/* ==========================================================
   api.js — 데이터 계층
   - 로컬 데모 모드(localStorage) / Supabase 모드를 같은 인터페이스로 제공
   - 화면 코드(app.js, admin.js)는 window.API 만 사용해요.
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG;
  const NICK_RE = /^[가-힣a-zA-Z0-9_]{2,10}$/;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const sess = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };

  async function sha256(s) {
    try {
      if (window.crypto && crypto.subtle) {
        const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* fallthrough */ }
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + s.length.toString(16);
  }

  /* 금칙어 검사: 공백·특수문자·숫자를 지우고 비교해서 "시 발", "시.발" 같은 우회도 잡아요 */
  const normalize = s => String(s).toLowerCase().replace(/[\s​.,\-_!?~*^()\[\]{}'"`+=\/\\|:;<>@#$%&0-9]+/g, '');
  function isBad(text, words) {
    const n = normalize(text);
    return (words || []).some(w => { const x = normalize(w); return x && n.includes(x); });
  }

  function validateNick(nick) {
    if (!NICK_RE.test(nick || '')) throw new Error('닉네임은 한글·영문·숫자·_ 로 2~10글자예요.');
  }
  function validatePw(pw) {
    if (!pw || pw.length < 6) throw new Error('비밀번호는 6글자 이상이어야 해요.');
  }
  const OTHER_WRITER = n => (n === '서울교덕' ? '지철덕' : '서울교덕');
  function validateNewPw(pw) {
    validatePw(pw);
    if (pw.length > 72) throw new Error('비밀번호는 72글자까지만 쓸 수 있어요. (로그인 시스템의 한계예요)');
    if (pw === '123456') throw new Error('초기 비밀번호(123456)는 다시 쓸 수 없어요. 다른 비밀번호를 정해 주세요.');
  }

  const DEFAULT_BOARDS = C.boards.map(b => ({ id: b.id, icon: b.icon, name: b.name, desc: b.desc, cat: '' }));
  const defaultSettings = () => ({
    marquee: '덕질역에 오신 것을 환영합니다 ★ 이번 열차는 신나는 덕질 방면 급행입니다 ★ 안전선 밖으로 한 걸음 물러나 주세요 ★',
    intro: '버스와 철도를 좋아하는 교통 덕후들의 공동 기록장입니다.\n일상, 버스 탑사기, 출사기 같은 이야기를 천천히 모아 두고 있어요.',
    links: { seoulYoutube: 'https://www.youtube.com/@서울교덕', seoulInstagram: '', jiYoutube: '', jiInstagram: '' },
    boards: DEFAULT_BOARDS.map(b => ({ ...b })), categories: [],
    banned: [...C.badWords]
  });
  const mergeSettings = s => {
    const d = defaultSettings();
    s = s || {};
    const okB = b => b && typeof b.id === 'string' && b.id && typeof b.name === 'string' && b.name;
    const bl = Array.isArray(s.boards) ? s.boards.filter(okB) : [];
    const boards = bl.length ? bl.map(b => ({ id: String(b.id), icon: String(b.icon || '📄'), name: String(b.name), desc: String(b.desc || ''), cat: String(b.cat || '') })) : d.boards;
    const categories = Array.isArray(s.categories) ? s.categories.filter(c => c && c.id && c.name).map(c => ({ id: String(c.id), name: String(c.name) })) : [];
    return Object.assign(d, s, { links: Object.assign(d.links, s.links || {}), banned: Array.isArray(s.banned) ? s.banned : d.banned, boards, categories });
  };

  /* ====================== 로컬 데모 모드 ====================== */
  const WRITER_NICKS = ['서울교덕', '지철덕'];
  function makeLocal() {
    const KEY = 'deokjil_db_v1', SES = 'deokjil_sess_v1';
    function seed() {
      const now = Date.now();
      const mk = (board, title, body, tags, ago, views, pinned) => ({
        id: uid(), board, title, body, tags, pinned: !!pinned, views,
        created: new Date(now - ago * 864e5).toISOString(), updated: null, likes: []
      });
      return {
        users: [],
        posts: [
          mk('notice', '🚉 덕질역 개장 안내', '덕질역에 오신 것을 환영합니다!\n\n# 이곳은 어떤 곳인가요?\n버스·철도 덕질을 기록하는 개인 기록장이에요.\n**글은 운영자만** 쓸 수 있고, 로그인한 분은 댓글과 대댓글을 남길 수 있어요.\n\n# 이용 안내\n- 닉네임으로 가입하면 이메일 없이 바로 댓글을 쓸 수 있어요.\n- 심한 욕설이 포함된 댓글은 운영자 검토 후에 표시돼요.\n---\n[샘플 글입니다. 관리자 센터에서 지우거나 고쳐서 쓰세요.]', ['공지', '샘플'], 2, 31, true),
          mk('bus', '[샘플] 버스 탑사기는 이렇게 올라와요', '노선: 000번\n탑승일: 2026.00.00\n\n# 탑승 후기\n창가 맨 뒷자리가 진리라고 생각합니다.\n사진은 이미지 주소를 한 줄에 붙여 넣으면 자동으로 보여요.\n\n유튜브 주소도 한 줄에 붙여 넣으면 영상이 들어가요.\n\n[샘플 글입니다. 관리자 센터에서 지우세요.]', ['샘플', '탑사기'], 1, 12, false),
          mk('photo', '[샘플] 출사기 양식', '# 오늘의 출사지\n어디에 다녀왔는지 적어 보세요.\n\n# 한 줄 평\n역은 사람 없는 평일 오전이 제일 예뻐요.\n\n[샘플 글입니다. 관리자 센터에서 지우세요.]', ['샘플', '출사'], 0, 5, false)
        ],
        comments: [], visits: {}, settings: defaultSettings()
      };
    }
    let db = null;
    try { db = JSON.parse(store.get(KEY)); } catch (e) {}
    if (!db || !Array.isArray(db.posts)) db = seed();
    db.settings = mergeSettings(db.settings);
    db.comments = db.comments || []; db.users = db.users || []; db.visits = db.visits || {};
    db.memos = db.memos || []; db.memoComments = db.memoComments || [];
    const save = () => store.set(KEY, JSON.stringify(db));
    let me = null;
    const userById = id => db.users.find(u => u.id === id);
    const pubUser = u => u && { id: u.id, nick: u.nick, role: u.role };
    const needAdmin = () => { if (!me || me.role !== 'admin') throw new Error('관리자만 할 수 있어요.'); };
    const needStaff = needAdmin;
    const checkMemoBody = (b, max) => { b = String(b || '').trim(); if (!b) throw new Error('내용을 적어 주세요.'); if (b.length > max) throw new Error(`${max}자 이내로 적어 주세요.`); return b; };
    const isWriter = () => !!me && (me.role === 'admin' || me.role === 'author');

    const anonId = () => { let v = null; try { v = localStorage.getItem('deokjil_anon'); if (!v) { v = uid() + uid(); localStorage.setItem('deokjil_anon', v); } } catch (e) {} return v || 'anon0000'; };
    const anonNick = () => '익명 ' + anonId().replace(/[^0-9a-z]/g, '').slice(0, 4);
    const postOut = p => ({
      id: p.id, board: p.board, title: p.title, body: p.body, tags: p.tags || [], pinned: !!p.pinned,
      author: p.author || '', authorId: p.authorId || null,
      views: p.views || 0, created: p.created, updated: p.updated,
      publishAt: p.publishAt || null, scheduled: !!p.publishAt && new Date(p.publishAt) > new Date(),
      likes: p.likes.length, liked: p.likes.includes(anonId()),
      comments: db.comments.filter(c => c.target === p.id && c.status === 'ok').length
    });
    const cmtOut = c => {
      const u = userById(c.userId);
      const role = u ? u.role : 'user';
      return { id: c.id, target: c.target, parentId: c.parentId || null, userId: c.userId, nick: c.nick, body: c.body,
        created: c.created, status: c.status, role, isAdmin: role === 'admin' };
    };

    const api = {
      mode: 'local',
      async init() {
        const id = store.get(SES);
        const u = id && userById(id);
        me = u ? pubUser(u) : null;
        save();
      },
      me: () => me,
      async signup(nick, pw) {
        nick = (nick || '').trim(); validateNick(nick); validatePw(pw);
        if (isBad(nick, db.settings.banned)) throw new Error('사용할 수 없는 닉네임이에요.');
        if (db.users.some(u => u.nick.toLowerCase() === nick.toLowerCase())) throw new Error('이미 사용 중인 닉네임이에요.');
        const salt = uid();
        const u = { id: uid(), nick, salt, hash: await sha256(salt + pw), role: WRITER_NICKS.includes(nick) ? 'admin' : 'user', created: new Date().toISOString() };
        db.users.push(u); save();
        store.set(SES, u.id); me = pubUser(u); return me;
      },
      async login(nick, pw) {
        nick = (nick || '').trim();
        const u = db.users.find(x => x.nick.toLowerCase() === nick.toLowerCase());
        if (!u || u.hash !== await sha256(u.salt + pw)) throw new Error('닉네임 또는 비밀번호가 맞지 않아요.');
        store.set(SES, u.id); me = pubUser(u); return me;
      },
      async logout() { try { localStorage.removeItem(SES); } catch (e) {} me = null; },
      async accessToken() { return null; },
      async changePassword(oldPw, newPw) {
        if (!me) throw new Error('로그인이 필요해요.');
        const u = userById(me.id);
        if (!u || u.hash !== await sha256(u.salt + oldPw)) throw new Error('현재 비밀번호가 맞지 않아요.');
        validateNewPw(newPw);
        const o = db.users.find(x => x.nick === OTHER_WRITER(u.nick));
        if (o && o.hash === await sha256(o.salt + newPw)) throw new Error('다른 운영진이 이미 쓰고 있는 비밀번호예요. 다른 걸로 정해 주세요.');
        u.salt = uid(); u.hash = await sha256(u.salt + newPw); save();
      },

      async listPosts(opt) {
        const all = !!(opt && opt.all) && isWriter();
        return db.posts.map(postOut).filter(p => all || !p.scheduled).sort((a, b) => new Date(b.created) - new Date(a.created));
      },
      async getPost(id, countView) {
        const p = db.posts.find(x => x.id === id);
        if (!p) return null;
        if (countView) {
          const seen = JSON.parse(sess.get('deokjil_seen') || '[]');
          if (!seen.includes(id)) { p.views = (p.views || 0) + 1; seen.push(id); sess.set('deokjil_seen', JSON.stringify(seen)); save(); }
        }
        const o = postOut(p);
        return o.scheduled && !isWriter() ? null : o;
      },
      async savePost(d) {
        if (!isWriter()) throw new Error('글쓴이만 글을 쓸 수 있어요.');
        const adm = me.role === 'admin';
        const title = (d.title || '').trim(), body = (d.body || '').trim();
        if (!title || !body) throw new Error('제목과 내용을 입력해 주세요.');
        if (d.board === 'notice' && !adm) throw new Error('공지사항은 관리자만 쓸 수 있어요.');
        let p = d.id && db.posts.find(x => x.id === d.id);
        if (p) {
          if (!adm && p.authorId !== me.id) throw new Error('내 글만 고칠 수 있어요.');
          Object.assign(p, { board: d.board, title, body, tags: d.tags || [], updated: new Date().toISOString() });
          if ('publishAt' in d) p.publishAt = d.publishAt || null;
          if (adm) p.pinned = !!d.pinned;
        } else {
          p = { id: uid(), board: d.board, title, body, tags: d.tags || [], pinned: adm && !!d.pinned, views: 0,
            created: new Date().toISOString(), updated: null, likes: [], authorId: me.id, author: me.nick, publishAt: d.publishAt || null };
          db.posts.push(p);
        }
        save(); return postOut(p);
      },
      async deletePost(id) {
        const p = db.posts.find(x => x.id === id); if (!p) return;
        if (!isWriter() || (me.role !== 'admin' && p.authorId !== me.id)) throw new Error('내 글만 지울 수 있어요.');
        db.posts = db.posts.filter(x => x.id !== id);
        db.comments = db.comments.filter(c => c.target !== id); save();
      },
      async toggleLike(id) {
        const p = db.posts.find(x => x.id === id); if (!p) return null;
        const k = anonId(), i = p.likes.indexOf(k);
        if (i >= 0) p.likes.splice(i, 1); else p.likes.push(k);
        save(); return postOut(p);
      },

      async listComments(target) {
        return db.comments
          .filter(c => c.target === target && (c.status === 'ok' || (me && me.role === 'admin')))
          .sort((a, b) => new Date(a.created) - new Date(b.created)).map(cmtOut);
      },
      async addComment(target, parentId, body) {
        body = (body || '').trim();
        if (!body) throw new Error('내용을 입력해 주세요.');
        if (body.length > C.commentMax) throw new Error(`댓글은 ${C.commentMax}자까지 쓸 수 있어요.`);
        if (parentId) {
          const par = db.comments.find(c => c.id === parentId);
          if (!par) throw new Error('답글을 달 댓글이 없어요.');
          if (par.parentId) parentId = par.parentId; // 대댓글은 1단계만
        }
        const isAdm = !!me && me.role === 'admin';
        const status = isAdm ? 'ok' : (isBad(body, db.settings.banned) ? 'pending' : 'ok');
        const c = { id: uid(), target, parentId: parentId || null, userId: isAdm ? me.id : null, nick: isAdm ? me.nick : anonNick(), body, created: new Date().toISOString(), status };
        db.comments.push(c); save(); return cmtOut(c);
      },
      async deleteComment(id) {
        const c = db.comments.find(x => x.id === id); if (!c) return;
        if (!me || (me.role !== 'admin' && me.id !== c.userId)) throw new Error('삭제 권한이 없어요.');
        db.comments = db.comments.filter(x => x.id !== id && x.parentId !== id); save();
      },

      /* ---- 운영진 쪽지 (서울교덕·지철덕만) ---- */
      async listMemos() {
        needStaff();
        return [...db.memos].sort((a, b) => new Date(b.created) - new Date(a.created)).map(m => ({
          id: m.id, body: m.body, authorId: m.authorId, authorNick: m.authorNick, created: m.created,
          comments: db.memoComments.filter(c => c.memoId === m.id).sort((a, b) => new Date(a.created) - new Date(b.created)).map(c => ({ id: c.id, memoId: c.memoId, body: c.body, authorId: c.authorId, authorNick: c.authorNick, created: c.created }))
        }));
      },
      async addMemo(body) {
        needStaff(); body = checkMemoBody(body, 1000);
        const m = { id: uid(), body, authorId: me.id, authorNick: me.nick, created: new Date().toISOString() };
        db.memos.push(m); save(); return { ...m, comments: [] };
      },
      async deleteMemo(id) {
        needStaff();
        const m = db.memos.find(x => x.id === id); if (!m) return;
        if (m.authorId !== me.id) throw new Error('내가 쓴 쪽지만 지울 수 있어요.');
        db.memos = db.memos.filter(x => x.id !== id); db.memoComments = db.memoComments.filter(c => c.memoId !== id); save();
      },
      async addMemoComment(memoId, body) {
        needStaff(); body = checkMemoBody(body, 500);
        if (!db.memos.some(m => m.id === memoId)) throw new Error('쪽지를 찾을 수 없어요.');
        const c = { id: uid(), memoId, body, authorId: me.id, authorNick: me.nick, created: new Date().toISOString() };
        db.memoComments.push(c); save(); return c;
      },
      async deleteMemoComment(id) {
        needStaff();
        const c = db.memoComments.find(x => x.id === id); if (!c) return;
        if (c.authorId !== me.id) throw new Error('내가 쓴 댓글만 지울 수 있어요.');
        db.memoComments = db.memoComments.filter(x => x.id !== id); save();
      },

      async hitVisit() {
        if (!sess.get('deokjil_hit')) { db.visits[dayKey()] = (db.visits[dayKey()] || 0) + 1; save(); sess.set('deokjil_hit', '1'); }
        return { today: db.visits[dayKey()] || 0, total: Object.values(db.visits).reduce((a, b) => a + b, 0) };
      },
      async getSettings() { return mergeSettings(db.settings); },
      async saveSettings(s) { needAdmin(); db.settings = mergeSettings(s); save(); return db.settings; },

      /* ---- 관리자 전용 ---- */
      async listAllComments() { needAdmin(); return [...db.comments].sort((a, b) => new Date(b.created) - new Date(a.created)).map(cmtOut); },
      async setCommentStatus(id, status) { needAdmin(); const c = db.comments.find(x => x.id === id); if (c) { c.status = status; save(); } },
      async listUsers() { needAdmin(); return db.users.map(u => ({ id: u.id, nick: u.nick, role: u.role, created: u.created })); },
      async uploadImage(blob) {
        if (!isWriter()) throw new Error('글쓴이만 사진을 올릴 수 있어요.');
        if (blob && blob.size <= 350 * 1024) return await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('사진을 읽지 못했어요.')); r.readAsDataURL(blob); });
        throw new Error('데모 모드에서는 작은 사진(350KB 이하)만 쓸 수 있어요. Supabase를 연결하면 제한이 없어요.');
      },
      async backupPosts() { return []; },
      async listShowcase() { return (db.showcase || []).slice().sort((a, b) => new Date(b.created) - new Date(a.created)); },
      async addShowcase(d) {
        if (!me || (me.role !== 'admin' && me.role !== 'author')) throw new Error('글쓴이만 올릴 수 있어요.');
        const images = (d.images || []).filter(Boolean); if (!images.length) throw new Error('사진을 한 장 이상 골라 주세요.');
        db.showcase = db.showcase || [];
        const r = { id: uid(), author: me.nick, authorId: me.id, caption: (d.caption || '').slice(0, 500), images, likes: 0, created: new Date().toISOString() };
        db.showcase.push(r); save(); return r;
      },
      async deleteShowcase(id) {
        if (!me || (me.role !== 'admin' && me.role !== 'author')) throw new Error('글쓴이만 지울 수 있어요.');
        db.showcase = (db.showcase || []).filter(x => x.id !== id); save();
      },
      async likeShowcase(id, on) { const r = (db.showcase || []).find(x => x.id === id); if (r) { r.likes = Math.max(0, (r.likes || 0) + (on ? 1 : -1)); save(); } },
      async setUserRole(id, role) {
        needAdmin();
        if (!['user', 'author'].includes(role)) throw new Error('지정할 수 없는 권한이에요.');
        const u = userById(id);
        if (!u) throw new Error('회원을 찾을 수 없어요.');
        if (u.role === 'admin' || u.id === me.id) throw new Error('관리자 권한은 바꿀 수 없어요.');
        u.role = role; save();
      },
      async stats() {
        needAdmin();
        const days = [];
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ day: dayKey(d), count: db.visits[dayKey(d)] || 0 }); }
        return {
          posts: db.posts.length, views: db.posts.reduce((a, p) => a + (p.views || 0), 0),
          comments: db.comments.filter(c => c.status === 'ok').length, pending: db.comments.filter(c => c.status === 'pending').length,
          users: db.users.length, today: db.visits[dayKey()] || 0, total: Object.values(db.visits).reduce((a, b) => a + b, 0), days
        };
      },
      exportData() { needAdmin(); return JSON.stringify(db, null, 1); },
      importData(text) {
        needAdmin();
        const d = JSON.parse(text);
        if (!d || !Array.isArray(d.posts) || !Array.isArray(d.users)) throw new Error('덕질역 백업 파일이 아니에요.');
        db = d; db.settings = mergeSettings(db.settings); save();
      },
      resetAll() { needAdmin(); db = seed(); db.settings = mergeSettings(db.settings); save(); try { localStorage.removeItem(SES); } catch (e) {} me = null; }
    };
    return api;
  }

  /* ====================== Supabase 모드 ====================== */
  function makeSupabase() {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);
    let me = null;
    const emailOf = async nick => (await sha256(nick.toLowerCase())).slice(0, 32) + '@deokjil.site';
    const must = r => { if (r.error) throw new Error(r.error.message || '서버 오류'); return r.data; };
    async function loadMe() {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { me = null; return null; }
      const { data } = await sb.from('profiles').select('id,nick,role').eq('id', session.user.id).maybeSingle();
      me = data || null; return me;
    }
    const postOut = (r, likes, cm) => ({
      id: r.id, board: r.board, title: r.title, body: r.body, tags: r.tags || [], pinned: !!r.pinned,
      author: r.author_nick || '', authorId: r.author_id || null,
      views: r.views || 0, created: r.created_at, updated: r.updated_at,
      publishAt: r.publish_at || null, scheduled: !!r.publish_at && new Date(r.publish_at) > new Date(),
      likes: ((likes.find(l => l.post_id === r.id) || {}).n) | 0,
      liked: mineLikes.has(r.id),
      comments: cm.filter(c => c.target === r.id && c.status === 'ok').length
    });
    let mineLikes = new Set();
    async function loadLikes() {
      const [a, b] = await Promise.all([sb.rpc('like_counts'), sb.rpc('my_likes')]);
      mineLikes = new Set(Array.isArray(b.data) ? b.data.map(x => (x && x.my_likes) || x) : []);
      return Array.isArray(a.data) ? a.data : [];
    }
    const needStaffSb = () => { if (!me || me.role !== 'admin') throw new Error('운영진만 쓸 수 있어요.'); };
    const checkMemoBodySb = (b, max) => { b = String(b || '').trim(); if (!b) throw new Error('내용을 적어 주세요.'); if (b.length > max) throw new Error(`${max}자 이내로 적어 주세요.`); return b; };
    const memoRow = r => ({ id: r.id, body: r.body, authorId: r.author_id, authorNick: r.author_nick, created: r.created_at });
    const memoCmtRow = r => ({ id: r.id, memoId: r.memo_id, body: r.body, authorId: r.author_id, authorNick: r.author_nick, created: r.created_at });
    const cmtOut = (r, roles) => {
      const role = (roles && roles.get(r.user_id)) || 'user';
      return { id: r.id, target: r.target, parentId: r.parent_id, userId: r.user_id, nick: r.nick, body: r.body,
        created: r.created_at, status: r.status, role, isAdmin: role === 'admin' };
    };
    async function roleMap() {
      const d = must(await sb.from('profiles').select('id,role').in('role', ['admin', 'author']));
      return new Map(d.map(x => [x.id, x.role]));
    }
    const api = {
      mode: 'supabase',
      async init() { await loadMe(); sb.auth.onAuthStateChange(() => {}); },
      me: () => me,
      async signup(nick, pw) {
        nick = (nick || '').trim(); validateNick(nick); validatePw(pw);
        const r = await sb.auth.signUp({ email: await emailOf(nick), password: pw, options: { data: { nick } } });
        if (r.error) {
          if (/registered|exists/i.test(r.error.message)) throw new Error('이미 사용 중인 닉네임이에요.');
          if (/database error/i.test(r.error.message)) throw new Error('이미 사용 중인 닉네임이거나 가입 중 오류가 났어요.');
          throw new Error(r.error.message);
        }
        await loadMe();
        if (!me) throw new Error('가입은 됐는데 이메일 인증이 켜져 있어요. README의 "Confirm email 끄기"를 확인해 주세요.');
        return me;
      },
      async login(nick, pw) {
        const r = await sb.auth.signInWithPassword({ email: await emailOf((nick || '').trim()), password: pw });
        if (r.error) throw new Error('닉네임 또는 비밀번호가 맞지 않아요.');
        await loadMe(); return me;
      },
      async logout() { await sb.auth.signOut(); me = null; },
      async accessToken() { const r = await sb.auth.getSession(); return (r.data && r.data.session && r.data.session.access_token) || null; },
      async changePassword(oldPw, newPw) {
        if (!me) throw new Error('로그인이 필요해요.');
        const nick = me.nick;
        const ok = await sb.auth.signInWithPassword({ email: await emailOf(nick), password: oldPw });
        if (ok.error) throw new Error('현재 비밀번호가 맞지 않아요.');
        validateNewPw(newPw);
        const other = await sb.auth.signInWithPassword({ email: await emailOf(OTHER_WRITER(nick)), password: newPw });
        const back = await sb.auth.signInWithPassword({ email: await emailOf(nick), password: oldPw });
        if (back.error) throw new Error('다시 로그인하지 못했어요. 잠시 뒤에 다시 해 주세요.');
        if (!other.error) throw new Error('다른 운영진이 이미 쓰고 있는 비밀번호예요. 다른 걸로 정해 주세요.');
        const r = await sb.auth.updateUser({ password: newPw });
        if (r.error) throw new Error(/same/i.test(r.error.message) ? '지금 비밀번호와 같아요.' : r.error.message);
        await loadMe();
      },

      async listPosts(opt) {
        const all = !!(opt && opt.all);
        const [p, l, c] = await Promise.all([
          sb.from('posts').select('*').order('created_at', { ascending: false }),
          loadLikes(),
          sb.from('comments').select('target,status')
        ]);
        const posts = must(p), likes = l, cm = must(c);
        return posts.map(r => postOut(r, likes, cm)).filter(x => all || !x.scheduled);
      },
      async getPost(id, countView) {
        const r = await sb.from('posts').select('*').eq('id', id).maybeSingle();
        const row = must(r); if (!row) return null;
        if (countView) {
          const seen = JSON.parse(sess.get('deokjil_seen') || '[]');
          if (!seen.includes(id)) { await sb.rpc('bump_view', { pid: id }); row.views = (row.views || 0) + 1; seen.push(id); sess.set('deokjil_seen', JSON.stringify(seen)); }
        }
        const [l, c] = await Promise.all([loadLikes(), sb.from('comments').select('target,status').eq('target', id)]);
        return postOut(row, l, must(c));
      },
      async savePost(d) {
        const title = (d.title || '').trim(), body = (d.body || '').trim();
        if (!title || !body) throw new Error('제목과 내용을 입력해 주세요.');
        const row = { board: d.board, title, body, tags: d.tags || [], pinned: !!d.pinned };
        if ('publishAt' in d) row.publish_at = d.publishAt || null;
        let r;
        if (d.id) r = await sb.from('posts').update(Object.assign(row, { updated_at: new Date().toISOString() })).eq('id', d.id).select().single();
        else r = await sb.from('posts').insert(row).select().single();
        return postOut(must(r), [], []);
      },
      async deletePost(id) { must(await sb.from('posts').delete().eq('id', id)); },
      async toggleLike(id) {
        const r = await sb.rpc('toggle_like', { p_post: id });
        if (r.error) throw new Error(/빨리/.test(r.error.message) ? '너무 빨리 누르고 있어요. 잠시 뒤에 다시 해 주세요.' : '공감을 처리하지 못했어요. SQL(익명 댓글·공감 부분)을 실행했는지 확인해 주세요.');
        return api.getPost(id, false);
      },

      async listComments(target) {
        const [d, ad] = await Promise.all([sb.from('comments').select('*').eq('target', target).order('created_at', { ascending: true }), roleMap()]);
        return must(d).map(r => cmtOut(r, ad));
      },
      async addComment(target, parentId, body) {
        body = (body || '').trim();
        if (!body) throw new Error('내용을 입력해 주세요.');
        if (body.length > C.commentMax) throw new Error(`댓글은 ${C.commentMax}자까지 쓸 수 있어요.`);
        const r = await sb.rpc('add_comment', { p_target: String(target), p_parent: parentId || null, p_body: body });
        if (r.error) throw new Error(/빨리|많이/.test(r.error.message) ? r.error.message.replace(/^.*?:\s*/, '') : '댓글을 달지 못했어요. SQL(익명 댓글·공감 부분)을 실행했는지 확인해 주세요.');
        const row = Array.isArray(r.data) ? r.data[0] : r.data;
        return cmtOut(row, new Map(me ? [[me.id, me.role]] : []));
      },
      async deleteComment(id) { must(await sb.from('comments').delete().eq('id', id)); },

      /* ---- 운영진 쪽지 (서울교덕·지철덕만) ---- */
      async listMemos() {
        needStaffSb();
        const [m, c] = await Promise.all([sb.from('memos').select('*').order('created_at', { ascending: false }), sb.from('memo_comments').select('*').order('created_at', { ascending: true })]);
        const cs = must(c).map(memoCmtRow);
        return must(m).map(r => ({ ...memoRow(r), comments: cs.filter(x => x.memoId === r.id) }));
      },
      async addMemo(body) {
        needStaffSb(); body = checkMemoBodySb(body, 1000);
        const r = must(await sb.from('memos').insert({ body, author_id: me.id, author_nick: me.nick }).select().single());
        return { ...memoRow(r), comments: [] };
      },
      async deleteMemo(id) { needStaffSb(); must(await sb.from('memos').delete().eq('id', id)); },
      async addMemoComment(memoId, body) {
        needStaffSb(); body = checkMemoBodySb(body, 500);
        const r = must(await sb.from('memo_comments').insert({ memo_id: memoId, body, author_id: me.id, author_nick: me.nick }).select().single());
        return memoCmtRow(r);
      },
      async deleteMemoComment(id) { needStaffSb(); must(await sb.from('memo_comments').delete().eq('id', id)); },

      async hitVisit() {
        const doCount = !sess.get('deokjil_hit');
        const r = must(await sb.rpc('hit_visit', { do_count: doCount }));
        sess.set('deokjil_hit', '1');
        return { today: r.today || 0, total: r.total || 0 };
      },
      async getSettings() {
        const [s, b] = await Promise.all([sb.from('site_settings').select('data').eq('id', 1).maybeSingle(), sb.from('banned_words').select('word')]);
        const data = (must(s) || {}).data || {};
        data.banned = must(b).map(x => x.word);
        return mergeSettings(data);
      },
      async saveSettings(s) {
        s = mergeSettings(s);
        const { banned, ...rest } = s;
        must(await sb.from('site_settings').upsert({ id: 1, data: rest }));
        const cur = must(await sb.from('banned_words').select('word')).map(x => x.word);
        const gone = cur.filter(w => !banned.includes(w));
        if (gone.length) must(await sb.from('banned_words').delete().in('word', gone));
        const add = banned.filter(w => !cur.includes(w)).map(word => ({ word }));
        if (add.length) must(await sb.from('banned_words').insert(add));
        return s;
      },

      async listAllComments() {
        const [d, ad] = await Promise.all([sb.from('comments').select('*').order('created_at', { ascending: false }), roleMap()]);
        return must(d).map(r => cmtOut(r, ad));
      },
      async setCommentStatus(id, status) { must(await sb.from('comments').update({ status }).eq('id', id)); },
      async listUsers() {
        return must(await sb.from('profiles').select('id,nick,role,created_at').order('created_at', { ascending: true }))
          .map(u => ({ id: u.id, nick: u.nick, role: u.role, created: u.created_at }));
      },
      async listShowcase() {
        const r = await sb.from('showcase_posts').select('*').order('created_at', { ascending: false });
        if (r.error) throw new Error('사진자랑을 불러오지 못했어요. v15_showcase.sql을 실행했는지 확인해 주세요.');
        return r.data.map(x => ({ id: x.id, author: x.author_nick, authorId: x.author_id, caption: x.caption, images: x.images || [], likes: x.likes || 0, created: x.created_at }));
      },
      async addShowcase(d) {
        const images = (d.images || []).filter(Boolean); if (!images.length) throw new Error('사진을 한 장 이상 골라 주세요.');
        const r = await sb.from('showcase_posts').insert({ caption: (d.caption || '').slice(0, 500), images }).select().single();
        if (r.error) throw new Error(r.error.message || '올리지 못했어요.');
        return r.data;
      },
      async deleteShowcase(id) { must(await sb.from('showcase_posts').delete().eq('id', id)); },
      async likeShowcase(id, on) { await sb.rpc('showcase_like', { pid: id, up: !!on }); },
      async backupPosts() {
        const r = await sb.rpc('backup_posts');
        if (r.error) throw new Error('백업 글을 불러오지 못했어요. SQL(백업 글 보기 부분)을 실행했는지 확인해 주세요.');
        return Array.isArray(r.data) ? r.data : [];
      },
      async uploadImage(blob) {
        if (!me || (me.role !== 'admin' && me.role !== 'author')) throw new Error('글쓴이만 사진을 올릴 수 있어요.');
        if (blob.size > 5 * 1024 * 1024) throw new Error('사진은 한 장에 5MB 이하만 올릴 수 있어요.');
        const ext = { 'image/gif': 'gif', 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'jpg';
        const path = `${me.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const r = await sb.storage.from('post-images').upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: false });
        if (r.error) {
          const m = r.error.message || '';
          if (/bucket not found/i.test(m)) throw new Error('사진 보관함이 아직 없어요. supabase/storage.sql을 실행해 주세요.');
          if (/row-level security|unauthorized|not authorized/i.test(m)) throw new Error('사진을 올릴 권한이 없어요. 글쓴이로 로그인했는지 확인해 주세요.');
          throw new Error(m || '업로드에 실패했어요.');
        }
        return sb.storage.from('post-images').getPublicUrl(path).data.publicUrl;
      },
      async setUserRole(id, role) {
        if (!['user', 'author'].includes(role)) throw new Error('지정할 수 없는 권한이에요.');
        must(await sb.from('profiles').update({ role }).eq('id', id));
      },
      async stats() {
        const [p, c, u, v] = await Promise.all([
          sb.from('posts').select('views'), sb.from('comments').select('status'),
          sb.from('profiles').select('id', { count: 'exact', head: true }), sb.from('visits').select('day,count')
        ]);
        const posts = must(p), cm = must(c), vis = must(v);
        const map = {}; vis.forEach(x => { map[x.day] = x.count; });
        const days = [];
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ day: dayKey(d), count: map[dayKey(d)] || 0 }); }
        return {
          posts: posts.length, views: posts.reduce((a, x) => a + (x.views || 0), 0),
          comments: cm.filter(x => x.status === 'ok').length, pending: cm.filter(x => x.status === 'pending').length,
          users: u.count || 0, today: map[dayKey()] || 0, total: vis.reduce((a, x) => a + x.count, 0), days
        };
      }
    };
    return api;
  }

  let impl, fallback = false;
  if (C.supabaseUrl && C.supabaseAnonKey) {
    if (window.supabase && window.supabase.createClient) impl = makeSupabase();
    else { fallback = true; impl = makeLocal(); }
  } else impl = makeLocal();
  impl.fallback = fallback;
  impl.isBad = isBad;
  impl.validateNick = validateNick;
  window.API = impl;
})();