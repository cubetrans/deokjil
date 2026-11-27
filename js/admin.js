/* ==========================================================
   admin.js — 덕질역 스튜디오 (관리자 센터)
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG, A = window.API;
  const $ = (s, r = document) => r.querySelector(s);
  const { esc, fmtDate, fmtShort, renderBody, openWin, alertBox, confirmBox, askText, prepareImage } = window.Common;
  const root = $('#adm-root');
  let me = null, main = null, nav = null;
  const boardOf = id => C.boards.find(b => b.id === id);
  const isAdm = () => !!me && me.role === 'admin';
  const roleMark = r => r === 'admin' ? '👑 ' : r === 'author' ? '✍ ' : '';
  const setStatus = () => {};
  const errBox = e => `<div class="msg err">😵 ${esc(e && e.message || e)}</div>`;

  /* ---------- 로그인 게이트 ---------- */
  const NICKS = ['서울교덕', '지철덕'];
  const INIT_PW = '123456';
  /* 비밀번호만 입력 → 비밀번호로 누구인지 구분. (초기 비밀번호 123456이 겹치면 이름을 골라요) */
  function pwDialog() {
    return new Promise(res => {
      let val = null;
      const w = openWin({
        title: '🔑 운영진 로그인', width: 340, onClose: () => res(val),
        html: `<form class="dlg-body" style="display:block" autocomplete="off">
          <div class="field"><label for="pwIn">비밀번호</label><input class="input" id="pwIn" name="pw" type="password" autocomplete="current-password" required></div>
          <div class="err-line" role="alert" style="min-height:1.4em;color:#c0392b"></div>
          <div class="dlg-btns"><button class="btn primary" type="submit">들어가기</button><button class="btn" type="button" data-c>취소</button></div></form>`
      });
      const body = w.el.querySelector('.dlg-body');
      const f = () => w.el.querySelector('form'), err = () => w.el.querySelector('.err-line');
      const pick = text => new Promise(ok => {
        body.innerHTML = `<p>${text}</p><div class="dlg-btns">${NICKS.map(n => `<button class="btn primary" type="button" data-n="${n}">${n}</button>`).join('')}</div><div class="err-line" role="alert" style="min-height:1.4em;color:#c0392b"></div>`;
        body.querySelectorAll('[data-n]').forEach(b => b.onclick = () => ok(b.dataset.n));
      });
      const finish = async (user, pw) => { if (user && pw === INIT_PW) await mustChange(user); val = A.me(); w.close(); };
      const bind = () => {
        const form = f(); form.pw.focus();
        form.querySelector('[data-c]').onclick = () => w.close();
        form.onsubmit = async e => {
          e.preventDefault(); err().textContent = '';
          const pw = form.pw.value;
          if (pw.length < 6) { err().textContent = '비밀번호는 6글자 이상이에요.'; return; }
          try {
            const ok = [];
            for (const n of NICKS) { try { await A.login(n, pw); ok.push(n); } catch (x) {} }
            let who = null;
            if (ok.length === 2) who = await pick('초기 비밀번호가 같아요. 누구신가요?');
            else if (ok.length === 1) who = ok[0];
            else if (pw === INIT_PW) {
              who = await pick('처음이시네요! 누구신가요?');
              try { await A.signup(who, INIT_PW); } catch (x) { body.querySelector('.err-line').textContent = /이미 사용|exists|registered/i.test(x.message) ? '이 이름은 이미 다른 비밀번호로 만들어져 있어요.' : x.message; return; }
            } else { err().textContent = '비밀번호가 맞지 않아요.'; return; }
            const u = ok.length ? await A.login(who, pw) : A.me();
            await finish(u, pw);
          } catch (x) { err().textContent = x.message; }
        };
      };
      bind();
    });
  }
  /* 초기 비밀번호로 들어왔으면 내 비밀번호로 바꾸기 (바꾸기 전엔 못 들어가요) */
  async function mustChange(user) {
    const done = await pwChangeDialog({ force: true, oldPw: INIT_PW });
    if (!done) await A.logout();
  }
  function pwChangeDialog({ force = false, oldPw = '' } = {}) {
    return new Promise(res => {
      let done = false;
      const w = openWin({
        title: force ? '🔐 내 비밀번호 정하기' : '🔑 비밀번호 바꾸기', width: 360, onClose: () => res(done),
        html: `<form class="dlg-body" style="display:block" autocomplete="off">
          ${force ? '<p>지금은 초기 비밀번호(123456)예요.<br><b>나만의 비밀번호</b>를 정해야 들어갈 수 있어요.</p>' : '<div class="field"><label>현재 비밀번호</label><input class="input" name="old" type="password" autocomplete="current-password" required></div>'}
          <div class="field"><label>새 비밀번호 (6글자 이상)</label><input class="input" name="n1" type="password" autocomplete="new-password" required></div>
          <div class="field"><label>새 비밀번호 한 번 더</label><input class="input" name="n2" type="password" autocomplete="new-password" required></div>
          <div class="err-line" role="alert" style="min-height:1.4em;color:#c0392b"></div>
          <div class="dlg-btns"><button class="btn primary" type="submit">바꾸기</button><button class="btn" type="button" data-c>${force ? '로그아웃' : '취소'}</button></div></form>`
      });
      const f = w.el.querySelector('form'), err = f.querySelector('.err-line');
      f.querySelector('[data-c]').onclick = () => w.close();
      f.onsubmit = async e => {
        e.preventDefault(); err.textContent = '';
        if (f.n1.value !== f.n2.value) { err.textContent = '새 비밀번호가 서로 달라요.'; return; }
        try { await A.changePassword(force ? oldPw : f.old.value, f.n1.value); done = true; w.close(); if (!force) alertBox('비밀번호를 바꿨어요. 이제부터 새 비밀번호로 들어와요.', '완료', '✅'); }
        catch (x) { err.textContent = x.message; }
      };
    });
  }

  function gate(kind) {
    root.innerHTML = `<div class="adm-main sunken" style="margin:3px;text-align:center;padding-top:40px">
      <h2 class="page-title" style="border:0">🔒 글쓴이 전용 구역</h2>
      ${kind === 'denied'
        ? `<p><b>${esc(me.nick)}</b> 계정은 글쓴이가 아니에요.<br><small>이 센터는 서울교덕·지철덕 계정만 들어올 수 있어요.</small></p>`
        : `<p>서울교덕·지철덕만 들어올 수 있어요.<br><small>비밀번호 6자리를 입력해 주세요.</small></p>`}
      <p><button class="btn primary" id="gLogin" type="button">${kind === 'denied' ? '다시 로그인' : '🔑 운영진 로그인'}</button>
      <a class="btn" href="index.html">사이트로 돌아가기</a></p></div>`;
    $('#gLogin').onclick = async () => {
      if (kind === 'denied') { await A.logout(); }
      const u = await pwDialog();
      if (A.me() || kind === 'denied') start();
    };
    setStatus('로그인이 필요해요', '');
  }

  /* ---------- 틀 ---------- */
  const NAV = [
    ['#/', '📊', '대시보드'], ['#/posts', '📝', '글 관리'], ['#/new', '✏️', '새 글 쓰기'], ['#/boards', '🗂️', '게시판'],
    ['#/comments', '💬', '댓글 관리', 'pending'], ['#/memo', '📨', '쪽지'], ['#/design', '🎨', '디자인'], ['#/code', '🧩', '코드'], ['#/settings', '⚙️', '설정']
  ];
  const NAV_AUTHOR = [['#/posts', '📝', '내 글'], ['#/new', '✏️', '새 글 쓰기']];
  function buildShell() {
    root.innerHTML = `<nav class="adm-nav raised" aria-label="관리자 메뉴"></nav><main class="adm-main sunken" tabindex="-1"></main>`;
    nav = $('.adm-nav'); main = $('.adm-main');
  }
  async function countNewMemos() {
    const seen = +(localStorage.getItem('deokjil_memo_seen_' + me.id) || 0);
    const memos = await A.listMemos(); let n = 0;
    memos.forEach(m => { if (m.authorId !== me.id && new Date(m.created) > seen) n++; (m.comments || []).forEach(c => { if (c.authorId !== me.id && new Date(c.created) > seen) n++; }); });
    return n;
  }
  function drawNav(active, pending, memoNew) {
    nav.innerHTML = (isAdm() ? NAV : NAV_AUTHOR).map(([h, ic, t, badge]) => {
      const key = h.replace('#/', '').split('/')[0];
      return `<a class="ti${key === active ? ' on' : ''}" href="${h}"><span>${ic} ${t}</span>${badge && pending ? `<span class="badge">${pending}</span>` : ''}${h === '#/memo' && memoNew ? `<span class="badge">${memoNew}</span>` : ''}</a>`;
    }).join('');
  }

  /* ---------- 라우터 ---------- */
  async function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const [p, a] = parts;
    if (!isAdm() && !['posts', 'new', 'edit'].includes(p || '')) { location.hash = '#/posts'; return; }
    main.innerHTML = '<div class="loading">⏳ 불러오는 중…</div>';
    let pending = 0, memoNew = 0;
    if (isAdm()) { try { pending = (await A.stats()).pending; } catch (e) {} try { memoNew = await countNewMemos(); } catch (e) {} }
    const active = p === 'edit' ? 'posts' : (p || '');
    drawNav(active, pending, memoNew);
    try {
      if (!p) await viewDash();
      else if (p === 'posts') await viewPosts(a);
      else if (p === 'new') await viewEditor(null, a);
      else if (p === 'edit') await viewEditor(a);
      else if (p === 'boards') await viewBoards();
      else if (p === 'memo') await viewMemo();
      else if (p === 'comments') await viewComments(a || (pending ? 'pending' : 'all'));
      else if (p === 'design') await window.AdminCode.viewDesign(main);
      else if (p === 'code') await window.AdminCode.viewCode(main);
      else if (p === 'settings') await viewSettings();
      else main.innerHTML = '<div class="msg err">없는 메뉴예요.</div>';
      main.scrollTop = 0;
    } catch (e) { console.error(e); main.innerHTML = errBox(e); }
  }
  async function reloadNavBadge() { try { const s = await A.stats(); drawNav(location.hash.replace(/^#\/?/, '').split('/')[0] || '', s.pending); } catch (e) {} }

  /* ---------- 대시보드 ---------- */
  async function viewDash() {
    const [s, posts] = await Promise.all([A.stats(), A.listPosts({ all: true })]);
    const max = Math.max(1, ...s.days.map(d => d.count));
    const top = [...posts].sort((a, b) => b.views - a.views).slice(0, 5);
    const titleOf = {}; posts.forEach(p => { titleOf[p.id] = p.title; });
    main.innerHTML = `
      <h2 class="page-title">📊 대시보드</h2>
      <div class="cards">
        <div class="card raised"><div class="n">${s.today}</div><div class="l">오늘 방문</div></div>
        <div class="card raised"><div class="n">${s.total}</div><div class="l">전체 방문</div></div>
        <div class="card raised"><div class="n">${s.posts}</div><div class="l">글</div></div>
        <div class="card raised"><div class="n">${s.views}</div><div class="l">총 조회수</div></div>
      </div>
      <div class="sub-title"><span>📈 최근 7일 방문자</span></div>
      <div class="bars sunken" role="img" aria-label="최근 7일 방문자 막대 그래프">${s.days.map(d =>
        `<div class="bar"><i style="height:${Math.round(d.count / max * 100)}%"></i><span>${d.count}</span><span>${d.day.slice(5).replace('-', '/')}</span></div>`).join('')}</div>
      <div class="cols" style="margin-top:12px">
        <div><div class="sub-title"><span>🔥 조회수 TOP5</span></div>
          <table class="tbl"><tbody>${top.length ? top.map(p => `<tr><td class="t"><a href="#/edit/${esc(p.id)}">${esc(p.title)}</a></td><td class="c">👁 ${p.views}</td></tr>`).join('') : '<tr><td>아직 글이 없어요</td></tr>'}</tbody></table></div>
      </div>`;
    setStatus('대시보드', '');
  }

  /* ---------- 글 관리 ---------- */
  async function viewPosts(board) {
    let list = await A.listPosts({ all: true });
    if (!isAdm()) list = list.filter(p => p.authorId === me.id);
    const total = list.length;
    if (board && board !== 'all') list = list.filter(p => p.board === board);
    list.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.created) - new Date(a.created)));
    main.innerHTML = `
      <h2 class="page-title">📝 ${isAdm() ? '글 관리' : '내 글'}</h2>
      <div class="row" style="margin-bottom:10px"><select class="input" id="bf" style="width:auto" aria-label="게시판 필터">
        <option value="all">전체 게시판 (${total})</option>${C.boards.map(b => `<option value="${b.id}"${board === b.id ? ' selected' : ''}>${b.icon} ${esc(b.name)}</option>`).join('')}</select>
        <a class="btn primary" href="#/new${board && board !== 'all' ? '/' + board : ''}">✏️ 새 글 쓰기</a></div>
      ${list.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>제목</th><th class="hide-m">게시판</th>${isAdm() ? '<th class="hide-m">글쓴이</th>' : ''}<th class="hide-m">작성일</th><th>👁</th><th>💙</th><th>💬</th><th>관리</th></tr></thead><tbody>${list.map(p => `<tr>
        <td class="t">${p.pinned ? '📌 ' : ''}${p.scheduled ? `<span class="sched" title="공개 예정">⏰ ${fmtShort(p.publishAt)} 공개</span> ` : ''}<a href="#/edit/${esc(p.id)}">${esc(p.title)}</a></td>
        <td class="c hide-m">${esc((boardOf(p.board) || {}).name || p.board)}</td>${isAdm() ? `<td class="c hide-m">${esc(p.author || '-')}</td>` : ''}<td class="c hide-m">${fmtShort(p.created)}</td>
        <td class="c">${p.views}</td><td class="c">${p.likes}</td><td class="c">${p.comments}</td>
        <td class="c"><a class="btn sm" href="index.html#/post/${esc(p.id)}" target="_blank" rel="noopener">보기</a>
          ${isAdm() ? `<button class="btn sm" type="button" data-pin="${esc(p.id)}">${p.pinned ? '고정 해제' : '📌 고정'}</button>` : ''}
          <button class="btn sm danger" type="button" data-del="${esc(p.id)}">삭제</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">글이 없어요. 새 글을 써 보세요!</div>'}`;
    $('#bf').onchange = e => { location.hash = '#/posts/' + e.target.value; };
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

  /* ---------- 글쓰기/수정 ---------- */
  const toLocalInput = iso => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  async function viewEditor(id, presetBoard) {
    let p = { board: boardOf(presetBoard) ? presetBoard : C.boards[1] ? C.boards[1].id : C.boards[0].id, title: '', body: '', tags: [], pinned: false };
    if (id) {
      p = await A.getPost(id, false);
      if (!p) { main.innerHTML = '<div class="msg err">글을 찾을 수 없어요.</div>'; return; }
      if (!isAdm() && p.authorId !== me.id) { main.innerHTML = '<div class="msg err">내가 쓴 글만 고칠 수 있어요.</div>'; return; }
    } else if (!isAdm() && p.board === 'notice') { p.board = (C.boards.find(b => b.id !== 'notice') || C.boards[0]).id; }
    const draftKey = 'deokjil_draft_' + (id || 'new');
    if (!id) { try { const d = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (d && (d.title || d.body)) p = Object.assign(p, d); } catch (e) {} }
    main.innerHTML = `
      <h2 class="page-title">${id ? '✏️ 글 수정' : '✏️ 새 글 쓰기'}</h2>
      <form id="ef">
        <div class="row" style="align-items:flex-end">
          <div class="field" style="flex:1;min-width:150px"><label for="eb">게시판</label><select class="input" id="eb" name="board">${C.boards.filter(b => isAdm() || b.id !== 'notice').map(b => `<option value="${b.id}"${b.id === p.board ? ' selected' : ''}>${b.icon} ${esc(b.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="ep">⏰ 예약 발행 <small>(비우면 바로 공개)</small></label><input class="input" type="datetime-local" id="ep" name="publishAt" value="${p.publishAt ? toLocalInput(p.publishAt) : ''}"></div>
          ${isAdm() ? `<div class="field"><label class="check"><input type="checkbox" name="pinned"${p.pinned ? ' checked' : ''}> 📌 상단 고정</label></div>` : ''}
        </div>
        <div class="field"><label for="et">제목</label><input class="input" id="et" name="title" maxlength="100" value="${esc(p.title)}" required></div>
        <div class="field"><label for="eg">태그 <small>(쉼표로 구분, 최대 8개)</small></label><input class="input" id="eg" name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="예: 탑사기, 인천, 노선버스"></div>
        <div class="field ed-area"><label for="ec">내용</label>
          <div class="ed-tools">
            <button class="btn sm" type="button" data-t="bold"><b>B</b> 굵게</button><button class="btn sm" type="button" data-t="h1">큰 제목</button><button class="btn sm" type="button" data-t="h2">작은 제목</button><button class="btn sm" type="button" data-t="italic"><i>I</i> 기울임</button><button class="btn sm" type="button" data-t="strike"><s>S</s> 취소선</button><button class="btn sm" type="button" data-t="quote">❝ 인용</button><button class="btn sm" type="button" data-t="ul">• 목록</button><button class="btn sm" type="button" data-t="ol">1. 번호</button><button class="btn sm" type="button" data-t="chk">☑ 체크</button><button class="btn sm" type="button" data-t="code">&lt;/&gt; 코드</button><button class="btn sm" type="button" data-t="codeblock">코드 블록</button><button class="btn sm" type="button" data-t="link">🔗 링크</button><button class="btn sm" type="button" data-t="table">▦ 표</button>
            <button class="btn sm" type="button" data-t="hr">구분선</button><button class="btn sm" type="button" data-t="upload">📤 사진 올리기</button><button class="btn sm" type="button" data-t="img">🖼 사진 주소</button><button class="btn sm" type="button" data-t="yt">▶ 유튜브</button><button class="btn sm" type="button" data-t="gyo"><span class="f-gyo">교덕체</span></button><button class="btn sm" type="button" data-t="emo" title="덕질역 로고 이모티콘 (:deokjil:)"><img class="emo" src="images/logo.png" alt=""> :deokjil:</button>
            <button class="btn sm" type="button" id="pvBtn">👁 미리보기</button>
            <label for="szSel" style="margin-left:6px">사진 크기</label> <select class="input" id="szSel" style="width:auto;padding:1px 2px"><option value="30">30%</option><option value="50">50%</option><option value="70" selected>70%</option><option value="100">100%</option></select>
            <input type="file" id="fileIn" accept="image/*" multiple hidden> <small id="upMsg" style="color:#000080"></small></div>
          <textarea class="input" id="ec" name="body" required>${esc(p.body)}</textarea>
          <div class="preview-box sunken post-body" id="pv" hidden></div>
          <div class="hint"><b>📤 사진 올리기</b> 버튼, 내용칸에 <b>사진 붙여넣기(Ctrl+V)</b>, 또는 <b>끌어다 놓기</b>로 올릴 수 있어요. 올린 사진 줄에 커서를 두고 <b>사진 크기</b>를 고르면 그 사진 크기가 바뀌어요 (직접 쓰려면 <code>[img 50%]주소</code>) (Supabase 연결 시, 한 장 5MB 이하·자동으로 줄여 줘요). 사진·유튜브 주소를 <b>한 줄에 붙여 넣기</b>만 해도 돼요.</div></div>
        <div class="err-line" role="alert"></div>
        <div class="row"><button class="btn primary" type="submit">💾 ${id ? '수정 저장' : '발행'}</button><a class="btn" href="#/posts">취소</a>
          ${id ? `<a class="btn" href="index.html#/post/${esc(id)}" target="_blank" rel="noopener">사이트에서 보기</a>` : '<small style="color:#555">제목·내용은 이 브라우저에 자동 임시저장돼요.</small>'}</div>
      </form>`;
    const f = $('#ef'), ta = f.body;
    const ins = (before, after = '', ph = '') => {
      const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
      ta.setRangeText(before + sel + after, s, e, 'end'); ta.focus(); ta.dispatchEvent(new Event('input'));
    };
    const lineIns = t => { const s = ta.selectionStart; const pre = ta.value.slice(0, s); const nl = pre === '' || pre.endsWith('\n') ? '' : '\n'; ta.setRangeText(nl + t, s, ta.selectionEnd, 'end'); ta.focus(); ta.dispatchEvent(new Event('input')); };
    const upMsg = $('#upMsg'), fileIn = $('#fileIn'), szSel = $('#szSel');
    /* 커서가 사진 줄 위에 있으면 크기 선택 시 그 줄의 크기를 바꿈 */
    szSel.onchange = () => {
      const v = ta.value, s0 = ta.selectionStart;
      const a = v.lastIndexOf('\n', s0 - 1) + 1; let b = v.indexOf('\n', s0); if (b < 0) b = v.length;
      const m = v.slice(a, b).trim().match(/^(?:\[img(?:\s+\d{1,3}%?)?\]\s*)?((?:https?:\/\/|images\/)\S+)$/i);
      if (!m) { upMsg.textContent = `새로 올릴 사진은 ${szSel.value}%로 들어가요`; return; }
      ta.setRangeText('[img ' + szSel.value + '%]' + m[1], a, b, 'end'); ta.dispatchEvent(new Event('input'));
      upMsg.textContent = `이 사진을 ${szSel.value}%로 바꿨어요`;
    };
    let uploading = false;
    const uploadFiles = async files => {
      files = [...files].filter(x => /^image\//.test(x.type));
      if (!files.length || uploading) return;
      if (A.mode !== 'supabase') { await alertBox('사진 올리기는 Supabase를 연결한 뒤에 쓸 수 있어요.\n지금은 사진 주소를 붙여 넣어 주세요.', '데모 모드', 'ℹ️'); return; }
      uploading = true; let ok = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          upMsg.textContent = `업로드 중… (${i + 1}/${files.length})`;
          try {
            const blob = await prepareImage(files[i]);
            const url = await A.uploadImage(blob);
            lineIns('\n[img ' + szSel.value + '%]' + url + '\n'); ok++;
          } catch (e) { await alertBox(`${files[i].name || '사진'}: ${e.message || '업로드에 실패했어요.'}`, '사진 올리기 실패', '⚠️'); }
        }
      } finally { uploading = false; upMsg.textContent = ok ? `✅ ${ok}장 올렸어요` : ''; if (ok) setTimeout(() => { upMsg.textContent = ''; }, 4000); }
    };
    fileIn.onchange = () => { uploadFiles(fileIn.files); fileIn.value = ''; };
    ta.addEventListener('paste', e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])].filter(x => /^image\//.test(x.type)); if (fs.length) { e.preventDefault(); uploadFiles(fs); } });
    ta.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    ta.addEventListener('drop', e => { const fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) { e.preventDefault(); uploadFiles(fs); } });
    main.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => {
      const t = b.dataset.t;
      if (t === 'upload') { fileIn.click(); return; }
      if (t === 'bold') ins('**', '**', '굵게');
      else if (t === 'h1') lineIns('# ');
      else if (t === 'h2') lineIns('## ');
      else if (t === 'italic') ins('*', '*', '기울임');
      else if (t === 'strike') ins('~~', '~~', '취소선');
      else if (t === 'quote') lineIns('> ');
      else if (t === 'ul') lineIns('- ');
      else if (t === 'ol') lineIns('1. ');
      else if (t === 'chk') lineIns('- [ ] ');
      else if (t === 'code') ins('`', '`', '코드');
      else if (t === 'codeblock') ins('\n```\n', '\n```\n', '코드');
      else if (t === 'link') { const u = await askText('링크 넣기', '주소 (https://…)'); if (u) ins('[', '](' + u + ')', '링크 글자'); }
      else if (t === 'table') lineIns('\n| 제목1 | 제목2 |\n|---|---|\n| 내용 | 내용 |\n');
      else if (t === 'hr') lineIns('\n---\n');
      else if (t === 'img') { const u = await askText('사진 넣기', '사진 주소 (https://… 또는 images/파일명.jpg)'); if (u) lineIns('\n[img]' + u + '\n'); }
      else if (t === 'gyo') ins('[교덕체]', '[/교덕체]', '글자');
      else if (t === 'emo') ins(':deokjil:', '', '');
      else if (t === 'yt') { const u = await askText('유튜브 넣기', '유튜브 영상 주소'); if (u) lineIns('\n' + u + '\n'); }
    });
    const pv = $('#pv'), pvBtn = $('#pvBtn');
    pvBtn.onclick = () => {
      const on = pv.hidden; pv.hidden = !on; ta.hidden = on;
      pvBtn.textContent = on ? '✏ 편집으로' : '👁 미리보기'; if (on) pv.innerHTML = renderBody(ta.value) || '<div class="empty">내용이 비어 있어요</div>';
    };
    if (!id) f.addEventListener('input', () => { try { localStorage.setItem(draftKey, JSON.stringify({ board: f.board.value, title: f.title.value, body: f.body.value })); } catch (e) {} });
    f.onsubmit = async e => {
      e.preventDefault();
      const err = f.querySelector('.err-line'); err.textContent = '';
      const tags = [...new Set(f.tags.value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 8);
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const saved = await A.savePost({ id: id || undefined, board: f.board.value, title: f.title.value, body: f.body.value, tags, pinned: f.pinned ? f.pinned.checked : !!p.pinned, publishAt: f.publishAt.value ? new Date(f.publishAt.value).toISOString() : null });
        try { localStorage.removeItem(draftKey); } catch (x) {}
        await alertBox(saved && saved.scheduled ? '예약했어요! 정해 둔 시간에 사이트에 올라가요.' : id ? '수정했어요.' : '발행했어요! 사이트에 바로 올라가요.', '저장 완료', '✅');
        location.hash = '#/posts';
      } catch (x) { err.textContent = '⚠ ' + x.message; btn.disabled = false; }
    };
    setStatus(id ? '글 수정' : '새 글', '');
  }

  /* ---------- 댓글 검토 ---------- */
  async function viewComments(filter) {
    const [all, posts] = await Promise.all([A.listAllComments(), A.listPosts()]);
    const titleOf = {}; posts.forEach(p => { titleOf[p.id] = p.title; });
    const pend = all.filter(c => c.status === 'pending');
    const list = filter === 'pending' ? pend : all;
    main.innerHTML = `
      <h2 class="page-title">💬 댓글 검토</h2>
      <div class="row" style="margin-bottom:10px">
        <a class="btn${filter === 'pending' ? ' on' : ''}" href="#/comments/pending">🕓 검토 대기 (${pend.length})</a>
        <a class="btn${filter === 'all' ? ' on' : ''}" href="#/comments/all">전체 (${all.length})</a>
        ${filter === 'pending' && pend.length ? '<button class="btn" type="button" id="apAll">대기 전체 승인</button>' : ''}</div>
      <div class="msg info">금칙어가 포함된 댓글은 자동으로 "대기"가 되어 <b>작성자 본인과 관리자에게만</b> 보여요. 승인하면 모두에게 공개되고, 삭제하면 사라져요.</div>
      ${list.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>작성자</th><th>내용</th><th class="hide-m">위치</th><th class="hide-m">시각</th><th>관리</th></tr></thead><tbody>${list.map(c => `<tr>
        <td class="c"><b>${c.isAdmin ? '👑 ' : ''}${esc(c.nick)}</b>${c.status === 'pending' ? '<br><span class="pending-tag">대기</span>' : ''}${c.parentId ? '<br><small>↪ 답글</small>' : ''}</td>
        <td style="white-space:pre-wrap;min-width:150px">${esc(c.body)}</td>
        <td class="hide-m">${c.target === 'guestbook' ? '📒 방명록' : `<a href="index.html#/post/${esc(c.target)}" target="_blank" rel="noopener">${esc(titleOf[c.target] || '(삭제된 글)')}</a>`}</td>
        <td class="c hide-m">${fmtDate(c.created)}</td>
        <td class="c">${c.status === 'pending' ? `<button class="btn sm" type="button" data-ok="${esc(c.id)}">✅ 승인</button> ` : ''}<button class="btn sm danger" type="button" data-del="${esc(c.id)}">🗑 삭제</button></td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${filter === 'pending' ? '검토할 댓글이 없어요. 깨끗해요! ✨' : '댓글이 없어요.'}</div>`}`;
    main.querySelectorAll('[data-ok]').forEach(b => b.onclick = async () => { try { await A.setCommentStatus(b.dataset.ok, 'ok'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); } });
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!(await confirmBox('이 댓글을 삭제할까요? (답글도 함께 지워져요)', '댓글 삭제', '삭제', '취소'))) return;
      try { await A.deleteComment(b.dataset.del); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    });
    const ap = $('#apAll');
    if (ap) ap.onclick = async () => {
      if (!(await confirmBox(`대기 중인 ${pend.length}개를 모두 승인할까요?`, '전체 승인', '승인', '취소'))) return;
      try { for (const c of pend) await A.setCommentStatus(c.id, 'ok'); route(); } catch (e) { alertBox(e.message, '오류', '⚠️'); }
    };
    setStatus(`${list.length}개 개체`, `대기 ${pend.length}`);
  }

  /* ---------- 회원 ---------- */
  /* ---------- 게시판·카테고리 관리 ---------- */
  async function saveBoardSettings(boards, cats) {
    const s = await A.getSettings();
    const saved = await A.saveSettings({ ...s, boards, categories: cats });
    C.boards = saved.boards; C.categories = saved.categories;
  }
  function boardDialog(board, cats) {
    return new Promise(res => {
      let out = null;
      const w = openWin({ title: board ? '게시판 수정' : '게시판 추가', width: 380, onClose: () => res(out),
        html: `<form class="dlg-body" style="display:block" id="bdForm">
          <div class="field"><label>아이콘 (이모지 1~2개)</label><input class="input" name="bicon" maxlength="4" value="${esc(board ? board.icon : '📄')}"></div>
          <div class="field"><label>이름 (14자 이내)</label><input class="input" name="bname" maxlength="14" value="${esc(board ? board.name : '')}" autocomplete="off"></div>
          <div class="field"><label>설명 (40자 이내)</label><input class="input" name="bdesc" maxlength="40" value="${esc(board ? board.desc : '')}" autocomplete="off"></div>
          <div class="field"><label>카테고리</label><select class="input" name="bcat"><option value="">(없음)</option>${cats.map(c => `<option value="${esc(c.id)}"${board && board.cat === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
          <div class="err-line" id="bdErr"></div>
          <div class="dlg-btns"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-c>취소</button></div></form>`
      });
      const f = w.el.querySelector('#bdForm'), E = f.elements;
      E.bname.focus();
      w.el.querySelector('[data-c]').onclick = () => w.close();
      f.onsubmit = e => {
        e.preventDefault();
        const name = E.bname.value.trim();
        if (!name) { w.el.querySelector('#bdErr').textContent = '⚠ 이름을 적어 주세요.'; return; }
        out = { icon: E.bicon.value.trim() || '📄', name, desc: E.bdesc.value.trim(), cat: E.bcat.value };
        w.close();
      };
    });
  }
  function pickBoardDialog(text, boards) {
    return new Promise(res => {
      let out = null;
      const w = openWin({ title: '글 옮기기', width: 380, onClose: () => res(out),
        html: `<form class="dlg-body" style="display:block"><p>${esc(text)}</p>
          <div class="field"><label>옮길 게시판</label><select class="input" name="to">${boards.map(b => `<option value="${esc(b.id)}">${esc(b.icon)} ${esc(b.name)}</option>`).join('')}</select></div>
          <div class="dlg-btns"><button class="btn primary" type="submit">옮기고 지우기</button><button class="btn" type="button" data-c>취소</button></div></form>` });
      const f = w.el.querySelector('form');
      w.el.querySelector('[data-c]').onclick = () => w.close();
      f.onsubmit = e => { e.preventDefault(); out = f.elements.to.value; w.close(); };
    });
  }
  async function viewBoards() {
    const [s, posts] = await Promise.all([A.getSettings(), A.listPosts()]);
    const boards = s.boards.map(b => ({ ...b })), cats = (s.categories || []).map(c => ({ ...c }));
    const cnt = {}; posts.forEach(p => { cnt[p.board] = (cnt[p.board] || 0) + 1; });
    const catName = id => (cats.find(c => c.id === id) || {}).name || '(없음)';
    const persist = async () => { try { await saveBoardSettings(boards, cats); } catch (e) { await alertBox(e.message, '오류', '⚠️'); } route(); };
    main.innerHTML = `<h2 class="page-title">🗂️ 게시판 · 카테고리</h2>
      <p class="hint">게시판을 추가·수정·삭제하고 카테고리로 묶을 수 있어요. 사이트 왼쪽 목록과 홈 화면에 바로 반영돼요.</p>
      <div class="sub-title"><span>📁 카테고리</span></div>
      <div style="margin-bottom:6px">${cats.length ? cats.map(c => `<span class="tag">${esc(c.name)}
        <button class="btn sm" type="button" data-cren="${esc(c.id)}">이름 변경</button> <button class="btn sm danger" type="button" data-cdel="${esc(c.id)}">삭제</button></span>`).join('') : '<span style="color:#777">아직 카테고리가 없어요.</span>'}</div>
      <button class="btn sm primary" type="button" id="catAdd">+ 카테고리 추가</button>
      <div class="hint" style="margin-top:4px">카테고리를 지워도 게시판과 글은 그대로 남고 "(없음)"으로 돌아가요.</div>
      <div class="sub-title"><span>📋 게시판</span><button class="btn sm primary" type="button" id="bdAdd">+ 게시판 추가</button></div>
      <div style="overflow:auto"><table class="tbl"><thead><tr><th style="width:70px">순서</th><th>게시판</th><th class="hide-m">설명</th><th>카테고리</th><th style="width:50px">글</th><th style="width:130px">관리</th></tr></thead><tbody>
        ${boards.map((b, i) => `<tr><td class="c"><button class="btn sm" type="button" data-up="${i}"${i === 0 ? ' disabled' : ''} aria-label="위로">▲</button><button class="btn sm" type="button" data-dn="${i}"${i === boards.length - 1 ? ' disabled' : ''} aria-label="아래로">▼</button></td>
          <td><b>${esc(b.icon)} ${esc(b.name)}</b></td><td class="hide-m">${esc(b.desc)}</td><td class="c">${esc(catName(b.cat))}</td><td class="c">${cnt[b.id] || 0}</td>
          <td class="c"><button class="btn sm" type="button" data-bed="${i}">수정</button> <button class="btn sm danger" type="button" data-bdel="${i}">삭제</button></td></tr>`).join('')}
      </tbody></table></div>`;
    $('#catAdd').onclick = async () => {
      const name = await askText('카테고리 추가', '카테고리 이름 (12자 이내)', '예: 탑승 기록');
      if (!name) return;
      if (name.length > 12) return alertBox('이름은 12자 이내로 적어 주세요.', '알림', '⚠️');
      if (cats.some(c => c.name === name)) return alertBox('같은 이름의 카테고리가 이미 있어요.', '알림', '⚠️');
      cats.push({ id: 'c' + Date.now().toString(36), name }); persist();
    };
    main.querySelectorAll('[data-cren]').forEach(b => b.onclick = async () => {
      const c = cats.find(x => x.id === b.dataset.cren);
      const name = await askText('카테고리 이름 변경', `"${c.name}" 의 새 이름 (12자 이내)`, c.name);
      if (!name) return;
      if (name.length > 12) return alertBox('이름은 12자 이내로 적어 주세요.', '알림', '⚠️');
      c.name = name; persist();
    });
    main.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
      const c = cats.find(x => x.id === b.dataset.cdel);
      if (!await confirmBox(`"${c.name}" 카테고리를 지울까요?\n안에 있던 게시판과 글은 그대로 남아요.`, '카테고리 삭제', '지우기')) return;
      boards.forEach(x => { if (x.cat === c.id) x.cat = ''; });
      cats.splice(cats.indexOf(c), 1); persist();
    });
    $('#bdAdd').onclick = async () => {
      const r = await boardDialog(null, cats); if (!r) return;
      boards.push({ id: 'b' + Date.now().toString(36), ...r }); persist();
    };
    main.querySelectorAll('[data-bed]').forEach(b => b.onclick = async () => {
      const bd = boards[+b.dataset.bed]; const r = await boardDialog(bd, cats); if (!r) return;
      Object.assign(bd, r); persist();
    });
    const swap = (i, j) => { [boards[i], boards[j]] = [boards[j], boards[i]]; persist(); };
    main.querySelectorAll('[data-up]').forEach(b => b.onclick = () => swap(+b.dataset.up, +b.dataset.up - 1));
    main.querySelectorAll('[data-dn]').forEach(b => b.onclick = () => swap(+b.dataset.dn, +b.dataset.dn + 1));
    main.querySelectorAll('[data-bdel]').forEach(b => b.onclick = async () => {
      const i = +b.dataset.bdel, bd = boards[i], n = cnt[bd.id] || 0;
      if (boards.length <= 1) return alertBox('게시판은 최소 1개는 있어야 해요.', '알림', '⚠️');
      if (n > 0) {
        const to = await pickBoardDialog(`"${bd.name}" 게시판에는 글이 ${n}개 있어요. 지우기 전에 다른 게시판으로 옮겨요.`, boards.filter(x => x.id !== bd.id));
        if (!to) return;
        try {
          for (const p of posts.filter(x => x.board === bd.id)) await A.savePost({ id: p.id, board: to, title: p.title, body: p.body, tags: p.tags, pinned: p.pinned });
        } catch (e) { await alertBox('글을 옮기다 멈췄어요: ' + e.message, '오류', '⚠️'); return route(); }
      } else if (!await confirmBox(`"${bd.name}" 게시판을 지울까요?`, '게시판 삭제', '지우기')) return;
      boards.splice(i, 1); persist();
    });
  }

  /* ---------- 운영진 쪽지 ---------- */
  const memoText = t => esc(t).replace(/\n/g, '<br>');
  function memoCard(m) {
    const mine = m.authorId === me.id;
    const cmts = m.comments.map(c => `<div class="memo-c"><b>${esc(c.authorNick)}</b> ${memoText(c.body)}
      <small>${fmtShort(c.created)}</small>${c.authorId === me.id ? ` <button class="btn sm" type="button" data-cdel="${c.id}">지우기</button>` : ''}</div>`).join('');
    return `<article class="memo raised">
      <div class="memo-head"><b>${esc(m.authorNick)}</b> <small>${fmtDate(m.created)}</small>
        ${mine ? `<button class="btn sm" type="button" data-mdel="${m.id}">지우기</button>` : ''}</div>
      <div class="memo-body">${memoText(m.body)}</div>
      <div class="memo-cmts">${cmts}</div>
      <form class="memo-cform" data-memo="${m.id}"><input name="c" maxlength="500" placeholder="댓글 달기 (500자 이내)" required autocomplete="off">
        <button class="btn sm" type="submit">등록</button></form>
    </article>`;
  }
  async function viewMemo() {
    const memos = await A.listMemos();
    try { localStorage.setItem('deokjil_memo_seen_' + me.id, String(Date.now())); drawNav('memo', 0, 0); } catch (e) {}
    main.innerHTML = `<h2 class="page-title">📨 운영진 쪽지</h2>
      <p class="hint">서울교덕·지철덕만 보는 쪽지예요. 두 사람 모두 읽고 댓글을 달 수 있어요.</p>
      <form id="memoForm" class="memo-form sunken">
        <textarea name="body" rows="3" maxlength="1000" required placeholder="쪽지를 적어 주세요 (1,000자 이내)"></textarea>
        <div style="text-align:right;margin-top:6px"><button class="btn primary" type="submit">쪽지 남기기</button></div>
      </form>
      <div id="memoList">${memos.length ? memos.map(memoCard).join('') : '<div class="msg">아직 쪽지가 없어요.</div>'}</div>`;
    $('#memoForm').onsubmit = async e => {
      e.preventDefault();
      const body = e.target.body.value;
      try { await A.addMemo(body); route(); } catch (err) { alertBox(err.message, '오류', '⚠️'); }
    };
    main.querySelectorAll('.memo-cform').forEach(f => f.onsubmit = async e => {
      e.preventDefault();
      try { await A.addMemoComment(f.dataset.memo, f.c.value); route(); } catch (err) { alertBox(err.message, '오류', '⚠️'); }
    });
    main.querySelectorAll('[data-mdel]').forEach(b => b.onclick = async () => {
      const ok = await confirmBox('이 쪽지를 지울까요? 댓글도 함께 지워져요.', '쪽지 지우기', '지우기');
      if (!ok) return;
      try { await A.deleteMemo(b.dataset.mdel); route(); } catch (err) { alertBox(err.message, '오류', '⚠️'); }
    });
    main.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => {
      try { await A.deleteMemoComment(b.dataset.cdel); route(); } catch (err) { alertBox(err.message, '오류', '⚠️'); }
    });
  }

  async function viewUsers() {
    const [users, cms] = await Promise.all([A.listUsers(), A.listAllComments()]);
    const cnt = {}; cms.forEach(c => { cnt[c.userId] = (cnt[c.userId] || 0) + 1; });
    main.innerHTML = `<h2 class="page-title">👥 회원 (${users.length})</h2>
      ${users.length ? `<table class="tbl"><thead><tr><th>닉네임</th><th>권한</th><th class="hide-m">가입일</th><th>댓글</th></tr></thead><tbody>${users.map(u => `<tr>
        <td class="c"><b>${roleMark(u.role)}${esc(u.nick)}</b></td><td class="c">${u.role === 'admin' ? '✍ 글쓴이' : '회원'}</td>
        <td class="c hide-m">${fmtShort(u.created)}</td><td class="c">${cnt[u.id] || 0}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">회원이 없어요.</div>'}
      <div class="msg info">글쓴이는 <b>서울교덕</b>·<b>지철덕</b> 두 계정으로 고정돼 있어요. 다른 회원은 글을 쓸 수 없어요.</div>
      <div class="msg info">이메일을 받지 않아서 비밀번호를 잊으면 찾을 수 없어요. 문제가 생긴 회원은 ${A.mode === 'supabase' ? 'Supabase 대시보드(Authentication)에서' : '백업을 내려받아 확인하고'} 처리해 주세요.</div>`;
    setStatus(`${users.length}명`, '');
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
        <fieldset><legend>링크 모음 — 서울교덕 (https:// 로 시작)</legend>
          <div class="field"><label for="l1">▶️ 유튜브</label><input class="input" id="l1" name="seoulYoutube" value="${esc(L.seoulYoutube)}" placeholder="https://www.youtube.com/@…"></div>
          <div class="field"><label for="l2">📸 인스타그램</label><input class="input" id="l2" name="seoulInstagram" value="${esc(L.seoulInstagram)}" placeholder="https://www.instagram.com/…"></div>
        </fieldset>
        <fieldset><legend>링크 모음 — 지철덕 (https:// 로 시작)</legend>
          <div class="field"><label for="l3">▶️ 유튜브</label><input class="input" id="l3" name="jiYoutube" value="${esc(L.jiYoutube)}" placeholder="https://www.youtube.com/@…"></div>
          <div class="field"><label for="l4">📸 인스타그램</label><input class="input" id="l4" name="jiInstagram" value="${esc(L.jiInstagram)}" placeholder="https://www.instagram.com/…"></div>
        </fieldset>
        <fieldset><legend>댓글 금칙어</legend>
          <div class="field"><label for="bw">쉼표로 구분 — 포함된 댓글은 "검토 대기"가 돼요</label><textarea class="input" id="bw" name="banned" style="min-height:120px">${esc((s.banned || []).join(', '))}</textarea>
          <div class="hint">띄어쓰기·점·숫자를 넣어 우회한 표현(예: "시.발")도 같이 걸러요.</div></div>
        </fieldset>
        <div class="err-line" role="alert"></div>
        <button class="btn primary" type="submit">💾 설정 저장</button>
      </form>
      <div class="sub-title" style="margin-top:20px"><span>🔑 내 비밀번호</span></div>
      <div class="msg info">지금 로그인한 <b>${esc(me.nick)}</b>의 비밀번호를 바꿔요. 바꾸면 이전 비밀번호는 더 이상 쓸 수 없어요. 비밀번호로 누구인지 구분하니까 <b>두 사람이 서로 다른 비밀번호</b>를 써야 해요.</div>
      <div class="row"><button class="btn" type="button" id="pwChg">🔑 비밀번호 바꾸기</button></div>
      <div class="sub-title" style="margin-top:20px"><span>🗄 데이터</span></div>
      ${A.mode === 'local' ? `<div class="msg info">지금은 <b>로컬 데모 모드</b>예요. 모든 데이터가 이 브라우저에만 저장돼요. 다른 사람이 가입·댓글을 쓰게 하려면 README대로 Supabase를 연결하세요. 그 전에는 백업을 자주 받아 두세요.</div>
        <div class="row"><button class="btn" type="button" id="bkExp">💾 백업 내려받기</button><label class="btn" for="bkImp">📂 백업 불러오기</label><input type="file" id="bkImp" accept=".json,application/json" hidden>
        <button class="btn danger" type="button" id="bkReset">🧨 전부 초기화</button></div>`
        : `<div class="msg info">데이터는 Supabase에 저장돼요. 백업은 Supabase 대시보드(Database → Backups)나 Table Editor에서 CSV로 내려받을 수 있어요.</div>`}`;
    const f = $('#sf');
    $('#pwChg').onclick = () => pwChangeDialog();
    f.onsubmit = async e => {
      e.preventDefault(); const err = f.querySelector('.err-line'); err.textContent = '';
      const links = {};
      for (const k of ['seoulYoutube', 'seoulInstagram', 'jiYoutube', 'jiInstagram']) {
        const v = f[k].value.trim();
        if (v && !/^https?:\/\//i.test(v)) { err.textContent = '⚠ 링크는 https:// 로 시작해야 해요.'; return; }
        links[k] = v;
      }
      const banned = [...new Set(f.banned.value.split(/[,\n]/).map(x => x.trim()).filter(Boolean))];
      try { await A.saveSettings({ ...s, marquee: f.marquee.value.trim(), intro: f.intro.value.trim(), links, banned }); alertBox('설정을 저장했어요.', '저장 완료', '✅'); }
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

  /* ---------- 시작 ---------- */
  async function start() {
    try { await A.init(); me = A.me(); } catch (e) { root.innerHTML = errBox(e); return; }
    $('#modeBadge').textContent = A.mode === 'supabase' ? '☁ Supabase 연결됨' : '💾 로컬 데모 모드';
    if (!me) return gate('login');
    if (me.role !== 'admin') return gate('denied');
    try { const s = await A.getSettings(); C.boards = s.boards; C.categories = s.categories; } catch (e) {}
    buildShell();
    if (!start.bound) { window.addEventListener('hashchange', route); start.bound = true; }
    route();
  }

  $('#mLogout').onclick = async () => { await A.logout(); location.hash = ''; start(); };
  start();
})();