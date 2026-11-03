/* ==========================================================
   app.js — 덕질역 공개 사이트 (누구나 글쓰기 · 포인트 · 등급 · 상점)
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG, A = window.API, K = window.Common;
  const $ = (s, r = document) => r.querySelector(s);
  const { esc, fmtDate, fmtShort, renderBody, alertBox, confirmBox, loginDialog, applyTheme, gradeBadge, titleChip, rewardToast, toast } = K;

  let dmDraft = '';
  let me = null, settings = {}, visit = { today: 0, total: 0 }, previewing = null;
  const content = $('#content');
  const boardOf = id => C.boards.find(b => b.id === id);
  const sortPinned = l => [...l].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.created) - new Date(a.created)));
  const isStaff = () => !!me && A.isStaff(me.role);
  const isAdmin = () => !!me && me.role === 'admin';
  const isManager = () => !!me && A.isManager(me.role);
  const canEdit = p => !!me && (isManager() || p.authorId === me.id);
  const canDelete = p => !!me && (isStaff() || p.authorId === me.id);
  const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
  const grades = () => A.rules().grades;
  const QUOTES = [
    '버스는 창가 맨 뒷자리가 진리.', '환승은 기다림이 아니라 설렘이다.', '막차를 놓친 날이 가장 오래 기억에 남는다.',
    '노선도를 보면 아직 안 가 본 길이 보인다.', '좋은 출사는 새벽 첫차에서 시작된다.', '배차 간격이 길수록 정류장 풍경이 또렷해진다.',
    '역 이름을 외우는 건 취미이자 특기.', '비 오는 날 차창 빗방울도 훌륭한 피사체.', '종점까지 가 본 사람만 아는 풍경이 있다.',
    '열차 소리는 어느 음악보다 마음이 편하다.'
  ];

  const errBox = e => `<div class="msg err">😵 문제가 생겼어요: ${esc(e && e.message || e)}</div>`;
  function setAddr(path, title) {
    document.title = (title ? title + ' - ' : '') + C.name;
  }
  function setStatus() {}
  /* 닉네임 + 등급 배지 + 칭호 */
  const who = (nick, role, grade, title) => nick
    ? `<span class="nm">${gradeBadge(role, grade)} <a href="#/user/${encodeURIComponent(nick)}">${esc(nick)}</a>${titleChip(title)}</span>` : '-';
  const syncMe = () => { me = A.me(); refreshUser(); };
  /* 중고거래(market.js)에 넘겨 주는 도구 */
  window.Market.init({ content, buildTree, setAddr, setStatus, errBox, ago: iso => ago(iso), needMe: (t, i) => needMe(t, i), notFound: () => notFound(), needLogin: m => needLogin(m), route: () => route(), me: () => me, setDmDraft: t => { dmDraft = t; } });

  /* ---------- 왼쪽 트리 ---------- */
  /* 왼쪽 메뉴는 운영진(부관리자 이상)만 보여요. 안에는 운영진 센터 메뉴만 있어요. 나머지 메뉴는 위쪽 드롭다운에 있어요. */
  function buildTree() { const tree = $('#tree'); if (tree) { tree.hidden = true; tree.innerHTML = ''; } }

  function markTab(k) { document.querySelectorAll('.tabi').forEach(a => a.classList.toggle('on', a.dataset.tab === k)); }

  /* ---------- 글 목록 표 ---------- */
  function postsTable(list, startNo, showBoard) {
    if (!list.length) return '<div class="empty">아직 글이 없어요. 첫 글의 주인공이 되어 보세요 🚉</div>';
    return `<table class="tbl"><thead><tr><th class="hide-m" style="width:46px">번호</th><th>제목</th><th class="hide-m" style="width:150px">작성자</th><th style="width:90px">날짜</th><th class="hide-m" style="width:50px">조회</th><th style="width:44px">공감</th></tr></thead><tbody>${
      list.map((p, i) => `<tr><td class="c hide-m">${p.pinned ? '<span class="pin">📌</span>' : startNo - i}</td>
        <td class="t"><a href="#/post/${esc(p.id)}">${showBoard ? `<small>[${esc((boardOf(p.board) || {}).name || p.board)}]</small> ` : ''}${esc(p.title)}</a>${p.comments ? ` <span class="cnt">[${p.comments}]</span>` : ''}${p.status === 'pending' ? '<span class="pending-chip">🕓 검토 중</span>' : ''}</td>
        <td class="c hide-m">${who(p.author, p.authorRole, p.authorGrade, p.authorTitle)}</td>
        <td class="c">${fmtShort(p.created)}</td><td class="c hide-m">${p.views}</td><td class="c">${p.likes}</td></tr>`).join('')}</tbody></table>`;
  }
  const pager = (base, pg, pages) => pages <= 1 ? '' :
    `<div class="pager">${Array.from({ length: pages }, (_, i) => i + 1).map(n => n === pg ? `<b>${n}</b>` : `<a href="${base}/${n}">${n}</a>`).join('')}</div>`;

  /* ---------- 등급 노선도 ---------- */
  function routeMap(pr) {
    const gs = grades();
    const pg = A.progress(pr.stats, pr.grade);
    const stops = gs.map((g, i) => {
      const st = g.level < pr.grade ? 'done' : g.level === pr.grade ? 'cur' : 'todo';
      const seg = i === gs.length - 1 ? '' : (() => {
        const nxt = gs[i + 1];
        if (g.level < pr.grade) return `<div class="rm-seg full" style="--gc:${nxt.color}"></div>`;
        if (g.level === pr.grade) return `<div class="rm-seg part" style="--gc:${nxt.color};--p:${Math.round(pg.ratio * 100)}%"><i></i></div>`;
        return '<div class="rm-seg"></div>';
      })();
      return `<div class="rm-stop ${st}" style="--gc:${g.color}"><div class="rm-dot">${g.icon}</div><div class="rm-name">${esc(g.name)}</div><div class="rm-sub">${st === 'cur' ? '현재 위치' : g.needApproval ? '승인제' : g.level === 1 ? '시작역' : '자동 등업'}</div></div>${seg}`;
    }).join('');
    return `<div class="rmap-wrap"><div class="rmap" role="img" aria-label="등급 노선도">${stops}</div></div>`;
  }
  function reqBars(pr) {
    const pg = A.progress(pr.stats, pr.grade);
    if (!pg.next) return `<div class="msg ok">🎉 가장 높은 일반 등급(${esc(pg.cur.name)})이에요!</div>`;
    return `<div><b>다음 역: ${pg.next.icon} ${esc(pg.next.name)}</b> <small>${pg.next.needApproval ? '(조건을 채우면 등업신청 → 운영진 승인)' : '(조건을 채우면 자동 등업)'}</small></div>
      <div class="reqs" style="--gc:${pg.next.color}">${pg.items.map(i => `<div class="req${i.ok ? ' ok' : ''}"><span>${i.label}</span><div class="rb"><i style="width:${Math.round(i.ratio * 100)}%"></i></div><span class="n">${i.cur}/${i.req}${i.unit}</span></div>`).join('')}</div>`;
  }

  /* ---------- 홈 ---------- */
  async function viewHome() {
    setAddr('', '');
    const posts = (await A.listPosts()).filter(p => p.status !== 'pending' || (me && p.authorId === me.id));
    const latest = posts.slice(0, 8);
    const top = [...posts].sort((a, b) => b.views - a.views).slice(0, 5);
    const counts = {}; posts.forEach(p => { counts[p.board] = (counts[p.board] || 0) + 1; });
    const tags = {}; posts.forEach(p => (p.tags || []).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
    const authors = {}, ainfo = {};
    posts.forEach(p => { if (p.author && p.status === 'ok') { authors[p.author] = (authors[p.author] || 0) + 1; ainfo[p.author] = p; } });
    const day = Math.floor(Date.now() / 864e5);
    const years = new Date().getFullYear() - C.since;
    const digits = String(visit.total).padStart(6, '0').split('').map(d => `<i>${d}</i>`).join('');
    let meBox = '';
    if (me) {
      let pr = null; try { pr = await A.getProfile(me.nick); } catch (e) {}
      const pg = pr && !A.isStaff(me.role) ? A.progress(pr.stats, pr.grade) : null;
      meBox = `<div class="sub-title"><span>🎫 내 정보</span><a href="#/me">자세히</a></div><div class="panel raised mebox">
        <div class="row2"><span>${gradeBadge(me.role, me.grade, true)} <b>${esc(me.nick)}</b>${titleChip(me.title)}</span><span class="pts">${me.points || 0}P</span></div>
        ${pg && pg.next ? `<div style="--gc:${pg.next.color}"><small>다음 역 ${pg.next.icon} ${esc(pg.next.name)}까지</small><div class="minibar"><i style="width:${Math.round(pg.ratio * 100)}%"></i></div></div>` : ''}
        <div class="row2"><a class="btn sm primary" href="#/write">✏ 글쓰기</a><a class="btn sm" href="#/shop">🛍 상점</a><a class="btn sm" href="#/checkin">📅 출석</a></div></div>`;
    } else {
      meBox = `<div class="sub-title"><span>🎫 가입하면</span></div><div class="panel raised">글·댓글·공감으로 <b>포인트</b>를 모으고 <b>등급</b>을 올려 보세요!<br>
        <button class="btn primary sm" type="button" id="homeJoin" style="margin-top:6px">로그인 / 가입</button> <a class="btn sm" href="#/grades">등급 안내</a></div>`;
    }
    content.innerHTML = `
      <h2 class="page-title">🚉 ${esc(C.name)} — ${esc(C.subtitle)}</h2>
      ${isAdmin() && A.legacy() ? '<div class="msg err legacy-banner">⚠ 데이터베이스가 아직 새 버전이 아니에요. Supabase SQL Editor에서 <b>supabase/v2_community.sql</b> 을 실행해 주세요. (포인트·등급·상점이 켜져요)</div>' : ''}
      <div class="led" aria-label="안내 전광판"><span>${esc(settings.marquee)}${posts[0] ? ' ▶ 새 글: ' + esc(posts[0].title) : ''}</span></div>
      <div class="panel raised">
        <b>${esc(C.since)}년부터 이어 온 ${years}년차 버스·철도 덕질 커뮤니티</b>
        <div style="margin-top:6px">${esc(settings.intro).replace(/\n/g, '<br>')}</div>
      </div>
      <div class="cols">
        <div>
          <div class="sub-title"><span>📋 최근 글</span><a href="#/write">✏ 글쓰기</a></div>
          ${postsTable(latest, posts.length, true)}
        </div>
        <div>
          ${meBox}
          <div class="sub-title"><span>👀 방문자</span></div>
          <div class="panel raised" style="text-align:center">
            <div class="odo" aria-label="전체 방문자 ${visit.total}명">${digits}</div>
            <div style="margin-top:6px">오늘 <b>${visit.today}</b> · 전체 <b>${visit.total}</b></div>
          </div>
          <div class="sub-title"><span>🔥 인기 글 TOP5</span></div>
          <div class="panel sunken" style="padding:6px 8px">${top.length ? top.map((p, i) => `<div>${i + 1}. <a href="#/post/${esc(p.id)}">${esc(p.title)}</a> <small>(${p.views})</small></div>`).join('') : '아직 없어요'}</div>
          ${Object.keys(authors).length ? `<div class="sub-title"><span>✍ 글 많이 쓴 회원</span></div><div class="panel raised">${Object.keys(authors).sort((a, b) => authors[b] - authors[a]).slice(0, 8).map(n => `<div>${who(n, ainfo[n].authorRole, ainfo[n].authorGrade, ainfo[n].authorTitle)} <small>(${authors[n]}개)</small></div>`).join('')}</div>` : ''}
          <div class="sub-title"><span>🎲 오늘의 덕질 한마디</span></div>
          <div class="panel raised">“${esc(QUOTES[day % QUOTES.length])}”</div>
        </div>
      </div>
      <div class="sub-title"><span>🚏 승강장 안내 (게시판)</span></div>
      <div class="board-grid">${C.boards.map(b => `<a class="bcard raised" href="#/board/${b.id}"><b>${b.icon} ${esc(b.name)}</b><small>${esc(b.desc)} · ${counts[b.id] || 0}개</small></a>`).join('')}</div>
      ${Object.keys(tags).length ? `<div class="sub-title"><span>🏷️ 태그</span></div><div>${Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 24).map(t => `<a class="tag" href="#/tag/${encodeURIComponent(t)}">#${esc(t)} (${tags[t]})</a>`).join('')}</div>` : ''}`;
    const j = $('#homeJoin'); if (j) j.onclick = () => needLogin();
    setStatus(`글 ${posts.length}개`, `오늘 ${visit.today} / 전체 ${visit.total}`);
  }

  /* ---------- 게시판 ---------- */
  async function viewBoard(id, page) {
    const b = boardOf(id); if (!b) return notFound();
    setAddr('게시판\\' + b.name, b.name);
    const list = sortPinned((await A.listPosts()).filter(p => p.board === id));
    const ps = C.pageSize, pages = Math.max(1, Math.ceil(list.length / ps)), pg = Math.min(Math.max(1, +page || 1), pages);
    const may = !b.staffOnly || isStaff();
    const kr = grades().find(g => g.needApproval) || {};
    content.innerHTML = `
      <h2 class="page-title">${b.icon} ${esc(b.name)}</h2>
      <div style="margin-bottom:8px;color:var(--c-txt2)">${esc(b.desc)} ${may ? `<a class="btn sm primary" href="#/write/${b.id}">✏ 글쓰기</a>` : '<small>(운영진만 쓸 수 있어요)</small>'}</div>
      ${b.ktxOnly ? `<div class="msg info">🚄 <b>KTX 등업 신청 게시판</b>이에요. 글 ${kr.minPosts}회·댓글 ${kr.minComments}회·공감 ${kr.minLikes}회 등 조건을 모두 채우면 글을 쓸 수 있고, 운영진이 확인한 뒤 등업해 드려요.</div>` : ''}
      ${postsTable(list.slice((pg - 1) * ps, pg * ps), list.length - (pg - 1) * ps, false)}
      ${pager('#/board/' + id, pg, pages)}`;
    setStatus(`${list.length}개 개체`, '');
  }

  /* ---------- 검색/태그 ---------- */
  async function viewSearch(q, mode) {
    const low = (q || '').toLowerCase();
    const list = sortPinned((await A.listPosts()).filter(p => mode === 'tag' ? (p.tags || []).includes(q) :
      (p.title + ' ' + p.body + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(low)));
    setAddr((mode === 'tag' ? '태그\\' : '검색\\') + q, (mode === 'tag' ? '#' : '검색: ') + q);
    content.innerHTML = `<h2 class="page-title">${mode === 'tag' ? '🏷️ #' : '🔍 검색: '}${esc(q)}</h2>${postsTable(list, list.length, true)}`;
    setStatus(`${list.length}개 개체`, '');
  }

  /* ---------- 글 보기 ---------- */
  async function viewPost(id) {
    const p = await A.getPost(id, true);
    if (!p) return notFound();
    const b = boardOf(p.board) || { id: p.board, name: p.board, icon: '📄' };
    buildTree('board:' + p.board);
    setAddr(`게시판\\${b.name}\\${p.title}`, p.title);
    const same = sortPinned((await A.listPosts()).filter(x => x.board === p.board && x.status === 'ok')).sort((x, y) => new Date(y.created) - new Date(x.created));
    const idx = same.findIndex(x => x.id === p.id);
    const newer = idx > 0 ? same[idx - 1] : null, older = idx >= 0 ? same[idx + 1] : null;
    const staffPost = A.isStaff(p.authorRole);
    content.innerHTML = `
      <div class="post-head">
        <a href="#/board/${esc(b.id)}">${b.icon} ${esc(b.name)}</a>
        <h1 class="post-title">${p.pinned ? '<span class="pin">📌</span> ' : ''}${esc(p.title)}</h1>
        <div class="post-meta"><span>✍ ${who(p.author, p.authorRole, p.authorGrade, p.authorTitle)}</span><span>🕒 ${fmtDate(p.created)}${p.updated ? ' (수정 ' + fmtShort(p.updated) + ')' : ''}</span><span>👁 조회 <span id="pv">${p.views}</span></span>
          <a id="shareBtn" role="button" tabindex="0" style="cursor:pointer">🔗 공유</a>${canEdit(p) ? `<a href="#/edit/${esc(p.id)}">✏ 수정</a>` : ''}${canDelete(p) ? '<a id="delPost" role="button" tabindex="0" style="cursor:pointer">🗑 삭제</a>' : ''}</div>
      </div>
      ${p.held ? `<div class="msg err">🚨 <b>신고가 접수되어 임시로 숨겨진 글</b>이에요. ${esc(p.heldWhy || '')}<br><small>지금은 글쓴이와 운영진에게만 보여요. 운영진이 확인한 뒤 다시 공개하거나 삭제해요. 이의가 있으면 <a href="#/inquiry">문의·건의</a>로 알려 주세요.</small></div>`
        : p.status === 'pending' ? '<div class="msg info">🕓 <b>검토 대기 중</b>이에요. 운영진이 확인하면 모두에게 공개돼요. (지금은 나와 운영진에게만 보여요)</div>' : ''}
      ${p.board === 'upgrade' && isStaff() ? '<div class="msg info">🎫 등업 신청글이에요. <button class="btn sm primary" type="button" id="apvKtx">✅ 이 작성자를 KTX로 등업</button></div>' : ''}
      ${K.licenseBar(p.license)}
      <div class="post-body">${renderBody(p.body, { external: staffPost })}</div>
      ${(p.tags || []).length ? `<div style="margin-top:12px">${p.tags.map(t => `<a class="tag" href="#/tag/${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
      <div class="like-wrap"><button class="btn primary" id="likeBtn" type="button"></button> <button class="btn" id="bmBtn" type="button">☆ 스크랩</button> <button class="btn" id="copyBtn" type="button">🔗 주소 복사</button>${!me || me.id !== p.authorId ? ' <button class="btn" id="rpBtn" type="button">🚨 신고</button>' : ''}</div>
      <div id="cbox"></div>
      <div class="navrows">
        ${newer ? `<div>▲ 다음 글: <a href="#/post/${esc(newer.id)}">${esc(newer.title)}</a></div>` : ''}
        ${older ? `<div>▼ 이전 글: <a href="#/post/${esc(older.id)}">${esc(older.title)}</a></div>` : ''}
      </div>
      <a class="btn" href="#/board/${esc(b.id)}">📋 목록으로</a>`;
    const likeBtn = $('#likeBtn');
    const drawLike = q => { likeBtn.textContent = (q.liked ? '💙 공감함 ' : '🤍 공감 ') + q.likes; likeBtn.classList.toggle('on', q.liked); };
    drawLike(p);
    likeBtn.onclick = async () => {
      if (!me) { await needLogin('공감은 로그인한 분만 누를 수 있어요.'); if (!me) return; }
      try { const q = await A.toggleLike(p.id); drawLike(q); rewardToast(q.reward); syncMe(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
    const bmBtn = $('#bmBtn'), drawBm = on => { bmBtn.textContent = on ? '⭐ 스크랩함' : '☆ 스크랩'; bmBtn.classList.toggle('on', on); };
    if (me) A.bookmarkIds().then(l => drawBm(l.indexOf(p.id) >= 0)).catch(() => {});
    bmBtn.onclick = async () => {
      if (!me) { await needLogin('스크랩은 로그인한 분만 쓸 수 있어요.'); if (!me) return; }
      try { const on = await A.toggleBookmark(p.id); drawBm(on); toast(on ? '스크랩했어요 ⭐' : '스크랩을 뺐어요.'); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
    $('#copyBtn').onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); alertBox('주소를 복사했어요. 퍼 가실 땐 출처를 밝혀 주세요!', '복사 완료', '✅'); }
      catch (e) { alertBox(location.href, '주소', '🔗'); }
    };
    const shBtn = $('#shareBtn');
    if (shBtn) { shBtn.onclick = () => shareDialog(p); shBtn.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shareDialog(p); } }; }
    const rpBtn = $('#rpBtn');
    if (rpBtn) rpBtn.onclick = async () => {
      if (!me) { await needLogin('신고는 로그인한 분만 할 수 있어요.'); if (!me) return; }
      reportDialog('post', p.id, p.title);
    };
    const del = $('#delPost');
    if (del) del.onclick = async () => {
      if (!(await confirmBox('이 글을 삭제할까요?\n(달린 댓글도 함께 지워져요)', '삭제 확인'))) return;
      try { await A.deletePost(p.id); toast('삭제했어요.'); location.hash = '#/board/' + p.board; } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
    const apv = $('#apvKtx');
    if (apv) apv.onclick = async () => {
      if (!(await confirmBox(`${p.author}님을 KTX 등급으로 올릴까요?`, '등업 승인'))) return;
      try { await A.approveKtx(p.authorId); toast('KTX로 등업했어요 🚄'); } catch (e) { alertBox(e.message, '등업 실패', '⚠️'); }
    };
    mountComments($('#cbox'), p.id, {});
    setStatus(`조회 ${p.views} · 공감 ${p.likes}`, '');
  }

  /* ---------- 댓글 / 방명록 ---------- */
  function mountComments(box, target, opts) {
    const word = opts.guest ? '방명록' : '댓글';
    async function draw() {
      let list;
      try { list = await A.listComments(target); } catch (e) { box.innerHTML = errBox(e); return; }
      const roots = list.filter(c => !c.parentId), kids = id => list.filter(c => c.parentId === id);
      const visible = list.filter(c => c.status === 'ok').length;
      const item = (c, reply) => `<div class="cmt${reply ? ' reply' : ''}" data-id="${esc(c.id)}" data-nick="${esc(c.nick)}">
        <div class="cmt-h"><b class="nick${A.isStaff(c.role) ? ' admin' : ''}">${gradeBadge(c.role, c.grade)} <a href="#/user/${encodeURIComponent(c.nick)}" style="color:inherit;text-decoration:none">${esc(c.nick)}</a></b>${titleChip(c.title)}<span class="date">${fmtDate(c.created)}</span>
          ${c.held ? '<span class="pending-tag">🚨 신고로 임시 숨김 (본인과 운영진에게만 보여요)</span>' : c.status === 'pending' ? '<span class="pending-tag">🕓 검토 대기 중 (본인과 운영진에게만 보여요)</span>' : ''}
          <span class="acts"><a data-act="reply" role="button" tabindex="0">답글</a>${!me || me.id !== c.userId ? '<a data-act="report" role="button" tabindex="0">신고</a>' : ''}${me && (me.id === c.userId || isStaff()) ? '<a data-act="del" role="button" tabindex="0">삭제</a>' : ''}</span></div>
        <div class="cmt-b">${esc(c.body)}</div></div>`;
      box.innerHTML = `<div class="cmt-head">💬 ${word} ${visible}</div>
        ${roots.length ? roots.map(r => item(r, false) + kids(r.id).map(k => item(k, true)).join('')).join('') : `<div class="empty">첫 ${word}을 남겨 보세요!</div>`}
        <div data-form-slot>${formHtml(null)}</div>`;
      bindForm(box.querySelector('[data-form-slot]'), null);
    }
    function formHtml(parentNick) {
      if (!me) return `<div class="cmt-form raised">🔒 ${word}은 로그인한 분만 쓸 수 있어요. <button class="btn sm" type="button" data-login>로그인 / 가입</button></div>`;
      return `<form class="cmt-form raised${parentNick ? ' inline' : ''}">
        <label for="cb-t" style="font-weight:bold">${parentNick ? '↪ ' + esc(parentNick) + '님에게 답글' : esc(me.nick) + '(으)로 ' + word + ' 쓰기'}</label>
        <textarea class="input" maxlength="${C.commentMax}" ${parentNick ? '' : 'id="cb-t"'} name="body" placeholder="${opts.guest ? '다녀가신 흔적을 남겨 주세요 :)' : '따뜻한 한마디를 남겨 주세요 :)'}" required></textarea>
        <div class="row"><small class="cnt-ind" style="color:var(--c-txt2)">0 / ${C.commentMax}</small><span class="row">${parentNick ? '<button class="btn sm" type="button" data-cancel>취소</button>' : ''}<button class="btn primary sm" type="submit">등록</button></span></div>
        <div class="err-line" role="alert"></div></form>`;
    }
    function bindForm(slot, parentId) {
      const lg = slot.querySelector('[data-login]');
      if (lg) lg.onclick = async () => { await needLogin(); };
      const f = slot.querySelector('form'); if (!f) return;
      const ind = f.querySelector('.cnt-ind');
      f.body.addEventListener('input', () => { ind.textContent = f.body.value.length + ' / ' + C.commentMax; });
      const cancel = f.querySelector('[data-cancel]'); if (cancel) cancel.onclick = () => slot.remove();
      f.onsubmit = async e => {
        e.preventDefault();
        const btn = f.querySelector('[type=submit]'); btn.disabled = true;
        try {
          const c = await A.addComment(target, parentId, f.body.value);
          rewardToast(c.reward); syncMe();
          if (c.status === 'pending') await alertBox('표현을 확인하기 위해 운영진 검토 후에 표시돼요. 승인되면 다른 분들에게도 보여요.', '검토 대기', '🕓');
          await draw();
        } catch (x) { f.querySelector('.err-line').textContent = '⚠ ' + x.message; btn.disabled = false; }
      };
    }
    box.addEventListener('click', async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const cm = a.closest('.cmt'), id = cm.dataset.id;
      if (a.dataset.act === 'del') {
        if (!(await confirmBox('이 댓글을 삭제할까요?\n(달린 답글도 함께 지워져요)', '삭제 확인'))) return;
        try { await A.deleteComment(id); await draw(); } catch (x) { alertBox(x.message, '오류', '⚠️'); }
      } else if (a.dataset.act === 'report') {
        if (!me) { await needLogin('신고는 로그인한 분만 할 수 있어요.'); if (!me) return; }
        reportDialog('comment', id, (cm.querySelector('.cmt-b') || {}).textContent || '댓글');
      } else if (a.dataset.act === 'reply') {
        if (!me) { await needLogin(); return; }
        const old = box.querySelector('[data-reply-slot]'); if (old) old.remove();
        // 대댓글은 1단계: 답글의 답글은 원댓글 아래에 붙고 @닉네임을 앞에 붙여 줘요
        let last = cm; while (last.nextElementSibling && last.nextElementSibling.classList.contains('reply')) last = last.nextElementSibling;
        const slot = document.createElement('div'); slot.dataset.replySlot = '1'; slot.innerHTML = formHtml(cm.dataset.nick);
        last.after(slot); bindForm(slot, id);
        const ta = slot.querySelector('textarea');
        if (cm.classList.contains('reply')) ta.value = '@' + cm.dataset.nick + ' ';
        ta.focus();
      }
    });
    box.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act]')) { e.preventDefault(); e.target.click(); } });
    box.__redraw = draw;
    return draw();
  }

  async function needLogin(msg) {
    if (msg) await alertBox(msg, '로그인 필요', '🔒');
    const u = await loginDialog({ signup: true });
    if (u) { await A.refresh(); me = A.me(); applyTheme(me.theme || 'station'); refreshUser(); await route(); }
    return u;
  }

  async function viewGuestbook() {
    setAddr('방명록', '방명록'); buildTree('guestbook');
    content.innerHTML = `<h2 class="page-title">📒 방명록</h2><div class="msg info">다녀가신 흔적을 남겨 주세요. 로그인한 분만 쓸 수 있고, 거친 표현은 검토 후 표시돼요.</div><div id="gbox"></div>`;
    await mountComments($('#gbox'), 'guestbook', { guest: true });
    setStatus('방명록', '');
  }

  /* ---------- 글쓰기 / 수정 ---------- */
  async function viewWrite(boardId, editId) {
    buildTree(''); markTab('write');
    setAddr(editId ? '글 수정' : '글쓰기', editId ? '글 수정' : '글쓰기');
    if (!me) {
      content.innerHTML = '<div class="msg info">🔒 글쓰기는 로그인한 분만 할 수 있어요.</div><button class="btn primary" type="button" id="wLogin">로그인 / 가입</button>';
      $('#wLogin').onclick = () => needLogin(); return;
    }
    await K.mountEditor({
      box: content, id: editId || null, preset: boardId,
      setStatus,
      onDone: async saved => { await A.refresh(); syncMe(); location.hash = '#/post/' + saved.id; },
      onCancel: () => history.back()
    });
  }

  /* ---------- 프로필 ---------- */
  async function viewUser(nick) {
    const pr = await A.getProfile(nick);
    if (!pr) return notFound();
    const isMe = !!me && me.id === pr.id;
    const staff = A.isStaff(pr.role);
    buildTree(''); markTab(isMe ? 'me' : '');
    setAddr('회원\\' + pr.nick, pr.nick + '님');
    const list = sortPinned((await A.listPosts()).filter(p => p.authorId === pr.id));
    const g = A.gradeByLevel(pr.grade);
    const skin = A.catalog(pr.skin) ? pr.skin : 'basic';
    const weeks = pr.stats.weeks;
    let log = '';
    if (isMe) {
      try {
        const rows = await A.pointLog(15);
        log = `<div class="sub-title"><span>🧾 포인트 내역 (최근 15개)</span></div>${rows.length ? `<table class="tbl"><thead><tr><th style="width:110px">날짜</th><th>내용</th><th style="width:70px">포인트</th></tr></thead><tbody>${rows.map(r => {
          const it = r.reason === 'buy' ? A.catalog(r.ref) : null;
          return `<tr><td class="c">${fmtShort(r.created)}</td><td>${esc(A.reasonLabel(r.reason))}${it ? ' · ' + esc(it.name) : r.reason === 'admin' && r.ref ? ' · ' + esc(r.ref) : ''}</td><td class="c" style="color:${r.delta < 0 ? 'var(--danger,#c00)' : 'var(--ok,#080)'}">${r.delta > 0 ? '+' : ''}${r.delta}</td></tr>`;
        }).join('')}</tbody></table>` : '<div class="empty">아직 내역이 없어요. 글·댓글·공감으로 포인트를 모아 보세요!</div>'}`;
      } catch (e) { log = ''; }
    }
    const pg = staff ? null : A.progress(pr.stats, pr.grade);
    content.innerHTML = `
      <div class="pcard raised skin-${esc(skin)}">
        <div class="ph"><div class="avatar">${A.okAvatar(pr.avatar) && pr.avatar ? `<img src="${pr.avatar}" alt="${esc(pr.nick)}님의 프로필 사진" title="눌러서 크게 보기">` : (staff ? C.staffGrades[pr.role].icon : g.icon)}</div>
          <div><div class="pn">${esc(pr.nick)}${titleChip(pr.title)}</div>
            <div class="pm">${gradeBadge(pr.role, pr.grade, true)} · 가입 ${fmtShort(pr.joined)} (${weeks}주째)</div></div>
          <div style="margin-left:auto;text-align:right"><div class="pm">보유 포인트</div><div class="pn">${isMe || isStaff() ? (pr.points || 0).toLocaleString() + 'P' : '🔒'}</div></div></div>
        <div class="pstats"><div class="pstat"><b>${weeks}</b><small>가입 후 주</small></div><div class="pstat"><b>${pr.stats.posts}</b><small>작성 글</small></div>
          <div class="pstat"><b>${pr.stats.comments}</b><small>작성 댓글</small></div><div class="pstat"><b>${pr.stats.likes}</b><small>누른 공감</small></div></div>
      </div>
      ${staff ? `<div class="msg info">${gradeBadge(pr.role, pr.grade, true)} — 덕질역을 가꾸는 운영진이에요.</div>` : `
      <div class="sub-title"><span>🚇 등급 노선도</span><a href="#/grades">등급 안내</a></div>
      <div class="panel raised">${routeMap(pr)}${reqBars(pr)}
        ${isMe && pg && pg.next && pg.next.needApproval && pr.ktxEligible ? '<div class="msg ok" style="margin-top:8px">🎉 KTX 조건을 모두 채웠어요! <a class="btn sm primary" href="#/write/upgrade">🎫 등업 신청하러 가기</a></div>' : ''}</div>`}
      ${bioCard(pr, isMe)}
      ${isMe ? `<div style="margin:10px 0"><a class="btn" href="#/shop">🛍 상점 가기</a> <a class="btn" href="#/shop/skins">🪪 프로필 스킨</a> <a class="btn" href="#/shop/titles">🏷 칭호</a> <button class="btn" type="button" id="avBtn">📷 프로필 사진 변경</button>${pr.avatar ? ' <button class="btn" type="button" id="avDel">🗑 사진 삭제</button>' : ''}<input type="file" id="avFile" accept="image/*" hidden> <a class="btn" href="#/inquiry">📮 문의·건의</a> <button class="btn" type="button" id="meLogout">🔓 로그아웃</button> <a class="btn" href="#/messages">✉ 쪽지함</a> <a class="btn" href="#/notifications">🔔 알림</a> <a class="btn" href="#/account">⚙ 회원정보 수정</a></div>${log}` : (me ? `<div style="margin:10px 0"><a class="btn" href="#/messages/${encodeURIComponent(pr.nick)}">✉ 쪽지 보내기</a></div>` : '')}
      <div class="sub-title"><span>📋 ${esc(pr.nick)}님의 글 (${list.length})</span></div>
      ${postsTable(list, list.length, true)}`;
    const lo = $('#meLogout'); if (lo) lo.onclick = doLogout;
    const ab = $('#avBtn'); if (ab) {
      ab.onclick = () => $('#avFile').click();
      $('#avFile').onchange = async e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        try { ab.disabled = true; await A.saveAvatar(await K.makeAvatar(f)); toast('프로필 사진을 바꿨어요.'); route(); }
        catch (x) { ab.disabled = false; alertBox(x.message, '사진 올리기 실패', '⚠️'); }
      };
      const ad = $('#avDel'); if (ad) ad.onclick = async () => { if (!(await confirmBox('프로필 사진을 지울까요?', '사진 삭제'))) return; try { await A.clearAvatar(); toast('사진을 지웠어요.'); route(); } catch (x) { alertBox(x.message, '오류', '⚠️'); } };
    }
    const cb = $('#clearBio'); if (cb) cb.onclick = async () => {
      if (!(await confirmBox(`${pr.nick}님의 사용자 문서를 비울까요?`, '문서 비우기'))) return;
      try { await A.clearBio(pr.id); toast('문서를 비웠어요.'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
    setStatus(`${pr.nick} · ${staff ? C.staffGrades[pr.role].name : g.name}`, '');
  }


  /* ---------- 문의 · 건의 ---------- */
  const INQ_STATUS = { open: ['🟡', '접수됨'], answered: ['🟢', '답변 완료'], closed: ['⚪', '종료'] };
  async function viewInquiry() {
    setAddr('문의·건의', '문의·건의');
    const head = `<h2 class="page-title">📮 문의·건의</h2><div class="msg info">궁금한 점, 바라는 점, 오류 신고를 남겨 주세요. 운영진만 볼 수 있고, 답변은 여기(내 문의 내역)에 표시돼요. 하루 5개까지 보낼 수 있어요.</div>`;
    if (!me) {
      content.innerHTML = head + '<div class="msg info">🔒 로그인한 분만 문의를 남길 수 있어요.</div><button class="btn primary" id="inqLogin" type="button">로그인 / 가입</button>';
      $('#inqLogin').onclick = () => needLogin(); setStatus('문의·건의', ''); return;
    }
    let mine = [];
    try { mine = await A.inqMine(); } catch (e) { content.innerHTML = head + errBox(e); return; }
    const cats = A.inquiryCategories;
    content.innerHTML = head + `
      <form id="inqForm" class="panel raised" style="margin:12px 0">
        <div class="field"><label for="iq-c">종류</label><select id="iq-c" class="input" name="category">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label for="iq-t">제목</label><input id="iq-t" class="input" name="title" maxlength="60" required></div>
        <div class="field"><label for="iq-b">내용</label><textarea id="iq-b" class="input" name="body" rows="6" maxlength="3000" required style="min-height:140px"></textarea></div>
        <div class="err-line" role="alert"></div>
        <button class="btn primary" type="submit">📨 보내기</button>
      </form>
      <div class="sub-title"><span>📜 내 문의 내역 (${mine.length})</span></div>
      <div id="inqList">${mine.length ? mine.map(q => inqCard(q)).join('') : '<div class="empty">아직 보낸 문의가 없어요.</div>'}</div>`;
    const f = $('#inqForm');
    f.onsubmit = async e => {
      e.preventDefault(); const err = f.querySelector('.err-line'); err.textContent = '';
      const b = f.querySelector('button[type=submit]'); b.disabled = true;
      try { await A.inqSubmit({ category: f.category.value, title: f.title.value, body: f.body.value }); toast('문의를 보냈어요. 답변을 기다려 주세요!'); viewInquiry(); }
      catch (x) { err.textContent = '⚠ ' + x.message; b.disabled = false; }
    };
    $('#inqList').onclick = async e => {
      const d = e.target.closest('[data-idel]'); if (!d) return;
      if (!(await confirmBox('이 문의를 지울까요?', '문의 삭제'))) return;
      try { await A.inqDelete(d.dataset.idel); viewInquiry(); } catch (x) { alertBox(x.message, '오류', '⚠️'); }
    };
    setStatus('문의·건의', `${mine.length}건`);
  }
  function inqCard(q) {
    const st = INQ_STATUS[q.status] || INQ_STATUS.open;
    return `<div class="inq panel raised"><div class="inq-h"><span class="tag">${esc(q.category)}</span> <b>${esc(q.title)}</b>
        <span class="inq-st">${st[0]} ${st[1]}</span></div>
      <small>${fmtDate(q.created)}</small>
      <div class="inq-b">${esc(q.body).replace(/\n/g, '<br>')}</div>
      ${q.reply ? `<div class="inq-r"><b>💬 ${esc(q.repliedBy || '운영진')}님의 답변</b> <small>${fmtDate(q.repliedAt)}</small><div>${esc(q.reply).replace(/\n/g, '<br>')}</div></div>` : ''}
      <div style="text-align:right"><button class="btn sm danger" type="button" data-idel="${esc(q.id)}">🗑 삭제</button></div></div>`;
  }

  /* ---------- 사용자 문서 ---------- */
  function bioCard(pr, isMe) {
    const staffBio = A.isStaff(pr.role);
    const toc = [];
    const body = pr.bio ? renderBody(pr.bio, { external: staffBio, toc }) : '';
    const tocHtml = toc.length >= 3 ? `<div class="bio-toc"><b>📑 목차</b>${toc.map(t => `<div class="t${t.lv}"><a role="button" tabindex="0" data-goto="${t.id}">${t.num}</a> ${esc(t.text)}</div>`).join('')}</div>` : '';
    return `<div class="sub-title"><span>📖 ${esc(pr.nick)}님의 문서</span></div>
      <div class="bio-card raised"><div class="bio-head"><h3>${esc(pr.nick)}</h3><small>${pr.bioUpdated ? '최근 수정 ' + fmtDate(pr.bioUpdated) : ''}</small>
        <span>${isMe ? '<a class="btn sm primary" href="#/me/doc">✏ 문서 편집</a>' : ''}${pr.bio && me && !isMe && (isAdmin() || (isManager() && A.rankOf(me.role) > A.rankOf(pr.role))) ? ' <button class="btn sm danger" type="button" id="clearBio">🧹 비우기</button>' : ''}</span></div>
      ${body ? tocHtml + '<div class="bio-body">' + body + '</div>'
        : `<div class="bio-empty">${isMe ? '아직 문서가 없어요. 자기소개, 좋아하는 노선, 탑승 기록 등을 마크다운으로 꾸며 보세요! <a href="#/me/doc">문서 만들기</a>' : '아직 작성된 문서가 없어요.'}</div>`}</div>`;
  }
  async function viewBioEdit() {
    buildTree(''); markTab('me');
    setAddr('내 문서 편집', '내 문서 편집');
    if (!me) { content.innerHTML = '<div class="msg info">🔒 로그인이 필요해요.</div>'; return; }
    const pr = await A.getProfile(me.nick);
    const max = 10000;
    content.innerHTML = `<h2 class="page-title">📖 내 사용자 문서 편집</h2>
      <div class="msg info">프로필에 표시되는 나만의 문서예요. 마크다운을 쓸 수 있고, <b>#</b> 제목이 3개 이상이면 목차가 자동으로 만들어져요.</div>
      <form id="bf" class="bio-edit">
        <div class="ed-tools">
          <button class="btn sm" type="button" data-t="h1"># 제목</button><button class="btn sm" type="button" data-t="h2">## 소제목</button><button class="btn sm" type="button" data-t="bold"><b>B</b></button><button class="btn sm" type="button" data-t="italic"><i>I</i></button>
          <button class="btn sm" type="button" data-t="quote">❝ 인용</button><button class="btn sm" type="button" data-t="list">• 목록</button><button class="btn sm" type="button" data-t="link">🔗 링크</button><button class="btn sm" type="button" data-t="table">▦ 표</button>
          <button class="btn sm" type="button" data-t="upload">📤 사진 올리기</button><button class="btn sm" type="button" id="bpv">👁 미리보기</button><input type="file" id="bfile" accept="image/*" hidden> <small id="bmsg"></small></div>
        <textarea class="input" id="btxt" maxlength="${max}" placeholder="# 소개&#10;안녕하세요! 버스와 철도를 좋아하는 …&#10;&#10;# 좋아하는 노선&#10;- 9호선 급행&#10;- 3300번">${esc(pr.bio || '')}</textarea>
        <div class="preview-box sunken bio-body" id="bprev" hidden></div>
        <div class="row" style="justify-content:space-between;margin-top:6px"><small id="bcnt"></small><span class="row"><a class="btn" href="#/me">취소</a><button class="btn primary" type="submit">💾 저장</button></span></div>
        <div class="err-line" role="alert"></div></form>`;
    const f = $('#bf'), ta = $('#btxt'), cnt = $('#bcnt'), msg = $('#bmsg');
    const upd = () => { cnt.textContent = `${ta.value.length} / ${max}자`; }; upd(); ta.addEventListener('input', upd);
    const ins = (a, b = '', ph = '') => { const st = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(st, en) || ph; ta.setRangeText(a + sel + b, st, en, 'end'); ta.focus(); upd(); };
    const lineIns = t => { const st = ta.selectionStart, pre = ta.value.slice(0, st); ta.setRangeText((pre === '' || pre.endsWith('\n') ? '' : '\n') + t, st, ta.selectionEnd, 'end'); ta.focus(); upd(); };
    const upload = async files => {
      if (A.mode !== 'supabase') { alertBox('사진 올리기는 Supabase를 연결한 뒤에 쓸 수 있어요.', '데모 모드', 'ℹ️'); return; }
      for (const file of [...files].filter(x => /^image\//.test(x.type))) {
        try { msg.textContent = '업로드 중…'; const url = await A.uploadImage(await K.prepareImage(file)); lineIns('\n[img 70%]' + url + '\n'); msg.textContent = '✅ 올렸어요'; }
        catch (e) { msg.textContent = ''; alertBox(e.message, '사진 올리기 실패', '⚠️'); }
      }
    };
    $('#bfile').onchange = e => { upload(e.target.files); e.target.value = ''; };
    ta.addEventListener('paste', e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])].filter(x => /^image\//.test(x.type)); if (fs.length) { e.preventDefault(); upload(fs); } });
    content.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => {
      const t = b.dataset.t;
      if (t === 'upload') $('#bfile').click();
      else if (t === 'h1') lineIns('# '); else if (t === 'h2') lineIns('## ');
      else if (t === 'bold') ins('**', '**', '굵게'); else if (t === 'italic') ins('*', '*', '기울임');
      else if (t === 'quote') lineIns('> '); else if (t === 'list') lineIns('- ');
      else if (t === 'table') lineIns('\n| 항목 | 내용 |\n|---|---|\n| 예시 | 값 |\n');
      else if (t === 'link') { const u = await K.askText('링크 넣기', '주소 (https://…)'); if (u) ins('[', '](' + u + ')', '링크 글자'); }
    });
    const pv = $('#bprev');
    $('#bpv').onclick = () => { const on = pv.hidden; pv.hidden = !on; ta.hidden = on; $('#bpv').textContent = on ? '✏ 편집으로' : '👁 미리보기'; if (on) { const toc = []; pv.innerHTML = renderBody(ta.value, { external: A.isStaff(me.role), toc }) || '<div class="empty">내용이 비어 있어요</div>'; } };
    f.onsubmit = async e => {
      e.preventDefault(); const err = f.querySelector('.err-line'); err.textContent = '';
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try { await A.saveBio(ta.value); toast('문서를 저장했어요.'); location.hash = '#/me'; }
      catch (x) { err.textContent = '⚠ ' + x.message; btn.disabled = false; }
    };
    setStatus('내 문서 편집', '');
  }

  /* ---------- 상점 ---------- */
  async function viewShop(tab) {
    tab = ['themes', 'skins', 'titles'].includes(tab) ? tab : 'themes';
    const kind = { themes: 'theme', skins: 'skin', titles: 'title' }[tab];
    buildTree('shop'); markTab('shop');
    setAddr('상점\\' + A.kindLabel[kind], '상점');
    const shop = await A.listShop();
    const items = shop.items.filter(i => i.kind === kind);
    const curTheme = K.currentTheme();
    const card = it => {
      let pv = '';
      if (kind === 'theme') pv = `<div class="spv tprev" data-theme="${esc(it.id)}"><div class="tw">${esc(it.name)}<i></i><i></i></div></div>`;
      else if (kind === 'skin') pv = `<div class="spv skin-${esc(it.id)}">${it.id === 'led-board' ? 'DEOKJIL' : '🚉'}</div>`;
      else pv = `<div class="spv title-pv">${esc(me ? me.nick : '덕질러')}<span class="tchip">${esc(it.name)}</span></div>`;
      const using = kind === 'theme' ? (me ? it.equipped : it.id === curTheme) : it.equipped;
      let btn;
      if (using) btn = '<button class="btn sm" type="button" disabled>✔ 사용 중</button>';
      else if (it.owned) btn = `<button class="btn sm primary" type="button" data-use="${esc(it.id)}">사용하기</button>`;
      else btn = `<button class="btn sm primary" type="button" data-buy="${esc(it.id)}">🛒 ${it.price}P 구매</button>`;
      if (kind === 'theme' && !using && !it.owned) btn += ` <button class="btn sm" type="button" data-prev="${esc(it.id)}">👁 미리보기</button>`;
      return `<div class="sitem raised${using ? ' eq' : ''}">${pv}<div class="sn">${esc(it.name)}</div><div class="sd">${esc(it.desc)}</div>
        <div class="sp">${it.price === 0 ? '무료' : it.owned ? '<span class="badge-own">✔ 보유 중</span>' : it.price + 'P'}</div><div>${btn}</div></div>`;
    };
    content.innerHTML = `
      <h2 class="page-title">🛍 상점 · 테마 변경</h2>
      <div class="wallet raised">${me ? `<span>${gradeBadge(me.role, me.grade, true)} <b>${esc(me.nick)}</b>님의 포인트</span><span class="big">${(me.points || 0).toLocaleString()}P</span>`
        : '<span>로그인하면 포인트로 테마·스킨·칭호를 살 수 있어요. (무료 테마는 로그인 없이도 바꿀 수 있어요)</span><button class="btn primary sm" type="button" id="shopLogin">로그인 / 가입</button>'}</div>
      <div class="seg-tabs" role="tablist">${[['themes', '🎨 테마'], ['skins', '🪪 프로필 스킨'], ['titles', '🏷 칭호']].map(([k, t]) => `<button type="button" role="tab" class="${k === tab ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
      ${kind === 'theme' ? '<div class="msg info">📌 <b>기차역·모노 화이트·야간 승강장</b> 테마는 무료예요. 노선 색 테마는 포인트로 구매해요. 위쪽 🌙 버튼으로 밝게/어둡게도 바로 바꿀 수 있어요.</div>' : ''}
      ${kind === 'title' && me && me.title ? '<div style="margin-bottom:8px"><button class="btn sm" type="button" id="clearTitle">칭호 떼기</button></div>' : ''}
      ${kind === 'skin' && !me ? '<div class="msg info">프로필 스킨은 로그인 후 사용할 수 있어요.</div>' : ''}
      <div class="shop-grid">${items.map(card).join('') || '<div class="empty">판매 중인 상품이 없어요.</div>'}</div>`;
    const sl = $('#shopLogin'); if (sl) sl.onclick = () => needLogin();
    content.querySelectorAll('.seg-tabs button').forEach(b => b.onclick = () => { location.hash = '#/shop/' + b.dataset.tab; });
    const ct = $('#clearTitle'); if (ct) ct.onclick = async () => { try { await A.clearTitle(); syncMe(); toast('칭호를 뗐어요.'); await route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); } };
    content.querySelectorAll('[data-prev]').forEach(b => b.onclick = () => {
      if (!previewing) previewing = K.currentTheme();
      applyTheme(b.dataset.prev); toast('미리보기 중이에요. 다른 페이지로 가면 원래대로 돌아가요.');
    });
    content.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
      if (!me) { await needLogin('구매는 로그인한 분만 할 수 있어요.'); return; }
      const it = items.find(x => x.id === b.dataset.buy);
      if (!(await confirmBox(`'${it.name}' 을(를) ${it.price}P에 구매할까요?\n(보유 ${me.points || 0}P → ${(me.points || 0) - it.price}P)`, '구매 확인'))) return;
      try { await A.buyItem(it.id); syncMe(); toast(`🛍 '${it.name}' 구매 완료!`, 'pts'); await route(); } catch (e) { alertBox(e.message, '구매 실패', '⚠️'); }
    });
    content.querySelectorAll('[data-use]').forEach(b => b.onclick = async () => {
      const id = b.dataset.use;
      try {
        if (kind !== 'theme' && !me) { await needLogin('로그인한 분만 쓸 수 있어요.'); return; }
        if (me) { await A.equipItem(id); syncMe(); }
        if (kind === 'theme') { previewing = null; try { localStorage.removeItem('deokjil_mode'); } catch (e) {} applyTheme(id); }
        toast('적용했어요!');
        await route();
      } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    setStatus(`${items.length}개 상품`, me ? `${me.points || 0}P` : '');
  }

  /* ---------- 등급 안내 ---------- */
  function viewGrades() {
    buildTree('grades'); markTab('shop');
    setAddr('등급 안내', '등급 안내');
    const R = A.rules(), gs = R.grades, P = R.points;
    content.innerHTML = `<h2 class="page-title">🚄 등급 · 포인트 안내</h2>
      <div class="panel raised">가입한 날부터 <b>지난 주 수</b>, 작성한 <b>글·댓글</b> 수, 누른 <b>공감</b> 수가 쌓이면 등급이 올라가요. 노선도는 내 프로필에서 볼 수 있어요.</div>
      <div class="sub-title"><span>🚇 등급 (낮은 순)</span></div>
      <table class="tbl gtable"><thead><tr><th>등급</th><th>가입 후</th><th>글</th><th>댓글</th><th>공감</th><th>등업 방식</th></tr></thead><tbody>
        ${gs.map(g => `<tr><td class="gn" style="color:${g.color}">${g.icon} ${esc(g.name)}</td><td>${g.minWeeks ? g.minWeeks + '주' : '-'}</td><td>${g.minPosts || '-'}</td><td>${g.minComments || '-'}</td><td>${g.minLikes || '-'}</td><td>${g.level === 1 ? '가입 즉시' : g.needApproval ? '조건 달성 후 <b>등업신청 게시판</b> → 운영진 확인' : '조건 달성 시 <b>자동</b>'}</td></tr>`).join('')}
        <tr><td class="gn" style="color:${C.staffGrades.subadmin.color}">${C.staffGrades.subadmin.icon} ${C.staffGrades.subadmin.name}</td><td colspan="4">-</td><td>총관리자가 지정</td></tr>
        <tr><td class="gn" style="color:${C.staffGrades.manager.color}">${C.staffGrades.manager.icon} ${C.staffGrades.manager.name}</td><td colspan="4">-</td><td>총관리자가 지정</td></tr>
        <tr><td class="gn" style="color:${C.staffGrades.admin.color}">${C.staffGrades.admin.icon} ${C.staffGrades.admin.name}</td><td colspan="4">-</td><td>사이트 주인</td></tr></tbody></table>
      <p><small>※ 모든 조건을 동시에 채워야 해요. 등급은 한 번 오르면 내려가지 않아요. 등업신청 게시판 글은 활동 글 수에 포함되지 않아요.</small></p>
      <div class="sub-title"><span>✨ 포인트 얻는 법</span></div>
      <table class="tbl gtable"><thead><tr><th>활동</th><th>포인트</th><th>하루 한도</th><th>조건</th></tr></thead><tbody>
        ${['post', 'comment', 'like'].map(k => { const r = P[k] || {}; return `<tr><td class="gn">${esc(C.pointRules[k].label)}</td><td>+${r.amount}P</td><td>${r.dailyCap}번</td><td>${r.minLen ? r.minLen + '자 이상' : '-'}${k === 'like' ? ' (남의 글만, 같은 글 중복 불가)' : ''}</td></tr>`; }).join('')}</tbody></table>
      <p><small>※ 검토 대기 중인 글·댓글은 승인되면 포인트가 들어와요. 포인트는 <a href="#/shop">상점</a>에서 테마·프로필 스킨·칭호를 사는 데 쓸 수 있어요.</small></p>
      <a class="btn primary" href="#/shop">🛍 상점 가기</a> <a class="btn" href="#/me">👤 내 노선도 보기</a>`;
    setStatus('등급 안내', '');
  }

  /* ---------- 링크/소개 ---------- */
  function viewLinks() {
    setAddr('링크 모음', '링크 모음');
    const L = settings.links || {};
    const defs = [['blog', '📗', '네이버 블로그', '덕질역 공식 블로그'], ['youtube', '▶️', '유튜브 채널', '덕질역 공식 영상'], ['instagram', '📸', '인스타그램', '덕질역 공식 계정'], ['threads', '🧵', '스레드', '덕질역 공식 계정']];
    content.innerHTML = `<h2 class="page-title">🌐 링크 모음</h2><div class="msg info">덕질역 운영진이 관리하는 공식 채널이에요.</div><div class="board-grid">${defs.map(([k, ic, t, d]) => {
      const u = safeUrl(L[k]);
      return u ? `<a class="bcard raised" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><b>${ic} ${t}</b><small>${d}</small></a>`
        : `<div class="bcard raised" style="opacity:.6"><b>${ic} ${t}</b><small>준비 중이에요</small></div>`;
    }).join('')}</div>`;
    setStatus('링크 모음', '');
  }
  function viewAbout() {
    setAddr('덕질역 소개', '덕질역 소개');
    const years = new Date().getFullYear() - C.since;
    content.innerHTML = `<h2 class="page-title">ℹ️ 덕질역 소개</h2>
      <div class="panel raised"><b>${esc(C.name)}</b> — ${esc(C.subtitle)}<br>${esc(C.since)}년부터 ${years}년째, 버스와 철도를 좋아하는 사람들이 함께 만들어 가는 커뮤니티예요.</div>
      <div class="sub-title"><span>🚏 이용 안내</span></div>
      <div class="panel sunken">
        <p>• 닉네임으로 가입하면(이메일 없이) <b>누구나 글·댓글·방명록·공감</b>을 쓸 수 있어요. 운영은 총관리자·관리자·부관리자가 함께 해요.</p>
        <p>• 활동하면 <b>포인트</b>가 쌓이고, <b>등급(광역철도 → 무궁화호 → 새마을호 → KTX)</b>이 올라가요. 내 프로필에 노선도로 보여요.</p>
        <p>• 포인트로 <b>상점</b>에서 테마, 프로필 스킨, 칭호를 살 수 있어요. 기차역·모노 화이트·야간 승강장 테마는 무료예요.</p>
        <p>• 심한 욕설이 포함된 글·댓글은 운영진이 확인할 때까지 보류돼요.</p>
        <p>• 일반 회원 글의 외부 사진 주소는 링크로만 보여요. 사진은 글쓰기의 <b>사진 올리기</b>로 올려 주세요.</p>
        <p>• 글마다 <b>라이선스</b>(CC BY 등)가 글 맨 위에 표시돼요. 퍼 가기 전에 확인해 주세요. 쓸 때는 글쓰기 화면에서 직접 고를 수 있어요.</p>
        <p>• 프로필에는 나를 소개하는 <b>사용자 문서</b>를 마크다운으로 꾸며 둘 수 있어요. 본문 사진을 누르면 크게 볼 수 있어요.</p>
      </div>
      <div class="sub-title"><span>⌨️ 글 쓰는 법</span></div>
      <div class="panel sunken"><p><b># 제목</b> · <b>**굵게**</b> · <b>*기울임*</b> · <b>~~취소선~~</b> · <b>&#96;코드&#96;</b> · <b>&gt; 인용</b> · <b>- 목록</b> · <b>[글자](주소)</b> · <b>---</b> 구분선 · 표 · 사진/유튜브 주소 한 줄 붙여 넣기 (마크다운)</p></div>`;
    setStatus('', '');
  }

  /* ---------- 글 공유 (링크 복사 · 링크 단축) ---------- */
  function shortId(id) {   /* UUID(36자)는 22자로 줄이고, 그 밖의 번호는 그대로 써요 */
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
    const hex = id.replace(/-/g, ''); let bin = '';
    for (let i = 0; i < 32; i += 2) bin += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function longId(sid) {
    if (!/^[A-Za-z0-9_-]{22}$/.test(sid)) return sid;
    try {
      const bin = atob(sid.replace(/-/g, '+').replace(/_/g, '/') + '=='); let h = '';
      for (let i = 0; i < bin.length; i++) h += bin.charCodeAt(i).toString(16).padStart(2, '0');
      return h.length === 32 ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : sid;
    } catch (e) { return sid; }
  }
  function shareDialog(p) {
    const base = location.origin + location.pathname.replace(/index\.html$/, '');
    const full = `${base}#/post/${p.id}`, short = `${base}#/s/${shortId(p.id)}`;
    const w = K.openWin({ title: '🔗 글 공유', width: 400, html: `<div class="dlg-body" style="display:block">
      <p style="margin:0 0 8px;font-size:13px;line-height:1.5">「${esc(String(p.title).slice(0, 40))}」 링크예요. 퍼 가실 땐 출처를 밝혀 주세요.</p>
      <div class="field"><label for="sh-u" class="sr-only">링크</label><input id="sh-u" class="input" type="text" readonly value="${esc(full)}" style="width:100%"></div>
      <div style="margin-top:8px"><button class="btn primary" id="sh-c" type="button">📋 복사</button></div>
      <label class="check" style="display:block;margin-top:10px"><input type="checkbox" id="sh-s"> 링크 단축</label>
      <p id="sh-n" style="margin:6px 0 0;font-size:12px;color:var(--muted,#666)" role="status"></p>
      <div class="dlg-btns" style="margin-top:10px"><button class="btn" type="button" data-c>닫기</button></div></div>` });
    const u = w.el.querySelector('#sh-u'), n = w.el.querySelector('#sh-n'), cb = w.el.querySelector('#sh-s');
    w.el.querySelector('[data-c]').onclick = () => w.close();
    cb.onchange = () => { u.value = cb.checked ? short : full; n.textContent = cb.checked ? `단축 링크로 바뀌었어요 (${full.length}자 → ${short.length}자)` : ''; };
    w.el.querySelector('#sh-c').onclick = async () => {
      u.select();
      try { await navigator.clipboard.writeText(u.value); n.textContent = '✅ 복사했어요!'; }
      catch (e) { try { document.execCommand('copy'); n.textContent = '✅ 복사했어요!'; } catch (x) { n.textContent = '길게 눌러서 직접 복사해 주세요.'; } }
    };
    u.onfocus = () => u.select();
  }

  /* ---------- 신고하기 (글·댓글) ---------- */
  function reportDialog(kind, id, label) {
    const R = C.report || {}, reasons = R.reasons || {}, inst = R.instant || [];
    const w = K.openWin({ title: kind === 'post' ? '🚨 글 신고' : '🚨 댓글 신고', width: 400, html: `<form class="dlg-body" style="display:block">
      <p style="margin:0 0 8px;font-size:13px;line-height:1.55">「${esc(String(label).slice(0, 40))}」<br><small>명예훼손·사생활·불법·저작권 신고는 접수되면 <b>바로 임시로 숨겨지고</b> 운영진이 확인해요. 그 밖의 신고는 서로 다른 ${R.hideAt || 3}명이 하면 숨겨져요. 허위 신고는 제재될 수 있어요. 자세한 기준은 <a href="./#/policy" target="_blank" rel="noopener">운영정책</a>을 봐 주세요.</small></p>
      <div class="field"><label for="rp-r">신고 사유</label><select id="rp-r" class="input">${Object.keys(reasons).map(k => `<option value="${esc(k)}">${esc(reasons[k])}${inst.includes(k) ? ' ⚡' : ''}</option>`).join('')}</select></div>
      <div class="field"><label for="rp-n">자세한 내용 <small>(권리침해·저작권 신고는 <b>내가 권리자인 이유</b>나 <b>원본 주소</b>를 적어 주세요)</small></label><textarea id="rp-n" class="input" rows="4" maxlength="500"></textarea></div>
      <div class="err-line" role="alert"></div>
      <div class="dlg-btns"><button class="btn danger" type="submit">신고하기</button><button class="btn" type="button" data-c>취소</button></div></form>` });
    const f = w.el.querySelector('form'); w.el.querySelector('[data-c]').onclick = () => w.close();
    f.onsubmit = async e => {
      e.preventDefault(); const er = f.querySelector('.err-line'), btn = f.querySelector('[type=submit]'); er.textContent = ''; btn.disabled = true;
      try {
        const r = await A.contentReport(kind, id, f.querySelector('#rp-r').value, f.querySelector('#rp-n').value);
        w.close(); toast(r && r.held ? '신고했어요. 글이 임시로 숨겨졌고 운영진이 확인할게요.' : '신고했어요. 운영진이 확인할게요.');
        if (r && r.held) route();
      } catch (x) { er.textContent = '⚠ ' + x.message; btn.disabled = false; }
    };
  }

  /* ---------- 운영정책 · 신고 처리 기준 · 저작권 침해 신고 (#/policy) ---------- */
  function viewPolicy() {
    setAddr('운영정책', '운영정책');
    const L = C.legal || {}, R = C.report || {}, reasons = R.reasons || {};
    content.innerHTML = `<h2 class="page-title">⚖️ 운영정책·신고 처리</h2>
      <div class="msg info">덕질역은 누구나 안심하고 덕질할 수 있는 곳이에요. 아래 내용을 지켜 주세요. (시행일 ${esc(L.effective || '')})</div>
      <div class="sub-title"><span>1. 올리면 안 되는 글</span></div>
      <div class="panel sunken">
        <p>• <b>명예훼손·모욕</b>: 사실이든 거짓이든 다른 사람의 명예를 깎아내리는 글, 욕설·혐오·괴롭힘.</p>
        <p>• <b>개인정보·사생활 침해</b>: 이름·전화번호·주소·학교·사진처럼 사람을 알아볼 수 있는 정보를 허락 없이 올리는 것.</p>
        <p>• <b>불법 정보</b>: 음란물, <b>불법 촬영물</b>, 사기·도박·마약, 범죄를 부추기는 글, 청소년에게 해로운 내용, 국가보안·법령에서 금지한 내용.</p>
        <p>• <b>저작권 침해</b>: 남의 사진·글·영상·글꼴·로고를 허락 없이 올리는 것. 출처만 적는다고 허락받은 게 아니에요.</p>
        <p>• <b>광고·도배·사칭</b>, 코레일·서울교통공사 등 <b>공식 기관인 척</b>하는 글.</p>
        <p>• 중고거래: 유효한 승차권·정기권, 증빙용으로 쓰일 줄 알면서 승차권 팔기, 모조품·위조품 등 (장터 규칙 참고).</p>
      </div>
      <div class="sub-title"><span>2. 신고하는 방법</span></div>
      <div class="panel sunken">
        <p>• 글 아래 <b>🚨 신고</b> 버튼, 댓글의 <b>신고</b> 링크를 눌러요. (로그인 필요 · 하루 10건까지)</p>
        <p>• 신고 사유: ${Object.keys(reasons).map(k => esc(reasons[k])).join(' · ')}</p>
        <p>• 신고한 사람의 닉네임은 글쓴이에게 알려지지 않고 운영진만 볼 수 있어요.</p>
      </div>
      <div class="sub-title"><span>3. 신고가 들어오면 이렇게 처리해요 (임시조치)</span></div>
      <div class="panel sunken">
        <p>① <b>명예훼손·사생활·불법·저작권</b> 신고는 1건만 접수돼도 <b>바로 임시로 숨겨요.</b> 그 밖의 신고는 서로 다른 ${R.hideAt || 3}명이 신고하면 숨겨요.</p>
        <p>② 숨겨진 글은 글쓴이와 운영진에게만 보이고, 글쓴이에게 <b>알림</b>이 가요.</p>
        <p>③ 운영진이 확인해서 <b>문제가 없으면 다시 공개</b>하고, <b>정책 위반이면 삭제</b>해요. 임시 숨김은 <b>최대 30일</b>을 넘기지 않아요.</p>
        <p>④ 억울한 글쓴이는 <a href="#/inquiry">문의·건의</a>로 <b>이의</b>를 낼 수 있어요. (재공개 요청)</p>
        <p>⑤ 반복해서 위반하면 <b>정지(1~365일, 글·댓글·쪽지·장터 글쓰기 제한)</b>나 탈퇴 처리를 할 수 있어요. 정지 사유는 본인에게 알려 주고, 이의는 <a href="#/inquiry">문의·건의</a>로 낼 수 있어요.</p>
        <p>⑥ 수사기관이나 방송통신심의위원회의 요청이 있으면 법에 따라 처리해요.</p>
      </div>
      <div class="sub-title"><span>4. 저작권 침해 신고 (저작권자·권리자)</span></div>
      <div class="panel sunken">
        <p>내 저작물이 허락 없이 올라왔다면 해당 글의 <b>🚨 신고 → “저작권 침해”</b>를 고르고, 아래를 적어 주세요.</p>
        <p>• 권리자 이름(또는 단체)과 연락처 · • 침해된 <b>원본 저작물</b>(주소나 설명) · • 내 권리를 보여 주는 설명<br>로그인 없이 알리고 싶거나 글 주소를 알려야 한다면 <b>${esc(L.officerEmail || '')}</b> 로 메일을 보내 주세요.</p>
        <p>접수되면 해당 글을 <b>바로 임시로 숨기고</b>, 글쓴이에게 알린 뒤, 글쓴이가 정당한 이용(인용·허락 등)을 밝히지 못하면 삭제해요. (저작권법 제103조)</p>
      </div>
      <div class="sub-title"><span>5. 청소년 보호</span></div>
      <div class="panel sunken">
        <p>덕질역에는 어린이·청소년 회원이 많아요. 청소년에게 해로운 글, 어른이 아이에게 개인 연락처를 묻거나 따로 만나자고 하는 글은 즉시 삭제하고 필요하면 수사기관에 알려요. 불편한 쪽지를 받았다면 <a href="#/inquiry">문의·건의</a>로 알려 주세요.</p>
      </div>
      <p style="margin-top:14px"><a class="btn" href="#/privacy">🔒 개인정보처리방침</a> <a class="btn" href="#/inquiry">📮 문의·건의</a></p>`;
    setStatus('운영정책', '');
  }

  /* ---------- 개인정보처리방침 (#/privacy) ---------- */
  function viewPrivacy() {
    setAddr('개인정보처리방침', '개인정보처리방침');
    const L = C.legal || {};
    content.innerHTML = `<h2 class="page-title">🔒 개인정보처리방침</h2>
      <div class="msg info">덕질역(이하 “덕질역”)은 「개인정보 보호법」에 따라 이용자의 개인정보를 소중히 다루고, 꼭 필요한 만큼만 모아요. 시행일: <b>${esc(L.effective || '')}</b></div>
      <div class="sub-title"><span>1. 모으는 개인정보와 이용 목적</span></div>
      <div class="panel sunken"><div style="overflow:auto"><table class="tbl"><thead><tr><th>구분</th><th>항목</th><th>이용 목적</th></tr></thead><tbody>
        <tr><td>가입 (필수)</td><td>이메일, 닉네임, 비밀번호(암호화해서 저장), 개인정보 수집·이용 동의 기록, 만 14세 미만 여부와 보호자 동의 여부</td><td>회원 확인, 로그인, 인증번호·비밀번호 재설정 메일, 부정 이용 방지, 보호자 동의 확인</td></tr>
        <tr><td>이용하면서 생기는 정보</td><td>쓴 글·댓글·공감·쪽지, 포인트·등급·출석 기록, 구매한 아이템, 내 노선도·이동 기록(나만 볼 수 있어요), 신고·문의 내용, 이용 제한(정지) 기록, 방문 수(오늘/전체 숫자)</td><td>커뮤니티 운영, 서비스 제공, 신고·민원 처리, 운영정책 위반 대응</td></tr>
        <tr><td>운영 기록</td><td>운영진이 한 처리 기록(처리자 닉네임, 대상 글·댓글 제목과 작성자 닉네임, 정지·권한 변경, 사유)</td><td>신고·분쟁·수사기관 요청 때 처리 과정을 확인하기 위해 (운영진 중 관리자 이상만 볼 수 있어요)</td></tr>
        <tr><td>선택</td><td>프로필 사진·소개 글, 브라우저 알림 구독 정보</td><td>프로필 표시, 알림 전송 (알림은 켠 사람에게만, 언제든 끌 수 있어요)</td></tr>
        <tr><td>서버가 자동으로 받는 정보</td><td>접속 IP, 접속 시각, 브라우저 정보 (호스팅·데이터 업체의 서버 기록)</td><td>보안, 오류 확인, 부정 이용 방지</td></tr>
      </tbody></table></div>
      <p><small>덕질역은 주민등록번호, 전화번호, 집 주소, 학교, 결제 정보를 <b>받지 않아요.</b> 이메일은 다른 회원에게 보이지 않아요.</small></p></div>
      <div class="sub-title"><span>2. 보유·이용 기간과 파기</span></div>
      <div class="panel sunken">
        <p>• 회원 정보는 <b>탈퇴할 때까지</b> 보관하고, <b>탈퇴하면 바로 삭제</b>해요. (내 정보 → 회원정보 수정 → 회원 탈퇴)</p>
        <p>• 쪽지는 <b>30일이 지나면 자동으로 삭제</b>돼요.</p>
        <p>• 운영 기록(감사 로그)은 <b>분쟁·신고 대응을 위해 서비스 운영 기간 동안</b> 보관하고, 사이트를 닫을 때 함께 삭제해요. 회원이 탈퇴해도 처리 기록에는 닉네임과 글 제목만 남을 수 있어요.</p>
        <p>• 탈퇴하면 내 <b>댓글은 함께 삭제</b>돼요. <b>글</b>은 탈퇴할 때 “함께 삭제”를 고르면 지워지고, 고르지 않으면 닉네임이 “탈퇴한 회원”으로 바뀐 채 남아요.</p>
        <p>• 법령에서 보관하라고 한 정보(예: 통신사실확인자료 등)는 그 기간 동안 따로 보관한 뒤 파기해요.</p>
        <p>• 파기는 전자적 파일을 복구할 수 없는 방법으로 삭제하는 방식으로 해요.</p>
      </div>
      <div class="sub-title"><span>3. 개인정보 처리 위탁과 국외 이전</span></div>
      <div class="panel sunken"><div style="overflow:auto"><table class="tbl"><thead><tr><th>받는 곳</th><th>맡기는 일 / 이전 항목</th><th>이전 국가·시기·방법</th><th>보유 기간</th></tr></thead><tbody>
        <tr><td>Supabase, Inc.</td><td>회원·글·쪽지 저장, 로그인, 인증 메일 발송 / 위 1번의 모든 항목</td><td>데이터 보관 서버: ${esc(L.region || '')} (운영사 Supabase, Inc.는 미국 법인이라 관리·지원 과정에서 국외에서 접근할 수 있어요) · 서비스를 쓰는 동안 · HTTPS로 전송</td><td>탈퇴 또는 위탁 계약 종료 시까지</td></tr>
        <tr><td>Netlify, Inc.</td><td>사이트 호스팅 / 접속 IP·접속 기록</td><td>미국 등 해외 · 접속할 때마다 · HTTPS</td><td>업체 정책에 따른 로그 보관 기간</td></tr>
        <tr><td>Cloudflare, Inc. (cdnjs)</td><td>[내 노선도 → 내 지도]를 열 때만: 지도 프로그램(Leaflet) 내려받기 / 접속 IP. 이동 기록·회원정보는 보내지 않고 내 기기에서만 그려요</td><td>미국 등 해외 · 내 지도를 열 때마다 · HTTPS</td><td>업체 정책에 따른 로그 보관 기간</td></tr>
      </tbody></table></div>
      <p><small>이전을 원하지 않으면 가입하지 않거나 탈퇴할 수 있어요. 이 업체들 말고는 개인정보를 다른 사람이나 회사에 팔거나 넘기지 않아요. 수사기관이 법에 따라 요구하는 경우는 예외예요.</small></p></div>
      <div class="sub-title"><span>4. 이용자와 보호자의 권리</span></div>
      <div class="panel sunken">
        <p>• 언제든지 내 정보를 <b>보고·고치고</b>(내 정보 → 회원정보 수정), <b>삭제(회원 탈퇴)</b>하고, 동의를 <b>철회</b>할 수 있어요. 동의를 철회하면 서비스를 쓸 수 없어요.</p>
        <p>• <b>만 14세 미만</b> 회원의 보호자(법정대리인)는 아이의 개인정보 열람·정정·삭제·처리정지를 요구할 수 있어요. 가입할 때 보호자의 동의를 받았다는 체크를 받아요. 보호자는 <a href="#/inquiry">문의·건의</a>나 아래 메일로 요청해 주세요.</p>
        <p>• 요청은 지체 없이(10일 안에) 처리하고 결과를 알려 드려요.</p>
        <p>• 권리 침해를 신고하려면 <a href="https://privacy.go.kr" target="_blank" rel="noopener">개인정보침해 신고센터(privacy.go.kr · 118)</a>, <a href="https://www.kopico.go.kr" target="_blank" rel="noopener">개인정보 분쟁조정위원회(1833-6972)</a>, 경찰청 사이버범죄 신고시스템(ecrm.police.go.kr)에 도움을 요청할 수 있어요.</p>
      </div>
      <div class="sub-title"><span>5. 안전하게 지키기 위한 노력</span></div>
      <div class="panel sunken">
        <p>• 비밀번호는 <b>암호화해서</b> 저장해서 운영자도 알 수 없어요.</p>
        <p>• 모든 통신은 <b>HTTPS</b>로 암호화돼요.</p>
        <p>• 데이터 접근은 <b>접근 권한 규칙(RLS)</b>으로 막고, 개인정보를 볼 수 있는 운영진은 꼭 필요한 사람만 지정해요. 쪽지는 운영진도 볼 수 없어요.</p>
        <p>• 운영진 계정은 비밀번호를 따로 관리하고, 의심스러운 접근이 있으면 확인해요.</p>
        <p>• 개인정보가 새어 나간 것을 알게 되면 법에서 정한 대로 지체 없이 알리고 신고해요.</p>
      </div>
      <div class="sub-title"><span>6. 쿠키와 브라우저 저장소</span></div>
      <div class="panel sunken">
        <p>• 로그인 유지, 테마·글꼴 설정, 임시 저장한 글, 최근 본 글을 위해 <b>브라우저 저장소(쿠키·로컬 저장소)</b>를 써요. 광고·추적용 쿠키는 쓰지 않아요.</p>
        <p>• 브라우저 설정에서 저장소를 지우거나 막을 수 있어요. 다만 로그인이 풀리고 일부 기능이 안 될 수 있어요.</p>
      </div>
      <div class="sub-title"><span>7. 개인정보 보호책임자</span></div>
      <div class="panel sunken">
        <p>• 책임자: <b>${esc(L.officerName || '')}</b></p>
        <p>• 연락처: <b>${esc(L.officerEmail || '')}</b> 또는 <a href="#/inquiry">문의·건의</a></p>
        <p>• 개인정보와 관련한 불만·문의·피해 구제는 위 책임자에게 요청해 주세요. 지체 없이 답해요.</p>
      </div>
      <div class="sub-title"><span>8. 방침이 바뀔 때</span></div>
      <div class="panel sunken"><p>내용이 바뀌면 시행일 <b>7일 전</b>부터 이 페이지와 공지사항에 알려요. 이용자에게 불리한 변경은 30일 전에 알려요.</p></div>
      <p style="margin-top:14px"><a class="btn" href="#/policy">⚖️ 운영정책·신고 처리</a></p>`;
    setStatus('개인정보처리방침', '');
  }

  /* ---------- 서울교덕체 배포 페이지 ---------- */
  async function probeFont(f) {
    try {
      const r = await fetch(f.file, { cache: 'no-store' });
      if (!r.ok) return null;
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      const b = await r.blob();
      if (ct.indexOf('text/html') >= 0 || b.size < 500) return null;
      return b.size;
    } catch (e) { return null; }
  }
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  async function viewFont() {
    const F = C.font;
    buildTree('font'); setAddr('서울교덕체', F.name);
    const sizes = await Promise.all(F.files.map(probeFont));
    const have = F.files.map((f, i) => ({ ...f, size: sizes[i] })).filter(f => f.size);
    const ok = have.length > 0;
    const ex = (have[0] || F.files[0]).file;
    const origin = location.origin.replace(/^null$/, '') || 'https://사이트주소';
    const css = `@font-face {\n  font-family: '${F.family}';\n  src: url('${origin}/${F.files[0].file}') format('woff2');\n  font-display: swap;\n}\n\n.내글씨 { font-family: '${F.family}', sans-serif; }`;
    const glyphs = '가각간갈감갑강개객거건걸검겁게겨격견결경계고곡곤골공과관광교구국군굴궁권귀규균그극근금기긴길김나난날남내냉너널네녀년노농높누눈느는늘능니다단달담답당대덕도독돌동되두둔뒤드든들등디따딸때또라락란랑래량러런럼레려력련로록론롤료루류리린림마막만말맛망매맥머먼멀메며면명모목몸무문물미민밀바박반발밤밥방배백버번벌범베벽변별병보복본봉부북분불브비빛사산살상새색생서석선설성세소속손솔수숙순술스습시식신실심십아악안알암압앞애야약양어언얼업에여역연열영예오온올와완왕외요용우운울원월위유육은을음의이인일임입자작잔장재저적전절점정제조종좌주죽준중지직진질집차착찬참창채책처천철첫청체초촌총최추축출춤취치칙친칠카커컴코콘크큰키타탄태터테토통투트특티파판패팬퍼페편평포표푸풀품프플피필하학한할함합항해행향허현형호혼홀화확환활황회횡후훈휴흐흑흰히';
    const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 !?.,:;~-+*/()[]<>@#&%';
    content.innerHTML = `<div class="fontpage">
      <h2 class="page-title">🔤 ${esc(F.name)}</h2>
      <div class="fp-hero" id="fpHero">${esc(F.sample[0])}</div>
      <div class="msg ${ok ? 'ok' : 'info'}">${ok ? `✅ ${esc(F.name)}가 적용돼 있어요. 이 사이트의 글씨가 바로 이 글꼴이에요.` : `🛠 아직 글꼴 파일이 올라오지 않았어요. 사이트의 <b>${esc(F.files[0].file.replace(/\.\w+$/, ''))}.woff2 / .ttf / .otf</b> 중 하나를 <b>fonts</b> 폴더에 넣으면 자동으로 적용돼요.`}</div>
      <div class="sub-title"><span>⬇ 내려받기</span></div>
      <div class="fp-dl">${F.files.map((f, i) => {
        const sz = sizes[i];
        return sz ? `<a href="${esc(f.file)}" download><b>${esc(f.label)}</b><small>${esc(f.note)}</small><br><small>${fmtSize(sz)} · 눌러서 저장</small></a>`
          : `<div class="fp-off"><b>${esc(f.label)}</b><small>${esc(f.note)}</small><br><small>파일 준비 중 (${esc(f.file)})</small></div>`;
      }).join('')}</div>
      <div class="sub-title"><span>✍ 직접 써 보기</span></div>
      <textarea class="fp-tester" id="fpText" aria-label="글자 입력" maxlength="300">${esc(F.sample[1])}</textarea>
      <div class="fp-ctl">
        <label>크기 <input type="range" id="fpSize" min="16" max="160" value="48"> <b id="fpSizeN">48</b>px</label>
        <label>굵기 <input type="range" id="fpW" min="100" max="900" step="100" value="400"></label>
        <label>글자색 <input type="color" id="fpFg" value="#1c1c1e"></label>
        <label>배경색 <input type="color" id="fpBg" value="#ffffff"></label>
        <label>자간 <input type="range" id="fpLs" min="-5" max="20" value="0"></label>
        <label>두껍게 <input type="range" id="fpSt" min="0" max="10" value="5"></label>
      </div>
      <div class="chips" id="fpChips">${F.sample.map((t, i) => `<button class="btn sm" type="button" data-i="${i}">${esc(t.length > 14 ? t.slice(0, 14) + '…' : t)}</button>`).join('')}</div>
      <div class="fp-view" id="fpView"></div>
      <div class="fp-ctl"><button class="btn primary" type="button" id="fpPng">🖼 PNG 이미지로 저장</button><button class="btn" type="button" id="fpCopy">📋 글자 복사</button><small id="fpMsg"></small></div>
      <div class="sub-title"><span>🔠 글자 모아보기</span></div>
      <div class="panel sunken fp-chars">${esc(glyphs)}<br>${esc(latin)}</div>
      <div class="sub-title"><span>🌐 내 웹사이트에 쓰기</span></div>
      <pre class="fp-code" id="fpCode">${esc(css)}</pre>
      <div class="fp-ctl"><button class="btn sm" type="button" id="fpCodeCopy">📋 코드 복사</button></div>
      <div class="sub-title"><span>📜 이용 안내 (라이선스)</span></div>
      <div class="fp-lic">${F.license.map(([h, t]) => `<div><b>${esc(h)}</b><br>${esc(t)}</div>`).join('')}</div>
      <p><small>© ${esc(F.maker)} · 문의는 <a href="#/inquiry">문의·건의</a>로 남겨 주세요.</small></p>
    </div>`;
    const T = $('#fpText'), V = $('#fpView');
    const paint = () => {
      V.style.fontSize = $('#fpSize').value + 'px'; V.style.fontWeight = $('#fpW').value;
      V.style.color = $('#fpFg').value; V.style.background = $('#fpBg').value; V.style.letterSpacing = $('#fpLs').value / 100 + 'em'; V.style.setProperty('--fp-stroke', $('#fpSt').value / 100 + 'em');
      V.textContent = T.value || ' '; $('#fpSizeN').textContent = $('#fpSize').value;
    };
    ['input'].forEach(ev => content.querySelectorAll('#fpText,#fpSize,#fpW,#fpFg,#fpBg,#fpLs,#fpSt').forEach(el => el.addEventListener(ev, paint)));
    $('#fpChips').onclick = e => { const b = e.target.closest('button'); if (!b) return; T.value = F.sample[+b.dataset.i]; paint(); };
    paint();
    const msg = t => { $('#fpMsg').textContent = t; setTimeout(() => { const m = $('#fpMsg'); if (m) m.textContent = ''; }, 2500); };
    const copy = async (t, done) => { try { await navigator.clipboard.writeText(t); toast(done); } catch (e) { alertBox(t, '복사해 주세요', '📋'); } };
    $('#fpCopy').onclick = () => copy(T.value, '글자를 복사했어요.');
    $('#fpCodeCopy').onclick = () => copy(css, '코드를 복사했어요.');
    $('#fpPng').onclick = async () => {
      const size = +$('#fpSize').value, wgt = $('#fpW').value, fg = $('#fpFg').value, bg = $('#fpBg').value, text = T.value || ' ';
      const fam = `"${F.family}", ${getComputedStyle(V).fontFamily}`;
      try { await document.fonts.load(`${wgt} ${size}px "${F.family}"`, text); } catch (e) {}
      const sk = $('#fpSt').value / 100, pad = Math.round(size * .6), W = 1200, cv = document.createElement('canvas'), g = cv.getContext('2d');
      g.font = `${wgt} ${size}px ${fam}`;
      const lines = [];
      text.split('\n').forEach(par => {
        let cur = '';
        for (const ch of par) { if (g.measureText(cur + ch).width > W - pad * 2 && cur) { lines.push(cur); cur = ch; } else cur += ch; }
        lines.push(cur);
      });
      const lh = Math.round(size * 1.35); cv.width = W; cv.height = pad * 2 + lh * lines.length;
      g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = fg; g.font = `${wgt} ${size}px ${fam}`; g.textBaseline = 'top';
      lines.forEach((l, i) => { const y = pad + i * lh + (lh - size) / 2; if (sk > 0) { g.lineWidth = size * sk; g.lineJoin = 'round'; g.strokeStyle = fg; g.strokeText(l, pad, y); } g.fillText(l, pad, y); });
      cv.toBlob(b => {
        if (!b) return msg('저장하지 못했어요.');
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'seoulgyodeok.png'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000); msg('저장했어요!');
      }, 'image/png');
    };
    setStatus(F.name, ok ? '적용됨' : '파일 대기');
  }

  /* ---------- 출석부 ---------- */
  async function viewCheckin() {
    buildTree('checkin'); setAddr('출석부', '출석부');
    if (!me) { content.innerHTML = '<h2 class="page-title">📅 출석부</h2><div class="msg info">🔒 로그인하면 매일 출석체크하고 포인트를 받을 수 있어요.</div><button class="btn primary" id="ckLogin" type="button">로그인 / 가입</button>'; $('#ckLogin').onclick = () => needLogin(); return; }
    const st = await A.checkInStatus();
    const now = new Date(Date.now() + 9 * 36e5), y = now.getUTCFullYear(), m = now.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), td = now.getUTCDate();
    const set = new Set(st.days.map(d => +d.slice(8)));
    let cells = ''.padStart(0);
    for (let i = 0; i < first; i++) cells += '<i class="ck-e"></i>';
    for (let d = 1; d <= days; d++) cells += `<span class="ck-d${set.has(d) ? ' on' : ''}${d === td ? ' today' : ''}">${set.has(d) ? '✔' : d}</span>`;
    content.innerHTML = `<h2 class="page-title">📅 출석부</h2>
      <div class="panel raised ck-top"><div><b>${st.done ? '오늘 출석 완료! 🎉' : '오늘 출석 도장을 찍어 보세요'}</b><br><small>연속 <b>${st.streak}</b>일째 · 오늘 보상 <b>${st.today}P</b> (연속 출석이 길수록 최대 11P까지 늘어요)</small></div>
        <button class="btn primary" id="ckBtn" type="button" ${st.done ? 'disabled' : ''}>${st.done ? '✔ 출석함' : '📅 출석체크'}</button></div>
      <div class="sub-title"><span>${y}년 ${m + 1}월</span></div>
      <div class="ck-cal"><b>일</b><b>월</b><b>화</b><b>수</b><b>목</b><b>금</b><b>토</b>${cells}</div>
      <p><small>하루에 한 번, 한국 시간 기준으로 바뀌어요. 하루를 거르면 연속 기록이 처음부터 시작돼요.</small></p>`;
    $('#ckBtn').onclick = async () => {
      try { const r = await A.checkIn(); if (r.already) toast('오늘은 이미 출석했어요.'); else { toast(`출석 완료! +${r.points}P (연속 ${r.streak}일)`); } syncMe(); route(); }
      catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
    setStatus('출석부', `연속 ${st.streak}일`);
  }

  /* ---------- 내 노선도 (#/mymap): 노선 기록 · 이동 기록(환승) · 내 지도 ---------- */
  const MM_TITLES = [[0, '뚜벅이 승객'], [1, '새내기 승객'], [5, '출퇴근러'], [10, '노선 수집가'], [20, '전국 노선 마스터']];
  const mmHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mmNorm = n => { n = String(n || '').trim().replace(/\s+/g, ''); return n.length > 1 ? n.replace(/역$/, '') : n; };
  let mmTab = 'lines', mmTrainSel = '', mmMapMode = 'real', mmIdx = null, mmLeaflet = null, mmLoadP = null;
  const LEAFLET = { css: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css', js: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' };
  const mmAddScript = src => new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.async = true; el.onload = ok; el.onerror = () => no(new Error('불러오지 못했어요: ' + src)); document.head.appendChild(el); });
  const mmAddCss = href => new Promise((ok, no) => { const el = document.createElement('link'); el.rel = 'stylesheet'; el.href = href; el.onload = ok; el.onerror = () => no(new Error('불러오지 못했어요: ' + href)); document.head.appendChild(el); });
  /* 역 좌표(js/stations.js) 와 지도 라이브러리(Leaflet)는 '내 지도'를 열 때만 불러와요 */
  const mmLoadGeo = () => mmLoadP || (mmLoadP = Promise.all([
    window.STATION_DATA ? 0 : mmAddScript('js/stations.js'),
    window.KOREA_GEO ? 0 : mmAddScript('js/korea-geo.js'),
    window.RAIL_DATA ? 0 : mmAddScript('js/rails.js'),
    window.RailRoute ? 0 : mmAddScript('js/railroute.js'),
    window.L ? 0 : mmAddCss(LEAFLET.css).then(() => mmAddScript(LEAFLET.js))
  ]).then(() => { if (!window.L || !window.STATION_DATA || !window.KOREA_GEO || !window.RAIL_DATA || !window.RailRoute) throw new Error('지도 자료를 읽지 못했어요.'); }).catch(e => { mmLoadP = null; throw e; }));
  async function viewMyMap() {
    buildTree('mymap'); setAddr('내 노선도', '내 노선도');
    if (!me) { content.innerHTML = '<h2 class="page-title">🗺️ 내 노선도</h2><div class="msg info">🔒 로그인하면 내가 타 본 노선과 이동 기록을 남기고, 나만의 노선도 지도로 볼 수 있어요.</div><button class="btn primary" id="mmLogin" type="button">로그인 / 가입</button>'; $('#mmLogin').onclick = () => needLogin(); return; }
    let marks, trips;
    try { [marks, trips] = await Promise.all([A.routeMarks(), A.trips().catch(e => { if (/준비 중/.test(e.message)) return null; throw e; })]); }
    catch (e) { content.innerHTML = '<h2 class="page-title">🗺️ 내 노선도</h2>' + errBox(e); return; }
    const groups = C.routeGroups || [], types = C.trainTypes || [];
    const LINES = {}; groups.forEach(g => g.lines.forEach(l => { LINES[l[0]] = { id: l[0], short: l[1], name: l[3] || l[1], color: l[2], group: g.name }; }));
    const TYPES = {}; types.forEach(t => { TYPES[t.id] = t; });
    const get = (k, key) => marks.find(m => m.kind === k && m.key === key);
    /* 열차 종류마다 노선 묶음(sections)을 하나로 맞춰요: 노선은 { r: 이름, span: 구간, color, key, label } */
    const secsOf = t => {
      const raw = t.sections === 'KTX' ? (C.ktxSections || []) : Array.isArray(t.sections) ? t.sections : [{ name: '', tag: '', routes: (t.routes || []).map(r => [r, '']) }];
      return raw.map(sec => ({ name: sec.name, routes: sec.routes.map(([r, span, col]) => ({ r, span: span || '', color: col || t.color, key: t.id + ':' + (sec.tag ? sec.tag + ':' : '') + r, label: t.name + ' ' + r + (raw.length > 1 && sec.tag ? ' (' + sec.tag + ')' : '') })) }));
    };
    const legColor = l => l.mode === 'line' ? ((LINES[l.ref] || {}).color || '#777') : l.mode === 'train' ? ((TYPES[String(l.ref).replace(/^train:/, '')] || {}).color || '#555') : '#2e8b3d';
    const modeIcon = l => l.mode === 'bus' ? '🚌' : l.mode === 'train' ? '🚆' : '🚇';
    const legPill = l => `<span class="mm-pill" style="--lc:${esc(legColor(l))}">${modeIcon(l)} ${esc(l.label)}</span>`;
    const tripHtml = t => `<li class="mm-trip"><div class="mm-trip-h"><b>${esc(t.date)}</b>${t.note ? ` <small>${esc(t.note)}</small>` : ''}<button type="button" class="mm-x" data-tdel="${esc(t.id)}" aria-label="이 이동 기록 지우기">✕</button></div>
      <div class="mm-legs">${t.legs.map((l, i) => `${i ? '<span class="mm-xfer" title="환승">⇄ 환승</span>' : ''}<span class="mm-leg-v">${legPill(l)} <span>${esc(l.from)}</span> → <span>${esc(l.to)}</span></span>`).join('')}</div></li>`;

    const draw = () => {
      if (mmLeaflet) { try { mmLeaflet.remove(); } catch (e) {} mmLeaflet = null; }
      const lineIds = Object.keys(LINES);
      const riddenLines = marks.filter(m => m.kind === 'line' && lineIds.includes(m.key)), doneLines = riddenLines.filter(m => m.status === 'done');
      const trainMarks = marks.filter(m => m.kind === 'train'), stops = marks.filter(m => m.kind === 'station'), buses = marks.filter(m => m.kind === 'bus');
      const total = riddenLines.length + trainMarks.length;
      const title = MM_TITLES.filter(t => total >= t[0]).pop()[1];
      content.innerHTML = `<h2 class="page-title">🗺️ 내 노선도</h2>
        <div class="panel raised mm-sum"><div class="mm-title">🎫 ${esc(title)}</div>
          <div class="mm-stats"><span><b>${total}</b> 타 본 노선</span><span><b>${doneLines.length}</b> 완주</span><span><b>${stops.length}</b> 가 본 역</span><span><b>${buses.length}</b> 타 본 버스</span>${trips ? `<span><b>${trips.length}</b> 이동 기록</span>` : ''}</div></div>
        <div class="mm-tabs" role="tablist">${[['lines', '🚇 노선 체크'], ['trips', '🧭 이동 기록'], ['map', '🗺 내 지도']].map(([k, t]) => `<button type="button" role="tab" aria-selected="${mmTab === k}" class="mm-tab${mmTab === k ? ' on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
        <div id="mmBody"></div>`;
      content.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { mmTab = b.dataset.tab; draw(); });
      const body = $('#mmBody');
      if (mmTab === 'lines') drawLines(body, stops, buses);
      else if (mmTab === 'trips') drawTrips(body);
      else drawMap(body).catch(e => { body.innerHTML = errBox(e); });
    };

    /* --- 탭 1: 노선 체크 --- */
    const drawLines = (body, stops, buses) => {
      if (!mmTrainSel || !TYPES[mmTrainSel]) mmTrainSel = (types[0] || {}).id || '';
      const tt = TYPES[mmTrainSel];
      body.innerHTML = `<div class="msg info">노선을 누를 때마다 <b>안 탔어요 → 타 봤어요 → ★완주</b>(모든 역 방문) → 안 탔어요 순서로 바뀌어요. 나만 볼 수 있어요.</div>
        ${groups.map(g => { const n = g.lines.filter(l => get('line', l[0])).length;
          return `<div class="sub-title"><span>${esc(g.name)}</span><small>${n}/${g.lines.length}</small></div><div class="mm-lines">${g.lines.map(([id, nm, col]) => {
            const m = get('line', id), st = !m ? 0 : m.status === 'done' ? 2 : 1;
            return `<button type="button" class="mm-line s${st}" data-line="${esc(id)}" style="--lc:${esc(col)}" aria-label="${esc(g.name)} ${esc(nm)} — ${['안 탔어요', '타 봤어요', '완주'][st]}"><i aria-hidden="true">${st === 2 ? '★' : st === 1 ? '●' : '○'}</i>${esc(nm)}</button>`; }).join('')}</div>`; }).join('')}
        <div class="sub-title"><span>🚆 철도 열차</span><small>열차 종류를 누르면 노선이 나와요</small></div>
        <div class="mm-lines" role="group" aria-label="열차 종류">${types.map(t => { const n = marks.filter(m => m.kind === 'train' && m.key.startsWith(t.id + ':')).length;
          return `<button type="button" class="mm-line mm-type s${t.id === mmTrainSel ? 2 : n ? 1 : 0}" data-type="${esc(t.id)}" style="--lc:${esc(t.color)}" aria-pressed="${t.id === mmTrainSel}">${esc(t.name)}${n ? ` <small>${n}</small>` : ''}</button>`; }).join('')}</div>
        ${tt ? `<div class="panel sunken mm-routes"><div class="mm-routes-h"><b style="color:${esc(tt.color)}">${esc(tt.name)}</b>${tt.note ? ` <small>(${esc(tt.note)})</small>` : ''} — 타 본 노선을 눌러 표시해요</div>${secsOf(tt).map(sec => `${sec.name ? `<div class="mm-sec">${esc(sec.name)}</div>` : ''}<div class="mm-lines">${sec.routes.map(rt => {
          const m = get('train', rt.key);
          return `<button type="button" class="mm-line s${m ? 1 : 0}" data-train="${esc(rt.key)}" data-label="${esc(rt.label)}" style="--lc:${esc(rt.color)}" aria-pressed="${!!m}"><i aria-hidden="true">${m ? '●' : '○'}</i><span>${esc(rt.r)}${rt.span ? `<small class="mm-span">${esc(rt.span)}</small>` : ''}</span></button>`; }).join('')}</div>`).join('')}</div>` : ''}
        <div class="sub-title"><span>📍 내 역·버스 기록</span><small>${stops.length + buses.length}</small></div>
        <form class="panel sunken mm-add" id="mmForm" autocomplete="off">
          <select class="input" name="kind" aria-label="종류" style="width:auto"><option value="station">🚉 역</option><option value="bus">🚌 버스</option></select>
          <input class="input" name="name" maxlength="20" placeholder="역 이름 또는 버스 번호 (예: 대모산입구, 146)" aria-label="이름" required>
          <input class="input" name="note" maxlength="60" placeholder="메모 (선택)" aria-label="메모">
          <button class="btn primary" type="submit">추가</button></form>
        <div class="mm-chips">${[...stops, ...buses].map(m => `<span class="mm-chip ${m.kind}" title="${esc(m.note || '')}"><b>${m.kind === 'bus' ? '🚌' : '🚉'}</b> ${esc(m.label)}${m.note ? ` <small>${esc(m.note)}</small>` : ''}<button type="button" data-del="${esc(m.kind)}:${esc(m.key)}" aria-label="${esc(m.label)} 지우기">✕</button></span>`).join('') || '<div class="empty">아직 기록이 없어요. 가 본 역이나 타 본 버스를 추가해 보세요! (이동 기록을 남기면 역이 자동으로 들어와요)</div>'}</div>`;
      body.querySelectorAll('[data-line]').forEach(b => b.onclick = async () => {
        const id = b.dataset.line, nm = LINES[id].name, m = get('line', id);
        try {
          if (!m) { await A.routeMarkSet('line', id, nm, 'ridden', ''); marks.push({ kind: 'line', key: id, label: nm, status: 'ridden', note: '' }); }
          else if (m.status === 'ridden') { await A.routeMarkSet('line', id, nm, 'done', ''); m.status = 'done'; }
          else { await A.routeMarkDel('line', id); marks = marks.filter(x => x !== m); }
          draw();
        } catch (e) { alertBox(e.message, '오류', '⚠️'); }
      });
      body.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { mmTrainSel = b.dataset.type; draw(); });
      body.querySelectorAll('[data-train]').forEach(b => b.onclick = async () => {
        const key = b.dataset.train, m = get('train', key);
        try {
          if (m) { await A.routeMarkDel('train', key); marks = marks.filter(x => x !== m); }
          else { await A.routeMarkSet('train', key, b.dataset.label, 'ridden', ''); marks.push({ kind: 'train', key, label: b.dataset.label, status: 'ridden', note: '' }); }
          draw();
        } catch (e) { alertBox(e.message, '오류', '⚠️'); }
      });
      body.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const [k, key] = b.dataset.del.split(':');
        try { await A.routeMarkDel(k, key); marks = marks.filter(x => !(x.kind === k && x.key === key)); draw(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
      });
      $('#mmForm').onsubmit = async e => {
        e.preventDefault(); const f = e.target, name = f.name.value.trim(), kind = f.kind.value;
        if (!name) return;
        try {
          const label = kind === 'bus' && /^[0-9A-Za-z-]+$/.test(name) ? name + '번' : name;
          await A.routeMarkSet(kind, name.toLowerCase(), label, 'ridden', f.note.value);
          marks = await A.routeMarks(); draw(); toast('기록했어요 🗺️');
        } catch (x) { alertBox(x.message, '오류', '⚠️'); }
      };
    };

    /* --- 탭 2: 이동 기록 (출발역 → 도착역, 타고 간 노선, 환승) --- */
    const drawTrips = body => {
      if (!trips) { body.innerHTML = '<div class="msg err">이동 기록은 아직 준비 중이에요. (Supabase에서 v4_staff.sql 을 다시 실행해 주세요)</div>'; return; }
      const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
      const stNames = [...new Set([...marks.filter(m => m.kind === 'station').map(m => m.label), ...trips.flatMap(t => t.legs.flatMap(l => [l.from, l.to]))])].sort();
      const modeOpts = `<option value="">노선 고르기</option>${groups.map(g => `<optgroup label="${esc(g.name)}">${g.lines.map(l => `<option value="line:${esc(l[0])}">${esc(l[3] || l[1])}</option>`).join('')}</optgroup>`).join('')}<optgroup label="철도 열차">${types.map(t => `<option value="train:${esc(t.id)}">${esc(t.name)}</option>`).join('')}</optgroup><optgroup label="버스"><option value="bus">🚌 버스</option></optgroup>`;
      body.innerHTML = `<div class="msg info">어디서 어디까지 <b>어느 노선</b>을 타고 갔는지 적어요. 갈아탔다면 <b>＋ 환승 추가</b>로 이어서 적어요. 적은 기록은 <b>🗺 내 지도</b>에서 노선도처럼 볼 수 있어요. 나만 볼 수 있어요.</div>
        <form class="panel sunken mm-trip-form" id="mmTrip" autocomplete="off">
          <div class="mm-trip-top"><label>날짜 <input class="input" type="date" name="date" value="${today}" max="${today}" required></label>
            <label class="grow">메모 <input class="input" name="note" maxlength="60" placeholder="예: 학원 가는 길 (선택)"></label></div>
          <div id="mmLegs"></div>
          <datalist id="mmSt">${stNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
          <div class="mm-trip-btns"><button type="button" class="btn" id="mmAddLeg">＋ 환승 추가</button><button class="btn primary" type="submit">기록하기</button></div>
          <div class="err-line" id="mmErr" role="alert"></div></form>
        <div class="sub-title"><span>🧭 내 이동 기록</span><small>${trips.length}/300</small></div>
        ${trips.length ? `<ul class="mm-trips">${trips.map(tripHtml).join('')}</ul>` : '<div class="empty">아직 이동 기록이 없어요. 위에 첫 이동을 적어 보세요!</div>'}`;
      const box = $('#mmLegs');
      const addLeg = (from = '') => {
        const n = box.children.length; if (n >= 8) return;
        const row = document.createElement('div'); row.className = 'mm-leg-row';
        row.innerHTML = `${n ? '<div class="mm-xfer-line">⇄ 환승</div>' : ''}<div class="mm-leg-in"><select class="input" name="mode" aria-label="${n + 1}번째 구간 노선">${modeOpts}</select>
          <input class="input bus" name="bus" maxlength="12" placeholder="버스 번호" aria-label="버스 번호" hidden>
          <input class="input" name="from" list="mmSt" maxlength="20" placeholder="출발 (역·정류장)" aria-label="${n + 1}번째 구간 출발" value="${esc(from)}" required>
          <span aria-hidden="true">→</span>
          <input class="input" name="to" list="mmSt" maxlength="20" placeholder="도착" aria-label="${n + 1}번째 구간 도착" required>
          ${n ? '<button type="button" class="mm-x" aria-label="이 구간 지우기">✕</button>' : ''}</div>`;
        row.querySelector('select').onchange = e => { const bus = row.querySelector('.bus'); bus.hidden = e.target.value !== 'bus'; bus.required = e.target.value === 'bus'; };
        const x = row.querySelector('.mm-x'); if (x) x.onclick = () => { row.remove(); $('#mmAddLeg').disabled = false; };
        box.appendChild(row);
      };
      addLeg();
      $('#mmAddLeg').onclick = () => { const last = box.lastElementChild; addLeg(last ? last.querySelector('[name=to]').value : ''); if (box.children.length >= 8) $('#mmAddLeg').disabled = true; const t = box.lastElementChild.querySelector('select'); t.focus(); };
      $('#mmTrip').onsubmit = async e => {
        e.preventDefault(); const f = e.target, err = $('#mmErr'); err.textContent = '';
        const legs = [...box.children].map(r => {
          const v = r.querySelector('select').value, bus = r.querySelector('.bus').value.trim();
          let mode = '', ref = '', label = '';
          if (v.startsWith('line:')) { mode = 'line'; ref = v.slice(5); label = (LINES[ref] || {}).name || ref; }
          else if (v.startsWith('train:')) { mode = 'train'; ref = v; label = (TYPES[v.slice(6)] || {}).name || v; }
          else if (v === 'bus' && bus) { mode = 'bus'; ref = bus.toLowerCase(); label = /^[0-9A-Za-z-]+$/.test(bus) ? bus + '번' : bus; }
          return { mode, ref, label, from: r.querySelector('[name=from]').value, to: r.querySelector('[name=to]').value };
        });
        const btn = f.querySelector('[type=submit]'); btn.disabled = true;
        try {
          await A.tripAdd({ date: f.date.value, legs, note: f.note.value });
          /* 탄 노선·지나간 역은 노선 체크와 역 기록에도 알아서 넣어 줘요 (실패해도 이동 기록은 이미 저장됐어요) */
          try {
            for (const l of legs) {
              if (l.mode === 'line' && !get('line', l.ref)) await A.routeMarkSet('line', l.ref, l.label, 'ridden', '');
              for (const nm of [l.from, l.to]) if (l.mode !== 'bus' && !get('station', nm.toLowerCase()) && !marks.some(m => m.kind === 'station' && mmNorm(m.label) === mmNorm(nm))) await A.routeMarkSet('station', nm.toLowerCase(), nm, 'ridden', '');
              if (l.mode === 'bus' && !get('bus', l.ref)) await A.routeMarkSet('bus', l.ref, l.label, 'ridden', '');
            }
          } catch (x) { /* 무시 */ }
          marks = await A.routeMarks(); trips = await A.trips(); toast('이동을 기록했어요 🧭'); draw();
        } catch (x) { err.textContent = '⚠ ' + x.message; btn.disabled = false; }
      };
      body.querySelectorAll('[data-tdel]').forEach(b => b.onclick = async () => {
        if (!(await confirmBox('이 이동 기록을 지울까요?', '이동 기록 삭제', '삭제', '취소'))) return;
        try { await A.tripDel(b.dataset.tdel); trips = trips.filter(t => t.id !== b.dataset.tdel); draw(); } catch (x) { alertBox(x.message, '오류', '⚠️'); }
      });
    };

    /* --- 탭 3: 내 지도 (기록한 역을 점, 탄 구간을 노선 색 선으로 이은 나만의 노선도) --- */
    const buildGraph = () => {
      const nodes = new Map(), edges = new Map(); let transfers = 0;
      const node = nm => { const k = mmNorm(nm); if (!nodes.has(k)) nodes.set(k, { key: k, label: nm.replace(/역$/, '') || nm, xfer: 0, n: 0 }); const v = nodes.get(k); v.n++; return v; };
      const edge = (a, b, color, label, dashed) => {
        if (a === b) return; const [lo, hi] = a.key < b.key ? [a, b] : [b, a], id = lo.key + '|' + hi.key + '|' + label;
        if (!edges.has(id)) edges.set(id, { id, a: lo, b: hi, color, label, dashed: !!dashed, n: 0 }); edges.get(id).n++;
      };
      trips.slice().reverse().forEach(t => t.legs.forEach((l, i) => {
        const a = node(l.from), b = node(l.to), col = legColor(l);
        edge(a, b, col, l.label);
        const nx = t.legs[i + 1];
        if (nx) { if (mmNorm(nx.from) === b.key) { b.xfer++; transfers++; } else edge(b, node(nx.from), '#888', '도보·기타 이동', true); }
      }));
      return { nodes: [...nodes.values()], edges: [...edges.values()], transfers };
    };
    const forceLayout = (nodes, edges, W, H) => {
      const n = nodes.length; if (!n) return;
      nodes.forEach((v, i) => { const a = (i / n) * Math.PI * 2 + (mmHash(v.key) % 100) / 300, r = 100 + (mmHash(v.key + 'r') % 80); v.x = W / 2 + Math.cos(a) * r; v.y = H / 2 + Math.sin(a) * r; });
      const L = 120, K2 = L * L * 2.2;
      for (let it = 0; it < 400; it++) {
        const cool = 1 - it / 400; nodes.forEach(v => { v.dx = 0; v.dy = 0; });
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 0.01) { dx = 0.1; dy = 0.1; d2 = 0.02; }
          const d = Math.sqrt(d2), f = K2 / d2; a.dx += dx / d * f * d; a.dy += dy / d * f * d; b.dx -= dx / d * f * d; b.dy -= dy / d * f * d;
        }
        edges.forEach(e => { const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.1, f = (d - L) * 0.12; e.a.dx += dx / d * f; e.a.dy += dy / d * f; e.b.dx -= dx / d * f; e.b.dy -= dy / d * f; });
        nodes.forEach(v => { v.dx += (W / 2 - v.x) * 0.012; v.dy += (H / 2 - v.y) * 0.012; const m = Math.sqrt(v.dx * v.dx + v.dy * v.dy) || 1, lim = 14 * cool + 0.4; v.x += v.dx / m * Math.min(m, lim); v.y += v.dy / m * Math.min(m, lim); });
      }
      const xs = nodes.map(v => v.x), ys = nodes.map(v => v.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const pad = 70, sx = (W - pad * 2) / Math.max(1, x1 - x0), sy = (H - pad * 2) / Math.max(1, y1 - y0), s = Math.min(sx, sy, 2.2);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; nodes.forEach(v => { v.x = W / 2 + (v.x - cx) * s; v.y = H / 2 + (v.y - cy) * s; });
    };
    /* --- 실제 지도: 기록한 역을 실제 좌표(OpenStreetMap)에 찍고 노선 색 선으로 이어요 --- */
    const geoIdx = () => {
      const D = window.STATION_DATA;
      if (!mmIdx) {
        const mk = arr => { const m = new Map(); arr.forEach(([n, la, lo]) => { [mmNorm(n), mmNorm(String(n).replace(/\(.*?\)/g, ''))].forEach(k => { if (k && !m.has(k)) m.set(k, [la, lo]); }); }); return m; };
        mmIdx = { line: {}, all: new Map(), rail: mk(D.rail), alias: D.alias || {} };
        Object.keys(D.urban).forEach(id => { const m = mk(D.urban[id]); mmIdx.line[id] = m; m.forEach((pt, k) => { const a = mmIdx.all.get(k) || []; a.push(pt); mmIdx.all.set(k, a); }); });
      }
      return mmIdx;
    };
    const kmBetween = (a, b) => { const dx = (a[1] - b[1]) * Math.cos((a[0] + b[0]) * Math.PI / 360), dy = a[0] - b[0]; return Math.sqrt(dx * dx + dy * dy) * 111; };
    const nameKeys = (ix, nm) => {
      const raw = String(nm || '').trim(), out = [], add = x => { x = mmNorm(x); if (x && !out.includes(x)) out.push(x); };
      add(raw); if (ix.alias[raw]) add(ix.alias[raw]); if (ix.alias[mmNorm(raw)]) add(ix.alias[mmNorm(raw)]); add(raw.replace(/\(.*?\)/g, '')); return out;
    };
    const uniqPts = list => { const o = []; list.forEach(pt => { if (!o.some(q => kmBetween(q, pt) < 0.8)) o.push(pt); }); return o; };
    const geoCands = (ix, leg, nm) => {
      if (leg.mode === 'bus') return [];
      const ks = nameKeys(ix, nm), first = fn => { for (const k of ks) { const r = fn(k); if (r.length) return r; } return []; };
      const rail = k => ix.rail.has(k) ? [ix.rail.get(k)] : [], urban = k => ix.all.get(k) || [];
      if (leg.mode === 'line') { const own = ix.line[leg.ref], a = own ? first(k => own.has(k) ? [own.get(k)] : []) : []; if (a.length) return a; const b = first(urban); return uniqPts(b.length ? b : first(rail)); }
      return uniqPts(first(rail).length ? first(rail) : first(urban));
    };
    const geoLeg = (ix, l) => {
      const A = geoCands(ix, l, l.from), B = geoCands(ix, l, l.to);
      if (A.length && B.length) { let best = null; A.forEach(a => B.forEach(b => { const d = kmBetween(a, b); if (!best || d < best[0]) best = [d, a, b]; })); return [best[1], best[2]]; }
      return [A[0] || null, B[0] || null];
    };
    const buildGeo = () => {
      const ix = geoIdx(), nodes = [], edges = new Map(), miss = new Set(); let transfers = 0, drawn = 0;
      const node = (nm, pt) => { const k = nameKeys(ix, nm)[0]; let v = nodes.find(n => n.key === k && kmBetween(n.p, pt) < 1.5); if (!v) { v = { i: nodes.length, key: k, label: String(nm).trim().replace(/역$/, '') || nm, p: pt, xfer: 0 }; nodes.push(v); } return v; };
      const edge = (a, b, color, label, dashed, path) => {
        if (a === b) return; const lo = a.i < b.i ? a : b, hi = a.i < b.i ? b : a, id = lo.i + '|' + hi.i + '|' + label;
        if (!edges.has(id)) edges.set(id, { id, a: lo, b: hi, color, label, dashed: !!dashed, path, n: 0 }); edges.get(id).n++;
      };
      /* 탄 노선·열차 종류에 맞춰 선로 위의 실제 경로를 찾아요 */
      const legSpec = l => { if (l.mode !== 'train') return { names: (C.routeOsm || {})[l.ref] || [] }; const id = String(l.ref).replace(/^train:/, ''); return { hs: ['ktx', 'ktxs', 'ktxc'].includes(id) ? true : id === 'ktxe' ? null : false }; };
      const pathCache = new Map(); let nopath = 0; const noTrack = new Set(); const NO_TRACK = { dg3: '대구 3호선(모노레일)' };
      const pathOf = (l, a, b) => { const k = l.mode + '|' + l.ref + '|' + a.i + '|' + b.i; if (!pathCache.has(k)) { let r = null; try { r = window.RailRoute.route(a.p, b.p, legSpec(l)); } catch (e) {} pathCache.set(k, r && r.pts.length > 1 ? r.pts : null); } return pathCache.get(k); };
      trips.slice().reverse().forEach(t => {
        const N = t.legs.map(l => {
          const [pa, pb] = geoLeg(ix, l);
          if (l.mode !== 'bus') { if (!pa) miss.add(String(l.from).trim()); if (!pb) miss.add(String(l.to).trim()); }
          return [pa && node(l.from, pa), pb && node(l.to, pb)];
        });
        t.legs.forEach((l, i) => {
          const [a, b] = N[i]; if (a && b && a !== b) { const pts = pathOf(l, a, b); if (pts) { edge(a, b, legColor(l), l.label, false, pts); drawn++; } else if (NO_TRACK[l.ref]) noTrack.add(NO_TRACK[l.ref]); else nopath++; }
          const nx = N[i + 1]; if (b && nx && nx[0]) { if (nx[0] === b) { b.xfer++; transfers++; } else if (kmBetween(b.p, nx[0].p) < 3) edge(b, nx[0], '#888', '도보·기타 이동', true, [b.p, nx[0].p]); }
        });
      });
      return { nodes, edges: [...edges.values()], miss: [...miss], transfers, drawn, nopath, noTrack: [...noTrack] };
    };
    const modeBar = cur => `<div class="mm-mode" role="group" aria-label="지도 종류"><button type="button" class="btn sm${cur === 'real' ? ' primary' : ''}" data-mode="real" aria-pressed="${cur === 'real'}">🌏 실제 지도</button><button type="button" class="btn sm${cur === 'schem' ? ' primary' : ''}" data-mode="schem" aria-pressed="${cur === 'schem'}">🧩 노선도</button></div>`;
    const bindMode = () => content.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mmMapMode = b.dataset.mode; draw(); });
    const drawReal = body => {
      const g = buildGeo();
      if (!g.nodes.length) return drawSchem(body, `<div class="msg info">기록한 역의 위치를 좌표 데이터에서 찾지 못해서 노선도로 보여 줘요.${g.miss.length ? ' (못 찾은 역: ' + g.miss.slice(0, 8).map(esc).join(', ') + ')' : ''}</div>`);
      const used = new Map(); g.edges.forEach(e => { if (!e.dashed) { const u = used.get(e.label) || { color: e.color, n: 0 }; u.n += e.n; used.set(e.label, u); } });
      const hidden = new Set();
      body.innerHTML = `${modeBar('real')}<div class="mm-map-bar"><small>지명 없는 백지도 위에 탄 노선을 실제 선로 모양대로 그렸어요 · 범례를 누르면 그 노선을 숨겨요</small></div>
        <div class="panel sunken mm-lmap-wrap"><div id="mmLeaf" class="mm-lmap" role="application" aria-label="내 이동 기록 지도"></div></div>
        <div class="mm-legend" id="mmLegend">${[...used].map(([lb, u]) => `<button type="button" class="mm-pill" data-lg="${esc(lb)}" style="--lc:${esc(u.color)}" aria-pressed="true">${esc(lb)} <small>×${u.n}</small></button>`).join('')}</div>
        <div class="mm-stats mm-map-stats"><span><b>${g.nodes.length}</b> 역</span><span><b>${g.drawn}</b> 구간</span><span><b>${g.transfers}</b> 환승</span></div>
        ${g.noTrack.length ? `<div class="msg info"><b>${g.noTrack.map(esc).join(', ')}</b>은(는) 선로 지도 자료에 없어서 역만 점으로 표시했어요. (선은 긋지 않았어요)</div>` : ''}
        ${g.nopath ? `<div class="msg info">선로에서 경로를 못 찾은 구간이 <b>${g.nopath}</b>개 있어서 선을 긋지 않았어요. (역은 점으로 찍었어요. 선로 데이터에 없는 노선일 수 있어요.)</div>` : ''}
        ${g.miss.length ? `<div class="msg info">지도에 못 찍은 역 <b>${g.miss.length}</b>곳: ${g.miss.slice(0, 12).map(esc).join(', ')}${g.miss.length > 12 ? ' …' : ''}<br><small>좌표 데이터에 없는 이름이에요. 역 이름의 오타나 새로 생긴 역인지 확인해 주세요. 🧩 노선도에서는 볼 수 있어요.</small></div>` : ''}
        <p class="mm-note">※ 선로 모양 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 기여자(ODbL) · 시도 경계 통계청 2018 · 역 위치는 공공데이터포털(전국도시철도역사정보, 한국철도공사 철도역 위치) 기준이에요. 경로는 선로를 따라 자동으로 찾은 거라 실제 운행 경로와 조금 다를 수 있어요. 정류장(버스)은 찍지 않아요.</p>`;
      bindMode();
      const L = window.L, el = $('#mmLeaf');
      const map = mmLeaflet = L.map(el, { zoomSnap: 0.5, minZoom: 6, maxZoom: 15, maxBounds: [[32.5, 124], [39.5, 132.5]], maxBoundsViscosity: 0.7 }).setView([36.4, 127.8], 7);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      map.attributionControl.addAttribution('선로 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 기여자 · 경계 통계청');
      /* 백지도: 시도 경계(해안선 포함)만 그려요. 지명·도로·강은 없어요 */
      const land = L.layerGroup().addTo(map);
      window.KOREA_GEO.forEach(([nm, rings]) => rings.forEach(r => L.polygon(r.map(([x, y]) => [y, x]), { color: '#9aa7b4', weight: 1, fillColor: '#fff', fillOpacity: 1, interactive: false, smoothFactor: 1 }).addTo(land)));
      const layer = L.layerGroup().addTo(map);
      const paint = () => {
        layer.clearLayers();
        const byPair = {}; g.edges.forEach(e => { if (hidden.has(e.label)) return; const k = e.a.i + '|' + e.b.i; (byPair[k] = byPair[k] || []).push(e); });
        Object.values(byPair).forEach(list => list.forEach((e, i) => {
          const pl = L.polyline(e.path, { color: e.color, weight: e.dashed ? 3 : 4 + (list.length - 1 - i) * 4, opacity: e.dashed ? .8 : .92, dashArray: e.dashed ? '2 8' : null, lineCap: 'round', lineJoin: 'round' });
          pl.bindTooltip(esc(e.label), { sticky: true }); pl.addTo(layer);
        }));
        const live = new Set(); g.edges.forEach(e => { if (!hidden.has(e.label)) { live.add(e.a.i); live.add(e.b.i); } });
        g.nodes.forEach(v => {
          if (g.edges.length && !live.has(v.i)) return;
          L.circleMarker(v.p, { radius: v.xfer ? 9 : 6, color: '#222', weight: v.xfer ? 4 : 3, fillColor: '#fff', fillOpacity: 1 })
            .bindTooltip(esc(v.label), { permanent: true, direction: 'right', offset: [8, 0], className: 'mm-tip' }).addTo(layer);
        });
      };
      paint();
      const allPts = g.nodes.map(v => v.p).concat(...g.edges.map(e => e.path));
      const lab = () => el.classList.toggle('mm-nolbl', g.nodes.length > 8 && map.getZoom() < 9);
      const fit = () => { map.invalidateSize(); if (g.nodes.length === 1) map.setView(g.nodes[0].p, 12); else map.fitBounds(L.latLngBounds(allPts), { padding: [36, 36], maxZoom: 13 }); lab(); };
      map.on('zoomend', lab); fit(); setTimeout(fit, 120);
      content.querySelectorAll('[data-lg]').forEach(b => b.onclick = () => { const lb = b.dataset.lg, off = !hidden.has(lb); off ? hidden.add(lb) : hidden.delete(lb); b.setAttribute('aria-pressed', String(!off)); b.classList.toggle('off', off); paint(); });
    };
    const drawMap = async body => {
      if (!trips) { body.innerHTML = '<div class="msg err">이동 기록이 아직 준비 중이에요. (Supabase에서 v4_staff.sql 을 다시 실행해 주세요)</div>'; return; }
      if (!trips.length) { body.innerHTML = '<div class="empty">지도를 그릴 이동 기록이 없어요. <b>🧭 이동 기록</b> 탭에서 출발·도착역과 노선을 적으면 여기에 내 지도가 그려져요!</div>'; return; }
      if (mmMapMode !== 'real') return drawSchem(body, '');
      body.innerHTML = '<div class="msg info">🌏 지도를 불러오는 중…</div>';
      try { await mmLoadGeo(); }
      catch (e) { if (mmTab === 'map' && body.isConnected) drawSchem(body, '<div class="msg err">실제 지도를 불러오지 못해서 노선도로 보여 줘요. 인터넷 연결이나 광고 차단 프로그램을 확인해 주세요.</div>'); return; }
      if (mmTab !== 'map' || !body.isConnected) return;
      drawReal(body);
    };
    const drawSchem = (body, note) => {
      const W = 900, H = 560, g = buildGraph(); forceLayout(g.nodes, g.edges, W, H);
      const used = new Map(); g.edges.forEach(e => { if (!e.dashed) { const u = used.get(e.label) || { color: e.color, n: 0 }; u.n += e.n; used.set(e.label, u); } });
      const hidden = new Set();
      body.innerHTML = `${modeBar('schem')}${note || ''}<div class="mm-map-bar"><button class="btn sm" id="mmRe" type="button">🔀 다시 배치</button><button class="btn sm" id="mmPng" type="button">🖼 이미지로 저장</button><small>점을 끌어서 옮길 수 있어요 · 범례를 누르면 그 노선을 숨겨요</small></div>
        <div class="panel sunken mm-map"><svg id="mmSvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="내 이동 기록 노선도"></svg></div>
        <div class="mm-legend" id="mmLegend">${[...used].map(([lb, u]) => `<button type="button" class="mm-pill" data-lg="${esc(lb)}" style="--lc:${esc(u.color)}" aria-pressed="true">${esc(lb)} <small>×${u.n}</small></button>`).join('')}</div>
        <div class="mm-stats mm-map-stats"><span><b>${g.nodes.length}</b> 역·정류장</span><span><b>${trips.reduce((a, t) => a + t.legs.length, 0)}</b> 구간</span><span><b>${g.transfers}</b> 환승</span></div>
        <p class="mm-note">※ 이 화면은 실제 위치가 아니라, 기록한 역을 이어서 자동으로 배치한 <b>나만의 노선도</b>예요. 실제 위치는 <b>🌏 실제 지도</b>에서 볼 수 있어요.</p>`;
      bindMode();
      const svg = $('#mmSvg'), cs = getComputedStyle(content), ink = cs.color;
      const paint = () => {
        const byPair = {}; g.edges.forEach(e => { if (hidden.has(e.label)) return; const k = e.a.key + '|' + e.b.key; (byPair[k] = byPair[k] || []).push(e); });
        let out = '';
        Object.values(byPair).forEach(list => list.forEach((e, i) => {
          const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, off = (i - (list.length - 1) / 2) * 8, ox = -dy / d * off, oy = dx / d * off;
          out += `<line x1="${(e.a.x + ox).toFixed(1)}" y1="${(e.a.y + oy).toFixed(1)}" x2="${(e.b.x + ox).toFixed(1)}" y2="${(e.b.y + oy).toFixed(1)}" stroke="${esc(e.color)}" stroke-width="${e.dashed ? 3 : Math.min(9, 5 + e.n)}" stroke-linecap="round"${e.dashed ? ' stroke-dasharray="2 7"' : ''} opacity="${e.dashed ? .7 : .95}"><title>${esc(e.label)} ×${e.n}</title></line>`;
        }));
        g.nodes.forEach(v => {
          const x = v.x.toFixed(1), y = v.y.toFixed(1), big = v.xfer > 0;
          out += `<g data-n="${esc(v.key)}" style="cursor:grab"><circle cx="${x}" cy="${y}" r="${big ? 13 : 9}" fill="#fff" stroke="${esc(ink)}" stroke-width="${big ? 4 : 3}"/>${big ? `<circle cx="${x}" cy="${y}" r="5" fill="${esc(ink)}"/>` : ''}<text x="${(v.x + 16).toFixed(1)}" y="${(v.y - 12).toFixed(1)}" font-size="15" font-weight="700" fill="${esc(ink)}" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${esc(v.label)}</text></g>`;
        });
        svg.innerHTML = out;
      };
      paint();
      let drag = null;
      const pt = e => { const m = svg.getScreenCTM().inverse(), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(m); };
      svg.onpointerdown = e => { const n = e.target.closest('[data-n]'); if (!n) return; drag = g.nodes.find(v => v.key === n.dataset.n); try { svg.setPointerCapture(e.pointerId); } catch (x) {} };
      svg.onpointermove = e => { if (!drag) return; const p = pt(e); drag.x = Math.max(10, Math.min(W - 10, p.x)); drag.y = Math.max(10, Math.min(H - 10, p.y)); paint(); };
      svg.onpointerup = svg.onpointercancel = () => { drag = null; };
      $('#mmRe').onclick = () => { g.nodes.forEach((v, i) => { v.key0 = v.key; }); const salt = Math.random().toString(36).slice(2); g.nodes.forEach(v => { v.key = v.key0 + salt.slice(0, 2); }); forceLayout(g.nodes, g.edges, W, H); g.nodes.forEach(v => { v.key = v.key0; }); paint(); };
      content.querySelectorAll('[data-lg]').forEach(b => b.onclick = () => { const lb = b.dataset.lg, off = !hidden.has(lb); off ? hidden.add(lb) : hidden.delete(lb); b.setAttribute('aria-pressed', String(!off)); b.classList.toggle('off', off); paint(); });
      $('#mmPng').onclick = () => {
        const bg = getComputedStyle(document.body).backgroundColor || '#fff', clone = svg.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', W * 2); clone.setAttribute('height', H * 2);
        clone.insertAdjacentHTML('afterbegin', `<rect width="${W}" height="${H}" fill="#fff"/>`);
        const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })), img = new Image();
        img.onload = () => { const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2; cv.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url);
          cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'my-route-map.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }); };
        img.onerror = () => { URL.revokeObjectURL(url); alertBox('이미지를 만들지 못했어요. 화면을 캡처해 주세요.', '저장 실패', '⚠️'); };
        img.src = url;
      };
    };
    draw(); setStatus('내 노선도', '');
  }

  /* ---------- 내 스크랩 ---------- */
  async function viewBookmarks() {
    buildTree('bookmarks'); setAddr('내 스크랩', '내 스크랩');
    if (!me) { content.innerHTML = '<h2 class="page-title">⭐ 내 스크랩</h2><div class="msg info">🔒 로그인하면 마음에 드는 글을 스크랩해 둘 수 있어요.</div><button class="btn primary" id="bmLogin" type="button">로그인 / 가입</button>'; $('#bmLogin').onclick = () => needLogin(); return; }
    const ids = await A.bookmarkIds();
    const all = await A.listPosts();
    const list = ids.map(id => all.find(p => p.id === id)).filter(p => p && (p.status !== 'pending' || p.authorId === me.id));
    content.innerHTML = `<h2 class="page-title">⭐ 내 스크랩 <small>(${list.length})</small></h2>${list.length ? postsTable(list, list.length, true) : '<div class="empty">아직 스크랩한 글이 없어요. 글 아래의 ☆ 스크랩 버튼을 눌러 보세요.</div>'}`;
    setStatus(`스크랩 ${list.length}개`, '');
  }

  /* ---------- 알림 · 쪽지 ---------- */
  let badge = { notif: 0, dm: 0 }, badgeInit = false, threadTimer = null;
  function paintBadges() {
    const set = (id, n) => { const a = $(id); if (!a) return; a.hidden = !me; const b = a.querySelector('.nb'); b.hidden = !n; b.textContent = n > 99 ? '99+' : n; };
    set('#bNotif', badge.notif); set('#bDm', badge.dm);
    document.querySelectorAll('[data-nb]').forEach(el => { const n = el.dataset.nb === 'all' ? badge.notif + badge.dm : badge[el.dataset.nb]; el.textContent = n ? (n > 99 ? '99+' : n) : ''; el.hidden = !n; });
  }
  async function refreshBadges() {
    if (!me) { badge = { notif: 0, dm: 0 }; badgeInit = false; paintBadges(); return; }
    try {
      const c = await A.unreadCounts();
      if (badgeInit) {
        if (c.dm > badge.dm) { toast('✉ 새 쪽지가 왔어요'); if (document.hidden && window.Push) Push.notify('덕질역 · 새 쪽지', '새 쪽지가 왔어요.', './index.html#/messages', 'dj-dm'); }
        else if (c.notif > badge.notif) { toast('🔔 새 알림이 있어요'); if (document.hidden && window.Push) Push.notify('덕질역 · 새 알림', '댓글·공감 같은 새 소식이 있어요.', './index.html#/notifications', 'dj-notif'); }
      }
      badge = c; badgeInit = true; paintBadges();
    } catch (e) { /* 업그레이드 전이면 조용히 */ }
  }
  setInterval(() => { if (!document.hidden || (window.Push && Push.enabled())) refreshBadges(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadges(); });
  const NK = { comment: '💬', reply: '↪️', like: '💙', inquiry: '📮', meeting: '🗓', market: '🛒', report: '🚨' };
  const ago = iso => {
    const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return '방금'; if (s < 3600) return Math.floor(s / 60) + '분 전'; if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전'; return fmtShort(iso);
  };
  function needMe(title, icon) {
    buildTree(''); setAddr(title, title);
    content.innerHTML = `<h2 class="page-title">${icon} ${title}</h2><div class="msg info">🔒 로그인하면 쓸 수 있어요.</div><button class="btn primary" id="nmLogin" type="button">로그인 / 가입</button>`;
    $('#nmLogin').onclick = () => needLogin();
  }
  async function viewNotifications() {
    if (!me) return needMe('알림', '🔔');
    buildTree('notifications'); setAddr('알림', '알림');
    const list = await A.notifList(60);
    const unread = list.filter(n => !n.read).length;
    content.innerHTML = `<h2 class="page-title">🔔 알림 <small>(안 읽음 ${unread})</small></h2>
      <div id="pushBox" class="nt-push"></div>
      <div class="nt-acts"><button class="btn sm" id="ntAll" type="button" ${unread ? '' : 'disabled'}>✔ 모두 읽음</button><button class="btn sm" id="ntClear" type="button" ${list.length ? '' : 'disabled'}>🗑 모두 지우기</button></div>
      ${list.length ? `<div class="nt-list">${list.map(n => `<a class="nt${n.read ? '' : ' un'}" href="${esc(n.link || '#/')}" data-id="${esc(String(n.id))}"><span class="nt-i">${NK[n.kind] || '🔔'}</span><span class="nt-t">${esc(n.text)}</span><span class="nt-d">${ago(n.created)}</span></a>`).join('')}</div>`
        : '<div class="empty">아직 알림이 없어요. 글을 쓰면 댓글과 공감 소식이 여기에 모여요 🔔</div>'}`;
    content.querySelectorAll('.nt').forEach(a => a.addEventListener('click', () => { const id = a.dataset.id; A.notifRead([isNaN(+id) ? id : +id]).then(refreshBadges).catch(() => {}); }));
    $('#ntAll').onclick = async () => { try { await A.notifRead(null); await refreshBadges(); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); } };
    $('#ntClear').onclick = async () => { if (!(await confirmBox('알림을 모두 지울까요?', '알림 지우기'))) return; try { await A.notifClear(); await refreshBadges(); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); } };
    if (unread) A.notifRead(null).then(refreshBadges).catch(e => { console.warn('[알림 읽음 처리 실패]', e.message); toast('⚠ 읽음 처리가 안 됐어요. v2_community.sql을 다시 실행해 주세요'); });
    if (window.Push) Push.panel($('#pushBox'), me);
    setStatus(`알림 ${list.length}개`, '');
  }
  async function viewMessages(nick) {
    if (!me) return needMe('쪽지함', '✉');
    if (nick) return viewThread(nick);
    buildTree('messages'); setAddr('쪽지함', '쪽지함');
    const th = await A.dmThreads();
    content.innerHTML = `<h2 class="page-title">✉ 쪽지함</h2>
      <form class="dm-new" id="dmNew"><input class="input" id="dmTo" maxlength="10" placeholder="받는 사람 닉네임" aria-label="받는 사람 닉네임"><button class="btn primary" type="submit">✏ 쪽지 쓰기</button></form>
      <div class="msg err" id="dmToErr" hidden></div>
      ${th.length ? `<div class="dm-list">${th.map(t => `<a class="dm-row${t.unread ? ' un' : ''}" href="#/messages/${encodeURIComponent(t.nick)}"><b>${esc(t.nick)}</b>${t.unread ? `<i class="nb">${t.unread}</i>` : ''}<span class="dm-last">${t.mine ? '나: ' : ''}${esc(t.last)}</span><span class="nt-d">${ago(t.lastAt)}</span></a>`).join('')}</div>`
        : '<div class="empty">주고받은 쪽지가 없어요. 프로필에서 "쪽지 보내기"를 눌러 보세요 ✉</div>'}
      <p><small>쪽지는 보낸 사람과 받은 사람만 볼 수 있어요. 운영진도 볼 수 없어요. 욕설은 보낼 수 없어요. 쪽지는 <b>30일이 지나면 자동으로 삭제</b>돼요.</small></p>`;
    $('#dmNew').onsubmit = async e => {
      e.preventDefault(); const n = $('#dmTo').value.trim(), er = $('#dmToErr'), btn = e.target.querySelector('[type=submit]');
      const bad = t => { er.textContent = '⚠ ' + t; er.hidden = false; $('#dmTo').focus(); };
      er.hidden = true; if (!n) return bad('받는 사람 닉네임을 입력해 주세요.');
      if (n.toLowerCase() === me.nick.toLowerCase()) return bad('나에게는 쪽지를 보낼 수 없어요.');
      btn.disabled = true;
      try { const real = await A.nickExists(n); if (!real) bad(`"${n}" 닉네임을 가진 회원이 없어요. 닉네임을 다시 확인해 주세요.`); else location.hash = '#/messages/' + encodeURIComponent(real); }
      catch (x) { bad(x.message); }
      btn.disabled = false;
    };
    $('#dmTo').addEventListener('input', () => { $('#dmToErr').hidden = true; });
    setStatus(`대화 ${th.length}명`, '');
  }
  async function viewThread(nick) {
    buildTree('messages'); setAddr('쪽지함\\' + nick, nick + '님과의 쪽지');
    if (nick.toLowerCase() === me.nick.toLowerCase()) { content.innerHTML = '<div class="msg err">나에게는 쪽지를 보낼 수 없어요.</div><a class="btn" href="#/messages">◀ 쪽지함</a>'; return; }
    const real = await A.nickExists(nick);
    if (!real) { content.innerHTML = `<h2 class="page-title">✉ 쪽지</h2><div class="msg err">⚠ "${esc(nick)}" 닉네임을 가진 회원이 없어요.</div><a class="btn" href="#/messages">◀ 쪽지함</a>`; return; }
    nick = real;
    content.innerHTML = `<h2 class="page-title">✉ <a href="#/user/${encodeURIComponent(nick)}">${esc(nick)}</a>님과의 쪽지</h2>
      <div class="dm-thread" id="dmBox"></div>
      <form class="dm-send" id="dmForm"><textarea class="input" id="dmBody" maxlength="500" rows="2" placeholder="쪽지 내용 (Enter 전송, Shift+Enter 줄바꿈)" aria-label="쪽지 내용"></textarea><button class="btn primary" type="submit">보내기</button></form>
      <div class="nt-acts"><a class="btn sm" href="#/messages">◀ 쪽지함</a> <button class="btn sm" id="dmDel" type="button">🗑 대화 지우기</button></div>`;
    const box = $('#dmBox'); let last = '', ids = [];
    const draw = async (force) => {
      let rows; try { rows = await A.dmThread(nick); } catch (e) { box.innerHTML = errBox(e); return; }
      if (rows.readFail && !draw.warned) { draw.warned = 1; toast('⚠ 읽음 처리가 안 됐어요. Supabase에서 v2_community.sql을 다시 실행해 주세요'); }
      const sig = rows.map(r => r.id + (r.read ? 'r' : '')).join(',');
      if (sig === last && !force) return; last = sig; ids = rows.map(r => r.id);
      const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60 || force;
      box.innerHTML = rows.length ? rows.map(r => { const meta = `<div class="dm-meta">${r.mine && !r.read ? '<em class="dm-un" title="상대가 아직 안 읽었어요">1</em>' : ''}<small>${ago(r.created)}</small></div>`;
          return `<div class="dm-b ${r.mine ? 'me' : 'th'}">${r.mine ? meta : ''}<div class="dm-tx">${esc(r.body)}</div>${r.mine ? '' : meta}</div>`; }).join('')
        : '<div class="empty">첫 쪽지를 보내 보세요.</div>';
      if (atEnd) box.scrollTop = box.scrollHeight;
      refreshBadges();
    };
    await draw(true);
    if (dmDraft) { $('#dmBody').value = dmDraft; dmDraft = ''; }
    threadTimer = setInterval(() => { if (!document.hidden) draw(false); }, 6000);
    const send = async () => {
      const ta = $('#dmBody'), v = ta.value.trim(); if (!v) return;
      const btn = $('#dmForm [type=submit]'); btn.disabled = true;
      try { await A.dmSend(nick, v); ta.value = ''; await draw(true); } catch (e) { alertBox(e.message, '쪽지를 보내지 못했어요', '⚠️'); }
      btn.disabled = false; ta.focus();
    };
    $('#dmForm').onsubmit = e => { e.preventDefault(); send(); };
    $('#dmBody').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    $('#dmDel').onclick = async () => {
      if (!ids.length) return;
      if (!(await confirmBox('이 대화를 내 쪽지함에서 지울까요?\n(상대방 쪽지함에서는 그대로 남아요)', '대화 지우기'))) return;
      try { await A.dmDelete(ids); await refreshBadges(); location.hash = '#/messages'; } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
    setStatus(nick + '님과의 쪽지', '');
  }

  /* ---------- 회원정보 수정 (#/account) ---------- */
  async function viewAccount() {
    if (!me) return needMe('회원정보 수정', '⚙');
    buildTree(''); markTab('me'); setAddr('회원정보 수정', '회원정보 수정');
    let info; try { info = await A.accountInfo(); } catch (e) { content.innerHTML = errBox(e); return; }
    const demo = A.mode === 'local';
    const emailLine = info.hasEmail
      ? `<b>${esc(info.email)}</b> ${info.emailOk ? '<span style="color:var(--ok,#080)">✔ 인증됨</span>' : '<span style="color:var(--danger,#c00)">⚠ 인증 전</span>'}`
      : '<span style="color:var(--danger,#c00)">등록된 이메일이 없어요</span>';
    content.innerHTML = `<h2 class="page-title">⚙ 회원정보 수정</h2>
      <div class="panel raised"><table class="tbl"><tbody>
        <tr><th style="width:110px">닉네임</th><td>${esc(info.nick)} <small>(닉네임은 바꿀 수 없어요)</small></td></tr>
        <tr><th>이메일</th><td>${emailLine}</td></tr></tbody></table></div>
      ${info.hasEmail ? '' : '<div class="msg info">📧 이메일을 등록해 두면 비밀번호를 잊었을 때 다시 정할 수 있고, 다음부터 이메일로 로그인할 수 있어요. 아래에서 등록해 주세요.</div>'}

      <div class="sub-title"><span>🔔 알림</span></div><div id="pushBox"></div>
      <div class="sub-title"><span>📧 이메일 ${info.hasEmail ? '변경' : '등록'}</span></div>
      <form class="panel raised" id="acEmail" autocomplete="off">
        <div class="field"><label for="ac-ne">새 이메일</label><input id="ac-ne" class="input" type="email" name="email" maxlength="120" required></div>
        <div class="field"><label for="ac-ep">현재 비밀번호</label><input id="ac-ep" class="input" type="password" name="pw" autocomplete="current-password" required></div>
        <div class="msg err" id="acEmailErr" hidden></div>
        <button class="btn primary" type="submit">인증번호 보내기</button>
        <small>새 이메일로 인증번호가 가요. 번호를 입력하면 바뀌어요.</small>
      </form>
      <div id="acPend"></div>

      <div class="sub-title"><span>🔑 비밀번호 변경</span></div>
      <form class="panel raised" id="acPw" autocomplete="off">
        <div class="field"><label for="ac-cp">현재 비밀번호</label><input id="ac-cp" class="input" type="password" name="cur" autocomplete="current-password" required></div>
        <div class="field"><label for="ac-np">새 비밀번호 (6자 이상)</label><input id="ac-np" class="input" type="password" name="np" autocomplete="new-password" required></div>
        <div class="field"><label for="ac-np2">새 비밀번호 확인</label><input id="ac-np2" class="input" type="password" name="np2" autocomplete="new-password" required></div>
        <div class="msg err" id="acPwErr" hidden></div>
        <button class="btn primary" type="submit">비밀번호 바꾸기</button>
      </form>

      <div class="sub-title"><span>🚪 회원 탈퇴</span></div>
      <form class="panel raised" id="acBye" autocomplete="off">
        <p style="margin:0 0 8px;line-height:1.6">탈퇴하면 <b>계정과 내 정보(이메일·쪽지·포인트·아이템 등)가 바로 삭제</b>되고 되돌릴 수 없어요. 내 <b>댓글은 함께 삭제</b>돼요.</p>
        <label class="check"><input type="checkbox" name="delPosts"> 내가 쓴 <b>글도 함께 삭제</b>해요 <small>(체크하지 않으면 글은 닉네임이 “탈퇴한 회원”으로 바뀌어 남아요)</small></label>
        <div class="field" style="margin-top:8px"><label for="ac-bp">비밀번호 확인</label><input id="ac-bp" class="input" type="password" name="pw" autocomplete="current-password" required></div>
        <label class="check"><input type="checkbox" name="ok" required> 위 내용을 확인했고 탈퇴해요</label>
        <div class="msg err" id="acByeErr" hidden></div>
        <button class="btn danger" type="submit">회원 탈퇴</button>
      </form>
      <p><a class="btn" href="#/me">◀ 내 프로필</a></p>`;
    const showErr = (id, t) => { const e = $(id); e.textContent = t ? '⚠ ' + t : ''; e.hidden = !t; };
    const pend = p => {
      const box = $('#acPend'); if (!p) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="panel raised" id="acConfirm"><b>📨 ${esc(p.pending)}</b> 로 인증번호를 보냈어요.
        ${demo ? `<div class="msg info" style="margin:6px 0">데모 모드라 메일은 안 가요. 인증번호: <b style="font-size:16px;letter-spacing:2px">${esc(p.demoCode)}</b></div>`
          : '<br><small>메일에 적힌 인증번호를 아래에 입력하면 이메일이 바뀌어요.</small>'}
        <form class="row" id="acCode" style="margin-top:6px"><input class="input" name="code" inputmode="numeric" maxlength="10" placeholder="인증번호" aria-label="인증번호" style="max-width:160px"><button class="btn" type="submit">확인</button></form>
        <div class="msg err" id="acCodeErr" hidden></div></div>`;
      $('#acCode').onsubmit = async e => {
        e.preventDefault(); showErr('#acCodeErr', '');
        try { await A.confirmEmailChange(e.target.code.value); toast('이메일을 바꿨어요.'); route(); } catch (x) { showErr('#acCodeErr', x.message); }
      };
    };
    if (info.pendingEmail) pend({ pending: info.pendingEmail, demoCode: info.demoCode });
    $('#acEmail').onsubmit = async e => {
      e.preventDefault(); showErr('#acEmailErr', ''); const f = e.target, b = f.querySelector('[type=submit]'); b.disabled = true;
      try { const r = await A.changeEmail(f.pw.value, f.email.value); f.pw.value = ''; pend(r); toast('인증번호를 보냈어요.'); }
      catch (x) { showErr('#acEmailErr', x.message); }
      b.disabled = false;
    };
    $('#acPw').onsubmit = async e => {
      e.preventDefault(); showErr('#acPwErr', ''); const f = e.target, b = f.querySelector('[type=submit]');
      if (f.np.value !== f.np2.value) return showErr('#acPwErr', '새 비밀번호 확인이 달라요.');
      b.disabled = true;
      try { await A.changePassword(f.cur.value, f.np.value); f.reset(); await alertBox('비밀번호를 바꿨어요.\n다음부터 새 비밀번호로 로그인해 주세요.', '완료', '✅'); }
      catch (x) { showErr('#acPwErr', x.message); }
      b.disabled = false;
    };
    $('#acBye').onsubmit = async e => {
      e.preventDefault(); showErr('#acByeErr', ''); const f = e.target, b = f.querySelector('[type=submit]');
      if (!(await confirmBox('정말 탈퇴할까요?\n탈퇴하면 되돌릴 수 없어요.', '회원 탈퇴', '탈퇴', '취소'))) return;
      b.disabled = true;
      try { await A.deleteMyAccount(f.pw.value, f.delPosts.checked); me = null; refreshUser(); await alertBox('탈퇴했어요.\n그동안 덕질역을 이용해 주셔서 고마워요.', '탈퇴 완료', '👋'); location.hash = '#/'; route(); }
      catch (x) { showErr('#acByeErr', x.message); b.disabled = false; }
    };
    if (window.Push) Push.panel($('#pushBox'), me);
    setStatus('회원정보 수정', '');
  }
  /* 메일 링크를 눌러 돌아왔을 때 / 비밀번호 재설정 링크로 들어왔을 때 */
  async function handleAuthReturn() {
    const r = A.authReturn && A.authReturn(); if (!r) return;
    if (r.error) return alertBox('인증 링크가 만료됐거나 이미 쓴 링크예요.\n로그인 창에서 인증 메일을 다시 받아 주세요.', '링크를 쓸 수 없어요', '⚠️');
    if (r.type === 'recovery' && me) {
      const f = await newPasswordDialog(); if (f) toast('새 비밀번호로 바꿨어요.'); return;
    }
    if (r.type === 'signup' && me) toast('🎉 이메일 인증이 끝났어요. 환영해요!');
    else if (r.type === 'email_change') toast('✔ 이메일이 바뀌었어요.');
  }
  function newPasswordDialog() {
    return new Promise(res => {
      const w = K.openWin({ title: '새 비밀번호 정하기', width: 340, onClose: () => res(false),
        html: `<form class="dlg-body" style="display:block"><p style="margin:0 0 8px">새 비밀번호를 입력해 주세요.</p>
          <div class="field"><label for="np-1">새 비밀번호 (6자 이상)</label><input id="np-1" class="input" type="password" name="p1" autocomplete="new-password" required></div>
          <div class="field"><label for="np-2">새 비밀번호 확인</label><input id="np-2" class="input" type="password" name="p2" autocomplete="new-password" required></div>
          <div class="err-line" role="alert"></div>
          <div class="dlg-btns"><button class="btn primary" type="submit">바꾸기</button></div></form>` });
      const f = w.el.querySelector('form'); f.p1.focus();
      f.onsubmit = async e => {
        e.preventDefault(); const er = f.querySelector('.err-line'); er.textContent = '';
        try { if (f.p1.value !== f.p2.value) throw new Error('비밀번호 확인이 달라요.'); await A.setNewPassword(f.p1.value); res(true); w.close(true); }
        catch (x) { er.textContent = '⚠ ' + x.message; }
      };
    });
  }

  /* ---------- 로그인 · 회원가입 바로가기 (#/login, #/signup) ---------- */
  async function viewAuth(kind) {
    const signup = kind === 'signup', label = signup ? '회원가입' : '로그인', icon = signup ? '📝' : '🔑';
    buildTree(''); setAddr(label, label);
    if (me) {
      content.innerHTML = `<h2 class="page-title">${icon} ${label}</h2><div class="msg ok">✅ 이미 <b>${esc(me.nick)}</b> 님으로 로그인되어 있어요.</div>`;
      await alertBox(`이미 로그인되어 있어요.\n지금 계정: ${me.nick}\n\n${signup ? '다른 계정으로 가입하려면' : '다른 계정으로 로그인하려면'} 먼저 로그아웃해 주세요.`, '이미 로그인됨', 'ℹ️');
      if (/^#\/(login|signup)\/?$/.test(location.hash)) location.hash = '#/';
      return;
    }
    content.innerHTML = `<h2 class="page-title">${icon} ${label}</h2><div class="msg info">${signup ? '이메일 · 닉네임 · 비밀번호로 가입해요. 가입하면 이메일로 인증번호가 가고, 번호를 입력하면 가입이 끝나요.' : '이메일(또는 예전에 만든 닉네임)과 비밀번호로 로그인해요.'}</div>
      <p><button class="btn primary" id="authBtn" type="button">${icon} ${label} 창 열기</button> <a class="btn" href="#/">🏠 홈으로</a></p>`;
    setStatus(label, '');
    const open = async () => {
      const u = await loginDialog({ signup: true, mode: kind });
      if (u) { await A.refresh(); me = A.me(); applyTheme(me.theme || 'station'); refreshUser(); location.hash = '#/'; }
    };
    $('#authBtn').onclick = open;
    open();
  }
  function notFound() {
    setAddr('없는 페이지', '찾을 수 없음');
    content.innerHTML = `<div class="msg err">🚧 이 승강장은 아직 공사 중이에요. 글이 지워졌거나 주소가 잘못됐어요.</div><a class="btn" href="#/">🏠 홈으로</a>`;
  }

  /* ---------- 라우터 ---------- */
  async function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const [p, a, b] = parts;
    if (previewing) { applyTheme(me && me.theme || previewing); previewing = null; }
    if (threadTimer) { clearInterval(threadTimer); threadTimer = null; }
    content.innerHTML = '<div class="loading">⏳ 열차 들어오는 중…</div>';
    markTab(!p || p === 'home' ? 'home' : '');
    try {
      if (!p || p === 'home') { buildTree('home'); await viewHome(); }
      else if (p === 'board') { buildTree('board:' + a); await viewBoard(a, b); }
      else if (p === 'post') await viewPost(a);
      else if (p === 's') { location.replace('#/post/' + encodeURIComponent(longId(a || ''))); return; }
      else if (p === 'market') await window.Market.view(a, b);
      else if (p === 'guestbook') await viewGuestbook();
      else if (p === 'write') await viewWrite(a, null);
      else if (p === 'edit') await viewWrite(null, a);
      else if (p === 'user' || p === 'author') await viewUser(a);
      else if (p === 'me' && a === 'doc') await viewBioEdit();
      else if (p === 'me') {
        if (!me) { buildTree(''); markTab('me'); content.innerHTML = '<div class="msg info">🔒 로그인하면 내 프로필과 노선도를 볼 수 있어요.</div><button class="btn primary" id="meLogin" type="button">로그인 / 가입</button>'; $('#meLogin').onclick = () => needLogin(); }
        else await viewUser(me.nick);
      }
      else if (p === 'shop') await viewShop(a);
      else if (p === 'grades') viewGrades();
      else if (p === 'search') { buildTree(''); await viewSearch(a, 'q'); }
      else if (p === 'tag') { buildTree(''); await viewSearch(a, 'tag'); }
      else if (p === 'notifications') await viewNotifications();
      else if (p === 'messages') await viewMessages(a);
      else if (p === 'login' || p === 'signup') await viewAuth(p);
      else if (p === 'account') await viewAccount();
      else if (p === 'font') await viewFont();
      else if (p === 'checkin') await viewCheckin();
      else if (p === 'bookmarks') await viewBookmarks();
      else if (p === 'inquiry') { buildTree('inquiry'); await viewInquiry(); }
      else if (p === 'links') { buildTree('links'); viewLinks(); }
      else if (p === 'about') { buildTree('about'); viewAbout(); }
      else if (p === 'privacy') { buildTree(''); viewPrivacy(); }
      else if (p === 'policy') { buildTree(''); viewPolicy(); }
      else if (p === 'mymap') await viewMyMap();
      else { buildTree(''); notFound(); }
      content.scrollTop = 0;
    } catch (e) { console.error(e); content.innerHTML = errBox(e); }
  }


  /* ---------- 위쪽 메뉴: 카테고리별 드롭다운 ---------- */
  function buildMenubar() {
    const body = $('#drBody'); if (!body) return;
    const adm = [['📊', '대시보드', ''], ['🗓', '회의실', 'meetings'], ['🛋', '휴게실', 'lounge'], ['📮', '문의/건의', 'inquiry'], ['👥', '회원', 'users'], ['📝', '글 관리', 'posts']];
    const groups = [
      { t: '게시판', k: 'board', open: true, items: [['✏️', '글쓰기', '#/write'], ...C.boards.map(b => [b.icon, b.name, '#/board/' + b.id]), ['📒', '방명록', '#/guestbook'], ['🎲', '랜덤 글 보기', '', 'random']] },
      { t: '내 공간', k: 'me', nb: 'all', open: true, items: me
        ? [['👤', '내 프로필', '#/me'], ['✉', '쪽지함', '#/messages', '', 'dm'], ['🔔', '알림', '#/notifications', '', 'notif'], ['📅', '출석부', '#/checkin'], ['🗺️', '내 노선도', '#/mymap'], ['⭐', '내 스크랩', '#/bookmarks'], ['⚙', '회원정보 수정', '#/account']]
        : [['🔑', '로그인', '#/login'], ['📝', '회원가입', '#/signup']] },
      { t: '장터', k: 'market', items: [['🛒', '중고거래 장터', '#/market'], ['✏️', '판매글 쓰기', '#/market/new'], ['📦', '내 판매글', '#/market/my']] },
      { t: '꾸미기', k: 'style', items: [['🛍', '상점', '#/shop'], ['🎨', '테마 변경', '#/shop/themes'], ['🚄', '등급 안내', '#/grades'], ['🔤', '서울교덕체', '#/font']] },
      { t: '안내', k: 'info', items: [['📮', '문의·건의', '#/inquiry'], ['📡', '서비스 상태', 'status.html'], ['🌐', '링크 모음', '#/links'], ['ℹ️', '덕질역 소개', '#/about'], ['⚖️', '운영정책·신고 처리', '#/policy'], ['🔒', '개인정보처리방침', '#/privacy']] }
    ];
    if (isStaff()) groups.push({ t: '🛠 운영진', k: 'adm', items: adm.map(([i, t, h]) => [i, t, 'admin.html#/' + h]).concat([['🛠', '운영진 센터 열기', 'admin.html']]) });
    const link = it => `<a class="dr-link" role="menuitem" href="${it[3] === 'random' ? 'javascript:void 0' : esc(it[2])}"${it[3] ? ` data-act="${it[3]}"` : ''}><span class="dr-ic">${it[0]}</span>${esc(it[1])}${it[4] ? `<i class="nb" data-nb="${it[4]}" hidden></i>` : ''}</a>`;
    body.innerHTML = `<a class="dr-link dr-home" href="#/"><span class="dr-ic">🏠</span>홈</a>`
      + (C.railUrl ? `<a class="dr-link" href="${esc(C.railUrl)}"><span class="dr-ic">🚆</span>열차 편성 (RAIL)</a>` : '')
      + groups.map(g => `<details class="dr-grp"${g.open || isOpenGroup(g.k) ? ' open' : ''} data-g="${g.k}"><summary>${esc(g.t)}${g.nb ? '<i class="nb" data-nb="all" hidden></i>' : ''}<i class="dr-caret" aria-hidden="true">▾</i></summary><div class="dr-items">${g.items.map(link).join('')}</div></details>`).join('')
      + (me ? '<button class="dr-link dr-out" type="button" id="drLogout"><span class="dr-ic">🔓</span>로그아웃</button>' : '');
    body.querySelectorAll('.dr-link[data-act="random"]').forEach(a => a.addEventListener('click', () => { setDrawer(false); randomPost(); }));
    const lo = $('#drLogout'); if (lo) lo.onclick = () => { setDrawer(false); doLogout(); };
    body.querySelectorAll('a.dr-link').forEach((a, i) => { a.style.setProperty('--i', Math.min(i, 14)); });
    paintBadges();
  }
  const isOpenGroup = k => { const h = location.hash; return (k === 'market' && /^#\/market/.test(h)) || (k === 'style' && /^#\/(shop|grades|font)/.test(h)); };

  /* ---------- 햄버거 메뉴(서랍) ---------- */
  function setDrawer(open) {
    const d = $('#drawer'), sc = $('#scrim'), b = $('#bMenu'); if (!d) return;
    d.classList.toggle('open', open); d.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (sc) { if (open) sc.hidden = false; sc.classList.toggle('on', open); if (!open) setTimeout(() => { if (!d.classList.contains('open')) sc.hidden = true; }, 300); }
    if (b) { b.classList.toggle('x', open); b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); }
    document.documentElement.classList.toggle('no-scroll', open);
    if (open) { const f = d.querySelector('a.dr-link, summary'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 120); } else if (b && document.activeElement && d.contains(document.activeElement)) b.focus();
  }
  function bindDrawer() {
    if (bindDrawer.done) return; bindDrawer.done = true;
    $('#bMenu').onclick = () => setDrawer(!$('#drawer').classList.contains('open'));
    $('#dClose').onclick = () => setDrawer(false);
    $('#scrim').onclick = () => setDrawer(false);
    $('#drawer').addEventListener('click', e => { if (e.target.closest('a[href]')) setDrawer(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { setDrawer(false); const h = $('.site-head'); if (h) h.classList.remove('search-open'); } });
    window.addEventListener('hashchange', () => setDrawer(false));
  }

  /* ---------- 사용자 ---------- */
  /* 정지 중이면 모든 화면 맨 위에 안내를 보여줘요 (화면이 바뀌어도 다시 붙여요) */
  function drawBan() {
    let b = $('#banBar');
    if (!me || !me.bannedUntil) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'banBar'; b.className = 'msg err'; b.setAttribute('role', 'alert'); }
    b.innerHTML = `⛔ <b>계정이 정지된 상태</b>예요. <b>${fmtDate(me.bannedUntil)}</b>까지 글·댓글·쪽지·장터 글쓰기가 막혀요 (읽기는 돼요).${me.banReason ? ` 사유: ${esc(me.banReason)}.` : ''} <a href="#/policy">운영정책</a> · 이의가 있으면 <a href="#/inquiry">문의·건의</a>`;
    if (content.firstChild !== b) { content.insertBefore(b, content.firstChild); window.scrollTo(0, 0); }
  }
  new MutationObserver(() => { if (me && me.bannedUntil && (!content.firstChild || content.firstChild.id !== 'banBar')) drawBan(); }).observe(content, { childList: true });
  let consentAsked = false;
  function askConsent() {
    if (consentAsked || !me || me.consent !== false || !K.consentDialog) return;
    consentAsked = true;
    setTimeout(async () => { try { if (await K.consentDialog()) { await A.refresh(); me = A.me(); toast('동의 내용을 저장했어요. 고마워요!'); } } catch (e) {} }, 800);
  }
  function refreshUser() {
    $('#btnLogin').textContent = me ? '👤 ' + me.nick : '👤 로그인';
    askConsent(); drawBan();
    const fv = $('#footVisit'); if (fv) fv.textContent = `오늘 ${visit.today} · 전체 ${visit.total}`;
    K.StaffChat.update(me);
    buildMenubar();
    refreshBadges();
  }
  window.addEventListener('deokjil-role', async () => { try { await A.refresh(); } catch (e) {} me = A.me(); refreshUser(); route(); });
  async function doLogout() {
    if (!(await confirmBox('로그아웃할까요?', '로그아웃'))) return;
    await A.logout(); me = null;
    /* 로그아웃하면 내 계정 테마·야간 설정·쓰던 글 임시저장은 이 기기에서 지워요 (기본 테마로 돌아가요) */
    try {
      const dark = !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
      applyTheme(dark ? 'ios-dark' : 'station');
      ['deokjil_theme', 'deokjil_mode'].forEach(k => localStorage.removeItem(k));
      Object.keys(localStorage).filter(k => /draft/i.test(k)).forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    previewing = null; refreshUser(); location.hash = '#/'; route();
  }
  async function randomPost() {
    const l = (await A.listPosts()).filter(p => p.status === 'ok'); if (!l.length) return alertBox('아직 글이 없어요.');
    location.hash = '#/post/' + l[Math.floor(Math.random() * l.length)].id;
  }
  /* ---------- 위쪽 버튼 ---------- */
  function bindChrome() {
    bindDrawer();
    $('#bSearch').onclick = () => { const h = $('.site-head'); h.classList.toggle('search-open'); if (h.classList.contains('search-open')) { $('#q').focus(); } };
    $('#btnLogin').onclick = () => (me ? (location.hash = '#/me') : needLogin());
    $('#sform').onsubmit = e => { e.preventDefault(); const q = $('#q').value.trim(); if (q) { location.hash = '#/search/' + encodeURIComponent(q); $('.site-head').classList.remove('search-open'); } };
  }

  content.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]'); if (!g) return;
    const el = document.getElementById(g.dataset.goto); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  content.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-goto]')) e.target.click(); });

  /* ---------- 시작 ---------- */
  (async function init() {
    K.mountPrefs($('.site-foot')); bindChrome(); buildMenubar(); buildTree('home');
    try {
      await A.init(); me = A.me();
      if (me && me.theme && !localStorage.getItem('deokjil_mode')) applyTheme(me.theme);
      settings = await A.getSettings();
      visit = await A.hitVisit();
    } catch (e) {
      console.error(e); content.innerHTML = errBox(e) + '<div class="msg info">config.js의 Supabase 설정을 확인해 주세요. 비워 두면 로컬 데모 모드로 열려요.</div>';
      refreshUser(); return;
    }
    if (A.fallback) console.warn('Supabase 라이브러리를 불러오지 못해 로컬 데모 모드로 열었어요.');
    refreshUser();
    if (me && window.Push) Push.sync();
    window.addEventListener('hashchange', route);
    route();
    handleAuthReturn();
  })();
})();
