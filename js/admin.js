/* ============================================================
 * 管理后台
 * 登录：演示模式密码 admin888；云端模式输入 service_role key
 * 功能：统计概览 / 用户管理（封禁、重置密码）/ 举报处理
 * ============================================================ */

const Admin = {
  api: null,   // 管理接口（makeAdmin 返回）

  bind() {
    $('#btn-admin-login').onclick = () => this.login();
    $('#admin-key').addEventListener('keydown', e => { if (e.key === 'Enter') this.login(); });
  },

  async login() {
    const key = $('#admin-key').value.trim();
    if (!key) { toast('请输入管理密码'); return; }
    this.api = DB.makeAdmin(key);
    if (!this.api) {
      toast(DB.mode === 'demo'
        ? '演示模式管理密码为 admin888'
        : '密钥无效（应为 Supabase 的 service_role key，见部署指南）');
      return;
    }
    $('#admin-login').classList.add('hidden');
    $('#admin-panel').classList.remove('hidden');
    await this.renderPanel();
  },

  logout() {
    this.api = null;
    $('#admin-panel').classList.add('hidden');
    $('#admin-login').classList.remove('hidden');
    $('#admin-key').value = '';
    localStorage.removeItem('panan_admin_key');
  },

  async renderPanel() {
    const box = $('#admin-panel');
    box.innerHTML = '<div class="empty">加载中…</div>';

    let stats;
    try { stats = await this.api.stats(); }
    catch (e) {
      box.innerHTML = `<div class="empty">⚠️ 数据加载失败，请检查密钥是否正确<br><button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="Admin.logout()">重新登录</button></div>`;
      return;
    }

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 class="page-title" style="margin:0;">管理后台</h2>
        <button class="btn btn-ghost btn-sm" onclick="Admin.logout()">退出管理</button>
      </div>

      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${stats.users}</div><div class="stat-label">注册用户</div></div>
        <div class="stat-box"><div class="stat-num">${stats.todayNew}</div><div class="stat-label">今日新增</div></div>
        <div class="stat-box"><div class="stat-num">${stats.greetings}</div><div class="stat-label">招呼总数</div></div>
        <div class="stat-box"><div class="stat-num">${stats.matched}</div><div class="stat-label">成功配对</div></div>
      </div>

      ${stats.reports ? `<div class="card" style="border:1px solid #ffd7a3;background:#fff9ef;">
        ⚠️ 有 <b>${stats.reports}</b> 条未处理的举报，请在下方处理</div>` : ''}

      <div class="section-title">👥 用户管理</div>
      <div id="admin-users"><div class="empty">加载中…</div></div>

      <div class="section-title">🚨 举报处理</div>
      <div id="admin-reports"><div class="empty">加载中…</div></div>

      ${DB.mode === 'cloud' ? `
      <div class="card" style="background:#fff5f5;border:1px solid #ffd0d0;font-size:.78rem;color:#a04040;">
        🔐 安全提醒：您正在使用高级管理密钥，请勿在公用电脑登录，用完及时点「退出管理」。</div>` : ''}
      <div style="height:24px;"></div>`;

    await this._renderUsers();
    await this._renderReports();
  },

  async _renderUsers() {
    const box = $('#admin-users');
    let users;
    try { users = await this.api.listUsers(); }
    catch (e) { box.innerHTML = '<div class="empty">用户列表加载失败</div>'; return; }

    if (!users.length) { box.innerHTML = '<div class="empty">暂无注册用户</div>'; return; }

    box.innerHTML = users.map(u => `
      <div class="admin-user-row">
        <div class="au-top">
          <b>${escapeHtml(u.nickname)}</b>
          <span class="${u.status === 'banned' ? 'tag-banned' : 'tag-active'}">${u.status === 'banned' ? '已封禁' : '正常'}</span>
        </div>
        <div class="au-line">📱 ${escapeHtml(u.phone)}　${escapeHtml(u.gender)}　打招呼 ${u.greetingCount} 次</div>
        <div class="au-line">注册于 ${fmtDate(u.createdAt)}</div>
        <div class="au-btns">
          <button class="btn btn-ghost btn-sm" data-resetpwd="${escapeHtml(u.phone)}">🔑 重置密码</button>
          <button class="btn ${u.status === 'banned' ? 'btn-ghost' : 'btn-danger'} btn-sm" data-ban="${u.id}" data-banned="${u.status !== 'banned'}">
            ${u.status === 'banned' ? '解除封禁' : '封禁账号'}
          </button>
        </div>
      </div>`).join('');

    box.onclick = async (e) => {
      const resetBtn = e.target.closest('[data-resetpwd]');
      if (resetBtn) {
        const phone = resetBtn.dataset.resetpwd;
        showModal({
          title: '重置密码 · ' + phone,
          html: `<div class="field"><label>新密码（请口头/电话告知用户本人）</label>
                 <input id="new-pwd" type="text" maxlength="20" placeholder="6-20位"></div>`,
          buttons: [
            { label: '取消', class: 'btn-ghost' },
            {
              label: '确认重置', class: 'btn-primary', onClick: async () => {
                const pwd = ($('#new-pwd') || {}).value?.trim();
                if (!validPassword(pwd)) { toast('密码需为6-20位'); return; }
                const r = await this.api.resetPassword(phone, pwd);
                toast(r.ok ? '已重置，请通知用户使用新密码登录' : r.error);
                if (r.ok) this._renderUsers();
              }
            }
          ]
        });
        return;
      }

      const banBtn = e.target.closest('[data-ban]');
      if (banBtn) {
        const id = banBtn.dataset.ban;
        const banned = banBtn.dataset.banned === 'true';
        confirmBox(
          banned ? '封禁账号' : '解除封禁',
          banned
            ? '封禁后该用户将无法被任何人看到，且无法登录使用。确定执行？'
            : '确定恢复该用户的正常使用？',
          async () => {
            try {
              await this.api.banUser(id, banned);
              toast(banned ? '已封禁' : '已解封');
              this._renderUsers();
            } catch (e2) { toast('操作失败'); }
          }
        );
      }
    };
  },

  async _renderReports() {
    const box = $('#admin-reports');
    let reports;
    try { reports = await this.api.listReports(); }
    catch (e) { box.innerHTML = '<div class="empty">举报列表加载失败</div>'; return; }

    if (!reports.length) { box.innerHTML = '<div class="empty">暂无举报记录 🎉</div>'; return; }

    box.innerHTML = reports.map(r => `
      <div class="admin-user-row">
        <div class="au-top"><b>举报「${escapeHtml(r.targetName)}」</b>
          <span class="${r.handled ? 'st-declined' : 'st-pending'} greet-status">${r.handled ? '已处理' : '待处理'}</span></div>
        <div class="au-line">举报人：${escapeHtml(r.reporterName)} · ${fmtDate(r.createdAt)}</div>
        <div class="au-line">原因：${escapeHtml(r.reason)}</div>
        ${r.handled ? '' : `
        <div class="au-btns">
          <button class="btn btn-ghost btn-sm" data-viewuser="${r.targetId}">查看被举报人</button>
          <button class="btn btn-primary btn-sm" data-handle="${r.id}">标记已处理</button>
        </div>`}
      </div>`).join('');

    box.onclick = async (e) => {
      const handleBtn = e.target.closest('[data-handle]');
      if (handleBtn) {
        await this.api.markReport(handleBtn.dataset.handle);
        toast('已标记处理');
        this._renderReports();
        return;
      }
      const viewBtn = e.target.closest('[data-viewuser]');
      if (viewBtn) {
        const p = await DB.profiles.get(viewBtn.dataset.viewuser);
        if (p && p.status !== 'banned') {
          showModal({
            title: p.nickname + ' 的资料',
            html: `手机号不可直接查看（隐私保护）<br>性别：${escapeHtml(p.gender)} · 年龄：${p.age || '?'}<br>哪里人：${escapeHtml(p.hometown || '未填')}<br>工作属地：${escapeHtml(p.work_place || '未填')}<br>爱好：${escapeHtml((p.hobbies || []).join('、') || '未填')}<br><br>如确认违规，请返回点击「封禁账号」。`,
            buttons: [{ label: '关闭', class: 'btn-primary' }]
          });
        } else {
          toast('该用户不存在或已被封禁');
        }
      }
    };
  }
};
