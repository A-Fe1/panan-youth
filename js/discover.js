/* ============================================================
 * 发现页（兴趣匹配列表）+ 他人资料卡详情
 * ============================================================ */

/* 计算共同爱好（忽略大小写与首尾空格） */
function commonHobbies(a = [], b = []) {
  const setB = new Set(b.map(x => String(x).trim().toLowerCase()));
  return a.filter(x => setB.has(String(x).trim().toLowerCase()));
}

/* 头像 HTML（无照片时按性别用 emoji） */
function avatarHtml(path, gender, cls = '') {
  if (path) return `<img class="${cls}" src="${DB.storage.url(path)}" alt="">`;
  return `<span class="${cls}">${gender === '女' ? '👩' : '👨'}</span>`;
}

const Discover = {

  /* ========================================================
   * 发现页列表
   * ====================================================== */
  async render() {
    const uid = await DB.uid();
    if (!uid) { location.hash = '#/login'; return; }
    const mine = await DB.profiles.mine();

    /* 未完善资料 → 引导 */
    if (!mine || !mine.nickname) {
      $('#discover-list').innerHTML = '';
      $('#discover-empty').classList.add('hidden');
      $('#my-hobbies-bar').innerHTML = `
        <div style="text-align:center;padding:8px 0;">
          📝 您还没有填写资料卡，填写后才能开始匹配<br><br>
          <button class="btn btn-primary btn-sm" onclick="location.hash='#/edit'">去填写资料</button>
        </div>`;
      return;
    }

    const myHobbies = mine.hobbies || [];
    $('#my-hobbies-bar').innerHTML = myHobbies.length
      ? `🎯 我的爱好：<b>${myHobbies.map(escapeHtml).join('、')}</b><br><span style="font-size:.74rem;">红色标签是与您的共同爱好 · 点击卡片查看详情</span>`
      : `🎯 您还没有添加爱好，<a href="#/edit">去添加</a>，匹配更精准`;

    const all = (await DB.profiles.listActive()).filter(p => p.user_id !== uid);

    /* 按共同爱好数量排序（多的在前），其次新注册在前 */
    const enriched = all.map(p => ({ p, common: commonHobbies(myHobbies, p.hobbies) }));
    enriched.sort((a, b) => b.common.length - a.common.length || new Date(b.p.created_at) - new Date(a.p.created_at));

    const listEl = $('#discover-list');
    const emptyEl = $('#discover-empty');

    if (!enriched.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      emptyEl.innerHTML = '<span class="em-ico">🌱</span>现在还没有其他小伙伴注册<br>把链接分享给身边的青年朋友吧～';
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.innerHTML = enriched.map(({ p, common }) => {
      const hobbies = (p.hobbies || []).slice(0, 5);
      const commonSet = new Set(common.map(c => c.toLowerCase()));
      return `
      <div class="profile-card" data-goto="${p.user_id}">
        <div class="avatar">${avatarHtml(p.avatar_path, p.gender)}</div>
        <div class="pc-info">
          <div class="pc-name-line">
            <span class="pc-name">${escapeHtml(p.nickname)}</span>
            <span class="pc-age">${p.age || '?'}岁</span>
            ${common.length ? `<span class="match-score">${common.length} 个共同爱好</span>` : ''}
          </div>
          <div class="pc-meta">${escapeHtml(p.hometown || '—')} · ${escapeHtml(p.work_place || '—')} · ${escapeHtml(p.mbti || 'MBTI未填')}</div>
          <div class="pc-hobbies">
            ${hobbies.map(h => `<span class="hobby-tag ${commonSet.has(String(h).toLowerCase()) ? 'match' : ''}">${escapeHtml(h)}</span>`).join('')}
          </div>
          <div class="pc-btns">
            <button class="btn btn-primary btn-sm" data-greet="${p.user_id}">👋 打个招呼</button>
            <button class="btn btn-ghost btn-sm" data-goto-btn="${p.user_id}">查看资料</button>
          </div>
        </div>
      </div>`;
    }).join('');

    /* 点击卡片或"查看资料"进详情；点"打招呼"直接弹窗 */
    listEl.onclick = (e) => {
      const greetBtn = e.target.closest('[data-greet]');
      if (greetBtn) { e.stopPropagation(); Greetings.openGreetDialog(greetBtn.dataset.greet); return; }
      const gotoBtn = e.target.closest('[data-goto-btn]');
      if (gotoBtn) { location.hash = '#/detail/' + gotoBtn.dataset.gotoBtn; return; }
      const card = e.target.closest('[data-goto]');
      if (card) location.hash = '#/detail/' + card.dataset.goto;
    };
  },

  /* ========================================================
   * 他人资料卡详情
   * ====================================================== */
  async renderDetail(userId) {
    const uid = await DB.uid();
    if (!uid) { location.hash = '#/login'; return; }
    const p = await DB.profiles.get(userId);
    const body = $('#detail-body');

    if (!p || p.status === 'banned') {
      body.innerHTML = '<div class="empty"><span class="em-ico">🫥</span>该用户不存在或已注销</div>';
      return;
    }

    const relation = await DB.greetings.relationWith(userId);
    const hero = p.avatar_path
      ? `<img class="hero-img" src="${DB.storage.url(p.avatar_path)}" alt="" onclick="viewImage(this.src)">`
      : `<div class="hero-placeholder">${p.gender === '女' ? '👩' : '👨'}</div>`;

    const photosBlock = (title, photos) => photos && photos.length ? `
      <div class="photo-row-label">${title}</div>
      <div class="photo-grid">${photos.map(path =>
        `<img src="${DB.storage.url(path)}" alt="" onclick="viewImage(this.src)">`).join('')}</div>` : '';

    /* 微信区：已是朋友 → 尝试读取；否则锁定 */
    let wechatHtml;
    if (relation === 'matched') {
      const wx = await DB.contacts.getOf(userId);
      wechatHtml = wx
        ? `<div class="wechat-box"><div class="wx-label">🎉 你们已成为朋友 · 对方微信号</div><div class="wx-value">${escapeHtml(wx)}</div><div class="wx-label" style="margin-top:6px;">快去添加好友吧</div></div>`
        : `<div class="wechat-locked">对方还未填写微信号</div>`;
    } else {
      wechatHtml = `<div class="wechat-locked">🔒 微信号互相回应成为朋友后可见</div>`;
    }

    /* 底部按钮：按关系状态 */
    let actionHtml;
    if (relation === 'matched') {
      actionHtml = `<button class="btn btn-ghost btn-block" disabled>✅ 已是朋友</button>`;
    } else if (relation === 'pending_out') {
      actionHtml = `<button class="btn btn-ghost btn-block" disabled>⏳ 已打招呼，等待对方回应</button>`;
    } else {
      const again = relation === 'declined' ? '再次' : '';
      actionHtml = `<button class="btn btn-primary btn-block" id="btn-detail-greet">👋 ${again}打个招呼</button>`;
    }

    body.innerHTML = `
      <div class="detail-hero">
        ${hero}
        <div class="detail-head">
          <span class="detail-name">${escapeHtml(p.nickname)}</span><span style="color:var(--text-sub);">${p.age || '?'}岁</span>
          <div class="detail-badges">
            ${p.gender ? `<span class="badge">${escapeHtml(p.gender)}</span>` : ''}
            ${p.mbti ? `<span class="badge mbti">${escapeHtml(p.mbti)}</span>` : ''}
            ${p.constellation ? `<span class="badge constellation">${escapeHtml(p.constellation)}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="info-row"><span class="k">哪里人</span><span class="v">${escapeHtml(p.hometown || '未填写')}</span></div>
        <div class="info-row"><span class="k">工作属地</span><span class="v">${escapeHtml(p.work_place || '未填写')}</span></div>
        <div class="info-row"><span class="k">自我介绍</span><span class="v">${escapeHtml(p.bio || '这个人很神秘，什么都没写～')}</span></div>
      </div>

      <div class="card">
        <div class="photo-row-label">❤️ 兴趣爱好</div>
        <div class="pc-hobbies">${(p.hobbies || []).length
      ? p.hobbies.map(h => `<span class="hobby-tag">${escapeHtml(h)}</span>`).join('')
      : '<span style="font-size:.8rem;color:var(--text-sub);">未填写</span>'}</div>
      </div>

      <div class="card">
        ${photosBlock('🖼️ 生活照', p.life_photos)}
        ${photosBlock('📸 我想分享的照片', p.daily_photos)}
        ${(!p.life_photos || !p.life_photos.length) && (!p.daily_photos || !p.daily_photos.length) ? '<div class="wechat-locked">暂无更多照片</div>' : ''}
      </div>

      <div class="card">${wechatHtml}</div>

      <div style="display:flex;gap:10px;align-items:center;">
        <div style="flex:1;">${actionHtml}</div>
        <button class="btn btn-ghost btn-sm" id="btn-report" style="height:fit-content;">⚠️ 举报</button>
      </div>
      <div style="height:20px;"></div>`;

    const greetBtn = $('#btn-detail-greet');
    if (greetBtn) greetBtn.onclick = () => Greetings.openGreetDialog(userId);

    $('#btn-report').onclick = () => {
      showModal({
        title: '举报该用户',
        html: `<div class="field"><textarea id="report-reason" maxlength="100" placeholder="请简要说明举报原因（如：内容不当、冒用他人身份、骚扰等）"></textarea></div>`,
        buttons: [
          { label: '取消', class: 'btn-ghost' },
          {
            label: '提交举报', class: 'btn-danger', onClick: async () => {
              const reason = ($('#report-reason') || {}).value?.trim();
              if (!reason) { toast('请填写举报原因'); return; }
              try {
                await DB.reports.send(userId, reason);
                toast('举报已提交，管理员将尽快处理');
              } catch (e) { toast('提交失败，请稍后再试'); }
            }
          }
        ]
      });
    };
  }
};
