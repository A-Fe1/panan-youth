/* ============================================================
 * 数据层：统一封装两种模式
 *   · 云端模式：Supabase（正式使用）
 *   · 演示模式：localStorage（仅当前浏览器，便于体验）
 * 上层页面代码只调用 DB.* 接口，不关心具体模式。
 * ============================================================ */

const DB = (function () {

  /* ========================================================
   * 云端模式（Supabase）
   * ====================================================== */
  if (typeof SUPABASE_URL === 'string' && SUPABASE_URL && typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY) {
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // 手机号转为占位邮箱（example.com 是国际保留测试域名，不投递邮件）
    const emailOf = (phone) => phone + '@example.com';
    const phoneOf = (email) => String(email || '').split('@')[0];

    async function uid() {
      const { data } = await client.auth.getSession();
      return data?.session?.user?.id || null;
    }

    const api = {
      mode: 'cloud',

      uid,

      auth: {
        async signUp({ phone, password, secq, seca }) {
          const { data, error } = await client.auth.signUp({ email: emailOf(phone), password });
          if (error) {
            if (error.message.includes('already registered')) return { ok: false, error: '该手机号已注册' };
            return { ok: false, error: error.message };
          }
          if (!data.session) {
            return { ok: false, error: '注册通道未开启（管理员需在 Supabase 后台关闭邮箱验证，见部署指南）' };
          }
          // 写入密保（手机号与答案均以哈希存储）
          try {
            const ph = await phoneHash(phone);
            const ah = await answerHash(seca, ph);
            await client.from('secqa').insert({ user_id: data.user.id, phone_hash: ph, question: secq, answer_hash: ah });
          } catch (e) { /* 密保写入失败不阻断注册 */ }
          return { ok: true };
        },

        async signIn(phone, password) {
          const { error } = await client.auth.signInWithPassword({ email: emailOf(phone), password });
          if (error) {
            if (error.message.includes('Invalid login')) return { ok: false, error: '手机号或密码不正确' };
            return { ok: false, error: error.message };
          }
          return { ok: true };
        },

        async signOut() { await client.auth.signOut(); },

        /* 按手机号查密保问题（忘记密码第一步） */
        async getSecqa(phone) {
          const ph = await phoneHash(phone);
          const { data } = await client.from('secqa').select('question, answer_hash').eq('phone_hash', ph).maybeSingle();
          if (!data) return null;
          return { question: data.question, ph, answerHashSaved: data.answer_hash };
        },

        /* 验证密保答案 */
        async verifySecqa(phone, answer) {
          const s = await this.getSecqa(phone);
          if (!s) return false;
          const ah = await answerHash(answer, s.ph);
          return ah === s.answerHashSaved;
        }
      },

      profiles: {
        async mine() {
          const u = await uid(); if (!u) return null;
          const { data } = await client.from('profiles').select('*').eq('user_id', u).maybeSingle();
          return data || null;
        },
        async get(id) {
          const { data } = await client.from('profiles').select('*').eq('user_id', id).maybeSingle();
          return data || null;
        },
        async listActive() {
          const { data } = await client.from('profiles').select('*').order('created_at', { ascending: false });
          return (data || []).filter(p => p.status !== 'banned');
        },
        async save(fields) {
          const u = await uid(); if (!u) throw new Error('未登录');
          const row = { ...fields, user_id: u };
          const { error } = await client.from('profiles').upsert(row);
          if (error) throw error;
        }
      },

      contacts: {
        async mineWechat() {
          const u = await uid(); if (!u) return '';
          const { data } = await client.from('contacts').select('wechat').eq('user_id', u).maybeSingle();
          return data?.wechat || '';
        },
        async saveMine(wechat) {
          const u = await uid(); if (!u) throw new Error('未登录');
          const { error } = await client.from('contacts').upsert({ user_id: u, wechat });
          if (error) throw error;
        },
        /* 只有已互相成为朋友，RLS 才会放行；否则返回 null */
        async getOf(id) {
          const { data } = await client.from('contacts').select('wechat').eq('user_id', id).maybeSingle();
          return data?.wechat ?? null;
        }
      },

      greetings: {
        async listMine() {
          const u = await uid(); if (!u) return [];
          const { data } = await client.from('greetings')
            .select('*')
            .or(`from_id.eq.${u},to_id.eq.${u}`)
            .order('created_at', { ascending: false });
          return data || [];
        },
        async send(toId, message) {
          const u = await uid();
          if (!u) return { ok: false, error: '请先登录' };
          const { error } = await client.from('greetings').insert({ from_id: u, to_id: toId, message });
          if (error) return { ok: false, error: '发送失败，请稍后再试' };
          return { ok: true };
        },
        async respond(id, status) {
          const { error } = await client.from('greetings').update({ status }).eq('id', id);
          if (error) throw error;
        },
        async countToday() {
          const u = await uid(); if (!u) return 99;
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const { count } = await client.from('greetings')
            .select('id', { count: 'exact', head: true })
            .eq('from_id', u).gte('created_at', start.toISOString());
          return count || 0;
        },
        async relationWith(id) {
          const u = await uid(); if (!u) return 'none';
          const { data } = await client.from('greetings')
            .select('*')
            .or(`and(from_id.eq.${u},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${u})`)
            .order('created_at', { ascending: false });
          const g = (data || [])[0];
          if (!g) return 'none';
          if (g.status === 'matched') return 'matched';
          if (g.status === 'declined') return 'declined';
          return g.from_id === u ? 'pending_out' : 'pending_in';
        }
      },

      reports: {
        async send(targetId, reason) {
          const u = await uid(); if (!u) throw new Error('请先登录');
          const { error } = await client.from('reports').insert({ reporter_id: u, target_id: targetId, reason });
          if (error) throw error;
        }
      },

      storage: {
        async upload(blob) {
          const u = await uid(); if (!u) throw new Error('请先登录');
          const path = `${u}/${Date.now()}_${randomHex(4)}.jpg`;
          const { error } = await client.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
          if (error) throw error;
          return path;
        },
        url(path) {
          if (!path) return '';
          if (path.startsWith('data:')) return path;
          return client.storage.from('photos').getPublicUrl(path).data.publicUrl;
        },
        /* 删除旧照片（更换/删除照片时调用） */
        async remove(path) {
          if (!path) return;
          try { await client.storage.from('photos').remove([path]); } catch (e) { /* 忽略 */ }
        }
      },

      /* 用 service_role key 创建管理端接口（仅管理后台使用） */
      makeAdmin(key) {
        if (!key || key.length < 40) return null;
        let ac;
        try { ac = window.supabase.createClient(SUPABASE_URL, key, { auth: { persistSession: false } }); }
        catch (e) { return null; }
        return {
          async stats() {
            const [pu, gr, rp] = await Promise.all([
              ac.from('profiles').select('user_id, created_at', { count: 'exact', head: false }),
              ac.from('greetings').select('id, status, created_at'),
              ac.from('reports').select('id, handled')
            ]);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            return {
              users: (pu.data || []).length,
              todayNew: (pu.data || []).filter(p => new Date(p.created_at) >= today).length,
              greetings: (gr.data || []).length,
              matched: (gr.data || []).filter(g => g.status === 'matched').length,
              reports: (rp.data || []).filter(r => !r.handled).length
            };
          },
          async listUsers() {
            const [usersRes, profRes, greetRes] = await Promise.all([
              ac.auth.admin.listUsers({ page: 1, perPage: 500 }),
              ac.from('profiles').select('*'),
              ac.from('greetings').select('from_id')
            ]);
            const profMap = {};
            (profRes.data || []).forEach(p => profMap[p.user_id] = p);
            const greetCount = {};
            (greetRes.data || []).forEach(g => { greetCount[g.from_id] = (greetCount[g.from_id] || 0) + 1; });
            return (usersRes.data?.users || []).map(usr => {
              const p = profMap[usr.id] || {};
              return {
                id: usr.id,
                phone: phoneOf(usr.email),
                nickname: p.nickname || '（未填写）',
                gender: p.gender || '',
                status: p.status || 'active',
                createdAt: usr.created_at,
                greetingCount: greetCount[usr.id] || 0
              };
            });
          },
          async banUser(id, banned) {
            const { error } = await ac.from('profiles').update({ status: banned ? 'banned' : 'active' }).eq('user_id', id);
            if (error) throw error;
          },
          async resetPassword(phone, newPwd) {
            const res = await ac.auth.admin.listUsers({ page: 1, perPage: 500 });
            const usr = (res.data?.users || []).find(x => phoneOf(x.email) === phone);
            if (!usr) return { ok: false, error: '未找到该手机号用户' };
            const { error } = await ac.auth.admin.updateUserById(usr.id, { password: newPwd });
            if (error) return { ok: false, error: error.message };
            return { ok: true };
          },
          async listReports() {
            const [rpRes, profRes] = await Promise.all([
              ac.from('reports').select('*').order('created_at', { ascending: false }),
              ac.from('profiles').select('user_id, nickname')
            ]);
            const nameMap = {};
            (profRes.data || []).forEach(p => nameMap[p.user_id] = p.nickname || '（未填写）');
            return (rpRes.data || []).map(r => ({
              id: r.id,
              reporterName: nameMap[r.reporter_id] || '已注销用户',
              targetName: nameMap[r.target_id] || '已注销用户',
              targetId: r.target_id,
              reason: r.reason,
              handled: r.handled,
              createdAt: r.created_at
            }));
          },
          async markReport(id) {
            const { error } = await ac.from('reports').update({ handled: true }).eq('id', id);
            if (error) throw error;
          }
        };
      }
    };

    return api;
  }

  /* ========================================================
   * 演示模式（localStorage）
   * ====================================================== */
  const DB_KEY = 'panan_demo_v1';
  const SESSION_KEY = 'panan_demo_session';
  const ADMIN_PWD = 'admin888';

  function load() {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || seed(); }
    catch (e) { return seed(); }
  }
  function save(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

  /* 预置演示数据 */
  function seed() {
    const u1 = 'demo-u1', u2 = 'demo-u2', u3 = 'demo-u3';
    const db = {
      users: [
        { id: u1, phone: '13800000001', password: '123456', secq: '我最喜欢的电影是什么？', seca: '流浪地球', createdAt: new Date(Date.now() - 86400000 * 20).toISOString() },
        { id: u2, phone: '13800000002', password: '123456', secq: '我的宠物叫什么名字？', seca: '团子', createdAt: new Date(Date.now() - 86400000 * 15).toISOString() },
        { id: u3, phone: '13800000003', password: '123456', secq: '我高中班主任姓什么？', seca: '陈', createdAt: new Date(Date.now() - 86400000 * 9).toISOString() }
      ],
      profiles: {
        [u1]: { user_id: u1, nickname: '小陈', gender: '男', age: 26, hometown: '磐安县安文街道', work_place: '磐安县某单位', mbti: 'ISTJ', constellation: '摩羯座', bio: '安文土著，周末喜欢约人爬爬山、打打球，希望认识更多本地小伙伴！', hobbies: ['徒步', '羽毛球', '摄影', '磐安小吃'], avatar_path: '', life_photos: [], daily_photos: [], status: 'active', created_at: new Date(Date.now() - 86400000 * 20).toISOString() },
        [u2]: { user_id: u2, nickname: '小楼', gender: '女', age: 24, hometown: '磐安县尖山镇', work_place: '磐安县某学校', mbti: 'INFP', constellation: '双鱼座', bio: '尖山姑娘，喜欢看书和烘焙，想找搭子一起逛吃逛吃～', hobbies: ['阅读', '烘焙', '旅行', '磐安小吃'], avatar_path: '', life_photos: [], daily_photos: [], status: 'active', created_at: new Date(Date.now() - 86400000 * 15).toISOString() },
        [u3]: { user_id: u3, nickname: '阿马', gender: '男', age: 28, hometown: '杭州市淳安县', work_place: '磐安县某企业', mbti: 'ENFP', constellation: '狮子座', bio: '来临磐工作的新磐安人，快乐小狗一枚，什么都想试试！', hobbies: ['露营', '骑行', '桌游', '火锅'], avatar_path: '', life_photos: [], daily_photos: [], status: 'active', created_at: new Date(Date.now() - 86400000 * 9).toISOString() }
      },
      contacts: { [u1]: 'xiaochen_pa', [u2]: 'loulou_2026', [u3]: 'happyma88' },
      greetings: [
        { id: 'g1', from_id: u2, to_id: u1, message: '你好呀！看到你也喜欢徒步，乌石村那条线走过吗？', status: 'pending', created_at: new Date(Date.now() - 3600000 * 5).toISOString() }
      ],
      reports: [],
      photos: {},
      seq: 100
    };
    save(db);
    return db;
  }

  function curUser(db) {
    const sid = localStorage.getItem(SESSION_KEY);
    if (!sid) return null;
    return db.users.find(u => u.id === sid) || null;
  }
  function nextId(db, prefix) { db.seq = (db.seq || 100) + 1; return prefix + db.seq; }

  const demoApi = {
    mode: 'demo',

    async uid() { const db = load(); return curUser(db)?.id || null; },

    auth: {
      async signUp({ phone, password, secq, seca }) {
        const db = load();
        if (db.users.some(u => u.phone === phone)) return { ok: false, error: '该手机号已注册' };
        const id = genId();
        db.users.push({ id, phone, password, secq, seca, createdAt: new Date().toISOString() });
        save(db);
        localStorage.setItem(SESSION_KEY, id);
        return { ok: true };
      },
      async signIn(phone, password) {
        const db = load();
        const u = db.users.find(x => x.phone === phone);
        if (!u || u.password !== password) return { ok: false, error: '手机号或密码不正确' };
        localStorage.setItem(SESSION_KEY, u.id);
        return { ok: true };
      },
      async signOut() { localStorage.removeItem(SESSION_KEY); },
      async getSecqa(phone) {
        const db = load();
        const u = db.users.find(x => x.phone === phone);
        if (!u) return null;
        return { question: u.secq };
      },
      async verifySecqa(phone, answer) {
        const db = load();
        const u = db.users.find(x => x.phone === phone);
        return !!u && String(u.seca).trim().toLowerCase() === String(answer).trim().toLowerCase();
      }
    },

    profiles: {
      async mine() {
        const db = load(); const u = curUser(db);
        if (!u) return null;
        return db.profiles[u.id] || null;
      },
      async get(id) {
        const db = load();
        return db.profiles[id] || null;
      },
      async listActive() {
        const db = load();
        return Object.values(db.profiles).filter(p => p.status !== 'banned')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      },
      async save(fields) {
        const db = load(); const u = curUser(db);
        if (!u) throw new Error('未登录');
        const old = db.profiles[u.id] || { user_id: u.id, created_at: new Date().toISOString() };
        db.profiles[u.id] = { ...old, ...fields, user_id: u.id };
        save(db);
      }
    },

    contacts: {
      async mineWechat() {
        const db = load(); const u = curUser(db);
        return u ? (db.contacts[u.id] || '') : '';
      },
      async saveMine(wechat) {
        const db = load(); const u = curUser(db);
        if (!u) throw new Error('未登录');
        db.contacts[u.id] = wechat; save(db);
      },
      async getOf(id) {
        const db = load(); const me = curUser(db);
        if (!me) return null;
        const matched = db.greetings.some(g =>
          g.status === 'matched' &&
          ((g.from_id === me.id && g.to_id === id) || (g.to_id === me.id && g.from_id === id)));
        return matched ? (db.contacts[id] || '') : null;
      }
    },

    greetings: {
      async listMine() {
        const db = load(); const u = curUser(db);
        if (!u) return [];
        return db.greetings
          .filter(g => g.from_id === u.id || g.to_id === u.id)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      },
      async send(toId, message) {
        const db = load(); const u = curUser(db);
        if (!u) return { ok: false, error: '请先登录' };
        db.greetings.push({ id: nextId(db, 'g'), from_id: u.id, to_id: toId, message, status: 'pending', created_at: new Date().toISOString() });
        save(db);
        return { ok: true };
      },
      async respond(id, status) {
        const db = load();
        const g = db.greetings.find(x => x.id === id);
        if (g) { g.status = status; save(db); }
      },
      async countToday() {
        const db = load(); const u = curUser(db);
        if (!u) return 99;
        const start = new Date(); start.setHours(0, 0, 0, 0);
        return db.greetings.filter(g => g.from_id === u.id && new Date(g.created_at) >= start).length;
      },
      async relationWith(id) {
        const db = load(); const u = curUser(db);
        if (!u) return 'none';
        const list = db.greetings.filter(g =>
          (g.from_id === u.id && g.to_id === id) || (g.to_id === u.id && g.from_id === id))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const g = list[0];
        if (!g) return 'none';
        if (g.status === 'matched') return 'matched';
        if (g.status === 'declined') return 'declined';
        return g.from_id === u.id ? 'pending_out' : 'pending_in';
      }
    },

    reports: {
      async send(targetId, reason) {
        const db = load(); const u = curUser(db);
        if (!u) throw new Error('请先登录');
        db.reports.push({ id: nextId(db, 'r'), reporter_id: u.id, target_id: targetId, reason, handled: false, created_at: new Date().toISOString() });
        save(db);
      }
    },

    storage: {
      /* 演示模式直接接收 dataUrl，存进 photos 映射 */
      async upload(dataUrl) {
        const db = load();
        const path = 'demo/' + Date.now() + '_' + randomHex(4) + '.jpg';
        db.photos[path] = dataUrl;
        save(db);
        return path;
      },
      url(path) {
        if (!path) return '';
        if (path.startsWith('data:')) return path;
        const db = load();
        return db.photos[path] || '';
      },
      async remove(path) {
        const db = load();
        delete db.photos[path]; save(db);
      }
    },

    /* 演示模式管理接口（密码 admin888） */
    makeAdmin(key) {
      if (key !== ADMIN_PWD) return null;
      return {
        async stats() {
          const db = load();
          const today = new Date(); today.setHours(0, 0, 0, 0);
          return {
            users: db.users.length,
            todayNew: db.users.filter(u => new Date(u.createdAt) >= today).length,
            greetings: db.greetings.length,
            matched: db.greetings.filter(g => g.status === 'matched').length,
            reports: db.reports.filter(r => !r.handled).length
          };
        },
        async listUsers() {
          const db = load();
          return db.users.map(u => {
            const p = db.profiles[u.id] || {};
            return {
              id: u.id, phone: u.phone, nickname: p.nickname || '（未填写）',
              gender: p.gender || '', status: p.status || 'active',
              createdAt: u.createdAt,
              greetingCount: db.greetings.filter(g => g.from_id === u.id).length
            };
          }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        },
        async banUser(id, banned) {
          const db = load();
          if (db.profiles[id]) { db.profiles[id].status = banned ? 'banned' : 'active'; save(db); }
          else { /* 无资料卡也允许记录状态 */ db.profiles[id] = { user_id: id, status: banned ? 'banned' : 'active', hobbies: [], life_photos: [], daily_photos: [], created_at: new Date().toISOString() }; save(db); }
        },
        async resetPassword(phone, newPwd) {
          const db = load();
          const u = db.users.find(x => x.phone === phone);
          if (!u) return { ok: false, error: '未找到该手机号用户' };
          u.password = newPwd; save(db);
          return { ok: true };
        },
        async listReports() {
          const db = load();
          return db.reports.map(r => ({
            id: r.id,
            reporterName: db.profiles[r.reporter_id]?.nickname || '（未填写）',
            targetName: db.profiles[r.target_id]?.nickname || '（未填写）',
            targetId: r.target_id,
            reason: r.reason,
            handled: r.handled,
            createdAt: r.created_at
          }));
        },
        async markReport(id) {
          const db = load();
          const r = db.reports.find(x => x.id === id);
          if (r) { r.handled = true; save(db); }
        }
      };
    }
  };

  return demoApi;
})();
