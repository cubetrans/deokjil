/* 사진 갤러리 — 글에 첨부된 사진을 한곳에 모아 보여 줘요 */
(function () {
  'use strict';
  const A = window.API, { esc, fmtShort } = window.Common;
  const RE_TAG = /\[img(?:\s+\d{1,3}%?)?\]\s*((?:https?:\/\/|images\/)\S+)/gi;
  const RE_URL = /(?:https?:\/\/|images\/)[^\s)\]"'<>]+?\.(?:png|jpe?g|gif|webp|bmp)(?:\?[^\s)\]"'<>]*)?/gi;

  function imagesOf(body) {
    const set = new Set(); let m;
    const src = String(body || '');
    while ((m = RE_TAG.exec(src))) set.add(m[1]);
    while ((m = RE_URL.exec(src))) set.add(m[0]);
    return [...set];
  }
  async function collect() {
    const posts = await A.listPosts();
    const out = [];
    posts.forEach(p => imagesOf(p.body).forEach(u => out.push({ url: u, pid: p.id, title: p.title, board: p.board, created: p.created })));
    return out;
  }
  const boardName = id => { const b = (window.SITE_BOARDS || (window.Common && window.Common.boards) || []).find(x => x.id === id); return b ? b.name : ''; };
  const card = x => `<a class="ph-card" href="#/post/${esc(x.pid)}"><div class="ph-img"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(x.url)}" alt=""></div><div class="ph-meta"><b>${esc(x.title)}</b><span>${fmtShort(x.created)}</span></div></a>`;

  async function viewGallery(boardId, C) {
    const all = await collect();
    const boards = [...new Set(all.map(x => x.board))];
    const list = boardId ? all.filter(x => x.board === boardId) : all;
    const nameOf = id => ((C && C.boards) || []).find(b => b.id === id)?.name || id;
    const el = document.getElementById('content');
    el.innerHTML = `<h2 class="page-title">📷 사진 갤러리</h2>
      <p class="hint">글에 올린 사진을 한곳에 모아 놨어요. 사진을 누르면 그 글로 가요. (사진 ${all.length}장)</p>
      <div class="ride-chips ph-chips"><a class="chip${boardId ? '' : ' on'}" href="#/photos">전체</a>${boards.map(b => `<a class="chip${boardId === b ? ' on' : ''}" href="#/photos/${encodeURIComponent(b)}">${esc(nameOf(b))}</a>`).join('')}</div>
      ${list.length ? `<div class="ph-grid">${list.map(card).join('')}</div>` : '<div class="empty">아직 글에 올린 사진이 없어요 📷</div>'}`;
  }
  async function homeStrip(el) {
    if (!el) return;
    try {
      const all = (await collect()).slice(0, 8);
      if (!all.length) return;
      el.innerHTML = `<div class="ph-strip"><div class="ph-strip-h"><b>📷 최근 사진</b><a href="#/photos">전체 보기 →</a></div><div class="ph-row">${all.map(card).join('')}</div></div>`;
    } catch (e) {}
  }
  window.Photos = { route: (a, C) => viewGallery(a ? decodeURIComponent(a) : '', C), homeStrip };
})();
