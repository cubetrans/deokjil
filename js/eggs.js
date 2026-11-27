/* 덕질역 숨은 기능 — 이스터에그 4개 + 운영진 센터 비밀 입구 */
(function () {
  'use strict';
  const C = window.Common || {};
  const alertBox = C.alertBox || (t => window.alert(t));
  const LOGO = 'images/logo.png';
  const st = document.createElement('style');
  st.textContent = `
    @keyframes eg-run { from { transform: translateX(-1400px); } to { transform: translateX(100vw); } }
    .eg-train { position: fixed; left: 0; bottom: 12%; z-index: 9999; animation: eg-run 7s linear forwards; pointer-events: none; filter: drop-shadow(0 6px 5px rgba(0,0,0,.3)); }
    .eg-train img { display: block; height: 90px; width: auto; max-width: none; }
    @keyframes eg-fall { from { transform: translateY(-80px) rotate(0); opacity: 1; } to { transform: translateY(110vh) rotate(540deg); opacity: .9; } }
    .eg-drop { position: fixed; top: 0; z-index: 9999; pointer-events: none; animation: eg-fall linear forwards; border-radius: 6px; }
    @media (prefers-reduced-motion: reduce) { .eg-train, .eg-drop { display: none; } }`;
  document.head.appendChild(st);

  /* 1) ↑↑↓↓←→←→ B A : 덕질 열차가 지나가요 */
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let kpos = 0, typed = '';
  function train() {
    const t = document.createElement('div'); t.className = 'eg-train';
    t.innerHTML = '<img src="images/ktx-train.svg" alt="">';
    document.body.appendChild(t); setTimeout(() => t.remove(), 7300);
  }
  /* 2) deokjil 이라고 치면 로고 비가 내려요 */
  function rain() {
    for (let i = 0; i < 36; i++) {
      const d = document.createElement('img'); d.src = LOGO; d.alt = ''; d.className = 'eg-drop';
      const s = 24 + Math.random() * 30;
      d.style.cssText = `left:${Math.random() * 100}vw;width:${s}px;height:${s}px;animation-duration:${2 + Math.random() * 2.5}s;animation-delay:${Math.random() * 1.2}s`;
      document.body.appendChild(d); setTimeout(() => d.remove(), 6000);
    }
  }
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kpos = k === KONAMI[kpos] ? kpos + 1 : (k === KONAMI[0] ? 1 : 0);
    if (kpos === KONAMI.length) { kpos = 0; train(); }
    if (e.key.length === 1) { typed = (typed + k).slice(-7); if (typed === 'deokjil') { typed = ''; rain(); } }
  });

  /* 3) 방문자 숫자판을 3번 누르면 안내방송 */
  let odoN = 0, odoT = 0;
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('.odo')) {
      clearTimeout(odoT); odoT = setTimeout(() => { odoN = 0; }, 1500);
      if (++odoN >= 3) {
        odoN = 0;
        const msg = '이번 역은 덕질, 덕질역입니다. 내리실 문은 왼쪽입니다. 오늘도 안전하게 덕질하세요.';
        try { const u = new SpeechSynthesisUtterance(msg); u.lang = 'ko-KR'; u.rate = .95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (x) {}
        alertBox(msg, '🔔 안내방송', '🚉');
      }
    }
    /* ★ 머리말 "버스·철도 덕질 기록소"를 4초 안에 5번 누르면 운영진 센터로 */
    if (e.target.closest && e.target.closest('.site-sub')) {
      subN++; clearTimeout(subT); subT = setTimeout(() => { subN = 0; }, 4000);
      if (subN >= 5) { subN = 0; location.href = 'admin.html'; }
    }
  });
  let subN = 0, subT = 0;

  /* 4) "막차"를 검색하면… */
  document.addEventListener('submit', e => {
    if (e.target.id !== 'sform') return;
    const q = (document.getElementById('q') || {}).value;
    if ((q || '').trim() === '막차') alertBox('막차는 이미 떠났습니다…\n택시를 이용해 주세요 🚕\n(걱정 마세요, 덕질역은 24시간 운행합니다)', '막차 안내', '🌙');
  }, true);
})();
