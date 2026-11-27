/* 홈 화면 스크롤 애니메이션: 화면에 들어올 때 아래에서 부드럽게 떠오르게 해요. */
(function () {
  'use strict';
  const content = document.getElementById('content');
  if (!content || !('IntersectionObserver' in window)) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const st = document.createElement('style');
  st.textContent = `
    .rv { opacity: 0; transform: translateY(26px); transition: opacity .6s ease, transform .6s cubic-bezier(.2,.7,.2,1); will-change: opacity, transform; }
    .rv.in { opacity: 1; transform: none; }
    .rv.in.done { will-change: auto; }`;
  document.head.appendChild(st);
  const SEL = ['#phStrip', '#content > .led', '#content > .dep', '#content > .panel', '#content > .sub-title', '#content > .cat-h',
    '.cols > div > .sub-title', '.cols > div > .panel', '.cols > div > .tbl', '.cols > div > .empty', '.board-grid .bcard', '#content > div:last-child > .tag'].join(',');
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in'); io.unobserve(e.target);
    setTimeout(() => e.target.classList.add('done'), 900);
  }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
  const isHome = () => ['', '#', '#/'].includes(location.hash);
  let queued = false;
  function apply() {
    queued = false;
    if (!isHome()) return;
    let n = 0;
    content.querySelectorAll(SEL).forEach(el => {
      if (el.dataset.rv) return;
      el.dataset.rv = '1'; el.classList.add('rv');
      if (el.classList.contains('bcard') || el.classList.contains('tag')) el.style.transitionDelay = (n++ % 4) * 70 + 'ms';
      io.observe(el);
    });
  }
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(apply); } }).observe(content, { childList: true });
  apply();
})();
