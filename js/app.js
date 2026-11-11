/* ============================================================
 * 路由与应用入口
 * ============================================================ */

const App = {

  /* 无需登录的页面 */
  PUBLIC_PAGES: ['login', 'register', 'forgot', 'policy', 'admin'],

  /* 页面标题（顶部栏） */
  TITLES: {
    login: '', register: '注册账号', forgot: '找回密码',
    discover: '发现 · 磐城遇见', detail: '资料卡',
    greetings: '消息', profile: '我的', edit: '编辑资料',
    admin: '管理后台', policy: '用户协议与隐私政策'
  },

  /* 底部 tab 对应页面 */
  TAB_PAGES: { discover: 'discover', greetings: 'greetings', profile: 'profile' },

  async route() {
    const hash = location.hash || '#/login';
    const parts = hash.replace(/^#\//, '').split('/');
    const page = parts[0] || 'login';
    const param = parts[1] || '';

    /* 已登录访问登录页 → 去发现页；未登录访问受保护页 → 去登录页 */
    const uid = await DB.uid();
    if (uid && (page === 'login' || page === '')) { location.hash = '#/discover'; return; }
    if (!uid && !this.PUBLIC_PAGES.includes(page)) { location.hash = '#/login'; return; }

    /* 切换视图 */
    $$('.view').forEach(v => v.classList.add('hidden'));
    const viewMap = {
      login: 'view-login', register: 'view-register', forgot: 'view-forgot',
      discover: 'view-discover', detail: 'view-detail', greetings: 'view-greetings',
      profile: 'view-profile', edit: 'view-edit', admin: 'view-admin', policy: 'view-policy'
    };
    const viewId = viewMap[page] || 'view-login';
    $('#' + viewId).classList.remove('hidden');

    /* 顶部栏与底部 tab 显示逻辑 */
    const showHeader = !['login', 'register'].includes(page);
    $('#app-header').classList.toggle('hidden', !showHeader);
    if (showHeader) {
      $('#header-title').textContent = this.TITLES[page] || '';
      $('#header-back').classList.toggle('hidden', !['forgot', 'detail', 'edit', 'policy'].includes(page));
      $('#header-action').classList.add('hidden');
    }
    const showTab = ['discover', 'greetings', 'profile'].includes(page);
    $('#app-tabbar').classList.toggle('hidden', !showTab);
    if (showTab) {
      $$('.tab-item').forEach(t => t.classList.toggle('active', t.getAttribute('href') === '#/' + page));
    }

    /* 页面渲染 */
    if (page === 'forgot') Auth.resetForgot();
    if (page === 'discover') Discover.render();
    if (page === 'detail' && param) Discover.renderDetail(param);
    if (page === 'greetings') Greetings.render();
    if (page === 'profile') Profile.renderMine();
    if (page === 'edit') Profile.renderEdit();
    if (page === 'policy') Policy.render();
    if (page === 'admin') {
      $('#admin-login').classList.remove('hidden');
      $('#admin-panel').classList.add('hidden');
    }

    window.scrollTo(0, 0);
  },

  init() {
    /* 演示模式横幅 */
    if (DB.mode === 'demo') $('#demo-banner').classList.remove('hidden');

    /* 事件绑定 */
    Auth.bind();
    Greetings.bind();
    Admin.bind();
    $('#header-back').onclick = () => history.back();

    window.addEventListener('hashchange', () => this.route());
    this.route();
  }
};

App.init();
