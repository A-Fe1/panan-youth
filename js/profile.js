/* ============================================================
 * 资料卡：我的页（查看）+ 编辑页（填写/修改）
 * ============================================================ */

/* ---------- 常量 ---------- */
const MBTI_LIST = [
  ['INTJ', '建筑师 · 独立睿智'], ['INTP', '逻辑学家 · 好奇思辨'], ['ENTJ', '指挥官 · 果敢领队'], ['ENTP', '辩论家 · 机敏点子王'],
  ['INFJ', '提倡者 · 温暖有原则'], ['INFP', '调停者 · 治愈理想家'], ['ENFJ', '主人公 · 热心组织者'], ['ENFP', '竞选者 · 快乐小狗'],
  ['ISTJ', '物流师 · 靠谱踏实'], ['ISFJ', '守卫者 · 细心体贴'], ['ESTJ', '总经理 · 务实执行'], ['ESFJ', '执政官 · 热情周到'],
  ['ISTP', '鉴赏家 · 冷静巧手'], ['ISFP', '探险家 · 安静艺术心'], ['ESTP', '企业家 · 行动派'], ['ESFP', '表演者 · 气氛担当']
];
const CONSTELLATION_LIST = ['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座'];
const QUICK_HOBBIES = ['徒步', '爬山', '羽毛球', '篮球', '跑步', '骑行', '露营', '钓鱼', '摄影', '阅读', '烘焙', '烹饪', '追剧', '电影', '音乐', '唱歌', '舞蹈', '桌游', '剧本杀', '旅行', '宠物', '手工', '书法', '健身', '王者荣耀', '磐安小吃'];

/* ---------- 编辑状态 ---------- */
const EditState = {
  data: null,          // 当前编辑中的资料（含照片路径）
  async load() {
    const mine = await DB.profiles.mine() || {};
    this.data = {
      nickname: mine.nickname || '',
      gender: mine.gender || '',
      age: mine.age || '',
      hometown: mine.hometown || '',
      work_place: mine.work_place || '',
      mbti: mine.mbti || '',
      constellation: mine.constellation || '',
      bio: mine.bio || '',
      hobbies: Array.isArray(mine.hobbies) ? [...mine.hobbies] : [],
      avatar_path: mine.avatar_path || '',
      life_photos: Array.isArray(mine.life_photos) ? [...mine.life_photos] : [],
      daily_photos: Array.isArray(mine.daily_photos) ? [...mine.daily_photos] : []
    };
    this.wechat = await DB.contacts.mineWechat();
  }
};

