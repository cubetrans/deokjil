/* 운영진 센터 미니게임: 지하철 운전 · CPU와 야구 */
(function () {
  'use strict';
  let cleanup = [];
  const stop = () => { cleanup.forEach(f => { try { f(); } catch (e) {} }); cleanup = []; };
  const $ = (s, r) => (r || document).querySelector(s);

  /* =============== 지하철 운전 게임 =============== */
  function subway(main) {
    const ST = ['덕질역', '대모산입구', '개포동', '대청', '일원', '수서'];
    const SEC = 1500, SCALE = 3, TRAIN_X = 150;   // 구간 길이(m), 화면 배율(px/m)
    const LIMITS = [{ from: 0, to: 350, v: 80 }, { from: 350, to: 650, v: 45 }, { from: 650, to: 1100, v: 80 }, { from: 1100, to: SEC, v: 60 }];
    const limitAt = x => (LIMITS.find(l => x >= l.from && x < l.to) || { v: 60 }).v;
    const W = 720, H = 260;
    main.innerHTML = `<h2 class="page-title">🚇 지하철 운전 게임</h2>
      <p class="hint">역에 정확히 세워 보세요! ↑ / ↓ 키(또는 아래 버튼)로 노치를 올리고 내려요. <b>스페이스</b>는 비상 제동이에요. 제한속도를 넘으면 감점!</p>
      <div class="gm-wrap"><canvas id="swC" width="${W}" height="${H}" class="gm-canvas"></canvas>
      <div class="gm-hud" id="swHud"></div>
      <div class="gm-btns"><button class="btn" id="swB">⬇ 브레이크 +</button><button class="btn" id="swN">● 중립</button><button class="btn" id="swP">⬆ 가속 +</button><button class="btn danger" id="swE">🛑 비상</button></div>
      <div class="gm-msg" id="swMsg"></div></div>`;
    const cv = $('#swC'), g = cv.getContext('2d');
    let s;
    const init = () => { s = { st: 0, x: 0, v: 0, notch: 0, score: 0, t: 0, sched: 0, phase: 'wait', wait: 2, log: [], over: false, over_t: 0, flash: 0 }; s.sched = SEC / 16 + 30; msg(`${ST[0]} 출발 준비… 가속(↑)해서 출발하세요!`); };
    const msg = t => { $('#swMsg').textContent = t; };
    const accel = n => n >= 0 ? n * 0.28 : n * 0.42;   // m/s²
    const stopDist = (v, n) => { const b = Math.max(0.2, -accel(Math.min(n, -1))); return v * v / (2 * b); };
    let last = performance.now(), raf = 0;
    function step(dt) {
      if (s.over) return;
      if (s.phase === 'wait') { s.wait -= dt; s.notch = s.notch; if (s.wait <= 0) { s.phase = 'run'; s.x = 0; s.t = 0; msg(`${ST[s.st]} → ${ST[s.st + 1]}  출발! 제시간: ${Math.round(s.sched)}초`); } return; }
      if (s.phase === 'doors') { s.wait -= dt; if (s.wait <= 0) { if (s.st >= ST.length - 2) { s.over = true; finish(); return; } s.st++; s.phase = 'wait'; s.wait = 1.5; s.notch = 0; msg(`${ST[s.st]} 출발 준비…`); } return; }
      const a = accel(s.notch); const grade = 0;
      s.v = Math.max(0, s.v + (a + grade) * dt); if (s.v > 30) s.v = 30;
      s.x += s.v * dt; s.t += dt;
      const kmh = s.v * 3.6, lim = limitAt(s.x);
      if (kmh > lim + 2) { s.score -= dt * 2; s.flash = .2; }
      const rem = SEC - s.x;
      if (rem < -12) { /* 지나침 */ s.score -= 40; msg('⚠️ 정차 위치를 너무 지나쳤어요! (-40점)'); s.phase = 'doors'; s.wait = 2; s.v = 0; s.log.push({ n: ST[s.st + 1], e: '지나침', p: -40 }); return; }
      if (s.v < 0.15 && s.notch < 0 && rem < 60) {   // 정차
        s.v = 0; const err = Math.abs(rem), late = s.t - s.sched;
        let p = err < 1 ? 100 : err < 3 ? 80 : err < 6 ? 55 : err < 10 ? 30 : 10;
        const tp = late <= 0 ? 20 : late < 10 ? 10 : -Math.min(30, Math.round(late));
        s.score += p + tp; s.log.push({ n: ST[s.st + 1], e: (rem >= 0 ? rem.toFixed(1) + 'm 앞' : (-rem).toFixed(1) + 'm 넘음'), p: Math.round(p + tp), late: late.toFixed(0) });
        msg(`🚉 ${ST[s.st + 1]} 정차! 위치 ${p}점 · 시간 ${tp >= 0 ? '+' : ''}${tp}점 (오차 ${err.toFixed(1)}m)`);
        s.phase = 'doors'; s.wait = 2.5; return;
      }
      if (s.v < 0.15 && s.notch < 0 && rem >= 60 && s.t > 3) { /* 중간 정차는 자연스럽게 재출발 가능 */ }
    }
    function finish() {
      const tot = Math.round(s.score), rank = tot > 600 ? 'S 🏆 특급 기관사' : tot > 450 ? 'A 우수 기관사' : tot > 300 ? 'B 숙련 기관사' : tot > 150 ? 'C 견습 기관사' : 'D 연습이 필요해요';
      msg('');
      $('#swHud').innerHTML = `<div class="gm-end"><h3>운행 종료!</h3><p>총점 <b>${tot}점</b> · ${rank}</p><table class="tbl"><thead><tr><th>역</th><th>정차</th><th>점수</th></tr></thead><tbody>${s.log.map(l => `<tr><td>${l.n}</td><td>${l.e}</td><td class="c">${l.p}</td></tr>`).join('')}</tbody></table><button class="btn primary" id="swAgain">다시 하기</button></div>`;
      $('#swAgain').onclick = () => { init(); };
    }
    function draw() {
      g.clearRect(0, 0, W, H);
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0c1b33'); sky.addColorStop(1, '#2b4f7e'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const gy = 190, rem = SEC - s.x;
      const off = s.x * SCALE;
      // 먼 건물
      g.fillStyle = '#16294a'; for (let i = -1; i < 14; i++) { const bx = i * 70 - (off * .25 % 70), bh = 40 + ((i * 37) % 5) * 14; g.fillRect(bx, gy - bh - 30, 48, bh + 30); }
      // 제한 속도 구간 표시(상단)
      LIMITS.forEach(l => { const x0 = TRAIN_X + (l.from - s.x) * SCALE, x1 = TRAIN_X + (l.to - s.x) * SCALE; if (x1 < 0 || x0 > W) return; g.fillStyle = l.v < 60 ? 'rgba(255,90,90,.25)' : 'rgba(255,255,255,.07)'; g.fillRect(Math.max(0, x0), 10, Math.min(W, x1) - Math.max(0, x0), 22); g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText('제한 ' + l.v + 'km/h', Math.max(6, x0 + 6), 26); });
      // 선로
      g.fillStyle = '#3a3f4a'; g.fillRect(0, gy, W, 70); g.fillStyle = '#8b93a3'; g.fillRect(0, gy + 6, W, 3);
      g.fillStyle = '#5b4a3a'; for (let i = -1; i < 40; i++) { const tx = i * 24 - (off % 24); g.fillRect(tx, gy + 10, 10, 6); }
      // 역(승강장) — 정차 위치 = rem
      const sx = TRAIN_X + rem * SCALE;
      if (sx > -400 && sx < W + 400) {
        g.fillStyle = '#c9d3e3'; g.fillRect(sx - 330, gy - 14, 360, 14); g.fillStyle = '#e8eef9'; g.fillRect(sx - 330, gy - 16, 360, 3);
        g.fillStyle = '#3182f6'; g.fillRect(sx - 330, gy - 70, 360, 8); g.fillStyle = '#9fb3cf'; for (let k = 0; k < 6; k++) g.fillRect(sx - 320 + k * 60, gy - 62, 6, 48);
        g.fillStyle = '#fff'; g.fillRect(sx - 40, gy - 58, 70, 24); g.fillStyle = '#16294a'; g.font = 'bold 13px sans-serif'; g.fillText(ST[Math.min(s.st + 1, ST.length - 1)], sx - 34, gy - 41);
        g.fillStyle = '#ffd400'; g.fillRect(sx - 1, gy - 14, 3, 14); g.fillRect(sx - 1, gy + 4, 3, 24);   // 정지선
      }
      // 열차
      const cars = 4, cw = 118; g.save(); if (s.flash > 0) { g.translate(0, Math.sin(performance.now() / 20)); s.flash -= .016; }
      for (let c = 0; c < cars; c++) { const x = TRAIN_X - (c + 1) * (cw + 4) + cw; g.fillStyle = '#e9edf3'; g.fillRect(x, gy - 46, cw, 44); g.fillStyle = '#3182f6'; g.fillRect(x, gy - 22, cw, 6); g.fillStyle = '#1b2a44'; for (let w = 0; w < 5; w++) g.fillRect(x + 8 + w * 22, gy - 40, 16, 14); g.fillStyle = '#222'; g.fillRect(x + 10, gy - 2, 18, 5); g.fillRect(x + cw - 28, gy - 2, 18, 5); }
      g.fillStyle = '#ffe36b'; g.fillRect(TRAIN_X + 2, gy - 18, 6, 6); g.restore();
      // 정차 가이드(제동거리)
      const sd = stopDist(s.v, -5); if (s.phase === 'run' && s.v > 1) { const gx = TRAIN_X + sd * SCALE; if (gx < W) { g.strokeStyle = '#ffd400'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(gx, gy - 90); g.lineTo(gx, gy); g.stroke(); g.setLineDash([]); g.fillStyle = '#ffd400'; g.font = '11px sans-serif'; g.fillText('B5 제동거리', gx - 30, gy - 94); } }
      // HUD
      const kmh = s.v * 3.6, lim = limitAt(s.x);
      const nt = s.notch >= 0 ? (s.notch === 0 ? '중립' : 'P' + s.notch) : 'B' + (-s.notch);
      $('#swHud') && !s.over && ($('#swHud').innerHTML = `<div class="gm-st"><span>속도<b class="${kmh > lim + 2 ? 'bad' : ''}">${kmh.toFixed(0)}</b>km/h</span><span>제한<b>${lim}</b></span><span>노치<b>${nt}</b></span><span>남은 거리<b>${Math.max(0, rem).toFixed(0)}</b>m</span><span>시간<b>${s.t.toFixed(0)}</b>/${Math.round(s.sched)}초</span><span>점수<b>${Math.round(s.score)}</b></span><span>${ST[s.st]} → ${ST[Math.min(s.st + 1, ST.length - 1)]}</span></div>`);
    }
    function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); draw(); raf = requestAnimationFrame(loop); }
    const nudge = d => { if (s.phase === 'wait' && d > 0 && s.notch < 0) { s.notch = 0; } s.notch = Math.max(-8, Math.min(4, s.notch + d)); if (s.phase === 'wait' && s.notch > 0) { s.wait = 0; } };
    const key = e => {
      if (!$('#swC')) return;
      if (['ArrowUp', 'ArrowDown', ' ', 'w', 's', 'W', 'S'].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') nudge(1);
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') nudge(-1);
      else if (e.key === ' ') s.notch = -8;
    };
    window.addEventListener('keydown', key);
    $('#swP').onclick = () => nudge(1); $('#swB').onclick = () => nudge(-1); $('#swN').onclick = () => { s.notch = 0; }; $('#swE').onclick = () => { s.notch = -8; };
    cleanup.push(() => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); });
    init(); raf = requestAnimationFrame(loop);
  }

  /* =============== CPU와 야구 게임 =============== */
  function baseball(main) {
    const MAXI = 5, TYPES = ['직구', '슬라이더', '커브', '체인지업'];
    const rnd = Math.random, pick = a => a[Math.floor(rnd() * a.length)];
    let G;
    const fresh = () => ({ inn: 1, top: true, outs: 0, b: 0, s: 0, bases: [0, 0, 0], sc: [0, 0], log: [], over: false, lastZ: -1, lastT: '', cpuPitch: null, sel: 4, typ: 0, result: '' });
    const dist = (a, b) => a === 9 || b === 9 ? 9 : Math.abs((a % 3) - (b % 3)) + Math.abs(Math.floor(a / 3) - Math.floor(b / 3));
    const say = t => { G.log.unshift(t); if (G.log.length > 8) G.log.pop(); G.result = t; };
    const runners = n => { // 타자 진루 n 루타
      let runs = 0, nb = [0, 0, 0];
      for (let i = 2; i >= 0; i--) if (G.bases[i]) { const t = i + 1 + n; if (t >= 4) runs++; else nb[t - 1] = 1; }
      if (n >= 4) runs++; else nb[n - 1] = 1;
      G.bases = nb; G.sc[G.top ? 0 : 1] += runs; return runs;
    };
    const walk = () => { const b = G.bases; if (b[0]) { if (b[1]) { if (b[2]) G.sc[G.top ? 0 : 1]++; b[2] = 1; } b[1] = 1; } b[0] = 1; G.b = 0; G.s = 0; };
    const out = () => { G.outs++; G.b = 0; G.s = 0; if (G.outs >= 3) endHalf(); };
    function endHalf() {
      G.outs = 0; G.b = 0; G.s = 0; G.bases = [0, 0, 0];
      if (G.top) { G.top = false; if (G.inn >= MAXI && G.sc[1] > G.sc[0]) return endGame(); }
      else { if (G.inn >= MAXI && G.sc[0] !== G.sc[1]) return endGame(); if (G.inn >= MAXI + 2) return endGame(); G.inn++; G.top = true; }
    }
    const endGame = () => { G.over = true; };
    const strike = () => { G.s++; if (G.s >= 3) { say('삼진! ' + say.t0); out(); } };
    const ball = () => { G.b++; if (G.b >= 4) { say('볼넷으로 걸어 나가요.'); walk(); } };
    const hitRes = quality => { // quality 0 약한타구 .. 1 정타
      const r = rnd() + quality * .55;
      if (r > 1.35) { const n = runners(4); return `💥 홈런!! ${n}점`; }
      if (r > 1.08) { const n = runners(3); return `3루타! ${n ? n + '점' : ''}`; }
      if (r > .86) { const n = runners(2); return `2루타! ${n ? n + '점' : ''}`; }
      if (r > .55) { const n = runners(1); return `안타! ${n ? n + '점' : ''}`; }
      if (r > .3) { out(); return '뜬공 아웃.'; }
      if (G.outs < 2 && G.bases[0] && rnd() < .4) { out(); if (!G.over) { out(); G.bases[0] = 0; } return '병살타…'; }
      out(); return '땅볼 아웃.';
    };
    /* 유저 타석: CPU가 던짐. 유저가 노릴 코스를 고르거나 지켜봄 */
    function userSwing(zone) {
      const p = G.cpuPitch; let t = '';
      if (zone === 'take') {
        if (p.z < 9) { t = `스트라이크! (${p.t})`; say.t0 = ''; G.s++; if (G.s >= 3) { t = '서서 삼진…'; G.b = 0; G.s = 0; say(t); out(); return next(); } }
        else { G.b++; t = `볼! (${p.t})`; if (G.b >= 4) { t = '볼넷! 걸어 나가요.'; walk(); } }
      } else {
        const d = dist(zone, p.z);
        const ease = { 직구: .1, 슬라이더: -.05, 커브: -.1, 체인지업: 0 }[p.t];
        if (d === 0) { if (rnd() < .78 + ease) t = hitRes(.35 + rnd() * .65); else { t = '헛스윙…'; G.s++; if (G.s >= 3) { t = '헛스윙 삼진!'; G.s = 0; G.b = 0; say(t); out(); return next(); } } }
        else if (d === 1) { if (rnd() < .5) { t = '파울!'; if (G.s < 2) G.s++; } else if (rnd() < .5) t = hitRes(rnd() * .45); else { t = '헛스윙!'; G.s++; if (G.s >= 3) { t = '헛스윙 삼진!'; G.s = 0; G.b = 0; say(t); out(); return next(); } } }
        else { t = '크게 헛스윙!'; G.s++; if (G.s >= 3) { t = '헛스윙 삼진!'; G.s = 0; G.b = 0; say(t); out(); return next(); } }
      }
      say(t); next();
    }
    /* CPU 타석: 유저가 던짐 */
    function userPitch() {
      const z = G.sel, ty = TYPES[G.typ];
      const repeat = (z === G.lastZ ? .22 : 0) + (ty === G.lastT ? .1 : 0);
      G.lastZ = z; G.lastT = ty;
      const inZone = z < 9, swing = rnd() < (inZone ? .72 : .22);
      let t;
      if (!swing) {
        if (inZone) { G.s++; t = `스트라이크! (${ty})`; if (G.s >= 3) { t = '루킹 삼진! 🎉'; G.s = 0; G.b = 0; say(t); out(); return next(); } }
        else { G.b++; t = `볼 (${ty})`; if (G.b >= 4) { t = '볼넷을 내줬어요.'; walk(); } }
      } else {
        const guess = rnd() < (.3 + repeat) ? z : (inZone ? Math.floor(rnd() * 9) : 9);
        const d = dist(guess, z);
        if (d === 0) { const mod = { 직구: .1, 슬라이더: -.06, 커브: -.1, 체인지업: -.04 }[ty]; if (rnd() < .72 + mod) t = hitRes(.2 + rnd() * .75 + (inZone ? 0 : -.3)); else { t = '헛스윙! 🎯'; G.s++; if (G.s >= 3) { t = '헛스윙 삼진! 🎉'; G.s = 0; G.b = 0; say(t); out(); return next(); } } }
        else if (d === 1) { if (rnd() < .5) { t = '파울'; if (G.s < 2) G.s++; } else t = hitRes(rnd() * .4); }
        else { t = '헛스윙! 🎯'; G.s++; if (G.s >= 3) { t = '헛스윙 삼진! 🎉'; G.s = 0; G.b = 0; say(t); out(); return next(); } }
      }
      say(t); next();
    }
    function next() { G.cpuPitch = null; render(); }
    function cpuThrow() {
      if (!G.top || G.over || G.cpuPitch) return;
      const heavy = G.b > G.s;   // 볼이 많으면 스트라이크 위주로
      const z = rnd() < (heavy ? .9 : .7) ? Math.floor(rnd() * 9) : 9;
      G.cpuPitch = { z, t: pick(TYPES) };
    }
    const zoneGrid = (cls, cur, ball) => `<div class="bb-zone ${cls}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<button type="button" class="bb-z${cur === i ? ' on' : ''}" data-z="${i}" aria-label="코스 ${i + 1}"></button>`).join('')}</div>`;
    const diamond = () => `<div class="bb-dia"><i class="b2${G.bases[1] ? ' on' : ''}"></i><i class="b3${G.bases[2] ? ' on' : ''}"></i><i class="b1${G.bases[0] ? ' on' : ''}"></i><i class="hp"></i></div>`;
    function render() {
      if (!$('#bbRoot')) return;
      const dots = (n, m, c) => Array.from({ length: m }, (_, i) => `<i class="bb-d ${c}${i < n ? ' on' : ''}"></i>`).join('');
      const board = `<div class="bb-board"><div class="bb-sc"><span>나</span><b>${G.sc[0]}</b><span>CPU</span><b>${G.sc[1]}</b></div>
        <div class="bb-inn">${G.inn}회 ${G.top ? '초 ⚾ 내 공격' : '말 🧤 내 수비'}</div>
        <div class="bb-cnt"><span>B ${dots(G.b, 3, 'bl')}</span><span>S ${dots(G.s, 2, 'st')}</span><span>O ${dots(G.outs, 2, 'ou')}</span></div>${diamond()}</div>`;
      let body = '';
      if (G.over) {
        const w = G.sc[0] > G.sc[1] ? '🎉 승리!' : G.sc[0] < G.sc[1] ? '😢 패배…' : '🤝 무승부';
        body = `<div class="gm-end"><h3>경기 종료 ${w}</h3><p>${G.sc[0]} : ${G.sc[1]}</p><button class="btn primary" id="bbAgain">다시 하기</button></div>`;
      } else if (G.top) {
        cpuThrow();
        body = `<p class="bb-tip">CPU 투수가 <b>${G.cpuPitch.t}</b>을(를) 던졌어요! 어디로 올까요? 코스를 골라 스윙하거나 지켜보세요. (직구는 잘 맞고, 변화구는 어려워요)</p>${zoneGrid('bat', -1)}<div class="gm-btns"><button class="btn" id="bbTake">👀 지켜보기</button></div>`;
      } else {
        body = `<p class="bb-tip">내가 던질 차례! 구종과 코스를 골라 던지세요. 같은 공만 던지면 CPU가 읽어요.</p>
          <div class="bb-types">${TYPES.map((t, i) => `<button type="button" class="btn${G.typ === i ? ' primary' : ''}" data-t="${i}">${t}</button>`).join('')}</div>
          ${zoneGrid('pit', G.sel)}<div class="gm-btns"><button class="btn${G.sel === 9 ? ' primary' : ''}" id="bbBall">존 밖(유인구)</button><button class="btn primary" id="bbThrow">⚾ 던지기</button></div>`;
      }
      $('#bbRoot').innerHTML = `${board}<div class="bb-main">${body}<div class="bb-res">${G.result || '플레이볼!'}</div><ul class="bb-log">${G.log.slice(1).map(l => `<li>${l}</li>`).join('')}</ul></div>`;
      if (G.over) { $('#bbAgain').onclick = () => { G = fresh(); render(); }; return; }
      if (G.top) {
        $('#bbRoot').querySelectorAll('.bb-z').forEach(b => b.onclick = () => userSwing(+b.dataset.z));
        $('#bbTake').onclick = () => userSwing('take');
      } else {
        $('#bbRoot').querySelectorAll('.bb-z').forEach(b => b.onclick = () => { G.sel = +b.dataset.z; render(); });
        $('#bbRoot').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { G.typ = +b.dataset.t; render(); });
        $('#bbBall').onclick = () => { G.sel = 9; render(); };
        $('#bbThrow').onclick = userPitch;
      }
    }
    main.innerHTML = `<h2 class="page-title">⚾ CPU와 야구 게임</h2><p class="hint">${MAXI}회 승부! 초에는 내가 치고, 말에는 내가 던져요. 코스(3×3)를 잘 읽어 보세요.</p><div id="bbRoot"></div>`;
    G = fresh(); render();
  }

  window.AdminGames = { stop, subway, baseball };
})();
