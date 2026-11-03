/* ==========================================================
   admin.js — 덕질역 스튜디오 (운영진 센터: 총관리자 + 부관리자)
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG, A = window.API;
  const $ = (s, r = document) => r.querySelector(s);
  const { esc, fmtDate, fmtShort, alertBox, confirmBox, askText, loginDialog, gradeBadge, toast, openWin } = window.Common;
  const root = $('#adm-root');
  let me = null, main = null, nav = null;
  const boardOf = id => C.boards.find(b => b.id === id);
  const isAdm = () => !!me && me.role === 'admin';
  const isMgr = () => !!me && A.isManager(me.role);
  /* 나보다 낮은 역할의 회원만 (총관리자는 누구나) */
  const canAct = u => !!me && (me.role === 'admin' || A.rankOf(u.role) < A.rankOf(me.role));
  const roleMark = r => (C.staffGrades[r] ? C.staffGrades[r].icon + ' ' : '');
  const setStatus = () => {};
  const errBox = e => `<div class="msg err">😵 ${esc(e && e.message || e)}</div>`;

  /* ---------- 로그인 게이트 ---------- */
  function gate(kind) {
    root.innerHTML = `<div class="adm-main sunken" style="margin:3px;text-align:center;padding-top:40px">
      <h2 class="page-title" style="border:0">🔒 운영진 전용 구역</h2>
      ${kind === 'denied'
        ? `<p><b>${esc(me.nick)}</b> 계정은 운영진이 아니에요.<br><small>총관리자·관리자가 "부관리자" 이상으로 지정해 주면 들어올 수 있어요. (운영진 센터 > 회원)</small></p>`
        : `<p>총관리자·관리자·부관리자만 들어올 수 있어요.<br><small>처음 가입한 계정이 자동으로 총관리자가 돼요. 배포하자마자 가장 먼저 가입하세요!<br>관리자·부관리자는 먼저 일반 가입을 한 뒤, 회원 메뉴에서 지정해요.</small></p>`}
      <p><button class="btn primary" id="gLogin" type="button">${kind === 'denied' ? '다른 계정으로 로그인' : '로그인 / 가입'}</button>
      <a class="btn" href="index.html">사이트로 돌아가기</a></p></div>`;
    $('#gLogin').onclick = async () => {
      if (kind === 'denied') { await A.logout(); }
      const u = await loginDialog({ signup: true, title: '운영진 로그인' });
      if (u || kind === 'denied') start();
    };
    setStatus('로그인이 필요해요', '');
  }

  /* ---------- 틀 ---------- */
  const NAV = [
    ['#/', '📊', '대시보드'], ['#/posts', '📝', '글 관리'], ['#/new', '✏️', '새 글 쓰기'],
    ['#/review', '🕓', '검토 대기', 'pending'], ['#/comments', '💬', '댓글 전체'], ['#/upgrade', '🎫', '등업 신청'], ['#/users', '👥', '회원'],
    ['#/inquiry', '📮', '문의/건의', 'inq'], ['#/meetings', '🗓', '회의실', 'meet'], ['#/lounge', '🛋', '휴게실'], ['#/status', '📡', '상태 공지'], ['#/market', '🛒', '중고거래'], ['#/reports', '🚨', '신고 처리']
  ];
  const NAV_MGR = [['#/shop', '🛍', '상점 관리'], ['#/audit', '📜', '감사 로그']];
  const NAV_ADMIN = [['#/settings', '⚙️', '설정']];
  function buildShell() {
    root.innerHTML = `<nav class="adm-nav raised" aria-label="운영진 메뉴"></nav><main class="adm-main sunken" tabindex="-1"></main>`;
    nav = $('.adm-nav'); main = $('.adm-main');
  }
  function drawNav(active, pending, inq, meet) {
    nav.innerHTML = NAV.concat(isMgr() ? NAV_MGR : [], isAdm() ? NAV_ADMIN : []).map(([h, ic, t, badge]) => {
      const key = h.replace('#/', '').split('/')[0];
      return `<a class="ti${key === active ? ' on' : ''}" href="${h}"><span>${ic} ${t}</span>${badge === 'pending' && pending ? `<span class="badge">${pending}</span>` : ''}${badge === 'inq' && inq ? `<span class="badge">${inq}</span>` : ''}${badge === 'meet' && meet ? '<span class="badge live">LIVE</span>' : ''}</a>`;
    }).join('');
  }

  /* ---------- 라우터 ---------- */
  async function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const [p, a] = parts;
    if ((!isMgr() && (p === 'shop' || p === 'audit')) || (!isAdm() && p === 'settings')) { location.hash = '#/'; return; }
    main.innerHTML = '<div class="loading">⏳ 불러오는 중…</div>';
    if (window.StaffRoom) window.StaffRoom.cleanup();
    let pending = 0, inq = 0, meet = false;
    try { const s = await A.stats(); pending = s.pending + (s.pendingPosts || 0); } catch (e) {}
    try { inq = await A.inqOpenCount(); } catch (e) {}
    try { const n = await A.meetNext(); meet = !!n && (n.phase === 'open' || n.phase === 'wrap'); } catch (e) {}
    const active = p === 'edit' ? 'posts' : (p || '');
    drawNav(active, pending, inq, meet);
    try {
      if (!p) await viewDash();
      else if (p === 'posts') await viewPosts(a);
      else if (p === 'new') await viewEditor(null, a);
      else if (p === 'edit') await viewEditor(a);
      else if (p === 'review') await viewReview();
      else if (p === 'comments') await viewComments();
      else if (p === 'upgrade') await viewUpgrade();
      else if (p === 'users') await viewUsers();
      else if (p === 'status') await viewStatus();
      else if (p === 'market') await viewMarket(a);
      else if (p === 'reports') await viewReports();
      else if (p === 'inquiry') await viewInquiries();
      else if (p === 'meetings') await window.StaffRoom.viewMeetings(main, a, route);
      else if (p === 'lounge') await window.StaffRoom.viewLounge(main);
      else if (p === 'shop') await viewShop();
      else if (p === 'audit') await viewAudit();
      else if (p === 'settings') await viewSettings();
      else main.innerHTML = '<div class="msg err">없는 메뉴예요.</div>';
      main.scrollTop = 0;
    } catch (e) { console.error(e); main.innerHTML = errBox(e); }
  }

  /* ---------- 대시보드 ---------- */
  async function viewDash() {
    const [s, posts, cms] = await Promise.all([A.stats(), A.listPosts(), A.listAllComments()]);
    const max = Math.max(1, ...s.days.map(d => d.count));
    const top = [...posts].sort((a, b) => b.views - a.views).slice(0, 5);
    const titleOf = {}; posts.forEach(p => { titleOf[p.id] = p.title; });
    const recent = cms.slice(0, 5);
    main.innerHTML = `
      <h2 class="page-title">📊 대시보드</h2>
      ${window.StaffRoom ? await window.StaffRoom.banner() : ''}
      ${s.pending + (s.pendingPosts || 0) ? `<div class="msg info">🕓 검토를 기다리는 글 <b>${s.pendingPosts || 0}개</b>, 댓글 <b>${s.pending}개</b>가 있어요. <a href="#/review">지금 확인하기</a></div>` : ''}
      <div class="cards">
        <div class="card raised"><div class="n">${s.today}</div><div class="l">오늘 방문</div></div>
        <div class="card raised"><div class="n">${s.total}</div><div class="l">전체 방문</div></div>
        <div class="card raised"><div class="n">${s.posts}</div><div class="l">글</div></div>
        <div class="card raised"><div class="n">${s.views}</div><div class="l">총 조회수</div></div>
        <div class="card raised"><div class="n">${s.comments}</div><div class="l">공개 댓글</div></div>
        <div class="card raised${s.pending + (s.pendingPosts || 0) ? ' warn' : ''}"><div class="n">${s.pending + (s.pendingPosts || 0)}</div><div class="l">검토 대기</div></div>
        <div class="card raised"><div class="n">${s.users}</div><div class="l">회원</div></div>
      </div>
      <div class="sub-title"><span>📈 최근 7일 방문자</span></div>
      <div class="bars sunken" role="img" aria-label="최근 7일 방문자 막대 그래프">${s.days.map(d =>
        `<div class="bar"><i style="height:${Math.round(d.count / max * 100)}%"></i><span>${d.count}</span><span>${d.day.slice(5).replace('-', '/')}</span></div>`).join('')}</div>
      <div class="cols" style="margin-top:12px">
        <div><div class="sub-title"><span>🔥 조회수 TOP5</span></div>
          <table class="tbl"><tbody>${top.length ? top.map(p => `<tr><td class="t"><a href="#/edit/${esc(p.id)}">${esc(p.title)}</a></td><td class="c">👁 ${p.views}</td><td class="c">💙 ${p.likes}</td></tr>`).join('') : '<tr><td>아직 글이 없어요</td></tr>'}</tbody></table></div>
        <div><div class="sub-title"><span>💬 최근 댓글</span></div>
          <table class="tbl"><tbody>${recent.length ? recent.map(c => `<tr><td><b>${gradeBadge(c.role, c.grade)} ${esc(c.nick)}</b> ${c.status === 'pending' ? '<span class="pending-tag">대기</span>' : ''}<br><span class="ellipsis">${esc(c.body)}</span><br><small>${esc(c.target === 'guestbook' ? '방명록' : titleOf[c.target] || '(삭제된 글)')}</small></td></tr>`).join('') : '<tr><td>아직 댓글이 없어요</td></tr>'}</tbody></table></div>
      </div>`;
    setStatus('대시보드', '');
  }


  /* ---------- 글 관리 ---------- */
  async function viewPosts(board) {
    let list = await A.listPosts();
    const total = list.length;
    if (board && board !== 'all') list = list.filter(p => p.board === board);
    list.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.created) - new Date(a.created)));
    main.innerHTML = `
      <h2 class="page-title">📝 글 관리</h2>
      <div class="row" style="margin-bottom:10px"><select class="input" id="bf" style="width:auto" aria-label="게시판 필터">
        <option value="all">전체 게시판 (${total})</option>${C.boards.map(b => `<option value="${b.id}"${board === b.id ? ' selected' : ''}>${b.icon} ${esc(b.name)}</option>`).join('')}</select>
        <a class="btn primary" href="#/new${board && board !== 'all' ? '/' + board : ''}">✏️ 새 글 쓰기</a></div>
      ${list.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>제목</th><th class="hide-m">게시판</th><th class="hide-m">작성자</th><th class="hide-m">작성일</th><th>👁</th><th>💙</th><th>💬</th><th>관리</th></tr></thead><tbody>${list.map(p => `<tr>
        <td class="t">${p.pinned ? '📌 ' : ''}<a href="index.html#/post/${esc(p.id)}" target="_blank" rel="noopener">${esc(p.title)}</a>${p.status === 'pending' ? ' <span class="pending-tag">대기</span>' : ''}</td>
        <td class="c hide-m">${esc((boardOf(p.board) || {}).name || p.board)}</td><td class="c hide-m">${gradeBadge(p.authorRole, p.authorGrade)} ${esc(p.author || '-')}</td><td class="c hide-m">${fmtShort(p.created)}</td>
        <td class="c">${p.views}</td><td class="c">${p.likes}</td><td class="c">${p.comments}</td>
        <td class="c">${p.status === 'pending' ? `<button class="btn sm" type="button" data-ok="${esc(p.id)}">✅ 승인</button> ` : ''}${isMgr() || p.authorId === me.id ? `<a class="btn sm" href="#/edit/${esc(p.id)}">수정</a> ` : ''}
          <button class="btn sm" type="button" data-pin="${esc(p.id)}">${p.pinned ? '고정 해제' : '📌 고정'}</button>
          <button class="btn sm danger" type="button" data-del="${esc(p.id)}">삭제</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">글이 없어요. 새 글을 써 보세요!</div>'}`;
    $('#bf').onchange = e => { location.hash = '#/posts/' + e.target.value; };
    main.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => { try { await A.setPostStatus(b.dataset.ok, 'ok'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); } });
    main.querySelectorAll('[data-pin]').forEach(b => b.onclick = async () => {
      const p = list.find(x => x.id === b.dataset.pin);
      try { await A.savePost({ id: p.id, board: p.board, title: p.title, body: p.body, tags: p.tags, pinned: !p.pinned }); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      const p = list.find(x => x.id === b.dataset.del);
      if (!(await confirmBox(`"${p.title}" 글을 삭제할까요?\n댓글도 함께 지워지고, 되돌릴 수 없어요.`, '글 삭제', '삭제', '취소'))) return;
      try { await A.deletePost(p.id); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    setStatus(`${list.length}개 개체`, '');
  }

  /* ---------- 글쓰기/수정 (공개 사이트와 같은 편집기) ---------- */
  async function viewEditor(id, presetBoard) {
    await window.Common.mountEditor({
      box: main, id, preset: presetBoard, setStatus,
      onDone: () => { location.hash = '#/posts'; },
      onCancel: () => { location.hash = '#/posts'; }
    });
  }

  /* ---------- 검토 대기 (글 + 댓글) ---------- */
  async function viewReview() {
    const [pp, all, posts] = await Promise.all([A.listPendingPosts(), A.listAllComments(), A.listPosts()]);
    const titleOf = {}; posts.forEach(p => { titleOf[p.id] = p.title; });
    const pend = all.filter(c => c.status === 'pending');
    main.innerHTML = `
      <h2 class="page-title">🕓 검토 대기</h2>
      <div class="msg info">금칙어가 포함된 글·댓글은 자동으로 "대기"가 되어 <b>작성자 본인과 운영진에게만</b> 보여요. 승인하면 모두에게 공개되고(포인트도 지급돼요), 삭제하면 사라져요.</div>
      <div class="sub-title"><span>📝 대기 중인 글 (${pp.length})</span></div>
      ${pp.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>제목</th><th>작성자</th><th class="hide-m">게시판</th><th class="hide-m">시각</th><th>관리</th></tr></thead><tbody>${pp.map(p => `<tr>
        <td class="t"><a href="index.html#/post/${esc(p.id)}" target="_blank" rel="noopener">${esc(p.title)}</a></td><td class="c">${gradeBadge(p.authorRole, p.authorGrade)} ${esc(p.author)}</td>
        <td class="c hide-m">${esc((boardOf(p.board) || {}).name || p.board)}</td><td class="c hide-m">${fmtDate(p.created)}</td>
        <td class="c"><button class="btn sm" type="button" data-pok="${esc(p.id)}">✅ 승인</button> <button class="btn sm danger" type="button" data-pdel="${esc(p.id)}">🗑 삭제</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">검토할 글이 없어요. ✨</div>'}
      <div class="sub-title"><span>💬 대기 중인 댓글 (${pend.length})</span>${pend.length ? '<a id="apAll" role="button" style="cursor:pointer">전체 승인</a>' : ''}</div>
      ${pend.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>작성자</th><th>내용</th><th class="hide-m">위치</th><th>관리</th></tr></thead><tbody>${pend.map(c => cmtRow(c, titleOf)).join('')}</tbody></table></div>` : '<div class="empty">검토할 댓글이 없어요. ✨</div>'}`;
    main.querySelectorAll('[data-pok]').forEach(b => b.onclick = async () => { try { await A.setPostStatus(b.dataset.pok, 'ok'); toast('승인했어요.'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); } });
    main.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => {
      if (!(await confirmBox('이 글을 삭제할까요?', '글 삭제', '삭제', '취소'))) return;
      try { await A.deletePost(b.dataset.pdel); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    bindCmtActions(pend);
    setStatus(`글 ${pp.length} · 댓글 ${pend.length}`, '');
  }
  function cmtRow(c, titleOf) {
    return `<tr>
        <td class="c">${gradeBadge(c.role, c.grade)} <b>${esc(c.nick)}</b>${c.status === 'pending' ? '<br><span class="pending-tag">대기</span>' : ''}${c.parentId ? '<br><small>↪ 답글</small>' : ''}</td>
        <td style="white-space:pre-wrap;min-width:150px">${esc(c.body)}</td>
        <td class="hide-m">${c.target === 'guestbook' ? '📒 방명록' : `<a href="index.html#/post/${esc(c.target)}" target="_blank" rel="noopener">${esc(titleOf[c.target] || '(삭제된 글)')}</a>`}<br><small>${fmtDate(c.created)}</small></td>
        <td class="c">${c.status === 'pending' ? `<button class="btn sm" type="button" data-ok="${esc(c.id)}">✅ 승인</button> ` : ''}<button class="btn sm danger" type="button" data-cdel="${esc(c.id)}">🗑 삭제</button></td></tr>`;
  }
  function bindCmtActions(pend) {
    main.querySelectorAll('[data-ok]').forEach(b => { if (b.dataset.ok && !b.dataset.pok) b.onclick = async () => { try { await A.setCommentStatus(b.dataset.ok, 'ok'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); } }; });
    main.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
      if (!(await confirmBox('이 댓글을 삭제할까요? (답글도 함께 지워져요)', '댓글 삭제', '삭제', '취소'))) return;
      try { await A.deleteComment(b.dataset.cdel); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    const ap = $('#apAll');
    if (ap) ap.onclick = async () => {
      if (!(await confirmBox(`대기 중인 댓글 ${pend.length}개를 모두 승인할까요?`, '전체 승인', '승인', '취소'))) return;
      try { for (const c of pend) await A.setCommentStatus(c.id, 'ok'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
  }

  /* ---------- 댓글 전체 ---------- */
  async function viewComments() {
    const [all, posts] = await Promise.all([A.listAllComments(), A.listPosts()]);
    const titleOf = {}; posts.forEach(p => { titleOf[p.id] = p.title; });
    main.innerHTML = `<h2 class="page-title">💬 댓글 전체 (${all.length})</h2>
      ${all.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>작성자</th><th>내용</th><th class="hide-m">위치</th><th>관리</th></tr></thead><tbody>${all.map(c => cmtRow(c, titleOf)).join('')}</tbody></table></div>` : '<div class="empty">댓글이 없어요.</div>'}`;
    bindCmtActions([]);
    setStatus(`${all.length}개 개체`, '');
  }

  /* ---------- 등업 신청 ---------- */
  async function viewUpgrade() {
    const rows = await A.listUpgradeRequests();
    const k = A.rules().grades.find(g => g.needApproval) || {};
    main.innerHTML = `<h2 class="page-title">🎫 KTX 등업 신청</h2>
      <div class="msg info">KTX 조건: 가입 ${k.minWeeks}주 · 글 ${k.minPosts} · 댓글 ${k.minComments} · 공감 ${k.minLikes}. 조건을 채운 회원이 <b>등업신청</b> 게시판에 글을 쓰면 여기 나타나요. 확인 후 승인해 주세요.</div>
      ${rows.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>회원</th><th>현재 등급</th><th>활동</th><th>조건</th><th class="hide-m">신청글</th><th>처리</th></tr></thead><tbody>${rows.map(({ post, user }) => {
        if (!user) return `<tr><td colspan="6">(탈퇴한 회원)</td></tr>`;
        const s = user.stats || {};
        return `<tr><td class="c"><b>${esc(user.nick)}</b></td><td class="c">${gradeBadge(user.role, user.grade, true)}</td>
          <td class="c"><small>${s.weeks}주 · 글 ${s.posts} · 댓글 ${s.comments} · 공감 ${s.likes}</small></td>
          <td class="c">${user.ktxEligible ? '✅ 충족' : '❌ 부족'}</td>
          <td class="c hide-m"><a href="index.html#/post/${esc(post.id)}" target="_blank" rel="noopener">${esc(post.title)}</a><br><small>${fmtShort(post.created)}</small></td>
          <td class="c">${user.grade >= 4 || A.isStaff(user.role) ? '✔ 완료' : `<button class="btn sm primary" type="button" data-apv="${esc(user.id)}" ${user.ktxEligible ? '' : 'disabled'}>🚄 KTX 승인</button>`}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">등업 신청이 없어요.</div>'}`;
    main.querySelectorAll('[data-apv]').forEach(b => b.onclick = async () => {
      if (!(await confirmBox('이 회원을 KTX 등급으로 올릴까요?', '등업 승인', '승인', '취소'))) return;
      try { await A.approveKtx(b.dataset.apv); toast('KTX로 등업했어요 🚄'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    setStatus(`${rows.length}건`, '');
  }

  /* ---------- 회원 ---------- */
  /* ---------- 서비스 상태 공지 (status.html 에 보여요) ---------- */
  const ST_LABEL = { investigating: '🔍 확인 중', identified: '🧭 원인 파악', monitoring: '👀 지켜보는 중', resolved: '✅ 해결됨' };
  const IMP_LABEL = { none: '영향 없음 (안내)', minor: '일부 불편', major: '크게 불편 (장애)' };
  /* ---------- 중고거래 관리 ---------- */
  /* ---------- 신고 처리 (정보통신망법 임시조치 · 저작권 침해 신고) ---------- */
  async function viewReports() {
    const list = await A.contentReports(), R = (C.report || {}).reasons || {};
    const days = iso => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    main.innerHTML = `
      <h2 class="page-title">🚨 신고 처리</h2>
      <div class="msg info">권리침해·불법·저작권 신고는 1건이면, 그 밖의 신고는 ${(C.report || {}).hideAt || 3}명이 하면 글이 <b>임시로 숨겨져요</b>. 확인해서 문제가 없으면 <b>복구</b>, 위반이면 <b>삭제</b>해 주세요. 처리하면 글쓴이에게 알림이 가요. <b>임시 숨김은 30일 안에</b> 처리해요. 억울하다는 이의는 문의·건의로 들어와요.</div>
      ${list.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>대상</th><th>신고 내용</th><th class="hide-m">경과</th><th>처리</th></tr></thead><tbody>${list.map(g => {
        const d = days(g.reports[0].created);
        return `<tr><td style="min-width:150px">${g.kind === 'post' ? '📝 글' : '💬 댓글'} ${g.held ? '<span class="pending-tag">숨김</span>' : ''}<br><a href="index.html#/post/${esc(g.postId)}" target="_blank" rel="noopener">${esc(String(g.title).slice(0, 60))}</a><br><small>작성자 ${esc(g.author || '-')}</small></td>
          <td>${g.reports.map(r => `<div><b>${esc(R[r.reason] || r.reason)}</b> · ${esc(r.reporter || '')}${r.note ? `<br><small style="white-space:pre-wrap">${esc(r.note)}</small>` : ''}</div>`).join('')}</td>
          <td class="c hide-m">${d}일${d >= 25 ? '<br><b style="color:#c00">⚠ 곧 30일</b>' : ''}</td>
          <td class="c"><button class="btn sm" type="button" data-rs="${esc(g.kind)}:${esc(g.id)}">↩ 복구</button> <button class="btn sm danger" type="button" data-rm="${esc(g.kind)}:${esc(g.id)}">🗑 삭제</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">처리할 신고가 없어요. ✨</div>'}`;
    const act = async (v, action, q, ok) => {
      const [k, id] = v.split(':');
      if (!(await confirmBox(q, '신고 처리', ok, '취소'))) return;
      try { await A.contentReview(k, id, action); toast('처리했어요.'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
    main.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => act(b.dataset.rs, 'restore', '문제가 없다고 보고 다시 공개할까요?\n(들어온 신고는 모두 무효가 돼요)', '복구'));
    main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => act(b.dataset.rm, 'remove', '운영정책 위반으로 삭제할까요?\n되돌릴 수 없어요.', '삭제'));
    setStatus(`신고 ${list.length}건`, '');
  }

  async function viewMarket(filter) {
    let items, bans; try { [items, bans] = await Promise.all([A.marketAdminList(), A.marketBans()]); } catch (e) { main.innerHTML = errBox(e); return; }
    const MK = C.market || {}, flt = filter || 'attn';
    const attn = i => i.status === 'hidden' || i.reports > 0;
    const shown = items.filter(i => flt === 'all' ? true : flt === 'hidden' ? i.status === 'hidden' : flt === 'removed' ? i.status === 'removed' : attn(i));
    const tabs = [['attn', '확인 필요'], ['hidden', '숨김'], ['removed', '삭제됨'], ['all', '전체']];
    main.innerHTML = `<h2 class="page-title">🛒 중고거래 관리</h2>
      <div class="msg info">신고 ${MK.reportHide || 3}명이면 글이 자동으로 숨겨져요. <b>다시 열기</b>를 누르면 신고가 무효 처리되고 판매자에게 알림이 가요. 명백한 위반(모조품·유효 승차권·개인정보 등)은 <b>삭제</b>하세요.</div>
      ${bans.length ? `<div class="sub-title"><span>⛔ 판매 정지 중인 회원 (${bans.length})</span></div><div style="overflow:auto"><table class="tbl"><thead><tr><th>닉네임</th><th>해제 예정</th><th>사유</th><th>관리</th></tr></thead><tbody>${bans.map(b => `<tr><td class="c"><b>${esc(b.nick)}</b></td><td class="c">${fmtShort(b.until)}</td><td>${esc(b.reason)}</td><td class="c"><button class="btn sm" type="button" data-unban="${esc(b.userId)}">정지 해제</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      <div class="sub-title"><span>${tabs.map(([k, t]) => `<a href="#/market${k === 'attn' ? '' : '/' + k}" ${k === flt ? 'style="font-weight:700;text-decoration:underline"' : ''}>${t}</a>`).join(' · ')} — ${shown.length}건</span></div>
      ${shown.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>글</th><th>판매자</th><th>상태</th><th>신고</th><th class="hide-m">올린 날</th><th>관리</th></tr></thead><tbody>${shown.map(i => `<tr data-mk="${esc(i.id)}">
        <td class="t"><a href="index.html#/market/${esc(i.id)}" target="_blank" rel="noopener">${esc(i.title)}</a><br><small>${esc(((MK.categories || []).find(c => c.id === i.category) || {}).name || '')} · ${i.price.toLocaleString()}원</small>${i.hiddenWhy ? `<br><small>⛔ ${esc(i.hiddenWhy)}</small>` : ''}</td>
        <td class="c">${esc(i.seller)}</td><td class="c">${esc((MK.status || {})[i.status] || i.status)}</td>
        <td class="c">${i.reports ? `<button class="btn sm" type="button" data-rp="${esc(i.id)}">${i.reports}건 보기</button>` : '-'}</td><td class="c hide-m">${fmtShort(i.created)}</td>
        <td class="c">${['hidden', 'removed'].includes(i.status) ? `<button class="btn sm" type="button" data-act="restore">♻ 다시 열기</button> ` : (i.reports ? `<button class="btn sm" type="button" data-act="restore" title="신고를 무효로 처리">신고 무효</button> ` : '')}${i.status !== 'removed' ? '<button class="btn sm danger" type="button" data-act="remove">🗑 삭제</button>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">확인할 글이 없어요 👍</div>'}`;
    main.querySelectorAll('[data-unban]').forEach(b => b.onclick = async () => { try { await A.marketUnban(b.dataset.unban); toast('정지를 풀었어요.'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); } });
    main.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const id = b.closest('[data-mk]').dataset.mk, act = b.dataset.act; let note = '';
      if (act === 'remove') { note = await askText('글 삭제', '삭제 사유 (판매자에게 알림으로 가요)'); if (note === null) return; }
      try { await A.marketStaff(id, act, note); toast('처리했어요.'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    main.querySelectorAll('[data-rp]').forEach(b => b.onclick = async () => {
      try {
        const rows = await A.marketReports(b.dataset.rp);
        alertBox(rows.map(r => `• ${r.reporter} — ${(MK.reasons || {})[r.reason] || r.reason}${r.note ? ' : ' + r.note : ''}${r.dismissed ? ' (무효)' : ''}`).join('\n') || '내역이 없어요.', '신고 내역', '🚨');
      } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    setStatus(`중고거래 ${items.length}건`, bans.length ? `정지 ${bans.length}명` : '');
  }

  async function viewStatus() {
    let list; try { list = await A.listIncidents(); } catch (e) { main.innerHTML = errBox(e); return; }
    const comps = C.statusComponents || [];
    const opts = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${v}</option>`).join('');
    const compName = id => (comps.find(c => c.id === id) || {}).name || id;
    const open = list.filter(x => x.status !== 'resolved');
    main.innerHTML = `<h2 class="page-title">📡 서비스 상태 공지</h2>
      <div class="msg info">장애나 점검이 있을 때 여기에 올리면 <a href="status.html" target="_blank" rel="noopener">상태 페이지</a>에 바로 보여요. 진행되는 대로 <b>업데이트</b>를 달고, 끝나면 <b>✅ 해결됨</b>으로 바꿔 주세요.</div>
      <fieldset class="panel raised"><legend><b>새 공지 올리기</b></legend>
        <div class="field"><label for="in-t">제목</label><input class="input" id="in-t" maxlength="100" placeholder="예: 로그인이 느려요"></div>
        <div class="field"><label for="in-i">영향</label> <select class="input" id="in-i" style="width:auto">${opts(IMP_LABEL, 'minor')}</select>
          <label for="in-s" style="margin-left:8px">상태</label> <select class="input" id="in-s" style="width:auto">${opts(ST_LABEL, 'investigating')}</select></div>
        <div class="field"><b>영향받는 서비스</b><br>${comps.map(c => `<label class="check" style="margin-right:10px"><input type="checkbox" name="in-c" value="${esc(c.id)}"> ${esc(c.name)}</label>`).join('')}</div>
        <div class="field"><label for="in-b">내용</label><textarea class="input" id="in-b" rows="3" maxlength="1000" placeholder="무슨 일이 있고, 지금 어떻게 하고 있는지 적어 주세요."></textarea></div>
        <div class="err-line" id="in-e" role="alert"></div>
        <button class="btn primary" id="in-go" type="button">공지 올리기</button></fieldset>
      <div class="sub-title"><span>진행 중 ${open.length}건 · 전체 ${list.length}건</span></div>
      ${list.length ? list.map(x => `<div class="panel raised" data-inc="${esc(x.id)}" style="margin-bottom:10px">
        <div><b>${esc(x.title)}</b> <small>${ST_LABEL[x.status]} · ${IMP_LABEL[x.impact]}${x.components.length ? ' · ' + x.components.map(c => esc(compName(c))).join(', ') : ''}</small></div>
        <ul style="margin:6px 0 8px 18px;padding:0">${x.updates.map(u => `<li><small>${fmtShort(u.created)} · ${ST_LABEL[u.status]} · ${esc(u.by)}</small><br>${esc(u.body)}</li>`).join('')}</ul>
        <div class="field" style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start">
          <select class="input" data-s style="width:auto">${opts(ST_LABEL, x.status)}</select>
          <textarea class="input" data-b rows="2" maxlength="1000" placeholder="업데이트 내용" style="flex:1;min-width:180px"></textarea>
          <button class="btn sm" type="button" data-up>업데이트 달기</button>${isMgr() ? ' <button class="btn sm danger" type="button" data-del>🗑 삭제</button>' : ''}</div></div>`).join('') : '<div class="empty">아직 올린 공지가 없어요. 문제가 없으면 상태 페이지에는 "모든 시스템 정상"으로 보여요.</div>'}`;
    $('#in-go').onclick = async () => {
      const err = $('#in-e'); err.textContent = '';
      try {
        await A.postIncident({ title: $('#in-t').value, impact: $('#in-i').value, status: $('#in-s').value, body: $('#in-b').value,
          components: [...main.querySelectorAll('[name=in-c]:checked')].map(c => c.value) });
        toast('공지를 올렸어요.'); route();
      } catch (e) { err.textContent = '⚠ ' + e.message; }
    };
    main.querySelectorAll('[data-inc]').forEach(box => {
      const id = box.dataset.inc;
      box.querySelector('[data-up]').onclick = async () => {
        try { await A.updateIncident(id, box.querySelector('[data-s]').value, box.querySelector('[data-b]').value); toast('업데이트를 달았어요.'); route(); }
        catch (e) { alertBox(e.message, '오류', '⚠️'); }
      };
      const del = box.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        if (!(await confirmBox('이 공지를 지울까요? 상태 페이지 기록에서도 사라져요.', '공지 삭제', '삭제', '취소'))) return;
        try { await A.deleteIncident(id); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
      };
    });
    setStatus(`상태 공지 ${list.length}건`, open.length ? `진행 중 ${open.length}건` : '');
  }

  async function viewUsers() {
    const users = (await A.listUsers()).sort((a, b) => new Date(b.created) - new Date(a.created));
    const roleCell = u => {
      if (u.role === 'admin') return '👑 총관리자';
      if (isAdm() && u.id !== me.id) return `<select class="input" style="width:auto" data-role="${esc(u.id)}" aria-label="${esc(u.nick)} 권한"><option value="user"${u.role === 'user' ? ' selected' : ''}>회원</option><option value="subadmin"${u.role === 'subadmin' ? ' selected' : ''}>🛠 부관리자</option><option value="manager"${u.role === 'manager' ? ' selected' : ''}>🛡 관리자</option></select>`;
      if (me.role === 'manager' && ['user', 'subadmin'].includes(u.role)) return `<select class="input" style="width:auto" data-role="${esc(u.id)}" aria-label="${esc(u.nick)} 권한"><option value="user"${u.role === 'user' ? ' selected' : ''}>회원</option><option value="subadmin"${u.role === 'subadmin' ? ' selected' : ''}>🛠 부관리자</option></select>`;
      return u.role === 'manager' ? '🛡 관리자' : u.role === 'subadmin' ? '🛠 부관리자' : '회원';
    };
    main.innerHTML = `<h2 class="page-title">👥 회원 (${users.length})</h2>
      ${users.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>닉네임</th><th>권한</th><th>등급</th><th>포인트</th><th class="hide-m">활동 (주/글/댓글/공감)</th><th class="hide-m">가입일</th><th>관리</th></tr></thead><tbody>${users.map(u => {
        const s = u.stats || {};
        return `<tr><td class="c"><b>${esc(u.nick)}</b>${u.bannedUntil ? `<br><span class="pending-tag" title="${esc(u.banReason || '')}">⛔ ${fmtShort(u.bannedUntil)}까지 정지</span>` : ''}</td><td class="c">${roleCell(u)}</td><td class="c">${gradeBadge(u.role, u.grade, true)}${u.gradeLock ? ' <span title="운영진이 정한 등급 (자동 승급 안 함)">🔒</span>' : ''}</td><td class="c">${(u.points || 0).toLocaleString()}P</td>
          <td class="c hide-m"><small>${s.weeks}/${s.posts}/${s.comments}/${s.likes}</small></td><td class="c hide-m">${fmtShort(u.created)}</td>
          <td class="c">${!A.isStaff(u.role) && u.grade < 4 && u.ktxEligible ? `<button class="btn sm" type="button" data-apv="${esc(u.id)}">🚄 KTX 승인</button> ` : ''}${canAct(u) && u.id !== me.id && A.rankOf(u.role) < A.rankOf(me.role) ? `<button class="btn sm${u.bannedUntil ? ' primary' : ''}" type="button" data-sus="${esc(u.id)}">${u.bannedUntil ? '✅ 정지 해제' : '⛔ 정지'}</button> ` : ''}${canAct(u) ? `<button class="btn sm" type="button" data-pt="${esc(u.id)}">💰 포인트·등급</button> ` : ''}${isMgr() && canAct(u) && u.id !== me.id ? `<button class="btn sm" type="button" data-clr="${esc(u.id)}" data-nick="${esc(u.nick)}" title="사용자 문서 비우기">🧹</button> ` : ''}${isMgr() && canAct(u) && u.id !== me.id && u.role !== 'admin' ? `<button class="btn sm danger" type="button" data-rm="${esc(u.id)}" title="강제 탈퇴">🚫 탈퇴</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty">회원이 없어요.</div>'}
      <div class="msg info"><b>역할</b>: 👑총관리자(전부, 설정 포함) &gt; 🛡관리자(회원 권한 지정[부관리자까지]·상점·포인트/등급·글 수정) &gt; 🛠부관리자(글·댓글 삭제, 검토·등업 승인, <b>포인트·등급 조정</b>) &gt; 회원. 포인트·등급은 <b>나보다 낮은 역할</b>의 회원만 바꿀 수 있어요(총관리자는 누구나). 관리자 임명은 총관리자만 해요.</div>
      <div class="msg info">등급을 직접 정하면 🔒 표시가 붙고 그 회원은 자동 승급이 멈춰요. "자동"을 고르면 활동 조건대로 다시 계산해요. 이메일을 받지 않아서 비밀번호를 잊으면 찾을 수 없어요. ${A.mode === 'supabase' ? '필요하면 Supabase 대시보드(Authentication)에서 처리하세요.' : ''}</div>`;
    main.querySelectorAll('[data-role]').forEach(sel => sel.onchange = async () => {
      try { await A.setUserRole(sel.dataset.role, sel.value); toast('권한을 바꿨어요.'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); route(); }
    });
    main.querySelectorAll('[data-apv]').forEach(b => b.onclick = async () => {
      if (!(await confirmBox('이 회원을 KTX 등급으로 올릴까요?', '등업 승인', '승인', '취소'))) return;
      try { await A.approveKtx(b.dataset.apv); toast('KTX로 등업했어요 🚄'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    main.querySelectorAll('[data-clr]').forEach(b => b.onclick = async () => {
      if (!(await confirmBox(`${b.dataset.nick}님의 사용자 문서를 비울까요?`, '문서 비우기', '비우기', '취소'))) return;
      try { await A.clearBio(b.dataset.clr); toast('문서를 비웠어요.'); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    main.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => pointDialog(users.find(x => x.id === b.dataset.pt)));
    main.querySelectorAll('[data-sus]').forEach(b => b.onclick = () => suspendDialog(users.find(x => x.id === b.dataset.sus)));
    main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => removeDialog(users.find(x => x.id === b.dataset.rm)));
    if (isMgr()) {
      const box = document.createElement('div'); main.appendChild(box);
      A.listRemovals().then(list => {
        if (!list.length) return;
        box.innerHTML = `<div class="sub-title"><span>🚫 강제 탈퇴 기록 (최근 ${list.length}건)</span></div><div style="overflow:auto"><table class="tbl"><thead><tr><th>닉네임</th><th>사유</th><th>처리자</th><th>알림 메일</th><th>일시</th></tr></thead><tbody>${list.map(x =>
          `<tr><td class="c"><b>${esc(x.nick)}</b></td><td>${esc(x.reason)}</td><td class="c">${esc(x.byNick)}</td><td class="c">${x.mailed ? '✉ 보냄' : '✕ ' + esc(x.mailNote || '못 보냄')}</td><td class="c">${fmtShort(x.created)}</td></tr>`).join('')}</tbody></table></div>`;
      }).catch(() => {});
    }
    setStatus(`${users.length}명`, '');
  }

  /* 정지 창: 며칠 동안 글·댓글·쪽지·장터 글쓰기를 막아요 (읽기는 돼요). 해제는 바로 돼요 */
  function suspendDialog(u) {
    if (!u) return;
    if (u.bannedUntil) {
      confirmBox(`${u.nick}님의 정지를 풀까요?\n(지금 사유: ${u.banReason || '-'})`, '정지 해제', '해제', '취소').then(async ok => {
        if (!ok) return;
        try { await A.setSuspension(u.id, 0, ''); toast('정지를 풀었어요.'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
      });
      return;
    }
    const w = openWin({
      title: `⛔ ${u.nick}님 정지`, width: 400,
      html: `<div class="dlg-body" style="display:block">
        <div class="msg info" style="margin-bottom:8px">정지 중에는 <b>글·댓글·쪽지·장터 글쓰기</b>가 막혀요. 읽기와 로그인은 돼요. 본인에게 알림이 가고 <b>감사 로그</b>에 남아요.</div>
        <div class="field"><label for="su-d"><b>기간</b></label><select class="input" id="su-d"><option value="1">1일</option><option value="3" selected>3일</option><option value="7">7일</option><option value="14">14일</option><option value="30">30일</option><option value="90">90일</option></select></div>
        <div class="field"><label for="su-r"><b>사유</b> <small>(본인에게 보여요 · 5~200자)</small></label><textarea class="input" id="su-r" rows="3" maxlength="200" placeholder="예: 다른 회원에게 욕설을 반복"></textarea></div>
        <div class="err-line" id="su-e" role="alert"></div></div>
      <div class="dlg-btns"><button class="btn primary" type="button" data-ok>정지하기</button><button class="btn" type="button" data-no>취소</button></div>`
    });
    const q = x => w.el.querySelector(x);
    q('[data-no]').onclick = () => w.close();
    q('[data-ok]').onclick = async () => {
      const err = q('#su-e'); err.textContent = ''; const r = q('#su-r').value.trim();
      if (r.length < 5) { err.textContent = '⚠ 사유를 5자 이상 적어 주세요.'; return; }
      const b = q('[data-ok]'); b.disabled = true;
      try { await A.setSuspension(u.id, +q('#su-d').value, r); w.close(); toast(`${u.nick}님을 ${q('#su-d').value}일 정지했어요.`); route(); }
      catch (e) { err.textContent = '⚠ ' + e.message; b.disabled = false; }
    };
  }

  /* ---------- 감사 로그 (관리자 이상) ---------- */
  const AUDIT_LABEL = { post_delete: '🗑 글 삭제', comment_delete: '🗑 댓글 삭제', report_restore: '↩ 신고 복구', suspend: '⛔ 회원 정지', unsuspend: '✅ 정지 해제', role_change: '🛡 권한 변경' };
  async function viewAudit() {
    const list = await A.auditLogs();
    main.innerHTML = `<h2 class="page-title">📜 감사 로그</h2>
      <div class="msg info">운영진이 <b>남의 글·댓글을 지우거나, 신고를 처리하거나, 회원을 정지하거나, 권한을 바꾼 기록</b>이에요. 누구도 고치거나 지울 수 없어요. 방심위·신고 대응 때 "누가 언제 왜 했는지" 증거가 돼요. (최근 ${list.length}건)${A.mode === 'supabase' ? ' 강제 탈퇴는 <a href="#/users">회원</a> 화면 아래 "강제 탈퇴 기록"에 있어요.' : ''}</div>
      <div class="row" style="margin-bottom:8px"><select class="input" id="au-f" style="width:auto" aria-label="종류 필터"><option value="">전체</option>${Object.keys(AUDIT_LABEL).map(k => `<option value="${k}">${AUDIT_LABEL[k]}</option>`).join('')}</select>
        <button class="btn sm" id="au-csv" type="button">⬇ CSV로 저장</button></div>
      <div id="au-t"></div>`;
    const draw = () => {
      const f = main.querySelector('#au-f').value, rows = list.filter(x => !f || x.action === f);
      main.querySelector('#au-t').innerHTML = rows.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>일시</th><th>처리자</th><th>종류</th><th>대상</th><th class="hide-m">사유</th></tr></thead><tbody>${rows.map(x =>
        `<tr><td class="c">${fmtDate(x.created)}</td><td class="c"><b>${esc(x.actor || '-')}</b></td><td class="c">${esc(AUDIT_LABEL[x.action] || x.action)}</td><td>${esc(x.label)}</td><td class="hide-m">${esc(x.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">기록이 없어요.</div>';
    };
    main.querySelector('#au-f').onchange = draw; draw();
    main.querySelector('#au-csv').onclick = () => {
      const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const csv = '\ufeff' + ['일시,처리자,종류,대상,사유'].concat(list.map(x => [x.created, x.actor, AUDIT_LABEL[x.action] || x.action, x.label, x.reason].map(q).join(','))).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'audit-log.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    setStatus(`감사 로그 ${list.length}건`, '');
  }

  /* 강제 탈퇴 창: 사유를 적으면 그 회원의 이메일로 알림이 가고, 계정이 지워져요 */
  function removeDialog(u) {
    if (!u) return;
    const w = openWin({
      title: `🚫 ${u.nick}님 강제 탈퇴`, width: 420,
      html: `<div class="dlg-body" style="display:block">
        <div class="msg err" style="margin-bottom:8px">⚠ 계정이 <b>바로 삭제</b>돼요. 되돌릴 수 없어요.<br><small>쓴 글은 남지만 작성자 연결이 끊기고, 댓글·쪽지·알림·보유 포인트는 함께 삭제돼요.</small></div>
        <div class="field"><label for="rm-r"><b>탈퇴 사유</b> <small>(회원 이메일로 그대로 전달돼요 · 5~500자)</small></label>
          <textarea class="input" id="rm-r" rows="4" maxlength="500" placeholder="예: 반복적인 도배와 운영진 경고 불응"></textarea></div>
        <div class="field"><label class="check"><input type="checkbox" id="rm-c"> 사유를 확인했고, ${esc(u.nick)}님을 탈퇴시키는 데 동의해요</label></div>
        <div class="err-line" id="rm-e" role="alert"></div></div>
      <div class="dlg-btns"><button class="btn primary" type="button" data-ok>탈퇴 처리</button><button class="btn" type="button" data-no>취소</button></div>`
    });
    const q = s => w.el.querySelector(s);
    q('[data-no]').onclick = () => w.close();
    const run = async skipMail => {
      const err = q('#rm-e'); err.textContent = '';
      const reason = q('#rm-r').value.trim();
      if (reason.length < 5) { err.textContent = '⚠ 사유를 5자 이상 적어 주세요.'; return; }
      if (!q('#rm-c').checked) { err.textContent = '⚠ 확인 체크를 해 주세요.'; return; }
      const ok = q('[data-ok]'); ok.disabled = true;
      try {
        const r = await A.removeMember(u.id, reason, { skipMail });
        w.close();
        toast(r.mailed ? `${u.nick}님을 탈퇴시키고 알림 메일을 보냈어요.` : `${u.nick}님을 탈퇴시켰어요. (알림 메일은 못 보냈어요${r.mailNote ? ': ' + r.mailNote : ''})`);
        route();
      } catch (e) {
        ok.disabled = false;
        if (e.code === 'no_email') {
          if (await confirmBox(`${u.nick}님은 알림을 보낼 이메일이 없어요. (예전 가입 방식)\n메일 없이 탈퇴시킬까요?`, '메일 없음', '그래도 탈퇴', '취소')) return run(true);
        } else err.textContent = '⚠ ' + e.message;
      }
    };
    q('[data-ok]').onclick = () => run(false);
  }

  /* 포인트·등급 조정 창 */
  function pointDialog(u) {
    const w = openWin({
      title: `${u.nick}님 포인트·등급`, width: 380,
      html: `<div class="dlg-body" style="display:block">
        <div style="margin-bottom:8px">현재 <b>${(u.points || 0).toLocaleString()}P</b> · ${gradeBadge(u.role, u.grade, true)}${u.gradeLock ? ' 🔒' : ''}</div>
        <fieldset><legend>포인트</legend>
          <label class="check"><input type="radio" name="pm" value="add" checked> 증가/감소 <small>(감소는 -100 처럼)</small></label><br>
          <label class="check"><input type="radio" name="pm" value="set"> 이 값으로 지정</label>
          <div class="field" style="margin-top:6px"><input class="input" type="number" id="pa" placeholder="예: 100 또는 -50" step="1"></div>
          <div class="field"><input class="input" id="pn" maxlength="60" placeholder="사유 (선택, 회원 내역에 표시돼요)"></div></fieldset>
        ${A.isStaff(u.role) ? '' : `<fieldset><legend>등급</legend><select class="input" id="pg"><option value="">변경 안 함</option><option value="0">자동 (활동 조건대로)</option>${A.rules().grades.map(g => `<option value="${g.level}">${g.icon} ${esc(g.name)}로 지정</option>`).join('')}</select></fieldset>`}
        <div class="err-line" id="perr" role="alert"></div></div>
        <div class="dlg-btns"><button class="btn primary" type="button" data-ok>적용</button><button class="btn" type="button" data-no>취소</button></div>`
    });
    const q = s => w.el.querySelector(s);
    q('[data-no]').onclick = () => w.close();
    q('[data-ok]').onclick = async () => {
      const err = q('#perr'); err.textContent = '';
      const amt = q('#pa').value.trim(), mode = w.el.querySelector('[name=pm]:checked').value, g = q('#pg') ? q('#pg').value : '';
      if (!amt && g === '') { err.textContent = '⚠ 바꿀 내용을 입력해 주세요.'; return; }
      try {
        if (amt) {
          const n = Math.trunc(Number(amt)); if (!Number.isFinite(n)) throw new Error('숫자를 입력해 주세요.');
          await A.adjustPoints(u.id, mode, n, q('#pn').value.trim() || '운영진 조정');
        }
        if (g !== '') await A.setGrade(u.id, +g);
        w.close(); toast('적용했어요.'); route();
      } catch (e) { err.textContent = '⚠ ' + e.message; }
    };
  }

  /* ---------- 상점 관리 (총관리자) ---------- */
  async function viewShop() {
    const shop = await A.listShop({ all: true });
    main.innerHTML = `<h2 class="page-title">🛍 상점 관리</h2>
      <div class="msg info">가격을 바꾸거나 판매를 잠시 멈출 수 있어요. 이미 산 회원은 판매를 멈춰도 계속 쓸 수 있어요. 가격 0P는 무료 상품이에요.</div>
      <div style="overflow:auto"><table class="tbl"><thead><tr><th>종류</th><th>상품</th><th>가격(P)</th><th>판매</th><th>저장</th></tr></thead><tbody>${shop.items.map(i => `<tr>
        <td class="c">${esc(A.kindLabel[i.kind] || i.kind)}</td><td><b>${esc(i.name)}</b><br><small>${esc(i.desc)}</small></td>
        <td class="c"><input class="input" type="number" min="0" step="10" value="${i.price}" style="width:90px" data-price="${esc(i.id)}"></td>
        <td class="c"><input type="checkbox" data-act="${esc(i.id)}"${i.active ? ' checked' : ''} aria-label="판매"></td>
        <td class="c"><button class="btn sm" type="button" data-save="${esc(i.id)}">저장</button></td></tr>`).join('')}</tbody></table></div>`;
    main.querySelectorAll('[data-save]').forEach(b => b.onclick = async () => {
      const id = b.dataset.save;
      const price = main.querySelector(`[data-price="${id}"]`).value, active = main.querySelector(`[data-act="${id}"]`).checked;
      try { await A.saveShopItem({ id, price, active }); toast('저장했어요.'); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    setStatus(`${shop.items.length}개 상품`, '');
  }

  /* ---------- 설정 ---------- */
  async function viewSettings() {
    const s = await A.getSettings();
    const L = s.links || {};
    main.innerHTML = `<h2 class="page-title">⚙️ 설정</h2>
      <form id="sf">
        <fieldset><legend>사이트 문구</legend>
          <div class="field"><label for="s1">전광판 문구 (홈 화면 위에서 흘러가요)</label><input class="input" id="s1" name="marquee" value="${esc(s.marquee)}" maxlength="200"></div>
          <div class="field"><label for="s2">소개글 (홈 화면)</label><textarea class="input" id="s2" name="intro" maxlength="500">${esc(s.intro)}</textarea></div>
        </fieldset>
        <fieldset><legend>덕질역 공식 채널 링크 (https:// 로 시작)</legend>
          <div class="field"><label for="l1">📗 네이버 블로그</label><input class="input" id="l1" name="blog" value="${esc(L.blog)}" placeholder="https://blog.naver.com/…"></div>
          <div class="field"><label for="l2">▶️ 유튜브</label><input class="input" id="l2" name="youtube" value="${esc(L.youtube)}" placeholder="https://www.youtube.com/@…"></div>
          <div class="field"><label for="l3">📸 인스타그램</label><input class="input" id="l3" name="instagram" value="${esc(L.instagram)}" placeholder="https://www.instagram.com/…"></div>
          <div class="field"><label for="l4">🧵 스레드</label><input class="input" id="l4" name="threads" value="${esc(L.threads)}" placeholder="https://www.threads.net/@…"></div>
        </fieldset>
        <fieldset><legend>댓글 금칙어</legend>
          <div class="field"><label for="bw">쉼표로 구분 — 포함된 댓글은 "검토 대기"가 돼요</label><textarea class="input" id="bw" name="banned" style="min-height:120px">${esc((s.banned || []).join(', '))}</textarea>
          <div class="hint">띄어쓰기·점·숫자를 넣어 우회한 표현(예: "시.발")도 같이 걸러요.</div></div>
        </fieldset>
        <div class="err-line" role="alert"></div>
        <button class="btn primary" type="submit">💾 설정 저장</button>
      </form>
      <div class="sub-title" style="margin-top:20px"><span>🗄 데이터</span></div>
      ${A.mode === 'local' ? `<div class="msg info">지금은 <b>로컬 데모 모드</b>예요. 모든 데이터가 이 브라우저에만 저장돼요. 다른 사람이 가입·댓글을 쓰게 하려면 README대로 Supabase를 연결하세요. 그 전에는 백업을 자주 받아 두세요.</div>
        <div class="row"><button class="btn" type="button" id="bkExp">💾 백업 내려받기</button><label class="btn" for="bkImp">📂 백업 불러오기</label><input type="file" id="bkImp" accept=".json,application/json" hidden>
        <button class="btn danger" type="button" id="bkReset">🧨 전부 초기화</button></div>`
        : `<div class="msg info">데이터는 Supabase에 저장돼요. 백업은 Supabase 대시보드(Database → Backups)나 Table Editor에서 CSV로 내려받을 수 있어요.</div>`}`;
    const f = $('#sf');
    f.onsubmit = async e => {
      e.preventDefault(); const err = f.querySelector('.err-line'); err.textContent = '';
      const links = {};
      for (const k of ['blog', 'youtube', 'instagram', 'threads']) {
        const v = f[k].value.trim();
        if (v && !/^https?:\/\//i.test(v)) { err.textContent = '⚠ 링크는 https:// 로 시작해야 해요.'; return; }
        links[k] = v;
      }
      const banned = [...new Set(f.banned.value.split(/[,\n]/).map(x => x.trim()).filter(Boolean))];
      try { await A.saveSettings({ marquee: f.marquee.value.trim(), intro: f.intro.value.trim(), links, banned }); alertBox('설정을 저장했어요.', '저장 완료', '✅'); }
      catch (x) { err.textContent = '⚠ ' + x.message; }
    };
    if (A.mode === 'local') {
      $('#bkExp').onclick = () => {
        const blob = new Blob([A.exportData()], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'deokjil-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      $('#bkImp').onchange = async e => {
        const file = e.target.files[0]; if (!file) return;
        if (!(await confirmBox('현재 데이터가 백업 파일 내용으로 바뀌어요. 계속할까요?', '백업 불러오기', '불러오기', '취소'))) return;
        try { A.importData(await file.text()); await A.logout(); await alertBox('불러왔어요. 다시 로그인해 주세요.', '완료', '✅'); location.reload(); }
        catch (x) { alertBox(x.message, '오류', '⚠️'); }
      };
      $('#bkReset').onclick = async () => {
        if (!(await confirmBox('글·댓글·회원이 전부 사라져요. 정말 초기화할까요?', '전부 초기화', '초기화', '취소'))) return;
        A.resetAll(); location.hash = '#/'; location.reload();
      };
    }
    setStatus('설정', '');
  }


  /* ---------- 문의/건의 ---------- */
  const INQ_ST = { open: '🟡 접수됨', answered: '🟢 답변 완료', closed: '⚪ 종료' };
  async function viewInquiries() {
    const list = await A.inqAll();
    let filter = 'open';
    const draw = () => {
      const rows = list.filter(q => filter === 'all' || q.status === filter);
      main.innerHTML = `<h2 class="page-title">📮 문의/건의 (${list.length})</h2>
        <div class="row" style="margin-bottom:10px;gap:6px;flex-wrap:wrap">${[['open', '🟡 접수됨'], ['answered', '🟢 답변 완료'], ['closed', '⚪ 종료'], ['all', '전체']].map(([k, t]) => `<button class="btn sm${filter === k ? ' primary' : ''}" type="button" data-f="${k}">${t} (${k === 'all' ? list.length : list.filter(q => q.status === k).length})</button>`).join('')}</div>
        ${rows.length ? rows.map(q => `<div class="inq panel raised" data-id="${esc(q.id)}">
          <div class="inq-h"><span class="tag">${esc(q.category)}</span> <b>${esc(q.title)}</b> <span class="inq-st">${INQ_ST[q.status] || ''}</span></div>
          <small>${esc(q.nick)} · ${fmtDate(q.created)}</small>
          <div class="inq-b">${esc(q.body).replace(/\n/g, '<br>')}</div>
          <div class="field"><label>답변 ${q.repliedBy ? `<small>(마지막: ${esc(q.repliedBy)} · ${fmtDate(q.repliedAt)})</small>` : ''}</label><textarea class="input" rows="3" maxlength="3000" data-r style="min-height:80px">${esc(q.reply)}</textarea></div>
          <div class="row" style="gap:6px;align-items:center;flex-wrap:wrap"><select class="input" data-s style="width:auto">${Object.entries(INQ_ST).map(([k, t]) => `<option value="${k}"${q.status === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
            <button class="btn primary sm" type="button" data-save>💾 답변·상태 저장</button>${isMgr() ? '<button class="btn sm danger" type="button" data-del>🗑 삭제</button>' : ''}<span class="err-line" data-e></span></div>
        </div>`).join('') : '<div class="empty">해당하는 문의가 없어요.</div>'}`;
      main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
      main.querySelectorAll('.inq').forEach(card => {
        const id = card.dataset.id, q = list.find(x => x.id === id), e = card.querySelector('[data-e]');
        card.querySelector('[data-save]').onclick = async () => {
          e.textContent = '';
          try {
            const r = await A.inqReply(id, { reply: card.querySelector('[data-r]').value, status: card.querySelector('[data-s]').value });
            Object.assign(q, r); toast('저장했어요.'); route();
          } catch (x) { e.textContent = '⚠ ' + x.message; }
        };
        const d = card.querySelector('[data-del]');
        if (d) d.onclick = async () => { if (!(await confirmBox('이 문의를 지울까요?', '문의 삭제'))) return; try { await A.inqDelete(id); route(); } catch (x) { e.textContent = '⚠ ' + x.message; } };
      });
    };
    draw();
    setStatus('문의/건의', `접수 ${list.filter(q => q.status === 'open').length}건`);
  }

  /* ---------- 시작 ---------- */
  async function start() {
    try { await A.init(); me = A.me(); } catch (e) { root.innerHTML = errBox(e); return; }
    $('#modeBadge').textContent = A.mode === 'supabase' ? '☁ Supabase 연결됨' : '💾 로컬 데모 모드';
    window.Common.StaffChat.update(me);
    if (!me) return gate('login');
    if (!A.isStaff(me.role)) return gate('denied');
    if (me.theme) window.Common.applyTheme(me.theme);
    buildShell();
    if (!start.bound) { window.addEventListener('hashchange', route); start.bound = true; }
    route();
  }

  
  $('#mLogout').onclick = async () => { await A.logout(); location.hash = ''; start(); };
  window.addEventListener('deokjil-role', () => start());
  start();
})();