const Profile = {

  /* ========================================================
   * 我的页（查看）
   * ====================================================== */
  async renderMine() {
    const uid = await DB.uid();
    if (!uid) { location.hash = '#/login'; return; }
    const p = await DB.profiles.mine();
    const body = $('#profile-body');

    if (!p || !p.nickname) {
      body.innerHTML = `
        <div class="empty"><span class="em-ico">📝</span>您还没有填写资料卡<br><br>
        <button class="btn btn-primary" onclick="location.hash='#/edit'">去填写资料</button>
        <br><br>
        <button class="menu-item" id="btn-logout" style="border-radius:10px;">🚪 退出登录<span class="arr">›</span></button></div>`;
      $('#btn-logout').onclick = () => confirmBox('退出登录', '确定要退出当前账号吗？', async () => {
        await DB.auth.signOut();
        location.hash = '#/login';
      });
      return;
    }

    const avatarHtml = p.avatar_path
      ? `<img src="${DB.storage.url(p.avatar_path)}" alt="" onclick="viewImage(this.src)">`
      : (p.gender === '女' ? '👩' : '👨');

    body.innerHTML = `
      <div class="me-head">
        <div class="avatar">${avatarHtml}</div>
        <div>
          <div class="me-name">${escapeHtml(p.nickname)}</div>
          <div class="me-sub">${escapeHtml(p.gender || '')} · ${p.age || '?'}岁 · ${escapeHtml(p.work_place || '未填工作属地')}</div>
          <div class="me-sub">爱好：${(p.hobbies || []).map(escapeHtml).join('、') || '未填写'}</div>
        </div>
      </div>
      <div class="menu-list">
        <button class="menu-item" onclick="location.hash='#/edit'">✏️ 编辑我的资料<span class="arr">›</span></button>
        <button class="menu-item" id="btn-my-policy">📜 用户协议与隐私政策<span class="arr">›</span></button>
        <button class="menu-item" id="btn-logout">🚪 退出登录<span class="arr">›</span></button>
      </div>`;

    $('#btn-my-policy').onclick = () => { location.hash = '#/policy'; };
    $('#btn-logout').onclick = () => confirmBox('退出登录', '确定要退出当前账号吗？', async () => {
      await DB.auth.signOut();
      location.hash = '#/login';
    });
  },

  /* ========================================================
   * 编辑页
   * ====================================================== */
  async renderEdit() {
    const uid = await DB.uid();
    if (!uid) { location.hash = '#/login'; return; }
    await EditState.load();
    this._renderEditBody();
    this._bindEditEvents();
  },

  _renderEditBody() {
    const d = EditState.data;
    const mbtiOpts = MBTI_LIST.map(([v, label]) =>
      `<option value="${v}" ${d.mbti === v ? 'selected' : ''}>${v} · ${label}</option>`).join('');
    const constOpts = CONSTELLATION_LIST.map(v =>
      `<option value="${v}" ${d.constellation === v ? 'selected' : ''}>${v}</option>`).join('');

    $('#edit-body').innerHTML = `
      <div class="card">
        <div class="section-title">📷 证件照（形象照）</div>
        <div class="upload-grid" id="grid-avatar">${this._avatarCell()}</div>
        <div class="upload-hint">将展示在您的资料卡封面，建议正面清晰照片</div>
      </div>

      <div class="card">
        <div class="section-title"> 基本信息</div>
        <div class="field"><label>昵称</label><input id="ed-nickname" type="text" maxlength="12" placeholder="怎么称呼您" value="${escapeHtml(d.nickname)}"></div>
        <div class="field"><label>性别</label>
          <div class="gender-row">
            <button type="button" class="gender-btn ${d.gender === '男' ? 'on' : ''}" data-g="男">👦 男</button>
            <button type="button" class="gender-btn ${d.gender === '女' ? 'on' : ''}" data-g="女">👧 女</button>
          </div>
        </div>
        <div class="field"><label>年龄</label><input id="ed-age" type="number" min="16" max="60" placeholder="周岁" value="${d.age || ''}"></div>
        <div class="field"><label>哪里人</label><input id="ed-hometown" type="text" maxlength="20" placeholder="例：磐安县尖山镇" value="${escapeHtml(d.hometown)}"></div>
        <div class="field"><label>工作属地</label><input id="ed-work" type="text" maxlength="20" placeholder="例：磐安县安文街道" value="${escapeHtml(d.work_place)}"></div>
        <div class="field"><label>MBTI 人格</label><select id="ed-mbti"><option value="">请选择（可不确定）</option>${mbtiOpts}</select></div>
        <div class="field"><label>星座</label><select id="ed-const"><option value="">请选择</option>${constOpts}</select></div>
        <div class="field"><label>自我介绍</label><textarea id="ed-bio" maxlength="200" placeholder="介绍一下自己，让大家更了解您～">${escapeHtml(d.bio)}</textarea></div>
      </div>

      <div class="card">
        <div class="section-title">❤️ 兴趣爱好</div>
        <div class="hobby-tip">✏️ 手动输入或选择现有兴趣爱好</div>
        <div class="hobby-input-row">
          <input id="ed-hobby-input" type="text" maxlength="10" placeholder="输入自定义爱好">
          <button id="ed-hobby-add" class="btn hobby-add-btn">添加</button>
        </div>
        <div class="hobby-list" id="ed-hobby-list"></div>
        <div class="quick-label">或直接选择：</div>
        <div class="quick-hobbies">${QUICK_HOBBIES.map(h => `<button type="button" class="quick-tag" data-h="${h}">${h}</button>`).join('')}</div>
        <div class="upload-hint">爱好越具体，越容易匹配到同频的小伙伴</div>
      </div>

      <div class="card">
        <div class="section-title">🖼️ 生活照（最多${MAX_LIFE_PHOTOS}张）</div>
        <div class="upload-grid" id="grid-life"></div>
      </div>

      <div class="card">
        <div class="section-title">📸 我想分享的照片（最多${MAX_DAILY_PHOTOS}张）</div>
        <div class="upload-grid" id="grid-daily"></div>
      </div>

      <div class="card">
        <div class="section-title">💬 微信联系方式</div>
        <div class="field"><input id="ed-wechat" type="text" maxlength="30" placeholder="您的微信号" value="${escapeHtml(EditState.wechat || '')}">
          <div class="upload-hint">🔒 默认严格保密，只有与您互相回应成为朋友的人才能看到</div></div>
      </div>

      <button id="btn-save-profile" class="btn btn-primary btn-block" style="margin-bottom:26px;">保 存</button>
      <input type="file" id="file-picker" accept="image/*" class="hidden">`;

    this._renderHobbyList();
    this._renderPhotoGrid('life');
    this._renderPhotoGrid('daily');
  },

  _avatarCell() {
    const d = EditState.data;
    if (d.avatar_path) {
      return `<div class="upload-cell"><img src="${DB.storage.url(d.avatar_path)}" alt="">
        <button class="del" data-act="del-avatar">✕</button></div>`;
    }
    return `<div class="upload-add" data-act="add-avatar"><span class="plus">＋</span>上传</div>`;
  },

  _renderPhotoGrid(kind) {
    const key = kind === 'life' ? 'life_photos' : 'daily_photos';
    const max = kind === 'life' ? MAX_LIFE_PHOTOS : MAX_DAILY_PHOTOS;
    const list = EditState.data[key];
    let html = list.map((path, i) => `
      <div class="upload-cell"><img src="${DB.storage.url(path)}" alt="">
        <button class="del" data-act="del-photo" data-kind="${kind}" data-i="${i}">✕</button></div>`).join('');
    if (list.length < max) {
      html += `<div class="upload-add" data-act="add-photo" data-kind="${kind}"><span class="plus">＋</span>添加</div>`;
    }
    $(`#grid-${kind}`).innerHTML = html;
  },

  _renderHobbyList() {
    const list = EditState.data.hobbies;
    $('#ed-hobby-list').innerHTML = list.length
      ? list.map((h, i) => `<span class="hobby-chip">${escapeHtml(h)}<button data-act="del-hobby" data-i="${i}">✕</button></span>`).join('')
      : '<span style="font-size:.78rem;color:#9db0ba;">还没有添加爱好，快添加第一个吧～</span>';
  },

  /* 编辑页所有交互事件 */
  _bindEditEvents() {
    const self = this;

    /* 性别勾选 */
    $$('.gender-btn').forEach(btn => btn.onclick = () => {
      EditState.data.gender = btn.dataset.g;
      $$('.gender-btn').forEach(b => b.classList.toggle('on', b === btn));
    });

    /* 爱好：输入 + 添加（可一直添加） */
    const addHobby = () => {
      const input = $('#ed-hobby-input');
      const val = input.value.trim();
      if (!val) { toast('请输入爱好内容'); return; }
      if (EditState.data.hobbies.some(h => h.toLowerCase() === val.toLowerCase())) { toast('这个爱好已经添加过了'); return; }
      if (EditState.data.hobbies.length >= 15) { toast('爱好最多添加15个'); return; }
      EditState.data.hobbies.push(val);
      input.value = '';
      self._renderHobbyList();
    };
    $('#ed-hobby-add').onclick = addHobby;
    $('#ed-hobby-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addHobby(); } });

    /* 快捷爱好点击即加 */
    $$('.quick-tag').forEach(t => t.onclick = () => {
      const h = t.dataset.h;
      if (EditState.data.hobbies.some(x => x.toLowerCase() === h.toLowerCase())) { toast('已添加过「' + h + '」'); return; }
      EditState.data.hobbies.push(h);
      self._renderHobbyList();
    });

    /* 爱好标签删除 */
    $('#ed-hobby-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-act="del-hobby"]');
      if (!btn) return;
      EditState.data.hobbies.splice(+btn.dataset.i, 1);
      self._renderHobbyList();
    });

    /* 照片：添加 / 删除（事件委托） */
    $('#edit-body').addEventListener('click', e => {
      const cell = e.target.closest('[data-act]');
      if (!cell) return;
      const act = cell.dataset.act;

      if (act === 'add-avatar') { self._pickPhoto('avatar'); return; }
      if (act === 'del-avatar') {
        const old = EditState.data.avatar_path;
        EditState.data.avatar_path = '';
        $('#grid-avatar').innerHTML = self._avatarCell();
        if (old) DB.storage.remove(old).catch(() => {});
        return;
      }
      if (act === 'add-photo') { self._pickPhoto(cell.dataset.kind); return; }
      if (act === 'del-photo') {
        const { kind, i } = cell.dataset;
        const key = kind === 'life' ? 'life_photos' : 'daily_photos';
        const [old] = EditState.data[key].splice(+i, 1);
        self._renderPhotoGrid(kind);
        if (old) DB.storage.remove(old).catch(() => {});
        return;
      }
    });

    /* 文件选择 → 压缩 → 上传 */
    $('#file-picker').onchange = async (e) => {
      const file = e.target.files[0];
      const target = e.target.dataset.target;
      e.target.value = '';
      if (!file) return;
      if (file.size > 15 * 1024 * 1024) { toast('图片太大，请换一张（15MB以内）'); return; }
      toast('正在上传…');
      try {
        const { blob, dataUrl } = await compressImage(file,
          DB.mode === 'demo' ? 720 : PHOTO_MAX_EDGE,
          DB.mode === 'demo' ? 0.6 : PHOTO_QUALITY);
        const path = await DB.storage.upload(DB.mode === 'demo' ? dataUrl : blob);
        if (target === 'avatar') {
          const old = EditState.data.avatar_path;
          EditState.data.avatar_path = path;
          $('#grid-avatar').innerHTML = self._avatarCell();
          if (old) DB.storage.remove(old).catch(() => {});
        } else {
          const key = target === 'life' ? 'life_photos' : 'daily_photos';
          const max = target === 'life' ? MAX_LIFE_PHOTOS : MAX_DAILY_PHOTOS;
          if (EditState.data[key].length >= max) { toast('已达上限'); return; }
          EditState.data[key].push(path);
          self._renderPhotoGrid(target);
        }
        toast('上传成功');
      } catch (err) {
        toast(err.message || '上传失败，请重试');
      }
    };

    /* 保存 */
    $('#btn-save-profile').onclick = async () => {
      const nickname = $('#ed-nickname').value.trim();
      const age = $('#ed-age').value;
      if (!nickname) { toast('请填写昵称'); return; }
      if (!EditState.data.gender) { toast('请勾选性别'); return; }
      if (!age || +age < 16 || +age > 60) { toast('请填写真实年龄（16-60）'); return; }
      const wechat = $('#ed-wechat').value.trim();
      if (!wechat) { toast('请填写微信号，成为朋友后对方将看到它'); return; }

      const btn = $('#btn-save-profile');
      btn.disabled = true; btn.textContent = '保存中…';
      try {
        await DB.profiles.save({
          nickname,
          gender: EditState.data.gender,
          age: +age,
          hometown: $('#ed-hometown').value.trim(),
          work_place: $('#ed-work').value.trim(),
          mbti: $('#ed-mbti').value,
          constellation: $('#ed-const').value,
          bio: $('#ed-bio').value.trim(),
          hobbies: EditState.data.hobbies,
          avatar_path: EditState.data.avatar_path,
          life_photos: EditState.data.life_photos,
          daily_photos: EditState.data.daily_photos
        });
        await DB.contacts.saveMine(wechat);
        toast('保存成功');
        location.hash = '#/profile';
      } catch (err) {
        toast('保存失败：' + (err.message || '请稍后再试'));
      } finally {
        btn.disabled = false; btn.textContent = '保 存';
      }
    };
  },

  /* 触发文件选择 */
  _pickPhoto(target) {
    const picker = $('#file-picker');
    picker.dataset.target = target;
    picker.click();
  }
};

/* 性别勾选按钮样式（追加到页面 style 由 css 提供，这里仅注册 class 切换逻辑） */
