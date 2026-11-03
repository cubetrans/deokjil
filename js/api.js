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
  const demoCode = () => String(Math.floor(100000 + Math.random() * 900000));
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validateEmail(e) {
    e = String(e || '').trim().toLowerCase();
    if (!EMAIL_RE.test(e) || e.length > 120) throw new Error('이메일 주소를 정확히 입력해 주세요.');
    if (/@deokjil\.site$/.test(e)) throw new Error('사용할 수 없는 이메일이에요.');
    return e;
  }
  const unverifiedErr = email => { const x = new Error('이메일 인증이 아직 안 끝났어요. 메일의 인증 링크(또는 인증번호)를 확인해 주세요.'); x.code = 'unverified'; x.email = email; return x; };
  /* 가입 동의: 개인정보 수집·이용 + 운영정책 확인은 필수, 만 14세 미만이면 보호자 동의도 필수 */
  function checkConsent(c) {
    c = c || {};
    if (!c.agree) throw new Error('개인정보 수집·이용에 동의해 주세요.');
    if (!c.rules) throw new Error('운영정책을 읽고 체크해 주세요.');
    if (c.under14 && !c.guardian) throw new Error('만 14세 미만은 보호자(법정대리인)의 동의가 필요해요.');
    return { under14: !!c.under14, guardian: !!c.under14 && !!c.guardian, ver: String((C.legal || {}).version || '') };
  }
  /* 이동 기록 검사: 구간(legs)마다 어떤 교통수단으로 어디서 어디까지 갔는지. 환승은 구간과 구간 사이예요 */
  function cleanTrip(d) {
    d = d || {};
    const date = String(d.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) throw new Error('날짜를 확인해 주세요.');
    if (new Date(date).getTime() > Date.now() + 2 * 864e5) throw new Error('미래 날짜는 기록할 수 없어요.');
    const legs = Array.isArray(d.legs) ? d.legs : [];
    if (!legs.length) throw new Error('구간을 하나 이상 적어 주세요.');
    if (legs.length > 8) throw new Error('구간은 8개(환승 7번)까지 적을 수 있어요.');
    const out = legs.map((l, i) => {
      const mode = ['line', 'train', 'bus'].includes(l && l.mode) ? l.mode : '';
      const ref = String((l && l.ref) || '').trim().slice(0, 40), label = String((l && l.label) || '').trim().slice(0, 40);
      const from = String((l && l.from) || '').trim().slice(0, 20), to = String((l && l.to) || '').trim().slice(0, 20);
      if (!mode || !ref || !label) throw new Error(`${i + 1}번째 구간의 노선(교통수단)을 골라 주세요.`);
      if (!from || !to) throw new Error(`${i + 1}번째 구간의 출발과 도착을 적어 주세요.`);
      return { mode, ref, label, from, to };
    });
    return { date, legs: out, note: String(d.note || '').trim().slice(0, 60) };
  }
  function validatePw(pw) {
    if (!pw || pw.length < 6) throw new Error('비밀번호는 6글자 이상이어야 해요.');
  }


  /* ---------- 등급·포인트 규칙 (서버 모드에서는 init 때 DB 값으로 덮어써요) ---------- */
  const RULES = {
    grades: C.grades.map(g => Object.assign({}, g)),
    points: JSON.parse(JSON.stringify(C.pointRules))
  };
  const gradeByLevel = l => RULES.grades.find(g => g.level === l) || RULES.grades[0];
  /* 역할 서열: 회원 0 < 부관리자 1 < 관리자 2 < 총관리자 3 */
  const BIO_MAX = 10000;
  const checkinAmount = streak => 5 + Math.min(Math.max(streak, 1) - 1, 6);
  /* ---------- 운영진 휴게실 · 회의실 공용 ---------- */
  const LOUNGE_GAMES = { memory: { low: true, lo: 8, hi: 200 }, reaction: { low: true, lo: 80, hi: 3000 }, g2048: { low: false, lo: 0, hi: 2000000 }, snake: { low: false, lo: 0, hi: 400 }, typing: { low: false, lo: 0, hi: 120 } };
  const MIN = 60000;
  function meetPhase(m, now) {
    now = now == null ? Date.now() : now;
    const st = new Date(m.start).getTime(), en = new Date(m.end).getTime();
    if (now < st - 10 * MIN) return 'upcoming';
    if (now <= en) return 'open';
    if (now <= en + 60 * MIN) return 'wrap';
    return 'ended';
  }
  function meetCheck(d) {
    const title = String(d.title || '').trim(), agenda = String(d.agenda == null ? '' : d.agenda).trim();
    if (!title || title.length > 80) throw new Error('회의 제목은 1~80자로 써 주세요.');
    if (agenda.length > 3000) throw new Error('안건은 3000자까지 쓸 수 있어요.');
    const st = new Date(d.start).getTime(), en = new Date(d.end).getTime();
    if (!isFinite(st) || !isFinite(en)) throw new Error('시작·끝 시간을 정해 주세요.');
    if (en <= st) throw new Error('끝나는 시간이 시작보다 늦어야 해요.');
    if (en - st > 12 * 60 * MIN) throw new Error('회의는 최대 12시간까지예요.');
    return { title, agenda, start: new Date(st).toISOString(), end: new Date(en).toISOString() };
  }
  function pollCheck(question, options) {
    question = String(question || '').trim(); options = (options || []).map(o => String(o || '').trim()).filter(Boolean);
    if (!question || question.length > 100) throw new Error('질문은 1~100자로 써 주세요.');
    if (options.length < 2 || options.length > 6) throw new Error('선택지는 2~6개예요.');
    if (options.some(o => o.length > 40)) throw new Error('선택지는 40자까지예요.');
    return { question, options };
  }
  const INQ_CATS = ['문의', '건의', '오류 신고', '기타'];
  const okAvatar = v => v === '' || (typeof v === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 60000);
  /* 자동 로그인: 끄면 브라우저를 닫았다 다시 열 때(1분 넘게 안 열려 있을 때) 로그아웃돼요 */
  const REM = 'deokjil_remember_v1', ALIVE = 'deokjil_alive_v1';
  const keepAlive = () => store.set(ALIVE, String(Date.now()));
  const setRemember = v => { store.set(REM, v === false ? '0' : '1'); keepAlive(); };
  const sessionExpired = () => store.get(REM) === '0' && Date.now() - (+store.get(ALIVE) || 0) > 60000;
  setInterval(keepAlive, 20000);
  window.addEventListener('pagehide', keepAlive);
  const RANK = { user: 0, subadmin: 1, manager: 2, admin: 3 };
  const rankOf = r => RANK[r] || 0;
  const isStaffRole = r => rankOf(r) >= 1;
  const isManagerRole = r => rankOf(r) >= 2;
  const licenseOf = id => (C.licenses || []).find(l => l.id === id) || (C.licenses || []).find(l => l.id === C.defaultLicense) || { id: 'cc-by', name: 'CC BY', desc: '', url: '' };
  const okLicense = id => (C.licenses || []).some(l => l.id === id) ? id : (C.defaultLicense || 'cc-by');
  const statMeets = (s, g) => !!g && s.weeks >= g.minWeeks && s.posts >= g.minPosts && s.comments >= g.minComments && s.likes >= g.minLikes;
  /* 다음 등급까지 진행률 */
  function progress(stats, level) {
    const cur = gradeByLevel(level);
    const next = RULES.grades.find(g => g.level === level + 1) || null;
    if (!next) return { cur, next: null, items: [], ratio: 1, met: true };
    const defs = [['weeks', '가입 기간', '주', next.minWeeks], ['posts', '글 작성', '회', next.minPosts],
      ['comments', '댓글 작성', '회', next.minComments], ['likes', '공감 누르기', '회', next.minLikes]];
    const items = defs.map(([k, label, unit, req]) => {
      const c = stats[k] || 0;
      return { k, label, unit, cur: c, req, ok: c >= req, ratio: req ? Math.min(1, c / req) : 1 };
    });
    return { cur, next, items, ratio: items.reduce((a, i) => a + i.ratio, 0) / items.length, met: items.every(i => i.ok) };
  }
  const catalogItem = id => C.shopItems.find(i => i.id === id);
  const KIND_LABEL = { theme: '테마', skin: '프로필 스킨', title: '칭호' };
  const REASON_LABEL = { post: '글 작성', comment: '댓글 작성', like: '공감', buy: '상점 구매', admin: '운영진 지급', checkin: '출석체크' };

  const defaultSettings = () => ({
    marquee: '덕질역에 오신 것을 환영합니다 ★ 이번 열차는 신나는 덕질 방면 급행입니다 ★ 안전선 밖으로 한 걸음 물러나 주세요 ★',
    intro: '버스와 철도를 좋아하는 사람들이 함께 만들어 가는 커뮤니티입니다.\n일상, 버스 탑사기, 출사기 같은 이야기를 자유롭게 올려 주세요.',
    links: { blog: '', youtube: '', instagram: '', threads: '' },
    banned: [...C.badWords]
  });
  const mergeSettings = s => {
    const d = defaultSettings();
    s = s || {};
    return Object.assign(d, s, { links: Object.assign(d.links, s.links || {}), banned: Array.isArray(s.banned) ? s.banned : d.banned });
  };

  /* ---------- 중고거래 공통: 입력 검사 (서버에서도 똑같이 한 번 더 검사해요) ---------- */
  const MK = () => C.market || {};
  const MK_PII = [/01[016789][\s.\-]*\d{3,4}[\s.\-]*\d{4}/, /\d{2,6}-\d{2,6}-\d{3,8}(-\d{1,6})?/, /\d{6}[\s\-]?[1-4]\d{6}/, /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/];
  const MK_TICKET = /(승차권|정기권|예매권|KTX\s*표|SRT\s*표|기차\s*표)/, MK_TICKET_OK = /(수집|사용\s*완료|사용완료|사용한|기념|소장|지난)/;
  function marketCheck(d, banned) {
    const title = String(d.title || '').trim(), body = String(d.body || '').trim(), region = String(d.region || '').trim();
    const cats = (MK().categories || []).map(c => c.id);
    if (title.length < 2 || title.length > 60) throw new Error('제목은 2~60자로 써 주세요.');
    if (body.length < 5 || body.length > 2000) throw new Error('설명은 5~2000자로 써 주세요.');
    if (!cats.includes(d.category)) throw new Error('종류를 골라 주세요.');
    const price = Number(d.price);
    if (!Number.isInteger(price) || price < 0 || price > 10000000) throw new Error('가격은 0~1,000만 원 사이의 숫자로 적어 주세요. (0원은 나눔)');
    if (region.length > 20) throw new Error('거래 지역은 20자 이하로 적어 주세요.');
    if (!(d.cond in (MK().conds || {}))) throw new Error('상품 상태를 골라 주세요.');
    if (!(d.method in (MK().methods || {}))) throw new Error('거래 방법을 골라 주세요.');
    if (banned && isBad(title + ' ' + body, banned)) throw new Error('쓸 수 없는 표현이 들어 있어요.');
    const all = title + ' ' + body + ' ' + region;
    if (MK_PII.some(r => r.test(all))) throw new Error('전화번호·계좌번호·이메일 같은 개인정보는 글에 쓸 수 없어요. 연락은 쪽지로 해 주세요.');
    if (MK_TICKET.test(all) && !MK_TICKET_OK.test(all)) throw new Error('유효한 승차권·정기권은 팔 수 없어요 (철도사업법). 사용이 끝난 수집용만 "수집용"이라고 적어서 올려 주세요.');
    const imgs = Array.isArray(d.images) ? d.images : [];
    if (imgs.length > (MK().maxImages || 4)) throw new Error(`사진은 ${MK().maxImages || 4}장까지 올릴 수 있어요.`);
    return { title, body, region, category: d.category, price, cond: d.cond, method: d.method, images: imgs.map(String) };
  }
  const marketLimit = u => isStaffRole(u.role) ? 1000 : (u.grade >= 2 ? (MK().limitGrade2 || 10) : (MK().limitBasic || 3));

  /* ====================== 로컬 데모 모드 ====================== */
  function makeLocal() {
    const KEY = 'deokjil_db_v1', SES = 'deokjil_sess_v1';
    function seed() {
      const now = Date.now();
      const mk = (board, title, body, tags, ago, views, pinned) => ({
        id: uid(), board, title, body, tags, pinned: !!pinned, views, status: 'ok',
        created: new Date(now - ago * 864e5).toISOString(), updated: null, likes: []
      });
      return {
        users: [],
        posts: [
          mk('notice', '🚉 덕질역 개장 안내', '덕질역에 오신 것을 환영합니다!\n\n# 이곳은 어떤 곳인가요?\n버스·철도 덕질을 기록하는 커뮤니티예요.\n**누구나 가입해서 글을 쓸 수 있고**, 활동하면 포인트가 쌓이고 등급이 올라가요.\n\n# 이용 안내\n- 닉네임으로 가입하면 이메일 없이 바로 글·댓글을 쓸 수 있어요.\n- 심한 욕설이 포함된 글·댓글은 운영진 검토 후에 표시돼요.\n---\n[샘플 글입니다. 운영진 센터에서 지우거나 고쳐서 쓰세요.]', ['공지', '샘플'], 2, 31, true),
          mk('bus', '[샘플] 버스 탑사기는 이렇게 올라와요', '노선: 000번\n탑승일: 2026.00.00\n\n# 탑승 후기\n창가 맨 뒷자리가 진리라고 생각합니다.\n사진은 [사진 올리기] 버튼으로 넣을 수 있어요.\n\n유튜브 주소도 한 줄에 붙여 넣으면 영상이 들어가요.\n\n[샘플 글입니다. 운영진 센터에서 지우세요.]', ['샘플', '탑사기'], 1, 12, false),
          mk('photo', '[샘플] 출사기 양식', '# 오늘의 출사지\n어디에 다녀왔는지 적어 보세요.\n\n# 한 줄 평\n역은 사람 없는 평일 오전이 제일 예뻐요.\n\n[샘플 글입니다. 운영진 센터에서 지우세요.]', ['샘플', '출사'], 0, 5, false)
        ],
        comments: [], visits: {}, settings: defaultSettings(), shop: {}
      };
    }
    function migrate(d) {
      d.users.forEach(u => {
        if (u.role === 'author') u.role = 'subadmin';
        u.points = u.points || 0; u.grade = u.grade || 1; u.theme = u.theme || 'station'; u.skin = u.skin || 'basic';
        u.title = u.title || ''; u.inv = u.inv || []; u.log = u.log || [];
      });
      d.posts.forEach(p => { if (!p.status) p.status = 'ok'; p.likes = p.likes || []; p.license = okLicense(p.license); });
      d.shop = d.shop || {};
      return d;
    }
    let db = null;
    try { db = JSON.parse(store.get(KEY)); } catch (e) {}
    if (!db || !Array.isArray(db.posts)) db = seed();
    db.settings = mergeSettings(db.settings);
    db.comments = db.comments || []; db.chat = db.chat || []; db.inquiries = db.inquiries || []; db.lounge = db.lounge || {}; db.meetings = db.meetings || []; db.mmem = db.mmem || []; db.mmsg = db.mmsg || []; db.mpolls = db.mpolls || []; db.mvotes = db.mvotes || []; db.notifs = db.notifs || []; db.dms = db.dms || []; db.users = db.users || []; db.visits = db.visits || {};
    migrate(db);
    const save = () => store.set(KEY, JSON.stringify(db));
    let me = null;
    const userById = id => db.users.find(u => u.id === id);
    const pubUser = u => u && { id: u.id, nick: u.nick, role: u.role, grade: u.grade, points: u.points, theme: u.theme, skin: u.skin, title: u.title, consent: !!u.consent,
      bannedUntil: u.bannedUntil && new Date(u.bannedUntil) > new Date() ? u.bannedUntil : null, banReason: u.bannedUntil && new Date(u.bannedUntil) > new Date() ? (u.banReason || '') : '' };
    const marketOut = i => ({ id: i.id, sellerId: i.sellerId, seller: i.seller, title: i.title, category: i.category, price: i.price, cond: i.cond, method: i.method, region: i.region, body: i.body,
      images: i.images || [], status: i.status, hiddenWhy: i.hiddenWhy || '', buyerId: i.buyerId, buyer: i.buyer || '', views: i.views || 0, created: i.created, bumped: i.bumped, mine: !!me && i.sellerId === me.id,
      isBuyer: !!me && !!i.buyerId && i.buyerId === me.id });
    /* 쪽지는 30일이 지나면 지워져요 */
    const dmPurgeLocal = () => { const cut = Date.now() - 30 * 864e5, n = (db.dms || []).length; db.dms = (db.dms || []).filter(m => new Date(m.created).getTime() > cut); if (db.dms.length !== n) save(); };
    const needAdmin = () => { if (!me || me.role !== 'admin') throw new Error('총관리자만 할 수 있어요.'); };
    const needManager = () => { if (!me || !isManagerRole(me.role)) throw new Error('관리자 이상만 할 수 있어요.'); };
    const needStaff = () => { if (!me || !isStaffRole(me.role)) throw new Error('운영진만 할 수 있어요.'); };
    const needLogin = () => { if (!me) throw new Error('로그인이 필요해요.'); return userById(me.id); };
    const isStaff = () => !!me && isStaffRole(me.role);
    /* 정지 중인 회원(운영진 제외)은 글·댓글·쪽지·장터 글을 쓸 수 없어요 */
    const fmtKo = iso => { const d = new Date(iso), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}.${z(d.getMonth() + 1)}.${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
    const banCheck = () => {
      const u = me && userById(me.id);
      if (u && u.bannedUntil && new Date(u.bannedUntil) > new Date() && !isStaffRole(u.role)) throw new Error(`정지 중이라 할 수 없어요 (${fmtKo(u.bannedUntil)} 까지) — ${u.banReason || ''}`);
    };
    /* 감사 로그: 운영진이 한 중요한 일을 남겨요 (고치거나 지울 수 없어요) */
    const audit = (action, kind, targetId, label, reason) => {
      const a = db.audit = db.audit || [];
      a.unshift({ id: uid(), created: new Date().toISOString(), actorId: me ? me.id : null, actor: me ? me.nick : '', action, kind: kind || '', targetId: String(targetId || ''), label: String(label || '').slice(0, 120), reason: String(reason || '').slice(0, 300) });
      if (a.length > 1000) a.length = 1000;
      save();
    };
    const refreshMe = () => { const u = me && userById(me.id); me = u ? pubUser(u) : null; };

    /* 활동 통계 · 등급 · 포인트 */
    const statsOf = u => ({
      weeks: Math.max(0, Math.floor((Date.now() - new Date(u.created).getTime()) / (7 * 864e5))),
      posts: db.posts.filter(p => p.authorId === u.id && p.status === 'ok' && p.board !== 'upgrade').length,
      comments: db.comments.filter(c => c.userId === u.id && c.status === 'ok').length,
      likes: db.posts.filter(p => p.likes.includes(u.id)).length
    });
    const ktxRule = () => RULES.grades.find(g => g.needApproval);
    const ktxOk = u => statMeets(statsOf(u), ktxRule());
    function recalc(u) {
      const s = statsOf(u);
      if (u.gradeLock) return;
      for (const r of RULES.grades.filter(g => !g.needApproval && g.level > u.grade).sort((a, b) => a.level - b.level)) {
        if (statMeets(s, r)) u.grade = r.level; else break;
      }
    }
    function award(u, rule, ref, len) {
      const r = RULES.points[rule];
      if (!r || r.amount <= 0 || (len || 0) < (r.minLen || 0)) return 0;
      const today = dayKey();
      if (u.log.filter(x => x.reason === rule && x.delta > 0 && dayKey(new Date(x.created)) === today).length >= r.dailyCap) return 0;
      if (ref && u.log.some(x => x.reason === rule && x.ref === ref)) return 0;
      u.log.unshift({ delta: r.amount, reason: rule, ref: ref || '', created: new Date().toISOString() });
      if (u.log.length > 1000) u.log.length = 1000;
      u.points += r.amount;
      return r.amount;
    }
    const snap = () => { const u = me && userById(me.id); return u ? { p: u.points, g: u.grade } : null; };
    function withReward(before, out) {
      refreshMe();
      const u = me && userById(me.id);
      if (before && u && out && typeof out === 'object') out.reward = { points: u.points - before.p, gradeUp: u.grade > before.g ? { from: before.g, to: u.grade } : null };
      return out;
    }

    function notify(userId, kind, actor, text, link) {
      if (!userId) return;
      db.notifs = db.notifs || [];
      db.notifs.push({ id: uid(), userId, kind, actor: actor || '', text: String(text).slice(0, 120), link, read: false, created: new Date().toISOString() });
      const mine = db.notifs.filter(n => n.userId === userId);
      if (mine.length > 200) { const drop = new Set(mine.slice(0, mine.length - 200).map(n => n.id)); db.notifs = db.notifs.filter(n => !drop.has(n.id)); }
    }
    const authorOf = p => (p.authorId && userById(p.authorId)) || null;
    const postOut = p => {
      const a = authorOf(p);
      return {
        id: p.id, board: p.board, title: p.title, body: p.body, tags: p.tags || [], pinned: !!p.pinned, status: p.status || 'ok', license: okLicense(p.license),
        author: p.author || '', authorId: p.authorId || null, authorRole: a ? a.role : 'user', authorGrade: a ? a.grade : 1, authorTitle: a ? a.title : '',
        views: p.views || 0, created: p.created, updated: p.updated,
        held: !!p.held, heldWhy: p.heldWhy || '', likes: p.likes.length, liked: !!me && p.likes.includes(me.id),
        comments: db.comments.filter(c => c.target === p.id && c.status === 'ok').length
      };
    };
    const cmtOut = c => {
      const u = userById(c.userId);
      return { id: c.id, target: c.target, parentId: c.parentId || null, userId: c.userId, nick: c.nick, body: c.body,
        created: c.created, status: c.status, held: !!c.held, heldWhy: c.heldWhy || '', role: u ? u.role : 'user', grade: u ? u.grade : 1, title: u ? u.title : '', isAdmin: !!u && u.role === 'admin' };
    };
    const profileOf = u => ({ id: u.id, nick: u.nick, role: u.role, grade: u.grade, points: u.points, theme: u.theme, skin: u.skin, title: u.title,
      bio: u.bio || '', bioUpdated: u.bioUpdated || null, avatar: u.avatar || '', joined: u.created, stats: statsOf(u), ktxEligible: ktxOk(u) });
    const shopRows = all => {
      const u = me && userById(me.id);
      return C.shopItems.map(i => {
        const o = db.shop[i.id] || {};
        const price = o.price != null ? o.price : i.price;
        const active = o.active !== false;
        const owned = price === 0 || !!(u && u.inv.includes(i.id));
        return { id: i.id, kind: i.kind, name: i.name, desc: i.desc, price, active, owned,
          equipped: !!u && (u.theme === i.id || u.skin === i.id || u.title === i.id) };
      }).filter(i => all || i.active || i.owned);
    };

    const api = {
      mode: 'local',
      legacy: () => false,
      async init() {
        if (sessionExpired()) { try { localStorage.removeItem(SES); } catch (e) {} }
        keepAlive();
        const id = store.get(SES);
        const u = id && userById(id);
        if (u) recalc(u);
        me = u ? pubUser(u) : null;
        save();
      },
      me: () => me,
      async refresh() { const u = me && userById(me.id); if (u) { recalc(u); save(); } refreshMe(); return me; },
      /* 회원가입: 이메일 + 닉네임 + 비밀번호. 이메일 인증을 마쳐야 로그인돼요.
         (데모 모드에는 메일 서버가 없어서 인증번호를 화면에 보여 줘요) */
      async signup(nick, pw, remember, email, consent) {
        nick = (nick || '').trim(); validateNick(nick); validatePw(pw); email = validateEmail(email);
        const cs = checkConsent(consent);
        if (isBad(nick, db.settings.banned)) throw new Error('사용할 수 없는 닉네임이에요.');
        if (db.users.some(u => u.nick.toLowerCase() === nick.toLowerCase())) throw new Error('이미 사용 중인 닉네임이에요.');
        if (db.users.some(u => (u.email || '').toLowerCase() === email)) throw new Error('이미 가입된 이메일이에요.');
        const salt = uid(), code = demoCode();
        const u = { id: uid(), nick, email, emailOk: false, vcode: code, salt, hash: await sha256(salt + pw), role: db.users.length === 0 ? 'admin' : 'user', created: new Date().toISOString(),
          points: 0, grade: 1, theme: 'station', skin: 'basic', title: '', inv: [], log: [], consent: Object.assign({ at: new Date().toISOString() }, cs) };
        db.users.push(u); save();
        setRemember(remember);
        return { verify: true, email, demoCode: code };
      },
      async verifyEmail(email, code, remember) {
        email = String(email || '').trim().toLowerCase();
        const u = db.users.find(x => (x.email || '').toLowerCase() === email);
        if (!u || !u.vcode || String(code || '').trim() !== u.vcode) throw new Error('인증번호가 맞지 않아요.');
        u.emailOk = true; delete u.vcode; save();
        if (remember !== undefined) setRemember(remember);
        store.set(SES, u.id); me = pubUser(u); return me;
      },
      async resendVerify(email) {
        email = String(email || '').trim().toLowerCase();
        const u = db.users.find(x => (x.email || '').toLowerCase() === email && x.emailOk === false);
        if (!u) throw new Error('인증 대기 중인 가입이 없어요.');
        u.vcode = demoCode(); save(); return { demoCode: u.vcode };
      },
      async login(idOrEmail, pw, remember) {
        const id = (idOrEmail || '').trim().toLowerCase();
        const u = db.users.find(x => x.nick.toLowerCase() === id || (x.email || '').toLowerCase() === id);
        if (!u || u.hash !== await sha256(u.salt + pw)) throw new Error('닉네임(또는 이메일) 또는 비밀번호가 맞지 않아요.');
        if (u.emailOk === false) { u.vcode = u.vcode || demoCode(); save(); const x = unverifiedErr(u.email); x.demoCode = u.vcode; throw x; }
        recalc(u); save();
        setRemember(remember); store.set(SES, u.id); me = pubUser(u); return me;
      },
      async forgotPassword() { throw new Error('데모 모드에서는 비밀번호 찾기를 쓸 수 없어요. (진짜 사이트에서는 이메일로 재설정 링크를 보내요)'); },
      async setNewPassword() { throw new Error('데모 모드에서는 쓸 수 없어요.'); },
      async resetPassword() { throw new Error('데모 모드에서는 쓸 수 없어요.'); },
      authReturn: () => null,

      /* 회원정보 */
      async accountInfo() {
        const u = needLogin();
        const real = u.email && u.emailOk !== false;
        return { nick: u.nick, email: u.email || '', emailOk: !!real, hasEmail: !!u.email, pendingEmail: u.newEmail || '', demoCode: u.ncode || '' };
      },
      async changePassword(cur, next) {
        const u = needLogin(); validatePw(next);
        if (u.hash !== await sha256(u.salt + (cur || ''))) throw new Error('현재 비밀번호가 맞지 않아요.');
        if (cur === next) throw new Error('새 비밀번호가 현재와 같아요.');
        u.salt = uid(); u.hash = await sha256(u.salt + next); save();
      },
      async changeEmail(pw, newEmail) {
        const u = needLogin(); newEmail = validateEmail(newEmail);
        if (u.hash !== await sha256(u.salt + (pw || ''))) throw new Error('현재 비밀번호가 맞지 않아요.');
        if ((u.email || '').toLowerCase() === newEmail) throw new Error('지금 쓰는 이메일과 같아요.');
        if (db.users.some(x => x.id !== u.id && ((x.email || '').toLowerCase() === newEmail || (x.newEmail || '').toLowerCase() === newEmail))) throw new Error('이미 쓰고 있는 이메일이에요.');
        u.newEmail = newEmail; u.ncode = demoCode(); save();
        return { pending: newEmail, demoCode: u.ncode };
      },
      async confirmEmailChange(code) {
        const u = needLogin();
        if (!u.newEmail || String(code || '').trim() !== u.ncode) throw new Error('인증번호가 맞지 않아요.');
        u.email = u.newEmail; u.emailOk = true; delete u.newEmail; delete u.ncode; save();
        return u.email;
      },

      /* ---- 중고거래 ---- */
      async marketList(o) {
        o = o || {}; const mk = db.market = db.market || { items: [], reports: [], reviews: [], bans: [] };
        const low = String(o.q || '').trim().toLowerCase();
        return mk.items.filter(i => ['selling', 'reserved', 'sold'].includes(i.status) && (!o.category || i.category === o.category) && (!o.onlySale || i.status !== 'sold')
          && (!low || (i.title + ' ' + i.body).toLowerCase().includes(low)))
          .sort((a, b) => new Date(b.bumped) - new Date(a.bumped)).map(i => marketOut(i));
      },
      async marketGet(id, count) {
        const i = (db.market ? db.market.items : []).find(x => x.id === id); if (!i) return null;
        const mine = !!me && i.sellerId === me.id;
        if (['hidden', 'removed'].includes(i.status) && !mine && !isStaff()) return null;
        if (count && ['selling', 'reserved', 'sold'].includes(i.status)) { i.views = (i.views || 0) + 1; save(); }
        return marketOut(i);
      },
      async marketMine() { return (db.market ? db.market.items : []).filter(i => me && i.sellerId === me.id && i.status !== 'removed').sort((a, b) => new Date(b.created) - new Date(a.created)).map(i => marketOut(i)); },
      async marketPost(d) {
        const u = needLogin(); banCheck(); const mk = db.market = db.market || { items: [], reports: [], reviews: [], bans: [] };
        if (!d.agree) throw new Error('금지 품목·유의사항을 확인하고 체크해 주세요.');
        const ban = mk.bans.find(b => b.userId === u.id && new Date(b.until) > new Date());
        if (ban && !isStaffRole(u.role)) throw new Error('신고가 쌓여 ' + ban.until.slice(0, 10) + ' 까지 새 글을 쓸 수 없어요.');
        const lim = marketLimit(u);
        if (mk.items.filter(i => i.sellerId === u.id && ['selling', 'reserved'].includes(i.status)).length >= lim) throw new Error(`동시에 올릴 수 있는 글은 ${lim}개까지예요 (등급이 오르면 늘어요).`);
        if (!isStaffRole(u.role) && mk.items.filter(i => i.sellerId === u.id && Date.now() - new Date(i.created).getTime() < 864e5).length >= (MK().perDay || 5)) throw new Error(`하루에 ${MK().perDay || 5}개까지 올릴 수 있어요.`);
        const v = marketCheck(d, db.settings.banned); const now = new Date().toISOString();
        const it = Object.assign({ id: uid(), sellerId: u.id, seller: u.nick, status: 'selling', hiddenWhy: '', buyerId: null, buyer: '', views: 0, created: now, bumped: now }, v);
        mk.items.push(it); save(); return { id: it.id };
      },
      async marketEdit(id, d) {
        const u = needLogin(); const it = (db.market ? db.market.items : []).find(x => x.id === id);
        if (!it || it.sellerId !== u.id) throw new Error('내 글만 고칠 수 있어요.');
        if (['hidden', 'removed'].includes(it.status)) throw new Error('숨겨진 글은 고칠 수 없어요.');
        Object.assign(it, marketCheck(d, db.settings.banned), { updated: new Date().toISOString() }); save();
      },
      async marketSetStatus(id, status, buyer) {
        const u = needLogin(); const it = (db.market ? db.market.items : []).find(x => x.id === id);
        if (!it || it.sellerId !== u.id) throw new Error('내 글만 바꿀 수 있어요.');
        if (['hidden', 'removed'].includes(it.status)) throw new Error('숨겨진 글이에요.');
        if (!['selling', 'reserved', 'sold'].includes(status)) throw new Error('상태가 올바르지 않아요.');
        let bu = null; buyer = String(buyer || '').trim();
        if (status === 'sold' && buyer) {
          bu = db.users.find(x => x.nick.toLowerCase() === buyer.toLowerCase());
          if (!bu) throw new Error(`"${buyer}" 닉네임을 가진 회원이 없어요.`);
          if (bu.id === u.id) throw new Error('나에게 판 걸로 할 수 없어요.');
        }
        it.status = status; if (status === 'selling') it.bumped = new Date().toISOString();
        it.buyerId = status === 'sold' && bu ? bu.id : null; it.buyer = status === 'sold' && bu ? bu.nick : ''; save();
        if (status === 'sold' && bu) { notify(bu.id, 'market', u.nick, `「${it.title.slice(0, 20)}」 거래가 끝났어요. 판매자에게 후기를 남겨 주세요`, '#/market/' + id); save(); }
      },
      async marketBump(id) {
        const u = needLogin(); const it = (db.market ? db.market.items : []).find(x => x.id === id);
        if (!it || it.sellerId !== u.id || !['selling', 'reserved'].includes(it.status)) throw new Error('끌어올릴 수 없는 글이에요.');
        if (Date.now() - new Date(it.bumped).getTime() < 864e5) throw new Error('끌어올리기는 24시간에 한 번만 할 수 있어요.');
        it.bumped = new Date().toISOString(); save();
      },
      async marketDelete(id) {
        const u = needLogin(); const mk = db.market || { items: [] }; const it = mk.items.find(x => x.id === id); if (!it) return;
        if (it.sellerId !== u.id && !isStaff()) throw new Error('내 글만 지울 수 있어요.');
        if (it.sellerId !== u.id) { it.status = 'removed'; it.hiddenWhy = '운영진이 삭제'; notify(it.sellerId, 'market', '운영진', `「${it.title.slice(0, 20)}」 글이 운영 정책에 따라 삭제됐어요`, '#/market'); }
        else if (it.status === 'hidden') { it.status = 'removed'; it.hiddenWhy = '판매자가 삭제'; }
        else mk.items = mk.items.filter(x => x.id !== id), db.market = mk;
        save();
      },
      async marketReport(id, reason, note) {
        const u = needLogin(); const mk = db.market = db.market || { items: [], reports: [], reviews: [], bans: [] }; const it = mk.items.find(x => x.id === id);
        if (!it || it.status === 'removed') throw new Error('신고할 수 없는 글이에요.');
        if (it.sellerId === u.id) throw new Error('내 글은 신고할 수 없어요.');
        if (!(reason in (MK().reasons || {}))) throw new Error('신고 사유를 골라 주세요.');
        if (mk.reports.filter(r => r.reporterId === u.id && Date.now() - new Date(r.created).getTime() < 864e5).length >= 10) throw new Error('하루에 신고는 10건까지 할 수 있어요.');
        if (mk.reports.some(r => r.itemId === id && r.reporterId === u.id)) throw new Error('이미 신고한 글이에요.');
        mk.reports.push({ id: uid(), itemId: id, reporterId: u.id, reporter: u.nick, reason, note: String(note || '').slice(0, 200), dismissed: false, created: new Date().toISOString() });
        const n = mk.reports.filter(r => r.itemId === id && !r.dismissed).length;
        if (n >= (MK().reportHide || 3) && ['selling', 'reserved', 'sold'].includes(it.status)) {
          it.status = 'hidden'; it.hiddenWhy = `신고 ${n}건 접수 — 운영진 확인 중`;
          notify(it.sellerId, 'market', '덕질역', `「${it.title.slice(0, 20)}」 글이 신고로 숨겨졌어요. 운영진이 확인해요`, '#/market/' + id);
          if (mk.items.filter(x => x.sellerId === it.sellerId && x.status === 'hidden').length >= 2) {
            const until = new Date(Date.now() + (MK().banDays || 7) * 864e5).toISOString(); const b = mk.bans.find(x => x.userId === it.sellerId);
            if (b) b.until = until; else mk.bans.push({ userId: it.sellerId, until, reason: '신고로 숨겨진 글이 2개 이상' });
            notify(it.sellerId, 'market', '덕질역', `신고가 쌓여 ${MK().banDays || 7}일간 새 판매글을 쓸 수 없어요`, '#/market');
          }
        }
        save(); return { reports: n };
      },
      async marketReview(id, rating, body) {
        const u = needLogin(); const mk = db.market = db.market || { items: [], reports: [], reviews: [], bans: [] }; const it = mk.items.find(x => x.id === id);
        if (!it || it.status !== 'sold' || it.buyerId !== u.id) throw new Error('판매자가 구매자로 지정한 분만 후기를 남길 수 있어요.');
        rating = +rating; if (![1, 2, 3].includes(rating)) throw new Error('평가를 골라 주세요.');
        body = String(body || '').trim(); if (body.length > 100) throw new Error('후기는 100자까지 쓸 수 있어요.');
        if (body && isBad(body, db.settings.banned)) throw new Error('쓸 수 없는 표현이 들어 있어요.');
        if (mk.reviews.some(r => r.itemId === id && r.reviewerId === u.id)) throw new Error('이미 후기를 남겼어요.');
        mk.reviews.push({ id: uid(), itemId: id, sellerId: it.sellerId, reviewerId: u.id, reviewer: u.nick, rating, body, created: new Date().toISOString() });
        notify(it.sellerId, 'market', u.nick, `${u.nick}님이 「${it.title.slice(0, 20)}」 거래 후기를 남겼어요`, '#/market/' + id); save();
      },
      async marketReviews(nick) {
        const mk = db.market || { reviews: [], items: [] }; const s = db.users.find(x => x.nick.toLowerCase() === String(nick || '').toLowerCase()); if (!s) return [];
        return mk.reviews.filter(r => r.sellerId === s.id).sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 50)
          .map(r => ({ id: r.id, itemId: r.itemId, title: (mk.items.find(i => i.id === r.itemId) || {}).title || '', reviewer: r.reviewer, rating: r.rating, body: r.body, created: r.created }));
      },
      async marketSellerStats(nick) {
        const mk = db.market || { reviews: [], items: [] }; const s = db.users.find(x => x.nick.toLowerCase() === String(nick || '').toLowerCase());
        if (!s) return { sold: 0, good: 0, ok: 0, bad: 0 };
        const rv = mk.reviews.filter(r => r.sellerId === s.id);
        return { sold: mk.items.filter(i => i.sellerId === s.id && i.status === 'sold').length, good: rv.filter(r => r.rating === 3).length, ok: rv.filter(r => r.rating === 2).length, bad: rv.filter(r => r.rating === 1).length };
      },
      async marketMyReview(id) { const u = me && userById(me.id); return !!u && (db.market ? db.market.reviews : []).some(r => r.itemId === id && r.reviewerId === u.id); },
      async marketBan() { const u = me && userById(me.id); const b = u && (db.market ? db.market.bans : []).find(x => x.userId === u.id && new Date(x.until) > new Date()); return b ? b.until : null; },
      async marketAdminList() {
        needStaff(); const mk = db.market || { items: [], reports: [], bans: [] };
        return mk.items.slice().sort((a, b) => new Date(b.created) - new Date(a.created)).map(i => Object.assign(marketOut(i), { reports: mk.reports.filter(r => r.itemId === i.id && !r.dismissed).length }));
      },
      async marketReports(id) { needStaff(); return (db.market ? db.market.reports : []).filter(r => r.itemId === id).map(r => ({ reporter: r.reporter, reason: r.reason, note: r.note, dismissed: r.dismissed, created: r.created })); },
      async marketStaff(id, action, note) {
        needStaff(); const mk = db.market || { items: [], reports: [] }; const it = mk.items.find(x => x.id === id); if (!it) throw new Error('글을 찾을 수 없어요.');
        if (action === 'restore') { mk.reports.filter(r => r.itemId === id).forEach(r => { r.dismissed = true; }); it.status = it.buyerId ? 'sold' : 'selling'; it.hiddenWhy = ''; notify(it.sellerId, 'market', '운영진', `「${it.title.slice(0, 20)}」 글을 다시 열었어요`, '#/market/' + id); }
        else if (action === 'remove') { it.status = 'removed'; it.hiddenWhy = String(note || '').trim().slice(0, 60) || '운영 정책 위반'; notify(it.sellerId, 'market', '운영진', `「${it.title.slice(0, 20)}」 글이 운영 정책 위반으로 삭제됐어요`, '#/market'); }
        else throw new Error('알 수 없는 작업이에요.');
        save();
      },
      async marketBans() { needStaff(); return ((db.market && db.market.bans) || []).filter(b => new Date(b.until) > new Date()).map(b => ({ userId: b.userId, nick: (userById(b.userId) || {}).nick || '(탈퇴)', until: b.until, reason: b.reason })); },
      async marketUnban(uidd) { needStaff(); if (db.market) db.market.bans = db.market.bans.filter(b => b.userId !== uidd); save(); },
      /* ---- 서비스 상태 공지 ---- */
      async listIncidents() {
        db.incidents = db.incidents || [];
        return db.incidents.slice().sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, 100);
      },
      async postIncident(d) {
        needStaff(); db.incidents = db.incidents || [];
        const title = String(d.title || '').trim(), body = String(d.body || '').trim();
        if (title.length < 2 || title.length > 100) throw new Error('제목은 2~100자로 써 주세요.');
        if (!body || body.length > 1000) throw new Error('내용은 1~1000자로 써 주세요.');
        if (!['none', 'minor', 'major'].includes(d.impact)) throw new Error('영향 정도가 올바르지 않아요.');
        if (!['investigating', 'identified', 'monitoring', 'resolved'].includes(d.status)) throw new Error('진행 상태가 올바르지 않아요.');
        const ids = (C.statusComponents || []).map(c => c.id), comps = (d.components || []).filter(x => ids.includes(x));
        const now = new Date().toISOString();
        const inc = { id: uid(), title, impact: d.impact, components: comps, status: d.status, created: now, resolved: d.status === 'resolved' ? now : null, by: me.nick, updates: [{ status: d.status, body, created: now, by: me.nick }] };
        db.incidents.push(inc); save(); return inc.id;
      },
      async updateIncident(id, status, body, impact) {
        needStaff(); const inc = (db.incidents || []).find(x => x.id === id);
        if (!inc) throw new Error('공지를 찾을 수 없어요.');
        body = String(body || '').trim(); if (!body || body.length > 1000) throw new Error('내용은 1~1000자로 써 주세요.');
        if (!['investigating', 'identified', 'monitoring', 'resolved'].includes(status)) throw new Error('진행 상태가 올바르지 않아요.');
        const now = new Date().toISOString();
        inc.status = status; if (impact) inc.impact = impact; inc.resolved = status === 'resolved' ? (inc.resolved || now) : null;
        inc.updates.push({ status, body, created: now, by: me.nick }); save();
      },
      async deleteIncident(id) { needManager(); db.incidents = (db.incidents || []).filter(x => x.id !== id); save(); },
      /* ---- 강제 탈퇴 (관리자 이상) ---- */
      async removeMember(id, reason, opts) {
        needManager();
        reason = String(reason || '').trim();
        if (reason.length < 5) throw new Error('탈퇴 사유를 5자 이상 적어 주세요.');
        if (reason.length > 500) throw new Error('탈퇴 사유는 500자 이하로 적어 주세요.');
        const u = userById(id);
        if (!u) throw new Error('회원을 찾을 수 없어요.');
        if (u.id === me.id) throw new Error('나 자신은 탈퇴시킬 수 없어요.');
        if (rankOf(u.role) >= rankOf(me.role)) throw new Error('나와 같거나 높은 역할의 회원은 탈퇴시킬 수 없어요.');
        const hasMail = !!u.email && u.emailOk !== false && !/@deokjil\.site$/i.test(u.email);
        if (!hasMail && !(opts && opts.skipMail)) { const e = new Error('이 회원은 알림을 보낼 이메일 주소가 없어요.'); e.code = 'no_email'; throw e; }
        db.users = db.users.filter(x => x.id !== id);
        db.comments = db.comments.filter(c => c.userId !== id);
        db.posts.forEach(p => { if (p.authorId === id) p.authorId = null; p.likes = (p.likes || []).filter(x => x !== id); });
        db.notifs = db.notifs.filter(n => n.userId !== id); db.dms = db.dms.filter(d => d.fromId !== id && d.toId !== id);
        db.removals = db.removals || [];
        db.removals.unshift({ id: uid(), nick: u.nick, role: u.role, reason, byNick: me.nick, mailed: hasMail, mailNote: hasMail ? '(데모) 메일 발송 흉내' : '이메일 없음', created: new Date().toISOString() });
        save();
        return { mailed: hasMail, demo: true, to: hasMail ? u.email : '' };
      },
      async listRemovals() { needManager(); return (db.removals || []).slice(0, 100); },
      /* ---- 동의 · 탈퇴 · 신고 (법령 대응) ---- */
      async recordConsent(c) {
        const u = needLogin(); c = c || {};
        const cs = checkConsent({ agree: true, rules: true, under14: c.under14, guardian: c.guardian });
        u.consent = Object.assign({ at: new Date().toISOString() }, cs); save(); refreshMe(); return me;
      },
      async deleteMyAccount(pw, delPosts) {
        const u = needLogin();
        if (u.hash !== await sha256(u.salt + String(pw || ''))) throw new Error('비밀번호가 맞지 않아요.');
        if (u.role === 'admin' && db.users.filter(x => x.role === 'admin').length <= 1) throw new Error('마지막 총관리자는 탈퇴할 수 없어요. 다른 회원을 총관리자로 지정한 뒤에 해 주세요.');
        const mine = new Set(db.comments.filter(c => c.userId === u.id).map(c => c.id));
        db.comments = db.comments.filter(c => !mine.has(c.id) && !mine.has(c.parentId));
        if (delPosts) { const ids = new Set(db.posts.filter(p => p.authorId === u.id).map(p => p.id)); db.posts = db.posts.filter(p => !ids.has(p.id)); db.comments = db.comments.filter(c => !ids.has(c.target)); }
        else db.posts.forEach(p => { if (p.authorId === u.id) { p.authorId = null; p.author = '탈퇴한 회원'; } });
        db.users = db.users.filter(x => x.id !== u.id);
        db.notifs = (db.notifs || []).filter(n => n.userId !== u.id);
        db.dms = (db.dms || []).filter(m => m.fromId !== u.id && m.toId !== u.id);
        if (db.market) db.market.items = db.market.items.filter(i => i.sellerId !== u.id);
        save(); try { localStorage.removeItem(SES); } catch (e) {} me = null;
      },
      async contentReport(kind, id, reason, note) {
        const u = needLogin(), R = C.report || {};
        if (!['post', 'comment'].includes(kind)) throw new Error('신고할 수 없어요.');
        if (!(reason in (R.reasons || {}))) throw new Error('신고 사유를 골라 주세요.');
        const t = kind === 'post' ? db.posts.find(x => x.id === id) : db.comments.find(x => x.id === id);
        if (!t) throw new Error('신고할 수 없는 글이에요.');
        const owner = kind === 'post' ? t.authorId : t.userId;
        if (owner === me.id) throw new Error('내 글은 신고할 수 없어요.');
        const rs = db.creports = db.creports || [];
        if (rs.filter(r => r.reporterId === me.id && Date.now() - new Date(r.created).getTime() < 864e5).length >= 10) throw new Error('하루에 신고는 10건까지 할 수 있어요.');
        if (rs.some(r => r.kind === kind && r.targetId === id && r.reporterId === me.id)) throw new Error('이미 신고했어요.');
        rs.push({ id: uid(), kind, targetId: id, reporterId: me.id, reporter: me.nick, reason, note: String(note || '').slice(0, 500), dismissed: false, created: new Date().toISOString() });
        const n = rs.filter(r => r.kind === kind && r.targetId === id && !r.dismissed).length;
        const hold = (R.instant || []).includes(reason) || n >= (R.hideAt || 3);
        if (hold && !t.held) {
          t.held = true; t.heldPrev = t.status; t.status = 'pending';
          t.heldWhy = (R.instant || []).includes(reason) ? '권리침해·불법 신고 접수 — 임시 숨김 (운영진 확인 중)' : `신고 ${n}건 접수 — 임시 숨김 (운영진 확인 중)`;
          notify(owner, 'report', '덕질역', `「${String(kind === 'post' ? t.title : t.body).slice(0, 20)}」이(가) 신고되어 임시로 숨겨졌어요. 운영진이 확인해요`, '#/policy');
        }
        save(); return { reports: n, held: hold };
      },
      async contentReports() {
        needStaff(); const map = new Map();
        (db.creports || []).filter(r => !r.dismissed).forEach(r => {
          const k = r.kind + ':' + r.targetId; if (!map.has(k)) map.set(k, { kind: r.kind, id: r.targetId, reports: [] });
          map.get(k).reports.push({ reporter: r.reporter, reason: r.reason, note: r.note, created: r.created });
        });
        return [...map.values()].map(g => {
          const t = g.kind === 'post' ? db.posts.find(x => x.id === g.id) : db.comments.find(x => x.id === g.id); if (!t) return null;
          return { kind: g.kind, id: g.id, postId: g.kind === 'post' ? g.id : t.target, title: g.kind === 'post' ? t.title : t.body, author: g.kind === 'post' ? t.author : t.nick,
            held: !!t.held, heldWhy: t.heldWhy || '', reports: g.reports.sort((a, b) => new Date(a.created) - new Date(b.created)) };
        }).filter(Boolean).sort((a, b) => new Date(a.reports[0].created) - new Date(b.reports[0].created));
      },
      async contentReview(kind, id, action) {
        needStaff();
        const t = kind === 'post' ? db.posts.find(x => x.id === id) : db.comments.find(x => x.id === id); if (!t) throw new Error('글을 찾을 수 없어요.');
        const owner = kind === 'post' ? t.authorId : t.userId, ttl = String(kind === 'post' ? t.title : t.body).slice(0, 20);
        (db.creports || []).forEach(r => { if (r.kind === kind && r.targetId === id) r.dismissed = true; });
        if (action === 'restore') {
          if (t.held) { t.held = false; t.status = t.heldPrev || 'ok'; t.heldWhy = ''; delete t.heldPrev; }
          audit('report_restore', kind, id, ttl, '신고 확인 후 다시 공개');
          notify(owner, 'report', '운영진', `「${ttl}」을(를) 확인했고 다시 공개했어요`, '#/');
        } else if (action === 'remove') {
          audit(kind + '_delete', kind, id, ttl, '신고 처리 — 운영정책 위반');
          if (kind === 'post') { db.posts = db.posts.filter(x => x.id !== id); db.comments = db.comments.filter(c => c.target !== id); }
          else db.comments = db.comments.filter(c => c.id !== id && c.parentId !== id);
          notify(owner, 'report', '운영진', `「${ttl}」이(가) 운영정책 위반으로 삭제됐어요`, '#/policy');
        } else throw new Error('처리할 수 없어요.');
        save();
      },
      async logout() { try { localStorage.removeItem(SES); } catch (e) {} me = null; },

      /* ---- 글 ---- */
      async listPosts() {
        return db.posts.filter(p => p.status === 'ok' || (me && (p.authorId === me.id || isStaffRole(me.role))))
          .map(postOut).sort((a, b) => new Date(b.created) - new Date(a.created));
      },
      async getPost(id, countView) {
        const p = db.posts.find(x => x.id === id);
        if (!p || (p.status !== 'ok' && !(me && (p.authorId === me.id || isStaffRole(me.role))))) return null;
        if (countView) {
          const seen = JSON.parse(sess.get('deokjil_seen') || '[]');
          if (!seen.includes(id)) { p.views = (p.views || 0) + 1; seen.push(id); sess.set('deokjil_seen', JSON.stringify(seen)); save(); }
        }
        return postOut(p);
      },
      async savePost(d) {
        const u = needLogin(); banCheck();
        const staff = isStaff(), adm = isManagerRole(me.role);
        const title = (d.title || '').trim(), body = (d.body || '').trim();
        if (!title || !body) throw new Error('제목과 내용을 입력해 주세요.');
        const bd = C.boards.find(b => b.id === d.board);
        if (!bd) throw new Error('없는 게시판이에요.');
        let p = d.id && db.posts.find(x => x.id === d.id);
        const own = !!p && p.authorId === me.id;
        if (p && !own && !adm) {
          if (!staff) throw new Error('내 글만 고칠 수 있어요.');
          p.pinned = !!d.pinned; save(); return postOut(p);            // 부관리자는 남의 글의 고정만 바꿀 수 있어요
        }
        if (bd.staffOnly && !staff) throw new Error('이 게시판은 운영진만 쓸 수 있어요.');
        if (bd.ktxOnly && !staff && !ktxOk(u)) throw new Error('KTX 등업 조건을 모두 채운 뒤에 신청할 수 있어요.');
        const tags = d.tags || [];
        const before = snap();
        const status = staff ? 'ok' : (isBad([title, body, tags.join(' ')].join(' '), db.settings.banned) ? 'pending' : 'ok');
        if (p) {
          Object.assign(p, { board: d.board, title, body, tags, updated: new Date().toISOString() });
          if (own) p.license = okLicense(d.license || p.license);
          if (staff) p.pinned = !!d.pinned;
          const was = p.status; p.status = p.held ? 'pending' : status;
          if (was === 'pending' && p.status === 'ok' && p.board !== 'upgrade') award(u, 'post', p.id, body.length);
        } else {
          if (!staff && db.posts.filter(x => x.authorId === me.id && Date.now() - new Date(x.created).getTime() < 864e5).length >= 20) throw new Error('하루에 올릴 수 있는 글 수(20개)를 넘었어요.');
          p = { id: uid(), board: d.board, title, body, tags, license: okLicense(d.license), pinned: staff && !!d.pinned, views: 0, status,
            created: new Date().toISOString(), updated: null, likes: [], authorId: me.id, author: me.nick };
          db.posts.push(p);
          if (status === 'ok' && p.board !== 'upgrade') award(u, 'post', p.id, body.length);
        }
        recalc(u); save();
        return withReward(before, postOut(p));
      },
      async deletePost(id) {
        const p = db.posts.find(x => x.id === id); if (!p) return;
        if (!me || (!isStaff() && p.authorId !== me.id)) throw new Error('내 글만 지울 수 있어요.');
        if (isStaff() && p.authorId !== me.id) audit('post_delete', 'post', id, `${p.title} · ${p.author || ''}`, '');
        db.posts = db.posts.filter(x => x.id !== id);
        db.comments = db.comments.filter(c => c.target !== id); save();
      },
      async toggleLike(id) {
        const u = needLogin();
        const p = db.posts.find(x => x.id === id); if (!p) return null;
        const before = snap();
        const i = p.likes.indexOf(me.id);
        if (i >= 0) p.likes.splice(i, 1);
        else {
          p.likes.push(me.id); if (p.authorId !== me.id) award(u, 'like', p.id, 0); recalc(u);
          if (p.authorId && p.authorId !== me.id) {
            const t = `${me.nick}님이 「${p.title.slice(0, 20)}」에 공감했어요`, l = '#/post/' + p.id;
            if (!db.notifs.some(n => n.userId === p.authorId && n.kind === 'like' && n.text === t && n.link === l)) notify(p.authorId, 'like', me.nick, t, l);
          }
        }
        save(); return withReward(before, postOut(p));
      },

      /* ---- 댓글 ---- */
      async listComments(target) {
        return db.comments
          .filter(c => c.target === target && (c.status === 'ok' || (me && (c.userId === me.id || isStaffRole(me.role)))))
          .sort((a, b) => new Date(a.created) - new Date(b.created)).map(cmtOut);
      },
      async addComment(target, parentId, body) {
        const u = needLogin(); banCheck();
        body = (body || '').trim();
        if (!body) throw new Error('내용을 입력해 주세요.');
        if (body.length > C.commentMax) throw new Error(`댓글은 ${C.commentMax}자까지 쓸 수 있어요.`);
        if (parentId) {
          const par = db.comments.find(c => c.id === parentId);
          if (!par) throw new Error('답글을 달 댓글이 없어요.');
          if (par.parentId) parentId = par.parentId; // 대댓글은 1단계만
        }
        const before = snap();
        const status = isStaff() ? 'ok' : (isBad(body, db.settings.banned) ? 'pending' : 'ok');
        const c = { id: uid(), target, parentId: parentId || null, userId: me.id, nick: me.nick, body, created: new Date().toISOString(), status };
        db.comments.push(c);
        if (status === 'ok') award(u, 'comment', c.id, body.length);
        if (status === 'ok' && target !== 'guestbook') {
          const post = db.posts.find(x => x.id === target), par = parentId && db.comments.find(x => x.id === parentId);
          const pu = par && par.userId !== me.id ? par.userId : null;
          if (pu) notify(pu, 'reply', me.nick, `${me.nick}님이 내 댓글에 답글을 남겼어요: ${body.slice(0, 40)}`, '#/post/' + target);
          if (post && post.authorId && post.authorId !== me.id && post.authorId !== pu) notify(post.authorId, 'comment', me.nick, `${me.nick}님이 「${post.title.slice(0, 20)}」에 댓글을 남겼어요: ${body.slice(0, 40)}`, '#/post/' + target);
        }
        recalc(u); save();
        return withReward(before, cmtOut(c));
      },
      async deleteComment(id) {
        const c = db.comments.find(x => x.id === id); if (!c) return;
        if (!me || (!isStaff() && me.id !== c.userId)) throw new Error('삭제 권한이 없어요.');
        if (isStaff() && c.userId !== me.id) audit('comment_delete', 'comment', id, `${String(c.body).slice(0, 40)} · ${c.nick}`, '');
        db.comments = db.comments.filter(x => x.id !== id && x.parentId !== id); save();
      },

      async hitVisit() {
        if (!sess.get('deokjil_hit')) { db.visits[dayKey()] = (db.visits[dayKey()] || 0) + 1; save(); sess.set('deokjil_hit', '1'); }
        return { today: db.visits[dayKey()] || 0, total: Object.values(db.visits).reduce((a, b) => a + b, 0) };
      },
      async getSettings() { return mergeSettings(db.settings); },
      async saveSettings(s) { needAdmin(); db.settings = mergeSettings(s); save(); return db.settings; },

      /* ---- 프로필 · 포인트 · 상점 ---- */
      async getProfile(nick) {
        const u = db.users.find(x => x.nick === nick) || db.users.find(x => x.nick.toLowerCase() === String(nick).toLowerCase());
        return u ? profileOf(u) : null;
      },
      async pointLog(limit = 30) {
        const u = needLogin();
        return u.log.slice(0, limit).map(x => ({ delta: x.delta, reason: x.reason, ref: x.ref, created: x.created }));
      },
      async listShop(opts) { return { points: me ? userById(me.id).points : 0, items: shopRows(!!(opts && opts.all)) }; },
      async buyItem(id) {
        const u = needLogin();
        const it = shopRows(true).find(i => i.id === id);
        if (!it || !it.active) throw new Error('판매하지 않는 상품이에요.');
        if (it.price === 0) throw new Error('무료 상품이라 구매할 필요가 없어요.');
        if (u.inv.includes(id)) throw new Error('이미 가지고 있는 상품이에요.');
        if (u.points < it.price) throw new Error(`포인트가 부족해요 (필요 ${it.price}P, 보유 ${u.points}P)`);
        u.points -= it.price; u.inv.push(id);
        u.log.unshift({ delta: -it.price, reason: 'buy', ref: id, created: new Date().toISOString() });
        save(); refreshMe(); return { points: u.points };
      },
      async equipItem(id) {
        const u = needLogin();
        const it = shopRows(true).find(i => i.id === id);
        if (!it) throw new Error('없는 상품이에요.');
        if (!it.owned) throw new Error('구매한 상품만 사용할 수 있어요.');
        if (it.kind === 'theme') u.theme = id; else if (it.kind === 'skin') u.skin = id; else u.title = id;
        save(); refreshMe();
      },
      async clearTitle() { const u = needLogin(); u.title = ''; save(); refreshMe(); },
      /* 사용자 문서 (프로필에 보이는 마크다운 문서). 본인만 쓰고, 관리자급은 정리용으로 비울 수 있어요 */
      async saveBio(text) {
        const u = needLogin(); text = String(text || '');
        if (text.length > BIO_MAX) throw new Error(`문서는 ${BIO_MAX}자까지 쓸 수 있어요.`);
        if (!isStaff() && isBad(text, db.settings.banned)) throw new Error('문서에 사용할 수 없는 표현이 들어 있어요.');
        u.bio = text; u.bioUpdated = new Date().toISOString(); save();
      },
      async clearBio(id) {
        needManager(); const u = userById(id); if (!u) throw new Error('회원을 찾을 수 없어요.');
        if (me.role !== 'admin' && rankOf(u.role) >= rankOf(me.role)) throw new Error('나보다 높거나 같은 역할의 문서는 지울 수 없어요.');
        u.bio = ''; u.bioUpdated = new Date().toISOString(); save();
      },

      /* 프로필 사진 (작은 JPEG 를 글자로 저장) */
      async saveAvatar(dataUrl) {
        const u = needLogin(); dataUrl = String(dataUrl || '');
        if (!okAvatar(dataUrl) || !dataUrl) throw new Error('사진 형식이 올바르지 않거나 너무 커요.');
        u.avatar = dataUrl; save();
      },
      async clearAvatar(id) {
        const u = needLogin();
        if (id && id !== u.id) { needManager(); const t = userById(id); if (!t) throw new Error('회원을 찾을 수 없어요.'); t.avatar = ''; save(); return; }
        u.avatar = ''; save();
      },

      /* 출석체크 */
      async checkInStatus() {
        const u = needLogin(); const list = u.checkins || [];
        const today = dayKey(), yest = dayKey(new Date(Date.now() - 864e5));
        const last = list.length ? list[list.length - 1] : null;
        const done = !!last && last.day === today;
        const streak = last && (last.day === today || last.day === yest) ? last.streak : 0;
        const ym = today.slice(0, 7);
        return { done, streak, today: checkinAmount(done ? streak : streak + 1), days: list.filter(x => x.day.slice(0, 7) === ym).map(x => x.day), total: list.length };
      },
      async checkIn() {
        const u = needLogin(); u.checkins = u.checkins || [];
        const today = dayKey(), yest = dayKey(new Date(Date.now() - 864e5));
        const last = u.checkins.length ? u.checkins[u.checkins.length - 1] : null;
        if (last && last.day === today) return { already: true, points: 0, streak: last.streak };
        const streak = last && last.day === yest ? last.streak + 1 : 1;
        const amt = checkinAmount(streak);
        u.checkins.push({ day: today, streak }); if (u.checkins.length > 400) u.checkins.shift();
        u.log.unshift({ delta: amt, reason: 'checkin', ref: today, created: new Date().toISOString() });
        u.points += amt; save(); refreshMe();
        return { already: false, points: amt, streak, reward: { points: amt, gradeUp: null } };
      },

      /* 스크랩 */
      async bookmarkIds() { const u = needLogin(); return [...(u.bookmarks || [])]; },
      async toggleBookmark(id) {
        const u = needLogin(); u.bookmarks = u.bookmarks || [];
        if (!db.posts.some(p => p.id === id)) throw new Error('글을 찾을 수 없어요.');
        const i = u.bookmarks.indexOf(id);
        if (i >= 0) u.bookmarks.splice(i, 1); else { u.bookmarks.push(id); if (u.bookmarks.length > 500) u.bookmarks.shift(); }
        save(); return i < 0;
      },


      /* 운영진 채팅 (부관리자 이상) */
      async syncRole() { const u = me && userById(me.id); me = u ? pubUser(u) : null; return me; },
      async chatList(afterId) {
        needStaff();
        try { const f = JSON.parse(store.get(KEY)); if (f && Array.isArray(f.chat)) db.chat = f.chat; } catch (e) {}
        const l = (db.chat || []).filter(m => !afterId || m.id > afterId).slice(-100);
        return l.map(m => ({ id: m.id, userId: m.userId, nick: m.nick, body: m.body, created: m.created }));
      },
      async chatSend(text) {
        needStaff(); text = String(text || '').trim();
        if (!text) throw new Error('내용을 입력해 주세요.');
        if (text.length > 500) throw new Error('채팅은 500자까지 보낼 수 있어요.');
        try { const f = JSON.parse(store.get(KEY)); if (f && Array.isArray(f.chat)) db.chat = f.chat; } catch (e) {}
        db.chat = db.chat || [];
        const id = (db.chat.length ? db.chat[db.chat.length - 1].id : 0) + 1;
        db.chat.push({ id, userId: me.id, nick: me.nick, body: text, created: new Date().toISOString() });
        const cut = Date.now() - 30 * 864e5; db.chat = db.chat.filter(m => new Date(m.created).getTime() > cut).slice(-500);
        save(); return id;
      },
      async chatReads() {
        needStaff();
        try { const f = JSON.parse(store.get(KEY)); if (f && f.chatReads) db.chatReads = f.chatReads; } catch (e) {}
        const r = db.chatReads || {};
        return db.users.filter(u => isStaffRole(u.role)).map(u => ({ userId: u.id, lastId: r[u.id] || 0 }));
      },
      async chatMarkRead(upto) {
        needStaff(); try { const f = JSON.parse(store.get(KEY)); if (f && f.chatReads) db.chatReads = f.chatReads; } catch (e) {}
        db.chatReads = db.chatReads || {}; if ((db.chatReads[me.id] || 0) < upto) { db.chatReads[me.id] = upto; save(); }
      },
      async chatDelete(id) {
        needStaff(); const m = (db.chat || []).find(x => x.id === id); if (!m) return;
        if (m.userId !== me.id && !isManagerRole(me.role)) throw new Error('내 말풍선만 지울 수 있어요.');
        db.chat = db.chat.filter(x => x.id !== id); save();
      },

      /* 문의/건의 */
      async inqSubmit(d) {
        const u = needLogin(); d = d || {};
        const category = INQ_CATS.includes(d.category) ? d.category : '문의';
        const title = String(d.title || '').trim(), body = String(d.body || '').trim();
        if (!title || title.length > 60) throw new Error('제목은 1~60자로 써 주세요.');
        if (!body || body.length > 3000) throw new Error('내용은 1~3000자로 써 주세요.');
        db.inquiries = db.inquiries || [];
        if (db.inquiries.filter(x => x.userId === u.id && Date.now() - new Date(x.created).getTime() < 864e5).length >= 5) throw new Error('문의는 하루에 5개까지 보낼 수 있어요.');
        const q = { id: uid(), userId: u.id, nick: u.nick, category, title, body, status: 'open', reply: '', repliedBy: '', repliedAt: null, created: new Date().toISOString() };
        db.inquiries.push(q); save(); return q;
      },
      async inqMine() { const u = needLogin(); return (db.inquiries || []).filter(x => x.userId === u.id).sort((a, b) => new Date(b.created) - new Date(a.created)); },
      async inqAll() { needStaff(); return [...(db.inquiries || [])].sort((a, b) => new Date(b.created) - new Date(a.created)); },
      async inqReply(id, d) {
        needStaff(); const q = (db.inquiries || []).find(x => x.id === id); if (!q) throw new Error('문의를 찾을 수 없어요.');
        const reply = String(d.reply == null ? q.reply : d.reply).trim();
        if (reply.length > 3000) throw new Error('답변은 3000자까지 쓸 수 있어요.');
        let status = ['open', 'answered', 'closed'].includes(d.status) ? d.status : q.status;
        if (reply !== q.reply) { q.repliedBy = me.nick; q.repliedAt = new Date().toISOString(); if (reply && status === 'open') status = 'answered'; if (reply) notify(q.userId, 'inquiry', me.nick, '문의에 답변이 달렸어요: ' + q.title.slice(0, 30), '#/inquiry'); }
        q.reply = reply; q.status = status; save(); return q;
      },
      async inqDelete(id) {
        const u = needLogin(); const q = (db.inquiries || []).find(x => x.id === id); if (!q) return;
        if (q.userId !== u.id && !isManagerRole(me.role)) throw new Error('지울 수 없어요.');
        db.inquiries = db.inquiries.filter(x => x.id !== id); save();
      },
      async inqOpenCount() { needStaff(); return (db.inquiries || []).filter(x => x.status === 'open').length; },

      /* 운영진 휴게실 */
      async loungeSubmit(game, score) {
        needStaff(); const g = LOUNGE_GAMES[game]; if (!g) throw new Error('없는 게임이에요.');
        score = Number(score); if (!isFinite(score) || score < g.lo || score > g.hi) throw new Error('기록이 올바르지 않아요.');
        db.lounge = db.lounge || {}; const k = me.id + '|' + game; const o = db.lounge[k];
        const better = !o || (g.low ? score < o.best : score > o.best);
        db.lounge[k] = { userId: me.id, nick: me.nick, game, best: better ? score : o.best, plays: (o ? o.plays : 0) + 1 }; save();
        return { best: db.lounge[k].best, isBest: better };
      },
      async loungeBoard(game) {
        needStaff(); const g = LOUNGE_GAMES[game]; if (!g) return [];
        return Object.values(db.lounge || {}).filter(x => x.game === game).sort((a, b) => g.low ? a.best - b.best : b.best - a.best).slice(0, 10).map(x => ({ userId: x.userId, nick: x.nick, best: x.best, plays: x.plays }));
      },

      /* 운영진 회의실 */
      async meetList() {
        needStaff(); db.meetings = db.meetings || []; db.mmem = db.mmem || [];
        return db.meetings.slice().sort((a, b) => new Date(b.start) - new Date(a.start)).map(m => {
          const mem = db.mmem.filter(x => x.meetingId === m.id), mine = mem.find(x => x.userId === me.id) || {};
          return { ...m, yes: mem.filter(x => x.rsvp === 'yes').length, no: mem.filter(x => x.rsvp === 'no').length, maybe: mem.filter(x => x.rsvp === 'maybe').length, joined: mem.filter(x => x.joinedAt).length, myRsvp: mine.rsvp || '', myJoined: !!mine.joinedAt };
        });
      },
      async meetGet(id) {
        needStaff(); db.meetings = db.meetings || [];
        const m = db.meetings.find(x => x.id === id); if (!m) return null;
        const members = (db.mmem || []).filter(x => x.meetingId === id).map(x => ({ userId: x.userId, nick: x.nick, rsvp: x.rsvp || '', joinedAt: x.joinedAt || null }));
        const polls = (db.mpolls || []).filter(x => x.meetingId === id).map(p => {
          const vs = (db.mvotes || []).filter(v => v.pollId === p.id);
          return { id: p.id, question: p.question, options: p.options, closed: !!p.closed, counts: p.options.map((_, i) => vs.filter(v => v.choice === i).length), voters: p.options.map((_, i) => vs.filter(v => v.choice === i).map(v => v.nick)), mine: (vs.find(v => v.userId === me.id) || {}).choice };
        });
        return { ...m, members, polls };
      },
      async meetSave(d) {
        needManager(); const v = meetCheck(d); db.meetings = db.meetings || [];
        if (d.id) {
          const m = db.meetings.find(x => x.id === d.id); if (!m) throw new Error('회의를 찾을 수 없어요.');
          Object.assign(m, v); if (d.minutes != null) { const mn = String(d.minutes); if (mn.length > 8000) throw new Error('회의록은 8000자까지예요.'); m.minutes = mn; }
          save(); return m;
        }
        const m = { id: uid(), ...v, minutes: '', creator: me.nick, creatorId: me.id, created: new Date().toISOString() };
        db.meetings.push(m);
        db.users.filter(u => isStaffRole(u.role) && u.id !== me.id).forEach(u => notify(u.id, 'meeting', me.nick, `🗓 새 회의: ${m.title.slice(0, 40)}`, 'admin.html#/meetings/' + m.id));
        save(); return m;
      },
      async meetDelete(id) {
        needManager(); db.meetings = (db.meetings || []).filter(x => x.id !== id);
        ['mmem', 'mmsg', 'mpolls'].forEach(k => { db[k] = (db[k] || []).filter(x => x.meetingId !== id); });
        db.mvotes = (db.mvotes || []).filter(v => (db.mpolls || []).some(p => p.id === v.pollId)); save();
      },
      async meetRsvp(id, st) {
        needStaff(); if (!['yes', 'no', 'maybe'].includes(st)) throw new Error('응답이 올바르지 않아요.');
        const m = (db.meetings || []).find(x => x.id === id); if (!m) throw new Error('회의를 찾을 수 없어요.');
        if (Date.now() >= new Date(m.end).getTime()) throw new Error('이미 끝난 회의예요.');
        db.mmem = db.mmem || []; let r = db.mmem.find(x => x.meetingId === id && x.userId === me.id);
        if (!r) { r = { meetingId: id, userId: me.id, nick: me.nick }; db.mmem.push(r); } r.rsvp = st; save();
      },
      async meetJoin(id) {
        needStaff(); const m = (db.meetings || []).find(x => x.id === id); if (!m) throw new Error('회의를 찾을 수 없어요.');
        if (meetPhase(m) !== 'open') throw new Error('지금은 입장할 수 있는 시간이 아니에요.');
        db.mmem = db.mmem || []; let r = db.mmem.find(x => x.meetingId === id && x.userId === me.id);
        if (!r) { r = { meetingId: id, userId: me.id, nick: me.nick }; db.mmem.push(r); } if (!r.joinedAt) r.joinedAt = new Date().toISOString(); save();
      },
      async meetChatList(id, afterId) {
        needStaff();
        try { const f = JSON.parse(store.get(KEY)); if (f && Array.isArray(f.mmsg)) db.mmsg = f.mmsg; } catch (e) {}
        return (db.mmsg || []).filter(x => x.meetingId === id && (!afterId || x.seq > afterId)).slice(-150).map(x => ({ id: x.seq, userId: x.userId, nick: x.nick, body: x.body, created: x.created }));
      },
      async meetChatSend(id, body) {
        needStaff(); body = String(body || '').trim(); const m = (db.meetings || []).find(x => x.id === id); if (!m) throw new Error('회의를 찾을 수 없어요.');
        if (!body || body.length > 500) throw new Error('메시지는 1~500자로 써 주세요.');
        const ph = meetPhase(m); if (ph === 'upcoming' || ph === 'ended') throw new Error('지금은 채팅할 수 있는 시간이 아니에요.');
        db.mmsg = db.mmsg || []; const seq = (db.mmsg.reduce((a, x) => Math.max(a, x.seq), 0)) + 1;
        db.mmsg.push({ seq, meetingId: id, userId: me.id, nick: me.nick, body, created: new Date().toISOString() }); if (db.mmsg.length > 2000) db.mmsg.shift(); save(); return { id: seq };
      },
      async meetChatDelete(id, seq) {
        needStaff(); const x = (db.mmsg || []).find(y => y.meetingId === id && y.seq === seq); if (!x) return;
        if (x.userId !== me.id && !isManagerRole(me.role)) throw new Error('내 메시지만 지울 수 있어요.');
        db.mmsg = db.mmsg.filter(y => y !== x); save();
      },
      async pollCreate(mid, question, options) {
        needManager(); const v = pollCheck(question, options); if (!(db.meetings || []).some(x => x.id === mid)) throw new Error('회의를 찾을 수 없어요.');
        db.mpolls = db.mpolls || []; const p = { id: uid(), meetingId: mid, ...v, closed: false }; db.mpolls.push(p); save(); return p;
      },
      async pollClose(pid, closed) { needManager(); const p = (db.mpolls || []).find(x => x.id === pid); if (p) { p.closed = !!closed; save(); } },
      async pollDelete(pid) { needManager(); db.mpolls = (db.mpolls || []).filter(x => x.id !== pid); db.mvotes = (db.mvotes || []).filter(v => v.pollId !== pid); save(); },
      async pollVote(pid, choice) {
        needStaff(); const p = (db.mpolls || []).find(x => x.id === pid); if (!p) throw new Error('투표를 찾을 수 없어요.');
        if (p.closed) throw new Error('마감된 투표예요.'); if (!(choice >= 0 && choice < p.options.length)) throw new Error('선택지가 올바르지 않아요.');
        const m = (db.meetings || []).find(x => x.id === p.meetingId); if (m && meetPhase(m) === 'ended') throw new Error('투표 시간이 지났어요.');
        db.mvotes = db.mvotes || []; let v = db.mvotes.find(x => x.pollId === pid && x.userId === me.id);
        if (!v) { v = { pollId: pid, userId: me.id, nick: me.nick }; db.mvotes.push(v); } v.choice = choice; save();
      },
      async meetNext() {
        if (!me || !isStaffRole(me.role)) return null;
        const l = (db.meetings || []).filter(m => meetPhase(m) !== 'ended').sort((a, b) => new Date(a.start) - new Date(b.start));
        return l[0] ? { id: l[0].id, title: l[0].title, start: l[0].start, end: l[0].end, phase: meetPhase(l[0]) } : null;
      },

      async nickExists(nick) {
        nick = String(nick || '').trim(); if (!NICK_RE.test(nick)) return null;
        const u = db.users.find(x => x.nick.toLowerCase() === nick.toLowerCase()); return u ? u.nick : null;
      },
      /* 알림 */
      async notifList(limit) {
        const u = needLogin();
        return (db.notifs || []).filter(n => n.userId === u.id).sort((a, b) => new Date(b.created) - new Date(a.created)).slice(0, limit || 60)
          .map(n => ({ id: n.id, kind: n.kind, actor: n.actor, text: n.text, link: n.link, read: n.read, created: n.created }));
      },
      async notifRead(ids) {
        const u = needLogin(); const set = ids ? new Set(ids) : null;
        (db.notifs || []).forEach(n => { if (n.userId === u.id && (!set || set.has(n.id))) n.read = true; }); save();
      },
      async notifClear() { const u = needLogin(); db.notifs = (db.notifs || []).filter(n => n.userId !== u.id); save(); },

      /* 쪽지 */
      async dmSend(toNick, body) {
        dmPurgeLocal();
        const u = needLogin(); banCheck(); body = String(body || '').trim();
        const r = db.users.find(x => x.nick.toLowerCase() === String(toNick || '').trim().toLowerCase());
        if (!r) throw new Error('받는 사람을 찾을 수 없어요.');
        if (r.id === u.id) throw new Error('나에게는 쪽지를 보낼 수 없어요.');
        if (!body || body.length > 500) throw new Error('쪽지는 1~500자로 써 주세요.');
        if (isBad(body, db.settings.banned)) throw new Error('쓸 수 없는 표현이 들어 있어요.');
        const m = { id: uid(), fromId: u.id, toId: r.id, fromNick: u.nick, toNick: r.nick, body, read: false, delS: false, delR: false, created: new Date().toISOString() };
        db.dms.push(m); save(); return { id: m.id };
      },
      async dmThreads() {
        dmPurgeLocal();
        const u = needLogin(), map = new Map();
        db.dms.filter(m => (m.fromId === u.id && !m.delS) || (m.toId === u.id && !m.delR)).sort((a, b) => new Date(a.created) - new Date(b.created)).forEach(m => {
          const mine = m.fromId === u.id, nick = mine ? m.toNick : m.fromNick;
          const t = map.get(nick) || { nick, unread: 0 };
          t.last = m.body; t.lastAt = m.created; t.mine = mine; if (!mine && !m.read) t.unread++; map.set(nick, t);
        });
        return [...map.values()].sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
      },
      async dmThread(nick) {
        dmPurgeLocal();
        const u = needLogin(); nick = String(nick || '').toLowerCase();
        const rows = db.dms.filter(m => ((m.fromId === u.id && !m.delS && m.toNick.toLowerCase() === nick) || (m.toId === u.id && !m.delR && m.fromNick.toLowerCase() === nick)))
          .sort((a, b) => new Date(a.created) - new Date(b.created));
        rows.forEach(m => { if (m.toId === u.id) m.read = true; }); save();
        return rows.map(m => ({ id: m.id, mine: m.fromId === u.id, body: m.body, created: m.created, read: m.read }));
      },
      async dmDelete(ids) {
        const u = needLogin(); const set = new Set(ids || []);
        db.dms.forEach(m => { if (set.has(m.id)) { if (m.fromId === u.id) m.delS = true; if (m.toId === u.id) m.delR = true; } });
        db.dms = db.dms.filter(m => !(m.delS && m.delR)); save();
      },
      async pushSubscribe() { /* 데모 모드는 서버가 없어서 열린 탭 알림만 써요 */ },
      async pushUnsubscribe() {},
      async unreadCounts() {
        if (!me) return { notif: 0, dm: 0 };
        return { notif: (db.notifs || []).filter(n => n.userId === me.id && !n.read).length, dm: db.dms.filter(m => m.toId === me.id && !m.read && !m.delR).length };
      },


      /* ---- 운영진 ---- */
      async listAllComments() { needStaff(); return [...db.comments].sort((a, b) => new Date(b.created) - new Date(a.created)).map(cmtOut); },
      async setCommentStatus(id, status) {
        needStaff();
        const c = db.comments.find(x => x.id === id); if (!c) return;
        if (c.held && status === 'ok') { await api.contentReview('comment', id, 'restore'); return; }
        const was = c.status; c.status = status;
        const u = userById(c.userId);
        if (u && was === 'pending' && status === 'ok') { award(u, 'comment', c.id, c.body.length); recalc(u); }
        save();
      },
      async listPendingPosts() { needStaff(); return db.posts.filter(p => p.status === 'pending').map(postOut); },
      async setPostStatus(id, status) {
        needStaff();
        const p = db.posts.find(x => x.id === id); if (!p) return;
        if (p.held && status === 'ok') { await api.contentReview('post', id, 'restore'); return; }
        const was = p.status; p.status = status;
        const u = authorOf(p);
        if (u && was === 'pending' && status === 'ok') { if (p.board !== 'upgrade') award(u, 'post', p.id, p.body.length); recalc(u); }
        save();
      },
      async listUsers() {
        needStaff();
        return db.users.map(u => ({ id: u.id, nick: u.nick, role: u.role, created: u.created, grade: u.grade, gradeLock: !!u.gradeLock, points: u.points, stats: statsOf(u), ktxEligible: ktxOk(u),
          bannedUntil: u.bannedUntil && new Date(u.bannedUntil) > new Date() ? u.bannedUntil : null, banReason: u.bannedUntil && new Date(u.bannedUntil) > new Date() ? (u.banReason || '') : '' }));
      },
      /* ---- 회원 정지 · 감사 로그 · 내 노선도 ---- */
      async setSuspension(id, days, reason) {
        needStaff(); days = Math.trunc(+days); reason = String(reason || '').trim();
        const t = userById(id); if (!t) throw new Error('회원을 찾을 수 없어요.');
        if (t.id === me.id) throw new Error('나 자신은 정지할 수 없어요.');
        if (rankOf(t.role) >= rankOf(me.role)) throw new Error('나와 같거나 높은 역할의 회원은 정지할 수 없어요.');
        if (!(days >= 0 && days <= 365)) throw new Error('정지 기간은 1~365일이에요.');
        if (days === 0) { t.bannedUntil = null; t.banReason = ''; audit('unsuspend', 'user', id, t.nick, reason); notify(t.id, 'report', '운영진', '계정 정지가 풀렸어요. 운영정책을 지켜 주세요', '#/policy'); }
        else {
          if (reason.length < 5 || reason.length > 200) throw new Error('정지 사유를 5~200자로 적어 주세요.');
          t.bannedUntil = new Date(Date.now() + days * 864e5).toISOString(); t.banReason = reason;
          audit('suspend', 'user', id, `${t.nick} · ${days}일`, reason); notify(t.id, 'report', '운영진', `${days}일 동안 글쓰기가 제한됐어요 (${reason})`, '#/policy');
        }
        save();
      },
      async auditLogs() { needManager(); return (db.audit || []).slice(0, 300); },
      async routeMarks() { const u = needLogin(); return (u.routes || []).slice(); },
      async routeMarkSet(kind, key, label, status, note) {
        const u = needLogin(); kind = String(kind); key = String(key || '').trim().toLowerCase().slice(0, 40); label = String(label || '').trim().slice(0, 40);
        if (!['line', 'station', 'bus', 'train'].includes(kind)) throw new Error('종류가 잘못됐어요.');
        if (!key || !label) throw new Error('이름을 적어 주세요.');
        status = status === 'done' ? 'done' : 'ridden'; note = String(note || '').trim().slice(0, 60);
        if (isBad(label + ' ' + note, db.settings.banned)) throw new Error('쓸 수 없는 표현이 들어 있어요.');
        const rs = u.routes = u.routes || []; const i = rs.findIndex(r => r.kind === kind && r.key === key);
        if (i >= 0) Object.assign(rs[i], { label, status, note });
        else { if (rs.length >= 500) throw new Error('노선도 기록은 500개까지 남길 수 있어요.'); rs.push({ kind, key, label, status, note, created: new Date().toISOString() }); }
        save();
      },
      async trips() { const u = needLogin(); return (u.trips || []).slice().sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created)); },
      async tripAdd(d) {
        const u = needLogin(); const t = cleanTrip(d);
        if (isBad(t.legs.map(l => l.from + ' ' + l.to + ' ' + l.label).join(' ') + ' ' + t.note, db.settings.banned)) throw new Error('쓸 수 없는 표현이 들어 있어요.');
        const ts = u.trips = u.trips || []; if (ts.length >= 300) throw new Error('이동 기록은 300개까지 남길 수 있어요.');
        const row = Object.assign({ id: uid(), created: new Date().toISOString() }, t); ts.push(row); save(); return row;
      },
      async tripDel(id) { const u = needLogin(); u.trips = (u.trips || []).filter(t => t.id !== id); save(); },
      async routeMarkDel(kind, key) { const u = needLogin(); u.routes = (u.routes || []).filter(r => !(r.kind === kind && r.key === String(key).toLowerCase())); save(); },
      async setUserRole(id, role) {
        needManager();
        const u = userById(id);
        if (!u) throw new Error('회원을 찾을 수 없어요.');
        if (u.role === 'admin' || u.id === me.id) throw new Error('총관리자·내 권한은 바꿀 수 없어요.');
        if (me.role === 'admin') { if (!['user', 'subadmin', 'manager'].includes(role)) throw new Error('지정할 수 없는 권한이에요.'); }
        else {
          if (!['user', 'subadmin'].includes(role)) throw new Error('관리자는 회원·부관리자만 지정할 수 있어요.');
          if (!['user', 'subadmin'].includes(u.role)) throw new Error('나와 같거나 높은 역할은 바꿀 수 없어요.');
        }
        audit('role_change', 'user', id, `${u.nick} · ${u.role} → ${role}`, ''); u.role = role; save();
      },
      async approveKtx(id) {
        needStaff();
        const u = userById(id);
        if (!u) throw new Error('회원을 찾을 수 없어요.');
        if (!ktxOk(u)) throw new Error('KTX 조건을 아직 채우지 못한 회원이에요.');
        u.grade = 4; save();
      },
      /* 부관리자 이상: 포인트 증감(add) / 지정(set). 자기보다 낮은 역할만 (총관리자는 누구나) */
      async adjustPoints(id, mode, amount, note) {
        needStaff();
        const u = userById(id); if (!u) throw new Error('회원을 찾을 수 없어요.');
        if (me.role !== 'admin' && rankOf(u.role) >= rankOf(me.role)) throw new Error('나보다 높거나 같은 역할의 포인트는 바꿀 수 없어요.');
        amount = Math.trunc(+amount || 0);
        let np;
        if (mode === 'set') { if (amount < 0) throw new Error('포인트는 0 이상으로 지정해 주세요.'); np = amount; }
        else if (mode === 'add') np = Math.max(0, u.points + amount);
        else throw new Error('알 수 없는 방식이에요.');
        if (np === u.points) return u.points;
        u.log.unshift({ delta: np - u.points, reason: 'admin', ref: String(note || '').slice(0, 60), created: new Date().toISOString() });
        u.points = np; save(); refreshMe(); return np;
      },
      async grantPoints(id, amount, note) { return api.adjustPoints(id, 'add', amount, note); },
      /* lvl 1~4 = 그 등급으로 고정, 0 = 자동(활동 조건대로) */
      async setGrade(id, lvl) {
        needStaff();
        const u = userById(id); if (!u) throw new Error('회원을 찾을 수 없어요.');
        if (me.role !== 'admin' && rankOf(u.role) >= rankOf(me.role)) throw new Error('나보다 높거나 같은 역할의 등급은 바꿀 수 없어요.');
        lvl = Math.trunc(+lvl);
        if (!(lvl >= 0 && lvl <= 4)) throw new Error('등급은 1~4 사이로 정해 주세요.');
        if (lvl === 0) { u.gradeLock = false; u.grade = 1; recalc(u); }
        else { u.grade = lvl; u.gradeLock = true; }
        save(); refreshMe(); return u.grade;
      },
      async listUpgradeRequests() {
        needStaff();
        return db.posts.filter(p => p.board === 'upgrade').sort((a, b) => new Date(b.created) - new Date(a.created)).map(p => {
          const u = authorOf(p);
          return { post: postOut(p), user: u ? { id: u.id, nick: u.nick, role: u.role, grade: u.grade, points: u.points, stats: statsOf(u), ktxEligible: ktxOk(u) } : null };
        });
      },
      async saveShopItem(d) {
        needManager();
        if (!catalogItem(d.id)) throw new Error('없는 상품이에요.');
        db.shop[d.id] = { price: Math.max(0, Math.trunc(+d.price || 0)), active: d.active !== false }; save();
      },
      async uploadImage() { throw new Error('로컬 데모 모드에서는 사진 올리기를 쓸 수 없어요. Supabase를 연결하면 쓸 수 있어요.'); },
      async stats() {
        needStaff();
        const days = [];
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ day: dayKey(d), count: db.visits[dayKey(d)] || 0 }); }
        return {
          posts: db.posts.filter(p => p.status === 'ok').length, views: db.posts.reduce((a, p) => a + (p.views || 0), 0),
          comments: db.comments.filter(c => c.status === 'ok').length, pending: db.comments.filter(c => c.status === 'pending').length,
          pendingPosts: db.posts.filter(p => p.status === 'pending').length,
          users: db.users.length, today: db.visits[dayKey()] || 0, total: Object.values(db.visits).reduce((a, b) => a + b, 0), days
        };
      },
      exportData() { needAdmin(); return JSON.stringify(db, null, 1); },
      importData(text) {
        needAdmin();
        const d = JSON.parse(text);
        if (!d || !Array.isArray(d.posts) || !Array.isArray(d.users)) throw new Error('덕질역 백업 파일이 아니에요.');
        db = migrate(d); db.comments = db.comments || []; db.visits = db.visits || {}; db.settings = mergeSettings(db.settings); save();
      },
      resetAll() { needAdmin(); db = seed(); db.settings = mergeSettings(db.settings); save(); try { localStorage.removeItem(SES); } catch (e) {} me = null; }
    };
    return api;
  }

  /* ====================== Supabase 모드 ====================== */
  function makeSupabase() {
    /* 메일의 링크를 눌러 돌아왔을 때(#access_token=...&type=signup 등) 어떤 일이었는지 먼저 기록해 둬요 */
    const AUTH_RETURN = (() => {
      const h = String(location.hash || '').replace(/^#/, ''); if (!/(^|&)(type|error|error_code)=/.test(h)) return null;
      const q = new URLSearchParams(h.replace(/^\/?/, '')); return { type: q.get('type') || '', error: q.get('error_code') || q.get('error') || '' };
    })();
    const RETURN_URL = location.origin + '/';
    /* 로그인 세션은 session-store.js 가 저장해요: *.deokjil.xyz 에서는 쿠키(제보 사이트와 공유), 그 밖에서는 localStorage */
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, window.DeokjilSessionStorage ? { auth: { storage: window.DeokjilSessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } } : undefined);
    let me = null, legacy = false;
    const emailOf = async nick => (await sha256(nick.toLowerCase())).slice(0, 32) + '@deokjil.site';
    const must = r => { if (r.error) throw new Error(friendly(r.error.message)); return r.data; };
    const marketRow = x => ({ id: x.id, sellerId: x.seller_id, seller: x.seller_nick, title: x.title, category: x.category, price: x.price, cond: x.cond, method: x.method, region: x.region, body: x.body,
      images: x.images || [], status: x.status, hiddenWhy: x.hidden_why || '', buyerId: x.buyer_id, buyer: x.buyer_nick || '', views: x.views || 0, created: x.created_at, bumped: x.bumped_at,
      mine: !!me && x.seller_id === me.id, isBuyer: !!me && !!x.buyer_id && x.buyer_id === me.id });
    const friendly = m => {
      m = m || '서버 오류';
      if (/row-level security|violates row-level/i.test(m)) return '권한이 없어요.';
      if (/function .* does not exist|could not find the function|schema cache/i.test(m)) return '서버(DB) 업그레이드가 필요해요. supabase/v2_community.sql 을 실행해 주세요.';
      return m;
    };
    const PCOLS = 'id,nick,role,grade,points,theme,skin,title';
    const inqOut = r => ({ id: r.id, userId: r.user_id, nick: r.nick, category: r.category, title: r.title, body: r.body, status: r.status, reply: r.reply || '', repliedBy: r.replied_by || '', repliedAt: r.replied_at, created: r.created_at });
    async function loadMe(refresh) {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { me = null; return null; }
      if (refresh) { try { await sb.rpc('refresh_grade'); } catch (e) { /* v2 SQL 전이면 무시 */ } }
      let r = await sb.from('profiles').select(PCOLS).eq('id', session.user.id).maybeSingle();
      if (r.error) {                       // v2 SQL 을 아직 안 돌린 DB
        r = await sb.from('profiles').select('id,nick,role').eq('id', session.user.id).maybeSingle();
        legacy = true;
        if (r.data) Object.assign(r.data, { grade: 1, points: 0, theme: 'station', skin: 'basic', title: '' });
      }
      me = r.data || null;
      if (me) {
        const c = await sb.from('profiles').select('consent_at').eq('id', me.id).maybeSingle(); me.consent = c.error ? true : !!(c.data && c.data.consent_at);
        const bn = await sb.from('profiles').select('banned_until,ban_reason').eq('id', me.id).maybeSingle();   // v4 SQL 전이면 건너뛰어요
        const bu = !bn.error && bn.data && bn.data.banned_until && new Date(bn.data.banned_until) > new Date() ? bn.data.banned_until : null;
        me.bannedUntil = bu; me.banReason = bu ? (bn.data.ban_reason || '') : '';
      }
      return me;
    }
    async function withReward(fn) {
      const b = me ? { p: me.points || 0, g: me.grade || 1 } : null;
      const out = await fn();
      if (b) {
        await loadMe();
        if (me && out && typeof out === 'object') out.reward = { points: (me.points || 0) - b.p, gradeUp: me.grade > b.g ? { from: b.g, to: me.grade } : null };
      }
      return out;
    }
    async function loadRules() {
      try {
        const [g, p] = await Promise.all([sb.from('grade_rules').select('*').order('level'), sb.from('point_rules').select('*')]);
        if (!g.error && g.data && g.data.length) {
          RULES.grades = g.data.map(r => ({ level: r.level, key: r.key, name: r.name, icon: r.icon,
            color: (C.grades.find(x => x.level === r.level) || {}).color || '#0052a4',
            minWeeks: r.min_weeks, minPosts: r.min_posts, minComments: r.min_comments, minLikes: r.min_likes, needApproval: r.need_approval }));
        }
        if (!p.error && p.data && p.data.length) {
          RULES.points = {};
          p.data.forEach(r => { RULES.points[r.key] = { amount: r.amount, dailyCap: r.daily_cap, minLen: r.min_len, label: r.label }; });
        }
      } catch (e) { /* 기본값 사용 */ }
    }
    async function profMap() {
      let r = await sb.from('profiles').select('id,role,grade,title');
      if (r.error) r = await sb.from('profiles').select('id,role');
      return new Map((r.data || []).map(x => [x.id, { role: x.role, grade: x.grade || 1, title: x.title || '' }]));
    }
    const postOut = (r, likes, cm, pm) => {
      const a = (pm && pm.get(r.author_id)) || {};
      return {
        id: r.id, board: r.board, title: r.title, body: r.body, tags: r.tags || [], pinned: !!r.pinned, status: r.held ? 'pending' : (r.status || 'ok'), held: !!r.held, heldWhy: r.held_why || '', license: okLicense(r.license),
        author: r.author_nick || '', authorId: r.author_id || null, authorRole: a.role || 'user', authorGrade: a.grade || 1, authorTitle: a.title || '',
        views: r.views || 0, created: r.created_at, updated: r.updated_at,
        likes: likes.filter(l => l.post_id === r.id).length,
        liked: !!me && likes.some(l => l.post_id === r.id && l.user_id === me.id),
        comments: cm.filter(c => c.target === r.id && c.status === 'ok').length
      };
    };
    const cmtOut = (r, pm) => {
      const a = (pm && pm.get(r.user_id)) || {};
      return { id: r.id, target: r.target, parentId: r.parent_id, userId: r.user_id, nick: r.nick, body: r.body,
        created: r.created_at, status: r.held ? 'pending' : r.status, held: !!r.held, heldWhy: r.held_why || '', role: a.role || 'user', grade: a.grade || 1, title: a.title || '', isAdmin: a.role === 'admin' };
    };
    /* 운영진용: 회원별 활동 통계 (서버 계산식과 같게) */
    async function userStats() {
      let ucols = 'id,nick,role,created_at,grade,points,grade_lock,banned_until,ban_reason';
      if ((await sb.from('profiles').select(ucols).limit(1)).error) ucols = 'id,nick,role,created_at,grade,points,grade_lock';   // v4 SQL 전
      const [u, p, c, l] = await Promise.all([
        sb.from('profiles').select(ucols).order('created_at', { ascending: true }),
        sb.from('posts').select('author_id,status,board'), sb.from('comments').select('user_id,status'), sb.from('post_likes').select('user_id')
      ]);
      const users = must(u), posts = must(p), cms = must(c), lks = must(l);
      const cnt = (arr, key, f) => { const m = {}; arr.forEach(x => { if (!f || f(x)) m[x[key]] = (m[x[key]] || 0) + 1; }); return m; };
      const pc = cnt(posts, 'author_id', x => x.status === 'ok' && x.board !== 'upgrade'), cc = cnt(cms, 'user_id', x => x.status === 'ok'), lc = cnt(lks, 'user_id');
      const kr = RULES.grades.find(g => g.needApproval);
      return users.map(x => {
        const stats = { weeks: Math.max(0, Math.floor((Date.now() - new Date(x.created_at).getTime()) / (7 * 864e5))), posts: pc[x.id] || 0, comments: cc[x.id] || 0, likes: lc[x.id] || 0 };
        return { id: x.id, nick: x.nick, role: x.role, created: x.created_at, grade: x.grade || 1, gradeLock: !!x.grade_lock, points: x.points || 0, stats, ktxEligible: statMeets(stats, kr),
          bannedUntil: x.banned_until && new Date(x.banned_until) > new Date() ? x.banned_until : null, banReason: x.banned_until && new Date(x.banned_until) > new Date() ? (x.ban_reason || '') : '' };
      });
    }
    const api = {
      mode: 'supabase',
      legacy: () => legacy,
      async init() {
        if (sessionExpired()) { try { await sb.auth.signOut(); } catch (e) {} }
        keepAlive();
        await loadMe(true); await loadRules(); sb.auth.onAuthStateChange(() => {});
      },
      me: () => me,
      async refresh() { await loadMe(true); return me; },
      /* 회원가입: 이메일 + 닉네임 + 비밀번호 → 인증 메일 (Supabase "Confirm email" 켜기) */
      async signup(nick, pw, remember, email, consent) {
        nick = (nick || '').trim(); validateNick(nick); validatePw(pw); email = validateEmail(email);
        const cs = checkConsent(consent);
        const taken = await sb.from('profiles').select('nick').eq('nick', nick).maybeSingle();
        if (taken.data) throw new Error('이미 사용 중인 닉네임이에요.');
        setRemember(remember);
        const r = await sb.auth.signUp({ email, password: pw, options: { data: { nick, agree: true, under14: cs.under14, guardian: cs.guardian, ver: cs.ver }, emailRedirectTo: RETURN_URL } });
        if (r.error) {
          if (/registered|exists/i.test(r.error.message)) throw new Error('이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요.');
          if (/database error/i.test(r.error.message)) throw new Error('이미 사용 중인 닉네임이거나 가입 중 오류가 났어요.');
          if (/rate limit|too many|seconds/i.test(r.error.message)) throw new Error('인증 메일을 너무 자주 보냈어요. 잠시 후에 다시 해 주세요.');
          throw new Error(r.error.message);
        }
        if (r.data && r.data.user && Array.isArray(r.data.user.identities) && r.data.user.identities.length === 0) throw new Error('이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써 주세요.');
        if (r.data && r.data.session) { await loadMe(); if (me) return me; }
        return { verify: true, email };
      },
      async verifyEmail(email, code, remember) {
        if (remember !== undefined) setRemember(remember);
        const r = await sb.auth.verifyOtp({ email: String(email || '').trim().toLowerCase(), token: String(code || '').trim(), type: 'signup' });
        if (r.error) throw new Error('인증번호가 맞지 않거나 시간이 지났어요. 메일을 다시 보내 보세요.');
        await loadMe(true); return me;
      },
      async resendVerify(email) {
        const r = await sb.auth.resend({ type: 'signup', email: String(email || '').trim().toLowerCase(), options: { emailRedirectTo: RETURN_URL } });
        if (r.error) throw new Error(/rate|seconds|too many/i.test(r.error.message) ? '메일을 너무 자주 보냈어요. 잠시 후에 다시 해 주세요.' : r.error.message);
        return {};
      },
      async login(idOrEmail, pw, remember) {
        setRemember(remember);
        const id = (idOrEmail || '').trim();
        const email = id.includes('@') ? id.toLowerCase() : await emailOf(id);
        const r = await sb.auth.signInWithPassword({ email, password: pw });
        if (r.error) {
          if (/not confirmed/i.test(r.error.message)) throw unverifiedErr(email);
          throw new Error(id.includes('@') ? '이메일 또는 비밀번호가 맞지 않아요.' : '닉네임 또는 비밀번호가 맞지 않아요. (새로 가입한 회원은 이메일로 로그인해 주세요)');
        }
        await loadMe(true); return me;
      },
      async forgotPassword(email) {
        email = validateEmail(email);
        const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: RETURN_URL });
        if (r.error) throw new Error(/rate|seconds|too many/i.test(r.error.message) ? '메일을 너무 자주 보냈어요. 잠시 후에 다시 해 주세요.' : r.error.message);
      },
      async resetPassword(email, code, pw) {
        validatePw(pw);
        const v = await sb.auth.verifyOtp({ email: String(email || '').trim().toLowerCase(), token: String(code || '').trim(), type: 'recovery' });
        if (v.error) throw new Error('인증번호가 맞지 않거나 시간이 지났어요. 번호를 다시 받아 주세요.');
        const u = await sb.auth.updateUser({ password: pw });
        if (u.error) { await sb.auth.signOut(); throw new Error(/different from the old/i.test(u.error.message) ? '새 비밀번호가 현재와 같아요.' : u.error.message); }
        await loadMe(true); return me;
      },
      async setNewPassword(pw) {
        validatePw(pw); const r = await sb.auth.updateUser({ password: pw });
        if (r.error) throw new Error(r.error.message);
      },
      authReturn: () => AUTH_RETURN,

      /* 회원정보 */
      async accountInfo() {
        if (!me) throw new Error('로그인이 필요해요.');
        const { data } = await sb.auth.getUser(); const u = data && data.user;
        if (!u) throw new Error('로그인이 필요해요.');
        const fake = /@deokjil\.site$/.test(u.email || '');
        return { nick: me.nick, email: fake ? '' : (u.email || ''), emailOk: !fake && !!u.email_confirmed_at, hasEmail: !fake, pendingEmail: u.new_email || '', demoCode: '' };
      },
      async changePassword(cur, next) {
        if (!me) throw new Error('로그인이 필요해요.'); validatePw(next);
        const { data } = await sb.auth.getUser(); const u = data && data.user; if (!u) throw new Error('로그인이 필요해요.');
        if (cur === next) throw new Error('새 비밀번호가 현재와 같아요.');
        const chk = await sb.auth.signInWithPassword({ email: u.email, password: cur || '' });
        if (chk.error) throw new Error('현재 비밀번호가 맞지 않아요.');
        const r = await sb.auth.updateUser({ password: next });
        if (r.error) throw new Error(/different from the old/i.test(r.error.message) ? '새 비밀번호가 현재와 같아요.' : r.error.message);
      },
      async changeEmail(pw, newEmail) {
        if (!me) throw new Error('로그인이 필요해요.'); newEmail = validateEmail(newEmail);
        const { data } = await sb.auth.getUser(); const u = data && data.user; if (!u) throw new Error('로그인이 필요해요.');
        if ((u.email || '').toLowerCase() === newEmail) throw new Error('지금 쓰는 이메일과 같아요.');
        const chk = await sb.auth.signInWithPassword({ email: u.email, password: pw || '' });
        if (chk.error) throw new Error('현재 비밀번호가 맞지 않아요.');
        const r = await sb.auth.updateUser({ email: newEmail }, { emailRedirectTo: RETURN_URL });
        if (r.error) throw new Error(/registered|exists|already/i.test(r.error.message) ? '이미 쓰고 있는 이메일이에요.' : /rate|seconds|too many/i.test(r.error.message) ? '메일을 너무 자주 보냈어요. 잠시 후에 다시 해 주세요.' : r.error.message);
        return { pending: newEmail, demoCode: '' };
      },
      async confirmEmailChange(code) {
        const { data } = await sb.auth.getUser(); const u = data && data.user;
        if (!u || !u.new_email) throw new Error('인증 대기 중인 이메일 변경이 없어요.');
        const r = await sb.auth.verifyOtp({ email: u.new_email, token: String(code || '').trim(), type: 'email_change' });
        if (r.error) throw new Error('인증번호가 맞지 않거나 시간이 지났어요.');
        return u.new_email;
      },

      /* ---- 중고거래 ---- */
      async marketList(o) {
        o = o || {};
        let q = sb.from('market_items').select('*').in('status', ['selling', 'reserved', 'sold']).order('bumped_at', { ascending: false }).limit(300);
        if (o.category) q = q.eq('category', o.category);
        if (o.onlySale) q = q.neq('status', 'sold');
        const low = String(o.q || '').trim().toLowerCase();
        return must(await q).map(marketRow).filter(i => !low || (i.title + ' ' + i.body).toLowerCase().includes(low));
      },
      async marketGet(id, count) {
        const r = await sb.from('market_items').select('*').eq('id', id).maybeSingle(); if (r.error) throw new Error(friendly(r.error.message));
        if (!r.data) return null;
        if (count && ['selling', 'reserved', 'sold'].includes(r.data.status)) { try { await sb.rpc('market_view', { p_id: id }); r.data.views = (r.data.views || 0) + 1; } catch (e) {} }
        return marketRow(r.data);
      },
      async marketMine() { if (!me) return []; return must(await sb.from('market_items').select('*').eq('seller_id', me.id).neq('status', 'removed').order('created_at', { ascending: false }).limit(100)).map(marketRow); },
      async marketPost(d) {
        if (!me) throw new Error('로그인이 필요해요.');
        const v = marketCheck(d, null);
        return must(await sb.rpc('market_post', { p_title: v.title, p_cat: v.category, p_price: v.price, p_cond: v.cond, p_method: v.method, p_region: v.region, p_body: v.body, p_images: v.images, p_agree: !!d.agree }));
      },
      async marketEdit(id, d) {
        const v = marketCheck(d, null);
        must(await sb.rpc('market_edit', { p_id: id, p_title: v.title, p_cat: v.category, p_price: v.price, p_cond: v.cond, p_method: v.method, p_region: v.region, p_body: v.body, p_images: v.images }));
      },
      async marketSetStatus(id, status, buyer) { must(await sb.rpc('market_set_status', { p_id: id, p_status: status, p_buyer: String(buyer || '').trim() })); },
      async marketBump(id) { must(await sb.rpc('market_bump', { p_id: id })); },
      async marketDelete(id) { must(await sb.rpc('market_delete', { p_id: id })); },
      async marketReport(id, reason, note) { return must(await sb.rpc('market_report', { p_id: id, p_reason: reason, p_note: String(note || '') })); },
      async marketReview(id, rating, body) { must(await sb.rpc('market_review', { p_id: id, p_rating: +rating, p_body: String(body || '').trim() })); },
      async marketReviews(nick) {
        const p = await sb.from('profiles').select('id').ilike('nick', String(nick || '').trim()).maybeSingle(); if (!p.data) return [];
        const rows = must(await sb.from('market_reviews').select('*').eq('seller_id', p.data.id).order('created_at', { ascending: false }).limit(50));
        const ids = [...new Set(rows.map(r => r.item_id))], tt = {};
        if (ids.length) { const it = await sb.from('market_items').select('id,title').in('id', ids); (it.data || []).forEach(x => { tt[x.id] = x.title; }); }
        return rows.map(r => ({ id: r.id, itemId: r.item_id, title: tt[r.item_id] || '', reviewer: r.reviewer_nick, rating: r.rating, body: r.body, created: r.created_at }));
      },
      async marketSellerStats(nick) { const r = await sb.rpc('market_seller_stats', { p_nick: String(nick || '').trim() }); return r.error ? { sold: 0, good: 0, ok: 0, bad: 0 } : r.data; },
      async marketMyReview(id) { if (!me) return false; const r = await sb.from('market_reviews').select('id').eq('item_id', id).eq('reviewer_id', me.id).maybeSingle(); return !!(r.data); },
      async marketBan() { if (!me) return null; const r = await sb.from('market_bans').select('until').eq('user_id', me.id).gt('until', new Date().toISOString()).maybeSingle(); return r.data ? r.data.until : null; },
      async marketAdminList() {
        const items = must(await sb.from('market_items').select('*').order('created_at', { ascending: false }).limit(300));
        const rp = await sb.from('market_reports').select('item_id,dismissed').limit(2000), cnt = {};
        (rp.data || []).forEach(r => { if (!r.dismissed) cnt[r.item_id] = (cnt[r.item_id] || 0) + 1; });
        return items.map(x => Object.assign(marketRow(x), { reports: cnt[x.id] || 0 }));
      },
      async marketReports(id) {
        const rows = must(await sb.from('market_reports').select('*').eq('item_id', id).order('created_at', { ascending: false })), ids = [...new Set(rows.map(r => r.reporter_id))], nm = {};
        if (ids.length) must(await sb.from('profiles').select('id,nick').in('id', ids)).forEach(p => { nm[p.id] = p.nick; });
        return rows.map(r => ({ reporter: nm[r.reporter_id] || '(탈퇴)', reason: r.reason, note: r.note, dismissed: r.dismissed, created: r.created_at }));
      },
      async marketStaff(id, action, note) { must(await sb.rpc('market_staff', { p_id: id, p_action: action, p_note: String(note || '') })); },
      async marketBans() {
        const rows = must(await sb.from('market_bans').select('*').gt('until', new Date().toISOString())), ids = rows.map(r => r.user_id), nm = {};
        if (ids.length) must(await sb.from('profiles').select('id,nick').in('id', ids)).forEach(p => { nm[p.id] = p.nick; });
        return rows.map(r => ({ userId: r.user_id, nick: nm[r.user_id] || '(탈퇴)', until: r.until, reason: r.reason }));
      },
      async marketUnban(uidd) { must(await sb.rpc('market_unban', { p_uid: uidd })); },
      /* ---- 서비스 상태 공지 ---- */
      async listIncidents() {
        const r = await sb.from('status_incidents').select('*').order('created_at', { ascending: false }).limit(100);
        if (r.error) return [];
        const ids = r.data.map(x => x.id); let ups = [];
        if (ids.length) { const u = await sb.from('status_updates').select('*').in('incident_id', ids).order('created_at', { ascending: true }); if (!u.error) ups = u.data; }
        return r.data.map(x => ({ id: x.id, title: x.title, impact: x.impact, components: x.components || [], status: x.status, created: x.created_at, resolved: x.resolved_at, by: x.by_nick,
          updates: ups.filter(u => u.incident_id === x.id).map(u => ({ status: u.status, body: u.body, created: u.created_at, by: u.by_nick })) }));
      },
      async postIncident(d) {
        return must(await sb.rpc('status_post', { p_title: String(d.title || '').trim(), p_impact: d.impact, p_components: d.components || [], p_status: d.status, p_body: String(d.body || '').trim() }));
      },
      async updateIncident(id, status, body, impact) {
        must(await sb.rpc('status_update', { p_id: id, p_status: status, p_body: String(body || '').trim(), p_impact: impact || null }));
      },
      async deleteIncident(id) { must(await sb.rpc('status_delete', { p_id: id })); },
      /* ---- 강제 탈퇴 (관리자 이상) — 서버(Edge Function remove-member)가 메일을 보내고 계정을 지워요 ---- */
      async removeMember(id, reason, opts) {
        const r = await sb.functions.invoke('remove-member', { body: { id, reason, skipMail: !!(opts && opts.skipMail) } });
        let d = r.data;
        if (r.error && !d) {   // 함수가 4xx/5xx 로 답하면 본문이 error.context 에 들어 있어요
          const res = r.error.context;
          if (res && typeof res.status === 'number') {
            let txt = ''; try { txt = await res.text(); } catch (e) {}
            try { d = JSON.parse(txt); } catch (e) {}
            if (!d || (d.ok === undefined && !d.error)) {
              const st = res.status;
              throw new Error(st === 404 ? '탈퇴 처리 함수를 찾지 못했어요. (HTTP 404) Supabase에 remove-member 라는 이름으로 배포했는지 확인해 주세요.'
                : st === 401 ? '로그인이 풀렸어요. 새로고침해서 다시 로그인해 주세요. (HTTP 401)'
                : `탈퇴 처리 함수가 오류로 멈췄어요. (HTTP ${st}) Supabase → Edge Functions → remove-member → Logs 를 확인해 주세요.${txt ? ' ' + txt.slice(0, 120) : ''}`);
            }
          } else throw new Error('탈퇴 처리 서버에 연결하지 못했어요. 함수가 배포됐는지, 이름이 remove-member 인지, 인터넷 연결이 괜찮은지 확인해 주세요.');
        }
        if (!d || !d.ok) { const e = new Error((d && d.error) || '탈퇴 처리에 실패했어요.'); if (d && d.code) e.code = d.code; throw e; }
        return { mailed: !!d.mailed, mailNote: d.mailNote || '' };
      },
      async listRemovals() {
        const r = await sb.from('member_removals').select('*').order('created_at', { ascending: false }).limit(100);
        if (r.error) return [];
        return r.data.map(x => ({ id: x.id, nick: x.nick, role: x.role, reason: x.reason, byNick: x.by_nick, mailed: x.mailed, mailNote: x.mail_note, created: x.created_at }));
      },
      /* ---- 동의 · 탈퇴 · 신고 (법령 대응 — supabase/v3_legal.sql) ---- */
      async recordConsent(c) {
        c = c || {}; const cs = checkConsent({ agree: true, rules: true, under14: c.under14, guardian: c.guardian });
        must(await sb.rpc('record_consent', { p_under14: cs.under14, p_guardian: cs.guardian, p_ver: cs.ver }));
        if (me) me.consent = true; return me;
      },
      async deleteMyAccount(pw, delPosts) {
        if (!me) throw new Error('로그인이 필요해요.');
        const ud = await sb.auth.getUser(), em = ud && ud.data && ud.data.user && ud.data.user.email;
        if (em) {
          const ck = await sb.auth.signInWithPassword({ email: em, password: String(pw || '') });
          if (ck.error) throw new Error('비밀번호가 맞지 않아요.');
        } else throw new Error('이메일이 없는 예전 계정이에요. 문의·건의로 탈퇴를 요청해 주세요.');
        const r = await sb.rpc('delete_my_account', { p_delete_posts: !!delPosts });
        if (r.error) throw new Error(/function .*delete_my_account|schema cache/i.test(r.error.message) ? '탈퇴 기능이 아직 준비되지 않았어요. 운영자에게 알려 주세요. (v3_legal.sql 필요)' : r.error.message);
        try { await sb.auth.signOut(); } catch (e) {} me = null;
      },
      async contentReport(kind, id, reason, note) {
        const r = await sb.rpc('content_report', { p_kind: kind, p_id: id, p_reason: reason, p_note: String(note || '') });
        if (r.error) throw new Error(/function .*content_report|schema cache/i.test(r.error.message) ? '신고 기능이 아직 준비되지 않았어요. 문의·건의로 알려 주세요.' : r.error.message);
        return r.data;
      },
      async contentReports() {
        const rows = must(await sb.from('content_reports').select('*').eq('dismissed', false).order('created_at', { ascending: true }));
        if (!rows.length) return [];
        const pids = [...new Set(rows.filter(r => r.kind === 'post').map(r => r.target_id))], cids = [...new Set(rows.filter(r => r.kind === 'comment').map(r => r.target_id))];
        const uids = [...new Set(rows.map(r => r.reporter_id))];
        const [ps, cs, us] = await Promise.all([
          pids.length ? sb.from('posts').select('id,title,author_nick,held,held_why').in('id', pids) : { data: [] },
          cids.length ? sb.from('comments').select('id,target,body,nick,held,held_why').in('id', cids) : { data: [] },
          sb.from('profiles').select('id,nick').in('id', uids)]);
        const nm = {}; (us.data || []).forEach(x => { nm[x.id] = x.nick; });
        const tp = new Map((ps.data || []).map(x => [x.id, x])), tc = new Map((cs.data || []).map(x => [x.id, x]));
        const groups = new Map();
        rows.forEach(r => {
          const t = r.kind === 'post' ? tp.get(r.target_id) : tc.get(r.target_id); if (!t) return;
          const k = r.kind + ':' + r.target_id;
          if (!groups.has(k)) groups.set(k, { kind: r.kind, id: r.target_id, postId: r.kind === 'post' ? r.target_id : t.target, title: r.kind === 'post' ? t.title : t.body, author: r.kind === 'post' ? t.author_nick : t.nick, held: !!t.held, heldWhy: t.held_why || '', reports: [] });
          groups.get(k).reports.push({ reporter: nm[r.reporter_id] || '(탈퇴)', reason: r.reason, note: r.note, created: r.created_at });
        });
        return [...groups.values()];
      },
      async contentReview(kind, id, action) { must(await sb.rpc('content_review', { p_kind: kind, p_id: id, p_action: action })); },
      async logout() { await sb.auth.signOut(); me = null; },

      /* ---- 글 ---- */
      async listPosts() {
        const [p, l, c, pm] = await Promise.all([
          sb.from('posts').select('*').order('created_at', { ascending: false }),
          sb.from('post_likes').select('post_id,user_id'),
          sb.from('comments').select('target,status'), profMap()
        ]);
        const posts = must(p), likes = must(l), cm = must(c);
        return posts.map(r => postOut(r, likes, cm, pm));
      },
      async getPost(id, countView) {
        const r = await sb.from('posts').select('*').eq('id', id).maybeSingle();
        const row = must(r); if (!row) return null;
        if (countView && row.status === 'ok' && !row.held) {
          const seen = JSON.parse(sess.get('deokjil_seen') || '[]');
          if (!seen.includes(id)) { await sb.rpc('bump_view', { pid: id }); row.views = (row.views || 0) + 1; seen.push(id); sess.set('deokjil_seen', JSON.stringify(seen)); }
        }
        const [l, c, pm] = await Promise.all([sb.from('post_likes').select('post_id,user_id').eq('post_id', id), sb.from('comments').select('target,status').eq('target', id), profMap()]);
        return postOut(row, must(l), must(c), pm);
      },
      async savePost(d) {
        if (!me) throw new Error('로그인이 필요해요.');
        const title = (d.title || '').trim(), body = (d.body || '').trim();
        if (!title || !body) throw new Error('제목과 내용을 입력해 주세요.');
        const row = { board: d.board, title, body, tags: d.tags || [], pinned: !!d.pinned };
        if (!legacy) row.license = okLicense(d.license);
        return withReward(async () => {
          let r;
          if (d.id) r = await sb.from('posts').update(Object.assign(row, { updated_at: new Date().toISOString() })).eq('id', d.id).select().single();
          else r = await sb.from('posts').insert(row).select().single();
          return postOut(must(r), [], [], new Map());
        });
      },
      async deletePost(id) { must(await sb.from('posts').delete().eq('id', id)); },
      async toggleLike(id) {
        if (!me) throw new Error('로그인이 필요해요.');
        return withReward(async () => {
          const ex = must(await sb.from('post_likes').select('post_id').eq('post_id', id).eq('user_id', me.id));
          if (ex.length) must(await sb.from('post_likes').delete().eq('post_id', id).eq('user_id', me.id));
          else must(await sb.from('post_likes').insert({ post_id: id, user_id: me.id }));
          return api.getPost(id, false);
        });
      },

      /* ---- 댓글 ---- */
      async listComments(target) {
        const [d, pm] = await Promise.all([sb.from('comments').select('*').eq('target', target).order('created_at', { ascending: true }), profMap()]);
        return must(d).map(r => cmtOut(r, pm));
      },
      async addComment(target, parentId, body) {
        if (!me) throw new Error('로그인이 필요해요.');
        body = (body || '').trim();
        if (!body) throw new Error('내용을 입력해 주세요.');
        if (body.length > C.commentMax) throw new Error(`댓글은 ${C.commentMax}자까지 쓸 수 있어요.`);
        if (parentId) {
          const par = must(await sb.from('comments').select('id,parent_id').eq('id', parentId).maybeSingle());
          if (!par) throw new Error('답글을 달 댓글이 없어요.');
          if (par.parent_id) parentId = par.parent_id;
        }
        return withReward(async () => {
          const r = await sb.from('comments').insert({ target, parent_id: parentId || null, body }).select().single();
          return cmtOut(must(r), new Map([[me.id, { role: me.role, grade: me.grade, title: me.title }]]));
        });
      },
      async deleteComment(id) { must(await sb.from('comments').delete().eq('id', id)); },

      async hitVisit() {
        const doCount = !sess.get('deokjil_hit');
        const r = must(await sb.rpc('hit_visit', { do_count: doCount }));
        sess.set('deokjil_hit', '1');
        return { today: r.today || 0, total: r.total || 0 };
      },
      async getSettings() {
        const [s, b] = await Promise.all([sb.from('site_settings').select('data').eq('id', 1).maybeSingle(), sb.from('banned_words').select('word')]);
        const data = (must(s) || {}).data || {};
        data.banned = (b.data || []).map(x => x.word);          // 관리자가 아니면 목록이 비어 있어요 (정상)
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

      /* ---- 프로필 · 포인트 · 상점 ---- */
      async getProfile(nick) {
        let r = await sb.from('profiles').select(PCOLS + ',created_at,bio,bio_updated_at,avatar').eq('nick', nick).maybeSingle();
        if (r.error) r = await sb.from('profiles').select(PCOLS + ',created_at,bio,bio_updated_at').eq('nick', nick).maybeSingle();
        if (r.error) r = await sb.from('profiles').select(PCOLS + ',created_at').eq('nick', nick).maybeSingle();
        if (r.error) { r = await sb.from('profiles').select('id,nick,role,created_at').eq('nick', nick).maybeSingle(); if (r.data) Object.assign(r.data, { grade: 1, points: 0, theme: 'station', skin: 'basic', title: '' }); }
        const p = must(r); if (!p) return null;
        let stats = { weeks: Math.max(0, Math.floor((Date.now() - new Date(p.created_at).getTime()) / (7 * 864e5))), posts: 0, comments: 0, likes: 0 };
        let ktx = false;
        try {
          const s = must(await sb.rpc('member_stats', { uid: p.id }));
          if (s) stats = s;
          ktx = statMeets(stats, RULES.grades.find(g => g.needApproval));
        } catch (e) { /* v2 SQL 전 */ }
        return { id: p.id, nick: p.nick, role: p.role, grade: p.grade || 1, points: p.points || 0, theme: p.theme || 'station', skin: p.skin || 'basic', title: p.title || '',
          bio: p.bio || '', bioUpdated: p.bio_updated_at || null, avatar: p.avatar || '', joined: p.created_at, stats, ktxEligible: ktx };
      },
      async pointLog(limit = 30) {
        if (!me) throw new Error('로그인이 필요해요.');
        const d = must(await sb.from('point_log').select('delta,reason,ref,created_at').eq('user_id', me.id).order('created_at', { ascending: false }).limit(limit));
        return d.map(x => ({ delta: x.delta, reason: x.reason, ref: x.ref, created: x.created_at }));
      },
      async listShop(opts) {
        const [s, inv] = await Promise.all([sb.from('shop_items').select('*').order('sort'), me ? sb.from('inventory').select('item_id').eq('user_id', me.id) : Promise.resolve({ data: [] })]);
        const rows = must(s), mine = new Set((inv.data || []).map(x => x.item_id));
        const items = rows.map(r => {
          const c = catalogItem(r.id) || {};
          const owned = r.price === 0 || mine.has(r.id);
          return { id: r.id, kind: r.kind, name: r.name || c.name, desc: r.description || c.desc || '', price: r.price, active: r.active, owned,
            equipped: !!me && (me.theme === r.id || me.skin === r.id || me.title === r.id) };
        }).filter(i => (opts && opts.all) || i.active || i.owned);
        return { points: me ? me.points || 0 : 0, items };
      },
      async buyItem(id) { must(await sb.rpc('buy_item', { item: id })); await loadMe(); return { points: me.points }; },
      async equipItem(id) { must(await sb.rpc('equip_item', { item: id })); await loadMe(); },
      async clearTitle() { must(await sb.rpc('clear_title')); await loadMe(); },
      async saveBio(text) {
        if (!me) throw new Error('로그인이 필요해요.');
        text = String(text || '');
        if (text.length > BIO_MAX) throw new Error(`문서는 ${BIO_MAX}자까지 쓸 수 있어요.`);
        const r = await sb.from('profiles').update({ bio: text }).eq('id', me.id).select('id');
        if (r.error) throw new Error(/column .*bio|schema cache/i.test(r.error.message || '') ? '데이터베이스를 업데이트해 주세요. (supabase/v2_community.sql 실행)' : r.error.message);
      },
      async clearBio(id) {
        const r = await sb.from('profiles').update({ bio: '' }).eq('id', id).select('id');
        if (r.error) throw new Error(r.error.message);
        if (!r.data || !r.data.length) throw new Error('지울 수 있는 권한이 없어요.');
      },

      async saveAvatar(dataUrl) {
        if (!me) throw new Error('로그인이 필요해요.');
        dataUrl = String(dataUrl || '');
        if (!okAvatar(dataUrl) || !dataUrl) throw new Error('사진 형식이 올바르지 않거나 너무 커요.');
        const r = await sb.from('profiles').update({ avatar: dataUrl }).eq('id', me.id).select('id');
        if (r.error) throw new Error(/column .*avatar|schema cache/i.test(r.error.message || '') ? '데이터베이스를 업데이트해 주세요. (supabase/v2_community.sql 실행)' : r.error.message);
      },
      async clearAvatar(id) {
        if (!me) throw new Error('로그인이 필요해요.');
        const r = await sb.from('profiles').update({ avatar: '' }).eq('id', id || me.id).select('id');
        if (r.error) throw new Error(r.error.message);
        if (!r.data || !r.data.length) throw new Error('지울 수 있는 권한이 없어요.');
      },

      /* 출석체크 */
      async checkInStatus() {
        if (!me) throw new Error('로그인이 필요해요.');
        const now = new Date(Date.now() + 9 * 36e5), ymd = d => d.toISOString().slice(0, 10);
        const today = ymd(now), yest = ymd(new Date(now.getTime() - 864e5)), first = today.slice(0, 8) + '01';
        const r = await sb.from('checkins').select('day,streak').eq('user_id', me.id).gte('day', yest < first ? yest : first).order('day', { ascending: true });
        if (r.error) throw new Error(friendly(r.error.message));
        const rows = r.data || [];
        const last = rows.length ? rows[rows.length - 1] : null;
        const done = !!last && last.day === today;
        const streak = last && (last.day === today || last.day === yest) ? last.streak : 0;
        return { done, streak, today: checkinAmount(done ? streak : streak + 1), days: rows.filter(x => x.day >= first).map(x => x.day), total: null };
      },
      async checkIn() {
        if (!me) throw new Error('로그인이 필요해요.');
        return withReward(async () => {
          const d = must(await sb.rpc('check_in'));
          return { already: !!d.already, points: d.points || 0, streak: d.streak || 1 };
        });
      },

      /* 스크랩 */
      async bookmarkIds() {
        if (!me) throw new Error('로그인이 필요해요.');
        const r = await sb.from('bookmarks').select('post_id').eq('user_id', me.id).order('created_at', { ascending: false });
        if (r.error) throw new Error(friendly(r.error.message));
        return (r.data || []).map(x => x.post_id);
      },
      async toggleBookmark(id) {
        if (!me) throw new Error('로그인이 필요해요.');
        const ex = await sb.from('bookmarks').select('post_id').eq('user_id', me.id).eq('post_id', id);
        if (ex.error) throw new Error(friendly(ex.error.message));
        if (ex.data && ex.data.length) { must(await sb.from('bookmarks').delete().eq('user_id', me.id).eq('post_id', id)); return false; }
        must(await sb.from('bookmarks').insert({ user_id: me.id, post_id: id })); return true;
      },


      /* 운영진 채팅 (부관리자 이상, 서버(RLS)가 막아요) */
      async syncRole() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { me = null; return null; }
        const r = await sb.from('profiles').select('id,role').eq('id', session.user.id).maybeSingle();
        if (r.data && me) me.role = r.data.role;
        return me;
      },
      async chatList(afterId) {
        let q = sb.from('staff_chat').select('id,user_id,nick,body,created_at');
        q = afterId ? q.gt('id', afterId).order('id', { ascending: true }).limit(100) : q.order('id', { ascending: false }).limit(100);
        const d = must(await q);
        return (afterId ? d : d.reverse()).map(m => ({ id: m.id, userId: m.user_id, nick: m.nick, body: m.body, created: m.created_at }));
      },
      async chatSend(text) {
        text = String(text || '').trim();
        if (!text) throw new Error('내용을 입력해 주세요.');
        if (text.length > 500) throw new Error('채팅은 500자까지 보낼 수 있어요.');
        const r = await sb.from('staff_chat').insert({ body: text, user_id: me && me.id }).select('id').single();
        if (r.error) throw new Error(friendly(r.error.message));
        return r.data.id;
      },
      async chatReads() {
        const d = must(await sb.rpc('chat_reads'));
        return (d || []).map(r => ({ userId: r.user_id, lastId: Number(r.last_id) || 0 }));
      },
      async chatMarkRead(upto) { if (!upto) return; const r = await sb.rpc('chat_mark_read', { upto }); if (r.error) console.warn('[채팅 읽음 처리 실패]', r.error.message); },
      async chatDelete(id) { must(await sb.from('staff_chat').delete().eq('id', id)); },

      /* 문의/건의 */
      async inqSubmit(d) {
        if (!me) throw new Error('로그인이 필요해요.');
        d = d || {};
        const category = INQ_CATS.includes(d.category) ? d.category : '문의';
        const title = String(d.title || '').trim(), body = String(d.body || '').trim();
        if (!title || title.length > 60) throw new Error('제목은 1~60자로 써 주세요.');
        if (!body || body.length > 3000) throw new Error('내용은 1~3000자로 써 주세요.');
        const r = await sb.from('inquiries').insert({ user_id: me.id, category, title, body }).select('*').single();
        if (r.error) throw new Error(/하루에 5개/.test(r.error.message) ? '문의는 하루에 5개까지 보낼 수 있어요.' : friendly(r.error.message));
        return inqOut(r.data);
      },
      async inqMine() { if (!me) throw new Error('로그인이 필요해요.'); return must(await sb.from('inquiries').select('*').eq('user_id', me.id).order('created_at', { ascending: false })).map(inqOut); },
      async inqAll() { return must(await sb.from('inquiries').select('*').order('created_at', { ascending: false })).map(inqOut); },
      async inqReply(id, d) {
        const patch = {};
        if (d.reply != null) patch.reply = String(d.reply).trim();
        if (['open', 'answered', 'closed'].includes(d.status)) patch.status = d.status;
        if (patch.reply && patch.reply.length > 3000) throw new Error('답변은 3000자까지 쓸 수 있어요.');
        const r = await sb.from('inquiries').update(patch).eq('id', id).select('*');
        if (r.error) throw new Error(friendly(r.error.message));
        if (!r.data || !r.data.length) throw new Error('답변할 권한이 없어요.');
        return inqOut(r.data[0]);
      },
      async inqDelete(id) { must(await sb.from('inquiries').delete().eq('id', id)); },
      async inqOpenCount() { const r = await sb.from('inquiries').select('id', { count: 'exact', head: true }).eq('status', 'open'); return r.count || 0; },

      /* 운영진 휴게실 */
      async loungeSubmit(game, score) {
        if (!me) throw new Error('로그인이 필요해요.');
        return must(await sb.rpc('lounge_submit', { g: game, sc: Number(score) }));
      },
      async loungeBoard(game) {
        const g = LOUNGE_GAMES[game]; if (!g) return [];
        return must(await sb.from('lounge_scores').select('user_id,nick,best,plays').eq('game', game).order('best', { ascending: g.low }).limit(10))
          .map(x => ({ userId: x.user_id, nick: x.nick, best: Number(x.best), plays: x.plays }));
      },

      /* 운영진 회의실 */
      async meetList() {
        const [ms, mem] = await Promise.all([sb.from('meetings').select('*').order('start_at', { ascending: false }).limit(100), sb.from('meeting_members').select('meeting_id,user_id,rsvp,joined_at')]);
        const rows = must(ms), members = must(mem);
        return rows.map(m => {
          const l = members.filter(x => x.meeting_id === m.id), mine = l.find(x => me && x.user_id === me.id) || {};
          return { id: m.id, title: m.title, agenda: m.agenda, minutes: m.minutes, start: m.start_at, end: m.end_at, creator: m.creator_nick, created: m.created_at,
            yes: l.filter(x => x.rsvp === 'yes').length, no: l.filter(x => x.rsvp === 'no').length, maybe: l.filter(x => x.rsvp === 'maybe').length, joined: l.filter(x => x.joined_at).length, myRsvp: mine.rsvp || '', myJoined: !!mine.joined_at };
        });
      },
      async meetGet(id) {
        const m = must(await sb.from('meetings').select('*').eq('id', id).maybeSingle()); if (!m) return null;
        const [mem, pl] = await Promise.all([sb.from('meeting_members').select('*').eq('meeting_id', id), sb.from('meeting_polls').select('*').eq('meeting_id', id).order('created_at', { ascending: true })]);
        const polls = must(pl); let votes = [];
        if (polls.length) votes = must(await sb.from('meeting_votes').select('poll_id,user_id,choice').in('poll_id', polls.map(p => p.id)));
        const nicks = new Map(must(mem).map(x => [x.user_id, x.nick]));
        return { id: m.id, title: m.title, agenda: m.agenda, minutes: m.minutes, start: m.start_at, end: m.end_at, creator: m.creator_nick, created: m.created_at,
          members: must(mem).map(x => ({ userId: x.user_id, nick: x.nick, rsvp: x.rsvp || '', joinedAt: x.joined_at })),
          polls: polls.map(p => { const vs = votes.filter(v => v.poll_id === p.id);
            return { id: p.id, question: p.question, options: p.options, closed: p.closed, counts: p.options.map((_, i) => vs.filter(v => v.choice === i).length),
              voters: p.options.map((_, i) => vs.filter(v => v.choice === i).map(v => nicks.get(v.user_id) || '?')), mine: me ? (vs.find(v => v.user_id === me.id) || {}).choice : undefined }; }) };
      },
      async meetSave(d) {
        const v = meetCheck(d), row = { title: v.title, agenda: v.agenda, start_at: v.start, end_at: v.end };
        if (d.minutes != null) { if (String(d.minutes).length > 8000) throw new Error('회의록은 8000자까지예요.'); row.minutes = String(d.minutes); }
        if (d.id) { const r = await sb.from('meetings').update(row).eq('id', d.id).select('*'); if (r.error) throw new Error(friendly(r.error.message)); if (!r.data.length) throw new Error('고칠 권한이 없어요.'); return r.data[0]; }
        const r = await sb.from('meetings').insert(row).select('*').single(); if (r.error) throw new Error(friendly(r.error.message)); return r.data;
      },
      async meetDelete(id) { must(await sb.from('meetings').delete().eq('id', id)); },
      async meetRsvp(id, st) { must(await sb.rpc('meeting_rsvp', { mid: id, st })); },
      async meetJoin(id) { must(await sb.rpc('meeting_join', { mid: id })); },
      async meetChatList(id, afterId) {
        let q = sb.from('meeting_msgs').select('id,user_id,nick,body,created_at').eq('meeting_id', id);
        q = afterId ? q.gt('id', afterId).order('id', { ascending: true }).limit(150) : q.order('id', { ascending: false }).limit(150);
        const d = must(await q);
        return (afterId ? d : d.reverse()).map(m => ({ id: m.id, userId: m.user_id, nick: m.nick, body: m.body, created: m.created_at }));
      },
      async meetChatSend(id, body) {
        body = String(body || '').trim(); if (!body || body.length > 500) throw new Error('메시지는 1~500자로 써 주세요.');
        const r = await sb.from('meeting_msgs').insert({ meeting_id: id, body }).select('id').single();
        if (r.error) throw new Error(friendly(r.error.message)); return r.data;
      },
      async meetChatDelete(id, seq) { must(await sb.from('meeting_msgs').delete().eq('id', seq)); },
      async pollCreate(mid, question, options) {
        const v = pollCheck(question, options);
        const r = await sb.from('meeting_polls').insert({ meeting_id: mid, question: v.question, options: v.options }).select('*').single();
        if (r.error) throw new Error(friendly(r.error.message)); return r.data;
      },
      async pollClose(pid, closed) { must(await sb.from('meeting_polls').update({ closed: !!closed }).eq('id', pid)); },
      async pollDelete(pid) { must(await sb.from('meeting_polls').delete().eq('id', pid)); },
      async pollVote(pid, choice) { must(await sb.rpc('meeting_vote', { pid, ch: choice })); },
      async meetNext() {
        if (!me || !(me.role === 'subadmin' || me.role === 'manager' || me.role === 'admin')) return null;
        const r = await sb.from('meetings').select('id,title,start_at,end_at').gt('end_at', new Date(Date.now() - 60 * MIN).toISOString()).order('start_at', { ascending: true }).limit(5);
        if (r.error) return null;
        const l = (r.data || []).map(m => ({ id: m.id, title: m.title, start: m.start_at, end: m.end_at })).filter(m => meetPhase(m) !== 'ended');
        return l[0] ? { ...l[0], phase: meetPhase(l[0]) } : null;
      },

      async nickExists(nick) {
        nick = String(nick || '').trim(); if (!NICK_RE.test(nick)) return null;
        const r = await sb.from('profiles').select('nick').eq('nick', nick).maybeSingle();
        return r.data ? r.data.nick : null;
      },
      /* 알림 */
      async notifList(limit) {
        if (!me) throw new Error('로그인이 필요해요.');
        return must(await sb.from('notifications').select('*').order('id', { ascending: false }).limit(limit || 60))
          .map(n => ({ id: n.id, kind: n.kind, actor: n.actor_nick, text: n.text, link: n.link, read: n.read, created: n.created_at }));
      },
      async notifRead(ids) { if (!me) return; must(await sb.rpc('notif_read', { ids: ids && ids.length ? ids : null })); },
      async notifClear() { if (!me) return; must(await sb.from('notifications').delete().eq('user_id', me.id)); },

      /* 쪽지 */
      async dmSend(toNick, body) {
        if (!me) throw new Error('로그인이 필요해요.');
        return must(await sb.rpc('dm_send', { to_nick: String(toNick || '').trim(), msg: String(body || '').trim() }));
      },
      async dmThreads() {
        if (!me) throw new Error('로그인이 필요해요.');
        const rows = must(await sb.from('dms').select('*').order('created_at', { ascending: false }).limit(600)), map = new Map();
        rows.forEach(m => {
          const mine = m.sender_id === me.id, nick = mine ? m.recipient_nick : m.sender_nick;
          const t = map.get(nick) || { nick, unread: 0, last: m.body, lastAt: m.created_at, mine };
          if (!mine && !m.read) t.unread++; map.set(nick, t);
        });
        return [...map.values()];
      },
      async dmThread(nick) {
        if (!me) throw new Error('로그인이 필요해요.');
        nick = String(nick || '').trim();
        if (!/^[가-힣a-zA-Z0-9_]{2,10}$/.test(nick)) return [];
        const rows = must(await sb.from('dms').select('*').or(`sender_nick.eq.${nick},recipient_nick.eq.${nick}`).order('created_at', { ascending: true }).limit(300));
        let readFail = '';
        try { const r = await sb.rpc('dm_read', { with_nick: nick }); if (r.error) readFail = r.error.message || 'dm_read 실패'; } catch (e) { readFail = e.message || 'dm_read 실패'; }
        if (readFail) console.warn('[쪽지 읽음 처리 실패]', readFail);
        const out = rows.map(m => ({ id: m.id, mine: m.sender_id === me.id, body: m.body, created: m.created_at, read: m.sender_id === me.id ? m.read : true }));
        out.readFail = readFail; return out;
      },
      async dmDelete(ids) { if (!me || !ids || !ids.length) return; must(await sb.rpc('dm_delete', { ids })); },
      async pushSubscribe(sub) {
        if (!me || !sub || !sub.endpoint || !sub.keys) return;
        must(await sb.rpc('push_subscribe', { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_ua: (navigator.userAgent || '').slice(0, 200) }));
      },
      async pushUnsubscribe(endpoint) { if (me && endpoint) must(await sb.rpc('push_unsubscribe', { p_endpoint: endpoint })); },
      async unreadCounts() {
        if (!me) return { notif: 0, dm: 0 };
        const [a, b] = await Promise.all([
          sb.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false),
          sb.from('dms').select('id', { count: 'exact', head: true }).eq('recipient_id', me.id).eq('read', false).eq('del_r', false)]);
        return { notif: a.count || 0, dm: b.count || 0 };
      },


      /* ---- 운영진 ---- */
      async listAllComments() {
        const [d, pm] = await Promise.all([sb.from('comments').select('*').order('created_at', { ascending: false }), profMap()]);
        return must(d).map(r => cmtOut(r, pm));
      },
      async setCommentStatus(id, status) { must(await sb.from('comments').update({ status }).eq('id', id)); },
      async listPendingPosts() {
        const [d, pm] = await Promise.all([sb.from('posts').select('*').eq('status', 'pending').order('created_at', { ascending: false }), profMap()]);
        return must(d).map(r => postOut(r, [], [], pm));
      },
      async setPostStatus(id, status) { must(await sb.from('posts').update({ status }).eq('id', id)); },
      async listUsers() { return userStats(); },
      async setUserRole(id, role) {
        if (!['user', 'subadmin', 'manager'].includes(role)) throw new Error('지정할 수 없는 권한이에요.');
        const r = must(await sb.from('profiles').update({ role }).eq('id', id).select('role'));
        if (!r.length || r[0].role !== role) throw new Error('이 역할로 바꿀 권한이 없어요. (관리자는 회원·부관리자만, 관리자 임명은 총관리자만)');
      },
      async setSuspension(id, days, reason) {
        const r = await sb.rpc('set_suspension', { p_id: id, p_days: Math.trunc(+days), p_reason: String(reason || '').trim() });
        if (r.error && /set_suspension|function/i.test(r.error.message) && /not exist|schema cache|find/i.test(r.error.message)) throw new Error('회원 정지 기능은 아직 준비 중이에요. (Supabase에서 v4_staff.sql 을 실행해 주세요)');
        must(r);
      },
      async auditLogs() {
        const r = await sb.from('audit_logs').select('*').order('id', { ascending: false }).limit(300);
        if (r.error) { if (/audit_logs|schema cache|relation/i.test(r.error.message)) throw new Error('감사 로그는 아직 준비 중이에요. (Supabase에서 v4_staff.sql 을 실행해 주세요)'); throw new Error(r.error.message); }
        return r.data.map(x => ({ id: x.id, created: x.created_at, actorId: x.actor_id, actor: x.actor_nick, action: x.action, kind: x.target_kind, targetId: x.target_id, label: x.label, reason: x.reason }));
      },
      async routeMarks() {
        if (!me) throw new Error('로그인이 필요해요.');
        const r = await sb.from('route_marks').select('*').eq('user_id', me.id).order('created_at', { ascending: true }).limit(500);
        if (r.error) { if (/route_marks|schema cache|relation/i.test(r.error.message)) throw new Error('내 노선도는 아직 준비 중이에요. (Supabase에서 v4_staff.sql 을 실행해 주세요)'); throw new Error(r.error.message); }
        return r.data.map(x => ({ kind: x.kind, key: x.key, label: x.label, status: x.status, note: x.note, created: x.created_at }));
      },
      async routeMarkSet(kind, key, label, status, note) {
        if (!me) throw new Error('로그인이 필요해요.');
        key = String(key || '').trim().toLowerCase().slice(0, 40); label = String(label || '').trim().slice(0, 40);
        if (!key || !label) throw new Error('이름을 적어 주세요.');
        must(await sb.from('route_marks').upsert({ user_id: me.id, kind, key, label, status: status === 'done' ? 'done' : 'ridden', note: String(note || '').trim().slice(0, 60) }, { onConflict: 'user_id,kind,key' }));
      },
      async trips() {
        if (!me) throw new Error('로그인이 필요해요.');
        const r = await sb.from('route_trips').select('*').eq('user_id', me.id).order('trip_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
        if (r.error) { if (/route_trips|schema cache|relation/i.test(r.error.message)) throw new Error('이동 기록은 아직 준비 중이에요. (Supabase에서 v4_staff.sql 을 다시 실행해 주세요)'); throw new Error(r.error.message); }
        return r.data.map(x => ({ id: x.id, date: x.trip_date, legs: x.legs, note: x.note, created: x.created_at }));
      },
      async tripAdd(d) {
        if (!me) throw new Error('로그인이 필요해요.'); const t = cleanTrip(d);
        const r = must(await sb.from('route_trips').insert({ user_id: me.id, trip_date: t.date, legs: t.legs, note: t.note }).select().single());
        return { id: r.id, date: r.trip_date, legs: r.legs, note: r.note, created: r.created_at };
      },
      async tripDel(id) { if (!me) return; must(await sb.from('route_trips').delete().eq('user_id', me.id).eq('id', id)); },
      async routeMarkDel(kind, key) { if (!me) return; must(await sb.from('route_marks').delete().eq('user_id', me.id).eq('kind', kind).eq('key', String(key).toLowerCase())); },
      async approveKtx(id) { must(await sb.rpc('approve_ktx', { target: id })); },
      async adjustPoints(id, mode, amount, note) { return must(await sb.rpc('staff_adjust_points', { target: id, mode, amount: Math.trunc(+amount || 0), note: note || '' })); },
      async grantPoints(id, amount, note) { return api.adjustPoints(id, 'add', amount, note); },
      async setGrade(id, lvl) { return must(await sb.rpc('staff_set_grade', { target: id, lvl: Math.trunc(+lvl) })); },
      async listUpgradeRequests() {
        const [d, us, pm] = await Promise.all([sb.from('posts').select('*').eq('board', 'upgrade').order('created_at', { ascending: false }), userStats(), profMap()]);
        const byId = new Map(us.map(u => [u.id, u]));
        return must(d).map(r => ({ post: postOut(r, [], [], pm), user: byId.get(r.author_id) || null }));
      },
      async saveShopItem(d) { must(await sb.from('shop_items').update({ price: Math.max(0, Math.trunc(+d.price || 0)), active: d.active !== false }).eq('id', d.id)); },
      async uploadImage(blob) {
        if (!me) throw new Error('로그인이 필요해요.');
        if (blob.size > 5 * 1024 * 1024) throw new Error('사진은 한 장에 5MB 이하만 올릴 수 있어요.');
        const ext = { 'image/gif': 'gif', 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'jpg';
        const path = `${me.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const r = await sb.storage.from('post-images').upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000', upsert: false });
        if (r.error) {
          const m = r.error.message || '';
          if (/bucket not found/i.test(m)) throw new Error('사진 보관함이 아직 없어요. supabase/storage.sql을 실행해 주세요.');
          if (/row-level security|unauthorized|not authorized/i.test(m)) throw new Error('사진을 올릴 수 없어요. (하루 15장 한도이거나 권한이 없어요)');
          throw new Error(m || '업로드에 실패했어요.');
        }
        return sb.storage.from('post-images').getPublicUrl(path).data.publicUrl;
      },
      async stats() {
        const [p, c, u, v] = await Promise.all([
          sb.from('posts').select('views,status'), sb.from('comments').select('status'),
          sb.from('profiles').select('id', { count: 'exact', head: true }), sb.from('visits').select('day,count')
        ]);
        const posts = must(p), cm = must(c), vis = must(v);
        const map = {}; vis.forEach(x => { map[x.day] = x.count; });
        const days = [];
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ day: dayKey(d), count: map[dayKey(d)] || 0 }); }
        return {
          posts: posts.filter(x => (x.status || 'ok') === 'ok').length, views: posts.reduce((a, x) => a + (x.views || 0), 0),
          comments: cm.filter(x => x.status === 'ok').length, pending: cm.filter(x => x.status === 'pending').length,
          pendingPosts: posts.filter(x => x.status === 'pending').length,
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
  impl.rules = () => RULES;
  impl.gradeByLevel = gradeByLevel;
  impl.progress = progress;
  impl.isStaff = isStaffRole;
  impl.isManager = isManagerRole;
  impl.rankOf = rankOf;
  impl.licenseOf = licenseOf;
  impl.licenses = () => C.licenses || [];
  impl.inquiryCategories = INQ_CATS; impl.meetPhase = meetPhase; impl.loungeGames = LOUNGE_GAMES;
  impl.okAvatar = okAvatar;
  impl.kindLabel = KIND_LABEL;
  impl.reasonLabel = r => REASON_LABEL[r] || r;
  impl.catalog = catalogItem;
  window.API = impl;
})();