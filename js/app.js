/* ==========================================================
   app.js — 덕질역 공개 사이트
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG, A = window.API;
  const $ = (s, r = document) => r.querySelector(s);
  const { esc, fmtDate, fmtShort, renderBody, openWin, alertBox, confirmBox } = window.Common;

  let me = null, settings = {}, visit = { today: 0, total: 0 };
  const content = $('#content');
  const boardOf = id => C.boards.find(b => b.id === id);
  /* 게시판을 카테고리별로 묶어요 (카테고리 없는 게시판이 먼저) */
  function groupedBoards() {
    const cats = C.categories || [];
    const groups = [{ cat: null, boards: C.boards.filter(b => !cats.some(c => c.id === b.cat)) }];
    cats.forEach(c => groups.push({ cat: c, boards: C.boards.filter(b => b.cat === c.id) }));
    return groups.filter(g => g.boards.length);
  }
  const sortPinned = l => [...l].sort((a, b) => (b.pinned - a.pinned) || (new Date(b.created) - new Date(a.created)));
  const isAdmin = () => !!me && me.role === 'admin';
  const canEdit = p => isAdmin() || (!!me && me.role === 'author' && p.authorId === me.id);
  const roleMark = r => r === 'admin' ? '👑 ' : r === 'author' ? '✍ ' : '';
  const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
  const QUOTES = [
    '버스는 창가 맨 뒷자리가 진리.', '환승은 기다림이 아니라 설렘이다.', '막차를 놓친 날이 가장 오래 기억에 남는다.',
    '노선도를 보면 아직 안 가 본 길이 보인다.', '좋은 출사는 새벽 첫차에서 시작된다.', '배차 간격이 길수록 정류장 풍경이 또렷해진다.',
    '역 이름을 외우는 건 취미이자 특기.', '비 오는 날 차창 빗방울도 훌륭한 피사체.', '종점까지 가 본 사람만 아는 풍경이 있다.',
    '열차 소리는 어느 음악보다 마음이 편하다.'
  ];

  function errBox(e) { return `<div class="msg err">😵 문제가 생겼어요: ${esc(e && e.message || e)}</div>`; }
  function setAddr(path, title) {
    document.title = (title ? title + ' - ' : '') + C.name;
  }
  function setStatus() {}   /* 상태 표시줄은 없앴어요 */

  /* ---------- 왼쪽 트리 ---------- */
  function buildTree(active) {
    const link = x => `<a class="ti${x.k === active ? ' on' : ''}" href="${x.h}"><span>${x.i}</span> ${esc(x.t)}</a>`;
    const bl = b => link({ h: '#/board/' + b.id, i: b.icon, t: b.name, k: 'board:' + b.id });
    $('#tree').innerHTML = link({ h: '#/', i: '🚉', t: C.name, k: 'home' })
      + groupedBoards().map(g => (g.cat ? `<div class="ti-cat">${esc(g.cat.name)}</div>` : '') + g.boards.map(bl).join('')).join('')
      + '<div class="ti-sep" role="separator"></div>'
      + [{ h: '#/photos', i: '📷', t: '촬영 사진', k: 'photos' }, { h: '#/backup', i: '📦', t: '지난 글 보관함', k: 'backup' },
        { h: '#/links', i: '🌐', t: '링크 모음', k: 'links' }, { h: '#/about', i: 'ℹ️', t: '덕질역 소개', k: 'about' }].map(link).join('');
  }

  /* ---------- 글 목록 표 ---------- */
  function postsTable(list, startNo, showBoard) {
    if (!list.length) return '<div class="empty">아직 글이 없어요. 곧 열차가 들어옵니다 🚉</div>';
    return `<table class="tbl"><thead><tr><th class="hide-m" style="width:46px">번호</th><th>제목</th><th class="hide-m" style="width:84px">글쓴이</th><th style="width:90px">날짜</th><th class="hide-m" style="width:50px">조회</th><th style="width:44px">공감</th></tr></thead><tbody>${
      list.map((p, i) => `<tr><td class="c hide-m">${p.pinned ? '<span class="pin">📌</span>' : startNo - i}</td>
        <td class="t"><a href="#/post/${esc(p.id)}">${showBoard ? `<small>[${esc((boardOf(p.board) || {}).name || p.board)}]</small> ` : ''}${esc(p.title)}</a>${p.comments ? ` <span class="cnt">[${p.comments}]</span>` : ''}</td>
        <td class="c hide-m">${p.author ? `<a href="#/author/${encodeURIComponent(p.author)}">${esc(p.author)}</a>` : '-'}</td>
        <td class="c">${fmtShort(p.created)}</td><td class="c hide-m">${p.views}</td><td class="c">${p.likes}</td></tr>`).join('')}</tbody></table>`;
  }
  const pager = (base, pg, pages) => pages <= 1 ? '' :
    `<div class="pager">${Array.from({ length: pages }, (_, i) => i + 1).map(n => n === pg ? `<b>${n}</b>` : `<a href="${base}/${n}">${n}</a>`).join('')}</div>`;

  /* ---------- 홈 ---------- */
  async function viewHome() {
    setAddr('', '');
    const posts = await A.listPosts();
    const latest = posts.slice(0, 8);
    const top = [...posts].sort((a, b) => b.views - a.views).slice(0, 5);
    const counts = {}; posts.forEach(p => { counts[p.board] = (counts[p.board] || 0) + 1; });
    const tags = {}; posts.forEach(p => (p.tags || []).forEach(t => { tags[t] = (tags[t] || 0) + 1; }));
    const authors = {}; posts.forEach(p => { if (p.author) authors[p.author] = (authors[p.author] || 0) + 1; });
    const day = Math.floor(Date.now() / 864e5);
    const years = new Date().getFullYear() - C.since;
    const digits = String(visit.total).padStart(6, '0').split('').map(d => `<i>${d}</i>`).join('');
    content.innerHTML = `
      <h2 class="page-title">🚉 ${esc(C.name)} — ${esc(C.subtitle)}</h2>
      <div id="phStrip"></div>
      <div class="led" aria-label="안내 전광판"><span>${esc(settings.marquee)}${posts[0] ? ' ▶ 새 글: ' + esc(posts[0].title) : ''}</span></div>
      <div class="panel raised">
        <b>${esc(C.since)}년부터 덕질해온 ${years}년차 교통 덕후의 블로그</b>
        <div style="margin-top:6px">${esc(settings.intro).replace(/\n/g, '<br>')}</div>
      </div>
      <div class="cols">
        <div>
          <div class="sub-title"><span>📋 최근 글</span><a href="#/board/${esc(C.boards[1] ? C.boards[1].id : 'daily')}">더 보기</a></div>
          ${postsTable(latest, posts.length, true)}
        </div>
        <div>
          <div class="sub-title"><span>👀 방문자</span></div>
          <div class="panel raised" style="text-align:center">
            <div class="odo" aria-label="전체 방문자 ${visit.total}명">${digits}</div>
            <div style="margin-top:6px">오늘 <b>${visit.today}</b> · 전체 <b>${visit.total}</b></div>
          </div>
          <div class="sub-title"><span>🔥 인기 글 TOP5</span></div>
          <div class="panel sunken" style="padding:6px 8px">${top.length ? top.map((p, i) => `<div>${i + 1}. <a href="#/post/${esc(p.id)}">${esc(p.title)}</a> <small>(${p.views})</small></div>`).join('') : '아직 없어요'}</div>
          ${Object.keys(authors).length ? `<div class="sub-title"><span>✍ 글쓴이</span></div><div class="panel raised">${Object.keys(authors).sort((a, b) => authors[b] - authors[a]).map(n => `<div><a href="#/author/${encodeURIComponent(n)}">${esc(n)}</a> <small>(${authors[n]}개)</small></div>`).join('')}</div>` : ''}
          <div class="sub-title"><span>🎲 오늘의 덕질 한마디</span></div>
          <div class="panel raised">“${esc(QUOTES[day % QUOTES.length])}”</div>
        </div>
      </div>
      <div class="sub-title"><span>🚏 승강장 안내 (게시판)</span></div>
      ${groupedBoards().map(g => (g.cat ? `<div class="cat-h">📁 ${esc(g.cat.name)}</div>` : '') + `<div class="board-grid">${g.boards.map(b => `<a class="bcard raised" href="#/board/${b.id}"><b>${b.icon} ${esc(b.name)}</b><small>${esc(b.desc)} · ${counts[b.id] || 0}개</small></a>`).join('')}</div>`).join('')}
      ${Object.keys(tags).length ? `<div class="sub-title"><span>🏷️ 태그</span></div><div>${Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 24).map(t => `<a class="tag" href="#/tag/${encodeURIComponent(t)}">#${esc(t)} (${tags[t]})</a>`).join('')}</div>` : ''}`;
    setStatus(`글 ${posts.length}개`, `오늘 ${visit.today} / 전체 ${visit.total}`);
  }

  /* ---------- 게시판 ---------- */
  async function viewBoard(id, page) {
    const b = boardOf(id); if (!b) return notFound();
    setAddr('게시판\\' + b.name, b.name);
    const list = sortPinned((await A.listPosts()).filter(p => p.board === id));
    const ps = C.pageSize, pages = Math.max(1, Math.ceil(list.length / ps)), pg = Math.min(Math.max(1, +page || 1), pages);
    content.innerHTML = `
      <h2 class="page-title">${b.icon} ${esc(b.name)}</h2>
      <div style="margin-bottom:8px;color:#444">${esc(b.desc)}</div>
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
    const same = sortPinned((await A.listPosts()).filter(x => x.board === p.board)).sort((x, y) => new Date(y.created) - new Date(x.created));
    const idx = same.findIndex(x => x.id === p.id);
    const newer = same[idx - 1], older = same[idx + 1];
    content.innerHTML = `
      <div class="post-head">
        <a href="#/board/${esc(b.id)}">${b.icon} ${esc(b.name)}</a>
        <h1 class="post-title">${p.pinned ? '<span class="pin">📌</span> ' : ''}${esc(p.title)}</h1>
        <div class="post-meta">${p.author ? `<span>✍ <a href="#/author/${encodeURIComponent(p.author)}">${esc(p.author)}</a></span>` : ''}<span>🕒 ${fmtDate(p.created)}${p.updated ? ' (수정 ' + fmtShort(p.updated) + ')' : ''}</span><span>👁 조회 <span id="pv">${p.views}</span></span>
          ${canEdit(p) ? `<a href="admin.html#/edit/${esc(p.id)}">✏ 수정</a>` : ''}</div>
      </div>
      <div class="share-banner" role="note"><span class="em">🚌</span><div>
        <div><b class="g">이 글은 퍼가셔도 좋은 글입니다.</b></div>
        <small>다만, 출처가 없으면 불펌으로 보일 수 있으니 출처(${esc(C.name)})를 밝혀 주세요.</small>
        <div><b class="b">공감과 댓글은 저에게 큰 힘이 됩니다.</b></div></div></div>
      <div class="post-body">${renderBody(p.body)}</div>
      ${(p.tags || []).length ? `<div style="margin-top:12px">${p.tags.map(t => `<a class="tag" href="#/tag/${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
      <div class="like-wrap"><button class="btn primary" id="likeBtn" type="button"></button> <button class="btn" id="copyBtn" type="button">🔗 주소 복사</button></div>
      <div id="cbox"></div>
      <div class="navrows">
        ${newer ? `<div>▲ 다음 글: <a href="#/post/${esc(newer.id)}">${esc(newer.title)}</a></div>` : ''}
        ${older ? `<div>▼ 이전 글: <a href="#/post/${esc(older.id)}">${esc(older.title)}</a></div>` : ''}
      </div>
      <a class="btn" href="#/board/${esc(b.id)}">📋 목록으로</a>`;
    const likeBtn = $('#likeBtn');
    const drawLike = q => { likeBtn.textContent = (q.liked ? '💙 공감함 ' : '🤍 공감 ') + q.likes; likeBtn.classList.toggle('on', q.liked); };
    drawLike(p);
    likeBtn.onclick = async () => { try { drawLike(await A.toggleLike(p.id)); } catch (e) { alertBox(e.message, '오류', '⚠️'); } };
    $('#copyBtn').onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); alertBox('주소를 복사했어요. 퍼 가실 땐 출처를 밝혀 주세요!', '복사 완료', '✅'); }
      catch (e) { alertBox(location.href, '주소', '🔗'); }
    };
    mountComments($('#cbox'), p.id, {});
    setStatus(`조회 ${p.views} · 공감 ${p.likes}`, '');
  }

  /* ---------- 댓글 ---------- */
  function mountComments(box, target, opts) {
    const word = opts.guest ? '방명록' : '댓글';
    async function draw() {
      let list;
      try { list = await A.listComments(target); } catch (e) { box.innerHTML = errBox(e); return; }
      const roots = list.filter(c => !c.parentId), kids = id => list.filter(c => c.parentId === id);
      const visible = list.filter(c => c.status === 'ok').length;
      const item = (c, reply) => `<div class="cmt${reply ? ' reply' : ''}" data-id="${esc(c.id)}" data-nick="${esc(c.nick)}">
        <div class="cmt-h"><b class="nick${c.role && c.role !== 'user' ? ' admin' : ''}">${roleMark(c.role)}${esc(c.nick)}</b><span class="date">${fmtDate(c.created)}</span>
          ${c.status === 'pending' ? '<span class="pending-tag">🕓 검토 대기 중 (관리자에게만 보여요)</span>' : ''}
          <span class="acts"><a data-act="reply" role="button" tabindex="0">답글</a>${isAdmin() ? '<a data-act="del" role="button" tabindex="0">삭제</a>' : ''}</span></div>
        <div class="cmt-b">${esc(c.body)}</div></div>`;
      box.innerHTML = `<div class="cmt-head">💬 ${word} ${visible}</div>
        ${roots.length ? roots.map(r => item(r, false) + kids(r.id).map(k => item(k, true)).join('')).join('') : `<div class="empty">첫 ${word}을 남겨 보세요!</div>`}
        <div data-form-slot>${formHtml(null)}</div>`;
      bindForm(box.querySelector('[data-form-slot]'), null);
    }
    function formHtml(parentNick) {
      return `<form class="cmt-form raised${parentNick ? ' inline' : ''}">
        <label for="cb-t" style="font-weight:bold">${parentNick ? '↪ ' + esc(parentNick) + '님에게 답글' : '익명으로 ' + word + ' 쓰기'}</label>
        <textarea class="input" maxlength="${C.commentMax}" ${parentNick ? '' : 'id="cb-t"'} name="body" placeholder="${opts.guest ? '다녀가신 흔적을 남겨 주세요 :)' : '따뜻한 한마디를 남겨 주세요 :)'}" required></textarea>
        <div class="row"><small class="cnt-ind" style="color:#555">0 / ${C.commentMax}</small><span class="row">${parentNick ? '<button class="btn sm" type="button" data-cancel>취소</button>' : ''}<button class="btn primary sm" type="submit">등록</button></span></div>
        <small style="color:#777">닉네임은 접속 IP로 자동 정해져요. (IP는 공개되지 않아요)</small><div class="err-line" role="alert"></div></form>`;
    }
    function bindForm(slot, parentId) {
      const f = slot.querySelector('form'); if (!f) return;
      const ind = f.querySelector('.cnt-ind');
      f.body.addEventListener('input', () => { ind.textContent = f.body.value.length + ' / ' + C.commentMax; });
      const cancel = f.querySelector('[data-cancel]'); if (cancel) cancel.onclick = () => slot.remove();
      f.onsubmit = async e => {
        e.preventDefault();
        const btn = f.querySelector('[type=submit]'); btn.disabled = true;
        try {
          const c = await A.addComment(target, parentId, f.body.value);
          if (c.status === 'pending') await alertBox('표현을 확인하기 위해 운영진 검토 후에 표시돼요.', '검토 대기', '🕓');
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
      } else if (a.dataset.act === 'reply') {
        const old = box.querySelector('[data-reply-slot]'); if (old) old.remove();
        // 대댓글은 1단계: 답글의 답글은 원댓글 아래에 붙고 @닉네임을 앞에 붙여 줘요
        let last = cm; while (last.nextElementSibling && last.nextElementSibling.classList.contains('reply')) last = last.nextElementSibling;
        if (!cm.classList.contains('reply') || true) {
          const slot = document.createElement('div'); slot.dataset.replySlot = '1'; slot.innerHTML = formHtml(cm.dataset.nick);
          last.after(slot); bindForm(slot, id);
          const ta = slot.querySelector('textarea');
          if (cm.classList.contains('reply')) ta.value = '@' + cm.dataset.nick + ' ';
          ta.focus();
        }
      }
    });
    box.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act]')) { e.preventDefault(); e.target.click(); } });
    box.__redraw = draw;
    return draw();
  }


  /* ---------- 링크/소개 ---------- */
  /* ---------- 지난 글 보관함 (개편 전 글, DB 백업에서 읽기 전용) ---------- */
  async function viewBackup(id) {
    setAddr('지난 글 보관함', '지난 글 보관함');
    let rows;
    try { rows = await A.backupPosts(); } catch (e) { content.innerHTML = `<h2 class="page-title">📦 지난 글 보관함</h2>${errBox(e)}`; return; }
    const get = (r, ...k) => { for (const x of k) if (r[x] != null && r[x] !== '') return r[x]; return ''; };
    rows = rows.map((r, i) => ({ id: String(get(r, 'id') || i), title: get(r, 'title') || '(제목 없음)', body: get(r, 'body', 'content'), author: get(r, 'author_nick', 'author', 'nick'), created: get(r, 'created_at', 'created') })).sort((a, b) => new Date(b.created) - new Date(a.created));
    if (id) {
      const r = rows.find(x => x.id === id);
      if (!r) { content.innerHTML = '<div class="msg err">보관된 글을 찾을 수 없어요.</div><a class="btn" href="#/backup">← 보관함</a>'; return; }
      content.innerHTML = `<p><a href="#/backup">← 지난 글 보관함</a></p><h1 class="post-title">${esc(r.title)}</h1>
        <div class="post-meta">${esc(r.author)} · ${fmtDate(r.created)} · 개편 전 글 (읽기 전용)</div><div class="post-body">${renderBody(r.body)}</div>`;
      return;
    }
    content.innerHTML = `<h2 class="page-title">📦 지난 글 보관함</h2>
      <div class="panel raised">개편 전에 올라왔던 글이에요. 일정 기간 동안만 읽을 수 있고, 읽기 전용이에요.</div>
      ${rows.length ? `<table class="tbl"><thead><tr><th>제목</th><th class="hide-m" style="width:90px">글쓴이</th><th style="width:100px">날짜</th></tr></thead><tbody>${rows.map(r => `<tr><td class="t"><a href="#/backup/${encodeURIComponent(r.id)}">${esc(r.title)}</a></td><td class="c hide-m">${esc(r.author)}</td><td class="c">${fmtShort(r.created)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">보관된 글이 없어요.</div>'}`;
  }
  function viewLinks() {
    setAddr('링크 모음', '링크 모음');
    const L = settings.links || {};
    const people = [['서울교덕', 'seoul'], ['지철덕', 'ji']];
    const sites = [['Youtube', '▶️', '유튜브 채널', '영상으로 보는 덕질'], ['Instagram', '📸', '인스타그램', '사진·일상']];
    content.innerHTML = `<h2 class="page-title">🌐 링크 모음</h2>` + people.map(([nick, k]) =>
      `<div class="sub-title"><span>🧑 ${esc(nick)}</span><a href="#/author/${encodeURIComponent(nick)}">글 보기</a></div>
       <div class="board-grid">${sites.map(([s, ic, t, d]) => {
        const u = safeUrl(L[k + s]);
        return u ? `<a class="bcard raised" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><b>${ic} ${t}</b><small>${d}</small></a>`
          : `<div class="bcard raised" style="color:#777"><b>${ic} ${t}</b><small>준비 중이에요</small></div>`;
      }).join('')}</div>`).join('');
    setStatus('링크 모음', '');
  }
  function viewAbout() {
    setAddr('덕질역 소개', '덕질역 소개');
    const years = new Date().getFullYear() - C.since;
    content.innerHTML = `<h2 class="page-title">ℹ️ 덕질역 소개</h2>
      <div class="panel raised"><b>${esc(C.name)}</b> — ${esc(C.subtitle)}<br>${esc(C.since)}년부터 ${years}년째, 버스와 철도를 좋아하는 교통 덕후가 쓰는 기록장이에요.</div>
      <div class="sub-title"><span>🚏 이용 안내</span></div>
      <div class="panel sunken">
        <p>• 글은 글쓴이(운영진)만 쓸 수 있어요. 글쓴이 이름을 누르면 그 사람 글만 모아 볼 수 있어요.</p>
        <p>• 닉네임으로 가입하면(이메일 없이) 댓글·대댓글·방명록·공감을 쓸 수 있어요.</p>
        <p>• 심한 욕설이 포함된 댓글은 운영자가 확인할 때까지 보류돼요.</p>
        <p>• 글을 퍼 가실 땐 출처만 밝혀 주세요.</p>
      </div>
      <div class="sub-title"><span>⌨️ 글 쓰는 법 (글쓴이용)</span></div>
      <div class="panel sunken">
        <p><b># 큰 제목</b> · <b>## 작은 제목</b> · <b>**굵게**</b> · <b>*기울임*</b> · <b>~~취소선~~</b> · <b>==강조==</b> · <b>\`코드\`</b></p>
        <p><b>&gt; 인용</b> · <b>- 목록</b> · <b>1. 번호 목록</b> · <b>- [ ] 체크리스트</b> · <b>---</b> 구분선 · <b>[글자](주소)</b> 링크</p>
        <p>표는 <b>| 제목 | 제목 |</b> 아래 줄에 <b>|---|---|</b>, 코드 블록은 <b>\`\`\`</b> 로 감싸요. 사진·유튜브 주소는 한 줄에 붙여 넣기만 하면 돼요.</p>
      </div>`;
    setStatus('', '');
  }
  async function viewAuthor(nick) {
    const list = sortPinned((await A.listPosts()).filter(p => p.author === nick));
    setAddr('글쓴이\\' + nick, nick + '의 글');
    content.innerHTML = `<h2 class="page-title">✍ ${esc(nick)}의 글</h2>${postsTable(list, list.length, true)}`;
    setStatus(`${list.length}개 개체`, '');
  }
  function notFound() {
    setAddr('없는 페이지', '찾을 수 없음');
    content.innerHTML = `<div class="msg err">🚧 이 승강장은 아직 공사 중이에요. 글이 지워졌거나 주소가 잘못됐어요.</div><a class="btn" href="#/">🏠 홈으로</a>`;
  }

  /* ---------- 라우터 ---------- */
  async function route() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
    const [p, a, b] = parts;
    content.innerHTML = '<div class="loading">⏳ 열차 들어오는 중…</div>';
    try {
      if (!p || p === 'home') { buildTree('home'); await viewHome(); if (window.Photos) window.Photos.homeStrip(document.getElementById('phStrip')); }
      else if (p === 'board') { buildTree('board:' + a); await viewBoard(a, b); }
      else if (p === 'post') await viewPost(a);
      else if (p === 'author') { buildTree(''); await viewAuthor(a); }
      else if (p === 'search') { buildTree(''); await viewSearch(a, 'q'); }
      else if (p === 'tag') { buildTree(''); await viewSearch(a, 'tag'); }
      else if (p === 'photos') { buildTree('photos'); setAddr('', '촬영 사진'); await window.Photos.route(a, C); }
      else if (p === 'backup') { buildTree('backup'); await viewBackup(a); }
      else if (p === 'links') { buildTree('links'); viewLinks(); }
      else if (p === 'about') { buildTree('about'); viewAbout(); }
      else { buildTree(''); notFound(); }
      content.scrollTop = 0;
    } catch (e) { console.error(e); content.innerHTML = errBox(e); }
  }

  /* ---------- 로그인 상태 · 방문자 · 랜덤 글 ---------- */
  function refreshUser() {
    $('#trayVisit').textContent = `오늘 ${visit.today} / 전체 ${visit.total}`;
  }
  async function randomPost() {
    const l = await A.listPosts(); if (!l.length) return alertBox('아직 글이 없어요.');
    location.hash = '#/post/' + l[Math.floor(Math.random() * l.length)].id;
  }
  async function randomPost() {
    const l = await A.listPosts(); if (!l.length) return alertBox('아직 글이 없어요.');
    location.hash = '#/post/' + l[Math.floor(Math.random() * l.length)].id;
  }
  function bindChrome() {
    $('#mRandom').onclick = randomPost;
    $('#sform').onsubmit = e => { e.preventDefault(); const q = $('#q').value.trim(); if (q) location.hash = '#/search/' + encodeURIComponent(q); };
  }

  /* ---------- 시작 ---------- */
  (async function init() {
    bindChrome(); buildTree('home');
    try {
      await A.init(); me = A.me();
      settings = await A.getSettings();
      C.boards = settings.boards; C.categories = settings.categories;
      if (settings.customCss) { const st = document.createElement('style'); st.id = 'customCss'; st.textContent = String(settings.customCss).replace(/<\/style/gi, ''); document.head.appendChild(st); }
      visit = await A.hitVisit();
    } catch (e) {
      console.error(e); content.innerHTML = errBox(e) + '<div class="msg info">config.js의 Supabase 설정을 확인해 주세요. 비워 두면 로컬 데모 모드로 열려요.</div>';
      refreshUser(); return;
    }
    if (A.fallback) console.warn('Supabase 라이브러리를 불러오지 못해 로컬 데모 모드로 열었어요.');
    refreshUser();
    window.addEventListener('hashchange', route);
    route();
  })();

  /* ---------- 사진 확대 보기 ---------- */
  document.addEventListener('click', e => {
    const im = e.target.closest && e.target.closest('.post-body img, img.zoomable');
    if (!im || im.closest('a')) return;
    const src = im.currentSrc || im.src; if (!src) return;
    const imgs = [...document.querySelectorAll('.post-body img')].map(x => x.currentSrc || x.src);
    let i = Math.max(0, imgs.indexOf(src));
    const box = document.createElement('div');
    box.className = 'lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '사진 크게 보기');
    const draw = () => { box.innerHTML = `<img src="${esc(imgs.length ? imgs[i] : src)}" alt=""><button type="button" class="lb-x" aria-label="닫기">✕</button>${imgs.length > 1 ? '<button type="button" class="lb-n prev" aria-label="이전">‹</button><button type="button" class="lb-n next" aria-label="다음">›</button><span class="lb-c">' + (i + 1) + ' / ' + imgs.length + '</span>' : ''}`; };
    const close = () => { box.remove(); document.removeEventListener('keydown', key); };
    const go = d => { if (imgs.length > 1) { i = (i + d + imgs.length) % imgs.length; draw(); } };
    const key = ev => { if (ev.key === 'Escape') close(); else if (ev.key === 'ArrowLeft') go(-1); else if (ev.key === 'ArrowRight') go(1); };
    if (!imgs.length) imgs.push(src);
    draw();
    box.addEventListener('click', ev => { const t = ev.target; if (t.classList.contains('prev')) go(-1); else if (t.classList.contains('next')) go(1); else if (t.tagName !== 'IMG') close(); else close(); });
    document.addEventListener('keydown', key);
    document.body.appendChild(box);
  });

  /* ---------- 다크 모드 ---------- */
  const themeBtn = document.getElementById('themeBtn');
  if (themeBtn) {
    const apply = d => { document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light'); themeBtn.textContent = d ? '☀️' : '🌙'; themeBtn.setAttribute('aria-pressed', d ? 'true' : 'false'); themeBtn.title = d ? '밝은 모드로' : '어두운 모드로'; };
    apply(document.documentElement.getAttribute('data-theme') === 'dark');
    themeBtn.onclick = () => { const d = document.documentElement.getAttribute('data-theme') !== 'dark'; apply(d); try { localStorage.setItem('deokjil_theme', d ? 'dark' : 'light'); } catch (e) {} };
  }

  /* ---------- RSS 주소 (Supabase 함수) ---------- */
  (function () {
    const u = (window.SITE_CONFIG || {}).supabaseUrl; if (!u) return;
    const rss = u.replace(/\/$/, '') + '/functions/v1/rss';
    const a = document.getElementById('rssLink'); if (a) { a.href = rss; a.target = '_blank'; a.rel = 'noopener'; a.hidden = false; }
    const l = document.createElement('link'); l.rel = 'alternate'; l.type = 'application/rss+xml'; l.title = '덕질역 새 글'; l.href = rss; document.head.appendChild(l);
  })();
})();