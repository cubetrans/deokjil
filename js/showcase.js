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

  /* 격자 카드: 사진 비율 그대로(검은 여백 없음), 누르면 상세 */
  const tile = (p, liked) => `<button type="button" class="sc-tile" data-open="${esc(p.id)}" aria-label="${esc(p.caption || '사진')} 자세히 보기">
    <span class="sc-ph"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(p.images[0])}" alt="">${p.images.length > 1 ? `<i class="sc-multi">▣ ${p.images.length}</i>` : ''}<i class="sc-hrt${liked ? ' on' : ''}">${liked ? '♥' : '♡'}</i></span>
    <span class="sc-t">${esc(p.caption ? p.caption.split('\n')[0] : (p.author || '덕질역'))}</span><span class="sc-s">${esc(p.author || '덕질역')} · ${fmtDate(p.created)}${p.likes ? ` · ♥ ${p.likes}` : ''}</span></button>`;

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
      <div class="sc-grid">${list.length ? list.map(p => tile(p, mine.has(p.id))).join('') : '<div class="empty">아직 올라온 사진이 없어요 📸</div>'}</div>`;

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
    /* 상세 보기 */
    const open = id => {
      const p = list.find(x => x.id === id); if (!p) return;
      let liked = getL().includes(id), idx = 0;
      const ov = document.createElement('div'); ov.className = 'sc-ov';
      const paint = () => { ov.innerHTML = `<div class="sc-modal" role="dialog" aria-modal="true"><button class="sc-x" type="button" aria-label="닫기">✕</button>
        <div class="sc-view"><img referrerpolicy="no-referrer" src="${esc(p.images[idx])}" alt="">${p.images.length > 1 ? `<button class="sc-nv l" type="button" aria-label="이전">‹</button><button class="sc-nv r" type="button" aria-label="다음">›</button><span class="sc-cnt">${idx + 1} / ${p.images.length}</span>` : ''}</div>
        <div class="sc-info"><div class="sc-who"><img class="emo" src="images/logo.png" alt=""><div><b>${esc(p.author || '덕질역')}</b><small>${fmtDate(p.created)}</small></div></div>
          ${p.caption ? `<p class="sc-cap">${esc(p.caption).replace(/\n/g, '<br>')}</p>` : '<p class="sc-cap" style="color:#999">한마디가 없어요</p>'}
          <div class="sc-act"><button class="sc-like${liked ? ' on' : ''}" type="button" aria-pressed="${liked}">${liked ? '♥' : '♡'}</button><span class="sc-n">공감 <b>${p.likes}</b></span>${canPost() ? '<button class="btn sm danger sc-del" type="button">삭제</button>' : ''}</div></div></div>`;
        ov.querySelector('.sc-x').onclick = close;
        const L = ov.querySelector('.sc-nv.l'), R = ov.querySelector('.sc-nv.r');
        if (L) { L.onclick = () => { idx = (idx + p.images.length - 1) % p.images.length; paint(); }; R.onclick = () => { idx = (idx + 1) % p.images.length; paint(); }; }
        ov.querySelector('.sc-like').onclick = async () => {
          const arr = getL(); liked = !arr.includes(id); setL(liked ? [...arr, id] : arr.filter(x => x !== id)); p.likes = Math.max(0, p.likes + (liked ? 1 : -1)); paint();
          const t = el.querySelector(`[data-open="${CSS.escape(id)}"]`); if (t) { const h = t.querySelector('.sc-hrt'); h.classList.toggle('on', liked); h.textContent = liked ? '♥' : '♡'; }
          try { await A.likeShowcase(id, liked); } catch (e) {} };
        const d = ov.querySelector('.sc-del'); if (d) d.onclick = async () => { if (!confirm('이 사진 게시물을 삭제할까요?')) return; try { await A.deleteShowcase(id); close(); view(); } catch (e) { alert(e.message); } };
      };
      const kd = e => { if (e.key === 'Escape') close(); else if (p.images.length > 1 && e.key === 'ArrowLeft') { idx = (idx + p.images.length - 1) % p.images.length; paint(); } else if (p.images.length > 1 && e.key === 'ArrowRight') { idx = (idx + 1) % p.images.length; paint(); } };
      function close() { document.removeEventListener('keydown', kd); ov.remove(); document.body.style.overflow = ''; }
      ov.addEventListener('click', e => { if (e.target === ov) close(); });
      document.addEventListener('keydown', kd); document.body.appendChild(ov); document.body.style.overflow = 'hidden'; paint();
    };
    el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => open(b.dataset.open));
  }
  window.Showcase = { route: view };
})();
