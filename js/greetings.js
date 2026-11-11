/* ============================================================
 * 消息页：收到的招呼 / 我发出的 / 我的朋友
 * 打招呼弹窗（含每日限额）
 * ============================================================ */

const Greetings = {

  currentTab: 'received',

  bind() {
    $$('.tab-btn[data-gtab]').forEach(btn => btn.onclick = () => {
      this.currentTab = btn.dataset.gtab;
      $$('.tab-btn[data-gtab]').forEach(b => b.classList.toggle('active', b === btn));
      this._renderList();
    });
  },

  async render() {
    const uid = await DB.uid();
    if (!uid) { location.hash = '#/login'; return; }
    this._renderList();
  },

  async _renderList() {
    const uid = await DB.uid();
    if (!uid) return;

    const [list, profiles] = await Promise.all([
      DB.greetings.listMine(),
      DB.profiles.listActive()
    ]);
    const profMap = {};
    profiles.forEach(p => profMap[p.user_id] = p);

    const listEl = $('#greet-list');
    const emptyEl = $('#greet-empty');

    let items = [];
    let emptyText = '';

    if (this.currentTab === 'received') {
      items = list.filter(g => g.to_id === uid);
      emptyText = '还没有收到招呼<br>完善资料卡、多加爱好标签，更容易被发现哦～';
    } else if (this.currentTab === 'sent') {
      items = list.filter(g => g.from_id === uid);
      emptyText = '您还没有打过招呼<br>去「发现」页看看有没有心仪的小伙伴吧';
    } else {
      items = list.filter(g => g.status === 'matched');
      emptyText = '还没有互相回应的朋友<br>有来有往，才算真正认识呀～';
    }

    if (!items.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      emptyEl.innerHTML = `<span class="em-ico">🍂</span>${emptyText}`;
      return;
    }
    emptyEl.classList.add('hidden');

    listEl.innerHTML = items.map(g => {
      const otherId = g.from_id === uid ? g.to_id : g.from_id;
      const p = profMap[otherId];
      const name = p ? p.nickname : '已注销用户';
      const isReceived = g.from_id !== uid;

      const statusMap = {
        pending: ['st-pending', '待回应'],
        matched: ['st-matched', '已加为朋友'],
        declined: ['st-declined', '已婉拒']
      };
      const [stCls, stText] = statusMap[g.status] || ['st-pending', '待回应'];

      /* 操作按钮：收到且待回应 → 回应/婉拒；朋友 tab → 查看微信 */
      let btns = '';
      if (isReceived && g.status === 'pending') {
        btns = `
          <button class="btn btn-primary btn-sm" data-respond="${g.id}" data-st="matched">👍 回个招呼</button>
          <button class="btn btn-ghost btn-sm" data-respond="${g.id}" data-st="declined">婉拒</button>`;
      }
      if (g.status === 'matched') {
        btns = `<button class="btn btn-primary btn-sm" data-viewfriend="${otherId}">查看资料和微信</button>`;
      }

      return `
      <div class="greet-card">
        <div class="greet-top">
          <div class="avatar-sm">${avatarHtml(p?.avatar_path, p?.gender)}</div>
          <div class="greet-info">
            <div class="greet-name">${escapeHtml(name)} ${p ? `<span style="font-weight:400;color:var(--text-sub);font-size:.78rem;">${p.age || '?'}岁</span>` : ''}</div>
            <div class="greet-msg">${isReceived ? '向您打招呼' : '您向 TA 打了招呼'}${g.message ? '：「' + escapeHtml(g.message) + '」' : ''}</div>
          </div>
          <span class="greet-status ${stCls}">${stText}</span>
        </div>
        ${btns ? `<div class="greet-actions">${btns}</div>` : ''}
      </div>`;
    }).join('');

    /* 事件 */
    listEl.onclick = async (e) => {
      const respBtn = e.target.closest('[data-respond]');
      if (respBtn) {
        const st = respBtn.dataset.st;
        if (st === 'declined') {
          confirmBox('婉拒招呼', '确定婉拒这个招呼吗？婉拒后对方不会知道（其招呼显示"待回应"→"已婉拒"仅您可见）。', async () => {
            await DB.greetings.respond(respBtn.dataset.respond, 'declined');
            toast('已婉拒');
            this._renderList();
          });
        } else {
          await DB.greetings.respond(respBtn.dataset.respond, 'matched');
          toast('🎉 已成为朋友！可以查看对方微信了');
          this._renderList();
        }
        return;
      }
      const viewBtn = e.target.closest('[data-viewfriend]');
      if (viewBtn) { location.hash = '#/detail/' + viewBtn.dataset.viewfriend; }
    };
  },

  /* ========================================================
   * 打招呼弹窗（每日限额）
   * ====================================================== */
  async openGreetDialog(toId) {
    const uid = await DB.uid();
    if (!uid) { location.hash = '#/login'; return; }
    if (toId === uid) { toast('不能和自己打招呼哦'); return; }

    const relation = await DB.greetings.relationWith(toId);
    if (relation === 'matched') { toast('你们已经是朋友啦'); return; }
    if (relation === 'pending_out') { toast('已经打过招呼，耐心等待回应吧'); return; }
    if (relation === 'pending_in') { toast('对方向您发来了招呼，请到「消息」页回应'); return; }

    const used = await DB.greetings.countToday();
    if (used >= DAILY_GREET_LIMIT) {
      toast(`每天最多打 ${DAILY_GREET_LIMIT} 个招呼，明天再来吧`);
      return;
    }

    const left = DAILY_GREET_LIMIT - used;
    showModal({
      title: '👋 打个招呼',
      html: `
        <p style="font-size:.82rem;color:var(--text-sub);margin-bottom:10px;">
          对方回应后你们即成为朋友，可互相查看微信。<br>今日剩余招呼次数：${left} 次</p>
        <div class="field"><textarea id="greet-msg" maxlength="${GREET_MSG_MAX}" placeholder="附一句话，第一印象很重要～（可不填）"></textarea></div>`,
      buttons: [
        { label: '取消', class: 'btn-ghost' },
        {
          label: '发送招呼', class: 'btn-primary', onClick: async () => {
            const msg = ($('#greet-msg') || {}).value?.trim() || '';
            const r = await DB.greetings.send(toId, msg);
            if (!r.ok) { toast(r.error); return; }
            toast('已发送，等待对方回应 💫');
            if (location.hash.startsWith('#/detail/')) Discover.renderDetail(toId);
          }
        }
      ]
    });
  }
};
