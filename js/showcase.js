/* 사진자랑 — 인스타그램처럼 사진을 올리고 구경하는 피드 */
(function () {
  'use strict';
  const A = window.API, { esc, fmtDate } = window.Common;
  const LK = 'deokjil_sc_likes';
  const getL = () => { try { return JSON.parse(localStorage.getItem(LK) || '[]'); } catch (e) { return []; } };
  const setL = a => { try { localStorage.setItem(LK, JSON.stringify(a)); } catch (e) {} };
  const canPost = () => { const m = A.me(); return !!m && (m.role === 'admin' || m.role === 'author'); };

  /* 사진 줄이기: 긴 변 1600px, JPEG (GIF는 그대로) */
  function shrink(file) {
    return new Promise(res => {
      if (!/^image\/(jpe?g|png|webp)$/i.test(file.type)) return res(file);
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(b => res(b || file), 'image/jpeg', .86);
      };
      img.onerror = () => { URL.revokeObjectURL(u); res(file); };
      img.src = u;
    });
  }

  const card = (p, liked) => `<article class="sc-card" data-id="${esc(p.id)}">
    <div class="sc-head"><img class="emo" src="images/logo.png" alt=""><div><b>${esc(p.author || '덕질역')}</b><small>${fmtDate(p.created)}</small></div>
      ${canPost() ? `<button class="btn sm danger sc-del" type="button" data-del="${esc(p.id)}">삭제</button>` : ''}</div>
    <div class="sc-slides" tabindex="0" aria-label="사진 ${p.images.length}장">${p.images.map(u => `<div class="sc-slide"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(u)}" alt=""></div>`).join('')}</div>
    ${p.images.length > 1 ? `<div class="sc-dots">${p.images.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>` : ''}
    <div class="sc-act"><button class="sc-like${liked ? ' on' : ''}" type="button" data-like="${esc(p.id)}" aria-pressed="${liked}">${liked ? '♥' : '♡'}</button><span class="sc-n">공감 <b>${p.likes}</b></span></div>
    ${p.caption ? `<p class="sc-cap"><b>${esc(p.author || '덕질역')}</b> ${esc(p.caption).replace(/\n/g, '<br>')}</p>` : ''}</article>`;

  async function view() {
    const el = document.getElementById('content');
    let list;
    try { list = await A.listShowcase(); } catch (e) { el.innerHTML = `<h2 class="page-title">📸 출사 사진 갤러리</h2><div class="msg err">${esc(e.message)}</div>`; return; }
    const mine = new Set(getL());
    el.innerHTML = `<h2 class="page-title">📸 출사 사진 갤러리</h2>
      <p class="hint">찍은 사진을 올리는 곳이에요. (사진 ${list.length}개)</p>
      ${canPost() ? `<form class="sc-up" id="scForm"><div class="sc-pick"><label class="btn primary" for="scFiles">📷 사진 고르기 (최대 10장)</label><input id="scFiles" type="file" accept="image/*" multiple hidden><span id="scInfo" class="hint"></span></div>
        <div class="sc-prev" id="scPrev"></div>
        <textarea class="input" id="scCap" rows="2" maxlength="500" placeholder="사진에 대한 한마디 (선택)"></textarea>
        <button class="btn primary" type="submit" id="scGo" disabled>올리기</button> <span id="scMsg" class="hint"></span></form>`
        : ''}
      <div class="sc-feed">${list.length ? list.map(p => card(p, mine.has(p.id))).join('') : '<div class="empty">아직 올라온 사진이 없어요 📸</div>'}</div>`;

    /* 올리기 */
    const form = document.getElementById('scForm');
    if (form) {
      let files = [];
      const fi = document.getElementById('scFiles'), prev = document.getElementById('scPrev'), go = document.getElementById('scGo');
      fi.onchange = () => {
        files = [...fi.files].slice(0, 10);
        prev.innerHTML = files.map(f => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
        document.getElementById('scInfo').textContent = files.length ? `${files.length}장 선택됨` : '';
        go.disabled = !files.length;
      };
      form.onsubmit = async e => {
        e.preventDefault(); if (!files.length) return;
        const msg = document.getElementById('scMsg'); go.disabled = true;
        try {
          const urls = [];
          for (let i = 0; i < files.length; i++) { msg.textContent = `올리는 중… ${i + 1}/${files.length}`; urls.push(await A.uploadImage(await shrink(files[i]))); }
          await A.addShowcase({ caption: document.getElementById('scCap').value.trim(), images: urls });
          view();
        } catch (err) { msg.textContent = '⚠️ ' + err.message; go.disabled = false; }
      };
    }
    /* 공감 */
    const like = async id => {
      const arr = getL(), on = !arr.includes(id), c = el.querySelector(`.sc-card[data-id="${CSS.escape(id)}"]`); if (!c) return;
      setL(on ? [...arr, id] : arr.filter(x => x !== id));
      const b = c.querySelector('.sc-like'), n = c.querySelector('.sc-n b');
      b.classList.toggle('on', on); b.textContent = on ? '♥' : '♡'; b.setAttribute('aria-pressed', on); n.textContent = Math.max(0, (+n.textContent || 0) + (on ? 1 : -1));
      try { await A.likeShowcase(id, on); } catch (e) {}
    };
    el.querySelectorAll('[data-like]').forEach(b => b.onclick = () => like(b.dataset.like));
    el.querySelectorAll('.sc-slides').forEach(s => {
      s.ondblclick = () => { const id = s.closest('.sc-card').dataset.id; if (!getL().includes(id)) like(id); };
      const dots = s.parentElement.querySelectorAll('.sc-dots i');
      if (dots.length) s.onscroll = () => { const i = Math.round(s.scrollLeft / s.clientWidth); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
    });
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('이 사진 게시물을 삭제할까요?')) return;
      try { await A.deleteShowcase(b.dataset.del); view(); } catch (e) { alert(e.message); }
    });
  }
  window.Showcase = { route: view };
})();
