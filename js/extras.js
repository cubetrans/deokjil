/* 덕질역 편의 기능 모음
   - 단축키: / 검색 · ? 도움말 · g 다음 h/w/m/s/n (홈·글쓰기·장터·상점·알림) · t 맨 위로
   - 밝게/어둡게 빠른 전환 (🌓)
   - 최근 본 글 (홈 화면, 이 브라우저에만 저장)
   - 글쓰기 임시 저장 (이 브라우저에만 저장, 발행하면 지워요)
   - 탭 제목에 안 읽은 알림·쪽지 수 표시
   - 시스템이 어두운 모드면 처음 방문 때 어두운 테마로 시작
   모두 없어도 사이트가 동작하도록, 실패하면 조용히 넘어가요. */
(function () {
  'use strict';
  const K = window.Common || {};
  const $ = s => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const typing = el => !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);

  /* ---------- 밝게/어둡게 ---------- */
  const DARK = K.DARK_THEMES || ['ios-dark', 'midnight', 'night-bus'];
  const isDark = () => DARK.indexOf(document.documentElement.dataset.theme) >= 0;
  function toggleMode() {
    if (!K.applyTheme) return;
    if (isDark()) {
      const back = store.get('deokjil_lightpick', 'station');
      K.applyTheme(DARK.indexOf(back) >= 0 ? 'station' : back); store.set('deokjil_mode', 'light');
    } else {
      store.set('deokjil_lightpick', document.documentElement.dataset.theme || 'station');
      K.applyTheme('ios-dark'); store.set('deokjil_mode', 'dark');
    }
    paintMode();
  }
  function paintMode() {
    const b = $('#bMode'), d = $('#dMode');
    if (b) { b.textContent = isDark() ? '☀️' : '🌙'; b.title = isDark() ? '밝게 보기' : '어둡게 보기'; }
    if (d) d.textContent = isDark() ? '☀️ 밝게 보기' : '🌙 어둡게 보기';
  }
  const bm = $('#bMode'); if (bm) bm.addEventListener('click', toggleMode);
  const dm = $('#dMode'); if (dm) dm.addEventListener('click', toggleMode);
  paintMode();
  new MutationObserver(paintMode).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------- 단축키 ---------- */
  let gWait = 0;
  function helpDialog() {
    if (!K.openWin) return;
    const rows = [['/', '글 검색창으로 이동'], ['g 그리고 h', '홈'], ['g 그리고 w', '글쓰기'], ['g 그리고 m', '중고거래 장터'], ['g 그리고 s', '상점'], ['g 그리고 n', '알림'], ['t', '맨 위로'], ['d', '밝게/어둡게 전환'], ['?', '이 도움말']];
    const w = K.openWin({ title: '키보드 단축키', width: 380, html: `<div class="dlg-body" style="display:block"><div class="keys-help">${rows.map(r => `<span>${r[0].split(' 그리고 ').map(k => `<span class="kbd">${esc(k)}</span>`).join(' ＋ ')}</span><span>${esc(r[1])}</span>`).join('')}</div><p class="draft-note">글을 쓰는 중에는 단축키가 꺼져요.</p></div><div class="dlg-btns"><button class="btn primary" type="button" data-ok>닫기</button></div>` });
    const ok = w.el.querySelector('[data-ok]'); if (ok) ok.onclick = () => w.close();
  }
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e.target) || document.querySelector('.overlay')) return;
    const k = e.key;
    if (gWait && Date.now() < gWait) {
      gWait = 0;
      const go = { h: '#/', w: '#/write', m: '#/market', s: '#/shop', n: '#/notifications' }[k];
      if (go) { e.preventDefault(); location.hash = go; return; }
    }
    if (k === '/') { const q = $('#q'); if (q) { e.preventDefault(); q.focus(); q.select(); } }
    else if (k === '?') { e.preventDefault(); helpDialog(); }
    else if (k === 'g') gWait = Date.now() + 1200;
    else if (k === 't') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (k === 'd') toggleMode();
  });

  /* ---------- 탭 제목에 안 읽은 수 ---------- */
  const countOf = s => { const el = $(s + ' .nb'); const n = el && !el.hidden ? parseInt(el.textContent, 10) : 0; return n > 0 ? n : 0; };
  let titleBusy = false;
  function paintTitle() {
    if (titleBusy) return; titleBusy = true;
    const n = countOf('#bNotif') + countOf('#bDm');
    const base = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = (n ? '(' + n + ') ' : '') + base;
    setTimeout(() => { titleBusy = false; }, 0);
  }
  const tEl = document.querySelector('title');
  if (tEl) new MutationObserver(paintTitle).observe(tEl, { childList: true });
  ['#bNotif', '#bDm'].forEach(s => { const el = $(s); if (el) new MutationObserver(paintTitle).observe(el, { subtree: true, childList: true, attributes: true, characterData: true }); });

  /* ---------- 안 읽은 알림이 있으면 아이콘이 살짝 흔들려요 ---------- */
  function ring() { ['#bNotif', '#bDm'].forEach(s => { const el = $(s); if (el) el.classList.toggle('ring', countOf(s) > 0); }); }
  ['#bNotif', '#bDm'].forEach(s => { const el = $(s); if (el) new MutationObserver(ring).observe(el, { subtree: true, childList: true, attributes: true, characterData: true }); });
  ring();

  /* ---------- 스크롤하면 아래쪽 상자가 스르륵 나타나요 ---------- */
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let io = null;
  function reveal() {
    if (reduce || !('IntersectionObserver' in window) || !content) return;
    if (!io) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('rv-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    content.querySelectorAll('.panel, .sub-title, .bcard, .mk-card, .nt-list, .pcard, .sitem').forEach(el => {
      if (el.dataset.rv) return; el.dataset.rv = '1';
      if (el.getBoundingClientRect().top < innerHeight * 0.95) return;   // 처음부터 보이는 건 그대로
      el.classList.add('rv'); io.observe(el);
    });
  }

  /* ---------- 최근 본 글 / 글쓰기 임시 저장 ---------- */
  const content = $('#content');
  const RK = 'deokjil_recent';
  const readRecent = () => { try { return JSON.parse(store.get(RK, '[]')) || []; } catch (e) { return []; } };
  function noteRecent() {
    const m = location.hash.match(/^#\/post\/([^/?]+)/); if (!m) return;
    const id = decodeURIComponent(m[1]);
    const t = content && content.querySelector('.post-title'); if (!t) return;
    const title = t.textContent.replace(/^\s*📌\s*/, '').trim(); if (!title) return;
    const list = readRecent().filter(x => x.id !== id); list.unshift({ id, t: title.slice(0, 80) });
    store.set(RK, JSON.stringify(list.slice(0, 8)));
  }
  function paintRecent() {
    if (!content || (location.hash && location.hash !== '#/' && location.hash !== '#')) return;
    if (content.querySelector('.recent-wrap') || !content.querySelector('.page-title')) return;
    const list = readRecent(); if (!list.length) return;
    const box = document.createElement('div'); box.className = 'recent-wrap';
    box.innerHTML = `<div class="sub-title"><span>🕘 최근 본 글</span><a href="javascript:void 0" id="recentClear" style="font-size:12px">지우기</a></div><div class="recent-box">${list.map(x => `<a href="#/post/${encodeURIComponent(x.id)}" title="${esc(x.t)}">${esc(x.t)}</a>`).join('')}</div>`;
    const anchor = content.querySelector('.page-title');
    let at = anchor.nextElementSibling; while (at && /ticker|msg|notice/.test(at.className || '') && at.nextElementSibling) at = at.nextElementSibling;
    (at || anchor).insertAdjacentElement('afterend', box);
    box.querySelector('#recentClear').onclick = () => { store.del(RK); box.remove(); };
  }
  const DK = 'deokjil_draft';
  let draftTimer = null;
  function bindDraft() {
    const f = content && content.querySelector('#ef'); if (!f || f.dataset.draft) return;
    if (/^#\/edit\//.test(location.hash)) return;                    // 수정 화면은 임시 저장하지 않아요
    f.dataset.draft = '1';
    const t = f.querySelector('#et'), c = f.querySelector('#ec'), g = f.querySelector('#eg'); if (!t || !c) return;
    let d = null; try { d = JSON.parse(store.get(DK, 'null')); } catch (e) {}
    const note = document.createElement('div'); note.className = 'draft-note'; f.appendChild(note);
    if (d && !t.value && !c.value && (d.t || d.c)) {
      t.value = d.t || ''; c.value = d.c || ''; if (g) g.value = d.g || '';
      note.innerHTML = '✍ 쓰던 글을 불러왔어요. <a href="javascript:void 0" id="draftDrop">버리기</a>';
      note.querySelector('#draftDrop').onclick = () => { t.value = ''; c.value = ''; if (g) g.value = ''; store.del(DK); note.textContent = ''; };
    }
    const save = () => {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        if (!t.value && !c.value) { store.del(DK); return; }
        store.set(DK, JSON.stringify({ t: t.value, c: c.value, g: g ? g.value : '' }));
        note.textContent = '💾 임시 저장됨 ' + new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
      }, 800);
    };
    f.addEventListener('input', save);
    f.addEventListener('submit', () => { clearTimeout(draftTimer); setTimeout(() => store.del(DK), 3000); });
  }
  // 발행이 끝나서 글 화면으로 넘어가면 임시 저장을 지워요
  window.addEventListener('hashchange', () => { if (/^#\/post\//.test(location.hash) && store.get(DK, null)) { clearTimeout(draftTimer); store.del(DK); } });

  if (content) {
    let busy = false;
    new MutationObserver(() => {
      if (busy) return; busy = true;
      try { noteRecent(); paintRecent(); bindDraft(); reveal(); } catch (e) {}
      busy = false;
    }).observe(content, { childList: true });
  }

  /* ---------- 첫 방문: 시스템 다크 모드 따라가기는 index.html 머리말 스크립트에서 처리해요 ---------- */
  window.DJExtras = { toggleMode, helpDialog };
})();
