/* 운영진 센터 미니게임: 지하철 운전 시뮬레이터 (운전실 시점) */
(function () {
  'use strict';
  let cleanup = [];
  const stop = () => { cleanup.forEach(f => { try { f(); } catch (e) {} }); cleanup = []; };
  const $ = (s, r) => (r || document).querySelector(s);
  let dbg = null;

  /* ---- 노선 자료 (3호선 양재→수서 방향. 구간 거리·기울기·곡선은 게임용 근사값) ---- */
  const LINE = [
    { n: '양재', side: 1 }, { n: '매봉', side: -1 }, { n: '도곡', side: 1 }, { n: '대치', side: -1 },
    { n: '학여울', side: 1 }, { n: '대청', side: -1 }, { n: '일원', side: 1 }, { n: '수서', side: -1 }];
  const SECS = [   // 각 구간: 길이(m), 곡선 제한 [시작,끝,km/h], 기울기 [시작,끝,%]
    { len: 1500, curves: [[420, 760, 60]], grade: [[0, 300, -1.5], [300, 1100, 0.4], [1100, 1500, 1.8]] },
    { len: 1050, curves: [[300, 600, 50]], grade: [[0, 350, -2.0], [350, 800, 0.3], [800, 1050, 2.0]] },
    { len: 1250, curves: [[500, 900, 60]], grade: [[0, 300, -1.8], [300, 950, 0], [950, 1250, 1.6]] },
    { len: 1200, curves: [[250, 520, 45], [800, 1000, 60]], grade: [[0, 350, -1.6], [350, 900, 0.2], [900, 1200, 1.7]] },
    { len: 1400, curves: [[600, 980, 60]], grade: [[0, 300, -2.0], [300, 1100, 0], [1100, 1400, 2.0]] },
    { len: 1350, curves: [[200, 450, 50], [900, 1200, 60]], grade: [[0, 300, -1.5], [300, 1050, 0.3], [1050, 1350, 1.5]] },
    { len: 1700, curves: [[700, 1100, 60]], grade: [[0, 350, -2.2], [350, 1300, 0], [1300, 1700, 2.0]] }];
  const COURSES = { practice: { name: '연습 (도곡→대치→학여울)', from: 2, to: 4 }, full: { name: '전체 (양재→수서, 7구간)', from: 0, to: 7 } };

  const W = 760, H = 470, SH = 290, F = 330, CAMH = 2.3, CAMBACK = 1.5, WALL = 3.4, CEIL = 4.4;
  const PW = [0, .28, .52, .72, .85];                 // 역행 P1~P4 가속(m/s²)
  const brakeA = n => .1 + .145 * (n - 1);            // 제동 B1~B7 (B7 ≈ 3.5km/h/s)
  const EBA = 1.25, ATCA = .95;

  function subway(main) {
    main.innerHTML = `<h2 class="page-title">🚇 지하철 운전 시뮬레이터</h2>
      <div id="swMenu" class="sw-menu"><p class="hint">3호선 열차의 운전대를 잡아 보세요. ATC 속도 신호를 지키고, 승강장 <b>정위치</b>에 부드럽게 세운 뒤 문을 열고 닫고 출발하는 전 과정을 연습해요.</p>
        <div class="gm-btns">${Object.keys(COURSES).map(k => `<button class="btn primary" data-course="${k}">${COURSES[k].name}</button>`).join('')}</div>
        <p class="hint">배속: <select id="swSpd" class="input" style="width:auto"><option value="1">×1 (실제 속도)</option><option value="2">×2</option><option value="4">×4 (연습용)</option></select></p>
        <p class="hint">열차 종류: <label><input type="radio" name="swType" value="one" checked> 원핸들 (가속·제동 한 손잡이)</label> &nbsp; <label><input type="radio" name="swType" value="two"> 투핸들 (마스콘 + 제동핸들)</label></p>
        <ul class="sw-how"><li><b>Space</b> DSD (일정 시간마다 눌러 줘야 해요. 안 누르면 경보 후 비상제동)</li><li><b>Q</b> 가속 (원핸들) · <b>A</b> 가속 (투핸들) / 중립까지만 감속 (원핸들) · <b>Z</b> 감속 (모든 열차)</li><li><b>,</b> 브레이크 한 단계 체결 · <b>.</b> 한 단계 완해</li><li><b>↑ / ↓</b> 전후진 제어기 (후진·중립·전진 — 출발하려면 <b>전진</b>)</li><li><b>O</b> 출입문 열기/닫기 · <b>Backspace</b> 비상제동(EB)</li><li>제한속도를 넘으면 <b>ATC가 자동 제동</b>해요. 급제동·정차 충격은 승차감 감점!</li></ul></div>
      <div id="swGame" hidden><canvas id="swC" width="${W}" height="${H}" class="gm-canvas"></canvas>
        <div class="gm-btns"><button class="btn" id="swQ">Q 가속</button><button class="btn" id="swA">A 가속(투핸들)/중립까지 감속</button><button class="btn" id="swZ">Z 감속</button><button class="btn" id="swBk">, 제동 +</button><button class="btn" id="swRl">. 완해</button></div>
        <div class="gm-btns"><button class="btn" id="swRu">↑ 전진</button><button class="btn" id="swRd">↓ 후진</button><button class="btn" id="swDsd">Space DSD</button><button class="btn primary" id="swD">🚪 문 열기/닫기</button><button class="btn danger" id="swE">🛑 EB</button></div></div>`;
    let s = null, raf = 0, last = performance.now();
    const spd = () => +($('#swSpd') || { value: 1 }).value;
    const say = (t, bad) => { s.msg = t; s.msgT = 5; s.bad = !!bad; };
    let actx = null;
    const beep = (f, d) => { try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = actx || new AC(); const o = actx.createOscillator(), gn = actx.createGain(); o.frequency.value = f; gn.gain.value = .05; o.connect(gn); gn.connect(actx.destination); o.start(); o.stop(actx.currentTime + d); } catch (e) {} };
    const sync = () => { s.notch = s.type === 'one' ? s.L : (s.bn > 0 ? -s.bn : s.pn); };
    const neutral = () => { s.L = 0; s.pn = 0; s.bn = 0; sync(); };
    const holdBrake = () => { s.L = -3; s.pn = 0; s.bn = 4; sync(); };
    const cutPower = () => { if (s.type === 'one') s.L = Math.min(s.L, 0); else s.pn = 0; sync(); };
    const triggerEB = why => { s.eb = true; neutral(); s.ebN++; s.score -= 20; s.log.push({ k: why + ' — 비상제동(EB)', p: -20 }); say('🛑 ' + why + ' — 비상제동! (−20점)', true); beep(300, .5); };
    const secOf = () => SECS[s.idx];
    const zoneLimit = x => { const c = secOf().curves.find(c => x >= c[0] && x < c[1]); let l = c ? c[2] : 80; if (x < 150 && s.idx >= 0) l = Math.min(l, 40); return l; };
    const atcLimit = x => { const rem = secOf().len - x; let l = zoneLimit(x); const pat = Math.floor(Math.sqrt(2 * .75 * Math.max(rem - 8, 0)) * 3.6 / 5) * 5; l = Math.min(l, Math.max(10, pat)); return l; };
    const gradeAt = x => { const g = secOf().grade.find(g => x >= g[0] && x < g[1]); return g ? g[2] : 0; };

    function start(k) {
      const c = COURSES[k];
      s = { course: k, idx: c.from, end: c.to, x: 0, v: 0, a: 0, notch: 0, type: (main.querySelector('input[name=swType]:checked') || { value: 'one' }).value, L: -2, pn: 0, bn: 4, rev: 0, dsd: 0, eb: false, atc: false, doors: 0, doorCmd: 0, phase: 'dwell', first: true, t: 0, dwellT: 99, openT: 0, onboard: 120,
        score: 0, comfort: 100, log: [], msg: '', msgT: 0, bad: false, lastA: 0, over: false, ann: -1, pax: [], atcN: 0, ebN: 0, lastNotchT: 0 };
      sync(); genPax(); $('#swMenu').hidden = true; $('#swGame').hidden = false;
      say(`${LINE[s.idx].n}역 출발 준비 — 전후진 제어기를 전진(↑)으로, 브레이크를 풀고 가속하세요. 주행 중에는 DSD(Space)를 눌러 주세요.`);
    }
    function genPax() { s.pax = Array.from({ length: 46 }, (_, i) => ({ o: Math.random(), x: 1.9 + Math.random() * 1.2, c: ['#e5484d', '#3182f6', '#f5a623', '#2fb344', '#9b59b6', '#ddd'][i % 6], h: 1.55 + Math.random() * .3 })); }

    function sim(dt) {
      const sec = secOf(), rem = sec.len - s.x;
      s.t += dt; s.msgT -= dt;
      /* 문 동작 */
      if (s.doors !== s.doorCmd) { s.doors += Math.sign(s.doorCmd - s.doors) * dt / 3; if (Math.abs(s.doors - s.doorCmd) < .02) s.doors = s.doorCmd; }
      if (s.phase === 'dwell') {
        s.dwellT += dt;
        if (s.doors === 1) { s.openT += dt; if (Math.random() < dt * 2.2) s.onboard += Math.round((Math.random() - .45) * 8); s.onboard = Math.max(30, Math.min(400, s.onboard)); }
        if (s.notch > 0 && s.rev !== 1) { say('전후진 제어기를 전진(↑)으로 놓아야 출발해요!', true); cutPower(); }
        else if (s.notch > 0) { if (s.doors > 0 || s.doorCmd > 0) { say('출입문이 열려 있어 출발할 수 없어요! (O로 닫기)', true); cutPower(); }
          else { if (!s.first && s.dwellT < 18) { const p = Math.round(18 - s.dwellT); s.score -= p; s.log.push({ k: '조기출발', p: -p }); say(`조기 출발 ${p}초 (−${p}점)`, true); }
            s.phase = 'run'; s.dsd = 0; s.first = false; s.t = 0; s.x = 0; s.ann = -1; s.lastStop = false; say(`${LINE[s.idx].n} → ${LINE[s.idx + 1].n}  출발! 제시 ${Math.round(sec.len / 13)}초`); } }
        else cutPower();
        s.dsd = 0;
        s.v = 0; s.a = 0; return;
      }
      /* 열차 동력학 */
      const g = gradeAt(s.x), lim = atcLimit(s.x), kmh = s.v * 3.6; s.lim = lim;
      if (!s.atc && kmh > lim + 1.5) { s.atc = true; s.atcN++; s.score -= 15; s.log.push({ k: 'ATC 자동제동', p: -15 }); say(`⚠ ATC 속도 초과 — 자동 제동! (제한 ${lim})`, true); }
      if (s.atc && kmh <= lim - 3) s.atc = false;
      let cmd;
      if (s.eb) cmd = -EBA; else if (s.atc) cmd = -ATCA; else if (s.notch > 0 && s.rev === 1) cmd = PW[s.notch] * Math.min(1, 10 / Math.max(s.v, 10)); else if (s.notch < 0) cmd = -brakeA(-s.notch); else cmd = 0;
      const res = s.v > .05 ? (.012 + .00022 * s.v * s.v) : 0;
      let tgt = cmd - res - 9.81 * g / 100;
      if (s.v < .03 && cmd <= 0) tgt = Math.max(tgt, 0);
      const tau = (s.eb || s.atc) ? .35 : (cmd < 0 ? .7 : .6);
      const prevA = s.a; s.a += (tgt - s.a) * Math.min(1, dt / tau);
      const jerk = Math.abs(s.a - prevA) / dt;
      if (s.v > 1 && jerk > 1.3) s.comfort = Math.max(0, s.comfort - (jerk - 1.3) * dt * 8);
      if (s.v < 1.5 && s.v > .03) s.lastA = s.a;
      s.v += s.a * dt; if (s.v < 0) { s.v = 0; s.a = 0; } if (s.v > 24) s.v = 24;
      s.x += s.v * dt;
      if (s.v < .03 && cmd <= 0) s.v = 0;
      /* DSD (운전자 안전 장치) */
      if (s.v > .5) { s.dsd += dt; if (s.dsd > 20 && Math.floor(s.dsd * 2) !== Math.floor((s.dsd - dt) * 2)) beep(880, .12); if (s.dsd > 26 && !s.eb) triggerEB('DSD 미조작'); } else if (s.v === 0) s.dsd = 0;
      /* 안내방송 */
      if (s.ann !== s.idx && rem < 420) { s.ann = s.idx; say(`📢 이번 역은 ${LINE[s.idx + 1].n}, ${LINE[s.idx + 1].n}역입니다. 내리실 문은 ${LINE[s.idx + 1].side > 0 ? '오른쪽' : '왼쪽'}입니다.`); }
      /* 정지 위치 초과 */
      if (s.x > sec.len + 4 && !s.eb) { s.atc = true; }
      if (s.v === 0 && s.t > 3) {
        if (rem < 45 || s.x > sec.len) arrive(rem);
        else if (s.eb) { s.eb = false; holdBrake(); }
      }
      if (s.eb && s.v === 0) { s.eb = false; holdBrake(); }
    }
    function arrive(rem) {
      const sec = secOf(), err = rem, ae = Math.abs(err), late = s.t - Math.round(sec.len / 13);
      const p = ae <= .5 ? 100 : ae <= 1 ? 90 : ae <= 2 ? 75 : ae <= 3 ? 60 : ae <= 5 ? 35 : ae <= 10 ? 15 : 0;
      const shock = Math.abs(s.lastA) > .45 ? -10 : 0;
      const tp = late <= 5 ? 20 : late <= 15 ? 10 : -Math.min(30, Math.round(late / 2));
      s.score += p + shock + tp;
      s.log.push({ k: `${LINE[s.idx + 1].n} 정차 (${err >= 0 ? ae.toFixed(1) + 'm 앞' : ae.toFixed(1) + 'm 초과'})`, p: p + shock + tp, d: `위치 ${p}${shock ? ' · 정차충격 ' + shock : ''} · 시간 ${tp >= 0 ? '+' : ''}${tp} (${late >= 0 ? '+' : ''}${Math.round(late)}초)` });
      say(`🚉 ${LINE[s.idx + 1].n} 정차! 오차 ${ae.toFixed(1)}m — 위치 ${p}점${shock ? ' · 정차 충격 ' + shock : ''} · 시간 ${tp >= 0 ? '+' : ''}${tp}점. [O] 문 열기`);
      s.idx++; s.phase = 'dwell'; s.dwellT = 0; s.openT = 0; s.x = 0; s.t = 0; holdBrake(); s.dsd = 0; s.atc = false; s.doorCmd = 0;
      if (s.idx >= s.end) { s.over = true; finish(); return; }
      genPax();
    }
    function finish() {
      const base = Math.round(s.score), cm = Math.round(s.comfort * 1.0), tot = base + Math.round(cm / 2);
      const per = tot / ((s.end - COURSES[s.course].from) * 120), rk = per > .85 ? 'S 🏆 특급 기관사' : per > .7 ? 'A 우수 기관사' : per > .5 ? 'B 숙련 기관사' : per > .3 ? 'C 견습 기관사' : 'D 연습이 필요해요';
      $('#swGame').insertAdjacentHTML('beforeend', `<div class="gm-end" id="swEnd"><h3>운행 종료!</h3><p>총점 <b>${tot}점</b> (운전 ${base} + 승차감 ${Math.round(cm / 2)}) · ${rk}</p>
        <table class="tbl"><thead><tr><th>항목</th><th>점수</th></tr></thead><tbody>${s.log.map(l => `<tr><td>${l.k}${l.d ? `<br><small>${l.d}</small>` : ''}</td><td class="c">${l.p}</td></tr>`).join('') || '<tr><td colspan="2">기록 없음</td></tr>'}<tr><td>승차감 (급제동·충격 반영)</td><td class="c">${Math.round(cm / 2)}</td></tr></tbody></table>
        <button class="btn primary" id="swAgain">메뉴로</button></div>`);
      $('#swAgain').onclick = () => { $('#swEnd').remove(); $('#swGame').hidden = true; $('#swMenu').hidden = false; s = null; };
    }

    /* ---------------- 그리기 ---------------- */
    const cv = $('#swC'), g = cv.getContext('2d');
    const vxOf = () => W / 2 + (() => { const c = secOf().curves.find(c => s.x >= c[0] - 60 && s.x < c[1]); return c ? (s.x < c[0] ? (s.x - c[0] + 60) / 60 : 1) * 26 * (s.idx % 2 ? -1 : 1) : 0; })();
    function draw() {
      if (!s) return;
      const sec = secOf(), rem = sec.len - s.x, side = LINE[Math.min(s.idx + 1, LINE.length - 1)].side;
      const stName = s.phase === 'dwell' ? LINE[s.idx].n : LINE[s.idx + 1].n, vx = vxOf(), hy = 132 + gradeAt(s.x) * -2;
      const stopW = s.phase === 'dwell' ? s.x : sec.len;   // 정위치(구간 좌표)
      const zOf = w => w - (s.x - CAMBACK);
      const Pt = (x, y, z) => [vx + x * F / z, hy + (CAMH - y) * F / z];
      const quad = (a, c) => { g.fillStyle = c; g.beginPath(); a.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); };
      const box = (x1, x2, y1, y2, z1, z2, c, face) => { const zz1 = Math.max(.9, z1), zz2 = Math.max(.9, z2); if (zz2 <= .9) return;
        if (face === 'x') quad([Pt(x1, y1, zz1), Pt(x1, y2, zz1), Pt(x1, y2, zz2), Pt(x1, y1, zz2)], c); else quad([Pt(x1, y1, zz1), Pt(x2, y1, zz1), Pt(x2, y1, zz2), Pt(x1, y1, zz2)], c); };
      g.save(); g.beginPath(); g.rect(0, 0, W, SH); g.clip();
      g.fillStyle = '#05070b'; g.fillRect(0, 0, W, SH);
      const Z = 500, stZ1 = Math.max(.9, zOf(stopW - 200)), stZ2 = zOf(stopW + 25), inSt = stZ2 > .9 && stZ1 < Z;
      /* 터널 */
      box(-WALL, WALL, CEIL, 0, .9, Z, '#141a24', 'y'); box(-WALL, WALL, 0, 0, .9, Z, '#25282e', 'y');
      box(-WALL, 0, 0, CEIL, .9, Z, '#1a2130', 'x'); box(WALL, 0, 0, CEIL, .9, Z, '#161d2a', 'x');
      if (inSt) { box(-WALL, WALL, CEIL, 0, stZ1, stZ2, '#2a3344', 'y'); box(-WALL, 0, 0, CEIL, stZ1, stZ2, '#7c8aa3', 'x'); box(WALL, 0, 0, CEIL, stZ1, stZ2, '#8a98b0', 'x'); }
      box(-WALL, 0, 2.5, 2.7, .9, Z, '#0c1018', 'x'); box(WALL, 0, 2.5, 2.7, .9, Z, '#0c1018', 'x');
      /* 먼 터널 빛 */
      const gl = g.createRadialGradient(vx, hy, 2, vx, hy, 70); gl.addColorStop(0, 'rgba(150,175,215,.55)'); gl.addColorStop(1, 'rgba(150,175,215,0)'); g.fillStyle = gl; g.fillRect(vx - 80, hy - 80, 160, 160);
      /* 침목·레일 */
      const s0 = Math.ceil((s.x - CAMBACK) / .7) * .7;
      for (let k = 90; k >= 0; k--) { const z = s0 + k * .7 - (s.x - CAMBACK); if (z < .9) continue; quad([Pt(-1.15, 0, z), Pt(1.15, 0, z), Pt(1.15, 0, z + .22), Pt(-1.15, 0, z + .22)], '#40392f'); }
      [-.72, .72].forEach(x => { quad([Pt(x - .045, .02, .9), Pt(x + .045, .02, .9), Pt(x + .045, .02, Z), Pt(x - .045, .02, Z)], '#b4bccb'); });
      /* 터널 등 */
      const l0 = Math.ceil((s.x - CAMBACK) / 20) * 20;
      for (let k = 14; k >= 0; k--) { const z = l0 + k * 20 - (s.x - CAMBACK); if (z < .9) continue; const inS = inSt && z >= stZ1 && z <= stZ2, a = Math.max(.15, 1 - z / 280);
        quad([Pt(-.9, CEIL - .05, z), Pt(.9, CEIL - .05, z), Pt(.9, CEIL - .05, z + 1.4), Pt(-.9, CEIL - .05, z + 1.4)], `rgba(255,246,200,${inS ? 1 : a})`);
        if (inS || z < 90) { const [lx, ly] = Pt(0, CEIL - .1, z + .5), r = Math.min(60, 12 * F / z / 6); const lg = g.createRadialGradient(lx, ly, 1, lx, ly, r); lg.addColorStop(0, `rgba(255,240,190,${inS ? .5 : .25})`); lg.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = lg; g.fillRect(lx - r, ly - r, 2 * r, 2 * r); } }
      /* 속도 제한 표지 (곡선 시작) */
      sec.curves.forEach(c => { const z = zOf(c[0]); if (z > 3 && z < 260) { const [bx, by] = Pt(-WALL + .05, 1.9, z), sz = .9 * F / z; g.fillStyle = '#fff'; g.beginPath(); g.arc(bx + sz * .5, by, sz * .5, 0, 7); g.fill(); g.strokeStyle = '#e5484d'; g.lineWidth = Math.max(1, sz * .08); g.stroke(); g.fillStyle = '#111'; g.font = `bold ${Math.max(6, sz * .5)}px sans-serif`; g.textAlign = 'center'; g.fillText(c[2], bx + sz * .5, by + sz * .17); } });
      /* 거리표 */
      [100, 50, 25].forEach(d => { const z = zOf(sec.len - d); if (s.phase === 'run' && z > 2 && z < 300) { const [bx, by] = Pt(-side * (WALL - .05), 2.0, z), sz = .8 * F / z; g.fillStyle = '#f5f5f5'; g.fillRect(bx - sz * .5, by - sz * .3, sz, sz * .6); g.fillStyle = '#111'; g.font = `bold ${Math.max(6, sz * .38)}px sans-serif`; g.textAlign = 'center'; g.fillText(d + 'm', bx, by + sz * .12); } });
      /* 승강장 */
      if (inSt) {
        const px = side * 1.55, a = side;
        quad([Pt(px, 0, stZ1), Pt(px, 1.1, stZ1), Pt(px, 1.1, stZ2), Pt(px, 0, stZ2)], '#6c7587');
        quad([Pt(px, 1.1, stZ1), Pt(a * WALL, 1.1, stZ1), Pt(a * WALL, 1.1, stZ2), Pt(px, 1.1, stZ2)], '#c3cad6');
        quad([Pt(px, 1.1, stZ1), Pt(a * (1.55 + .3), 1.1, stZ1), Pt(a * (1.85), 1.1, stZ2), Pt(px, 1.1, stZ2)], '#f2c200');
        for (let wz = stopW - 190; wz <= stopW + 10; wz += 38) { const z = zOf(wz); if (z > 3 && z < 200) { const [bx, by] = Pt(a * (WALL - .05), 2.5, z), w = 2.6 * F / z, h = .8 * F / z; g.fillStyle = '#1c5fd6'; g.fillRect(bx - w / 2, by - h / 2, w, h); g.fillStyle = '#fff'; g.font = `bold ${Math.max(7, h * .6)}px sans-serif`; g.textAlign = 'center'; g.fillText(LINE[s.phase === 'dwell' ? s.idx : s.idx + 1].n, bx, by + h * .2); } }
        s.pax.forEach(p => { const wz = stopW - 190 + p.o * 195, z = zOf(wz); if (z > 1.5 && z < 120) { const [bx, by] = Pt(a * p.x, 1.1, z), sc = F / z; g.fillStyle = p.c; g.fillRect(bx - .22 * sc, by - p.h * .75 * sc, .44 * sc, p.h * .75 * sc); g.fillStyle = '#e8c9a6'; g.beginPath(); g.arc(bx, by - p.h * .85 * sc, .13 * sc, 0, 7); g.fill(); } });
        /* 정위치 표지 */
        const zs = zOf(stopW);
        if (zs > .95) { quad([Pt(-1.15, .03, zs), Pt(1.15, .03, zs), Pt(1.15, .03, zs + .25), Pt(-1.15, .03, zs + .25)], '#ffd400');
          const [bx, by] = Pt(a * 1.75, 1.1, zs), sc = F / zs; g.fillStyle = '#ff8a00'; g.fillRect(bx - .08 * sc, by - 1.5 * sc, .16 * sc, 1.5 * sc); g.fillStyle = '#fff'; g.fillRect(bx - .45 * sc, by - 1.9 * sc, .9 * sc, .45 * sc); g.fillStyle = '#d33'; g.font = `bold ${Math.max(7, .3 * sc)}px sans-serif`; g.textAlign = 'center'; g.fillText('정위치', bx, by - 1.55 * sc); }
      }
      g.restore();
      /* 운전실 틀 */
      g.fillStyle = '#090b0f'; g.beginPath(); g.moveTo(0, 0); g.lineTo(78, 0); g.lineTo(26, SH); g.lineTo(0, SH); g.fill(); g.beginPath(); g.moveTo(W, 0); g.lineTo(W - 78, 0); g.lineTo(W - 26, SH); g.lineTo(W, SH); g.fill(); g.fillRect(0, 0, W, 14);
      /* 계기반 */
      const dg = g.createLinearGradient(0, SH, 0, H); dg.addColorStop(0, '#242a35'); dg.addColorStop(1, '#10131a'); g.fillStyle = dg; g.fillRect(0, SH, W, H - SH); g.fillStyle = '#3a4252'; g.fillRect(0, SH, W, 3);
      const kmh = s.v * 3.6, lim = s.phase === 'dwell' ? 0 : atcLimit(s.x);
      /* 속도계 */
      const cx = 118, cy = SH + 70, R = 58; g.fillStyle = '#05070a'; g.beginPath(); g.arc(cx, cy, R + 6, 0, 7); g.fill();
      const ang = v => (135 + Math.min(100, v) * 2.7) * Math.PI / 180;
      g.strokeStyle = '#2d3646'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R - 4, ang(0), ang(100)); g.stroke();
      if (lim > 0) { g.strokeStyle = '#e5484d'; g.beginPath(); g.arc(cx, cy, R - 4, ang(lim), ang(lim + 1.5)); g.stroke(); g.strokeStyle = '#2fb344'; g.beginPath(); g.arc(cx, cy, R - 4, ang(0), ang(lim)); g.lineWidth = 2; g.stroke(); }
      g.fillStyle = '#cfd6e4'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.lineWidth = 2;
      for (let v = 0; v <= 100; v += 10) { const a = ang(v); g.strokeStyle = '#cfd6e4'; g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); g.lineTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2)); g.stroke(); g.fillText(v, cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24) + 3); }
      g.strokeStyle = '#ffb020'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ang(kmh)) * (R - 8), cy + Math.sin(ang(kmh)) * (R - 8)); g.stroke();
      g.fillStyle = '#fff'; g.font = "bold 18px 'Galmuri11',sans-serif"; g.fillText(kmh.toFixed(0), cx, cy + 34); g.font = '10px sans-serif'; g.fillStyle = '#9aa6bd'; g.fillText('km/h', cx, cy + 46);
      /* ATC 신호 */
      g.fillStyle = '#05070a'; g.fillRect(212, SH + 22, 96, 86); g.fillStyle = '#9aa6bd'; g.font = '11px sans-serif'; g.fillText('ATC 속도신호', 260, SH + 38);
      g.fillStyle = s.atc ? '#ff453a' : lim ? '#4cd964' : '#667'; g.font = "bold 40px 'Galmuri11',sans-serif"; g.fillText(lim || '정지', 260, SH + 82); g.font = '11px sans-serif'; g.fillStyle = s.atc ? '#ff453a' : '#9aa6bd'; g.fillText(s.atc ? 'ATC 제동 중' : 'km/h', 260, SH + 100);
      { const nc = sec.curves.find(c => c[0] > s.x); g.fillStyle = '#9aa6bd'; g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(nc && s.phase !== 'dwell' ? `곡선 제한 ${nc[2]} · ${Math.round(nc[0] - s.x)}m 앞` : '', 260, SH + 124); }
      /* 마스콘·제동핸들 */
      const mx = 330, my = SH + 16; g.fillStyle = '#05070a'; g.fillRect(mx, my, 96, 112); g.textAlign = 'left';
      const slot = (x, y, on, lab) => { g.fillStyle = on ? '#ffb020' : '#2d3646'; g.fillRect(x, y, 18, 6); g.fillStyle = '#9aa6bd'; g.font = '9px sans-serif'; g.fillText(lab, x + 22, y + 6); };
      if (s.type === 'one') { const NS = [4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6, -7]; NS.forEach((n, i) => slot(mx + 30, my + 8 + i * 8.6, n === s.L, n > 0 ? 'P' + n : n === 0 ? 'N' : 'B' + (-n))); const yy = my + 8 + NS.indexOf(s.L) * 8.6; g.fillStyle = '#e5484d'; g.fillRect(mx + 22, yy - 3, 8, 12); g.fillStyle = '#9aa6bd'; g.font = '9px sans-serif'; g.fillText('원핸들', mx + 2, my + 104); }
      else { [4, 3, 2, 1, 0].forEach((n, i) => slot(mx + 4, my + 8 + i * 8.6, n === s.pn && s.bn === 0 || (n === 0 && s.bn > 0), n ? 'P' + n : 'N')); [0, 1, 2, 3, 4, 5, 6, 7].forEach((n, i) => slot(mx + 54, my + 8 + i * 8.6, n === s.bn, n ? 'B' + n : 'N')); g.fillStyle = '#9aa6bd'; g.font = '9px sans-serif'; g.fillText('마스콘', mx + 2, my + 66); g.fillText('제동', mx + 56, my + 104); }
      /* 오른쪽: 거리·시간·문 */
      const rx = 440; g.fillStyle = '#05070a'; g.fillRect(rx, SH + 14, 310, 118);
      g.textAlign = 'left'; g.fillStyle = '#9aa6bd'; g.font = '11px sans-serif'; g.fillText(`${LINE[s.idx].n} → ${LINE[Math.min(s.idx + 1, LINE.length - 1)].n}  ·  내리는 문 ${side > 0 ? '오른쪽 ▶' : '◀ 왼쪽'}`, rx + 10, SH + 32);
      const dist = s.phase === 'dwell' ? 0 : rem; g.fillStyle = '#fff'; g.font = "bold 22px 'Galmuri11',sans-serif"; g.fillText(`${dist.toFixed(0)} m`, rx + 10, SH + 60);
      g.font = '11px sans-serif'; g.fillStyle = '#9aa6bd'; g.fillText('정위치까지', rx + 100, SH + 60);
      g.fillStyle = '#cfd6e4'; g.fillText(`시간 ${s.t.toFixed(0)}초 / 제시 ${Math.round(sec.len / 13)}초 · 기울기 ${gradeAt(s.x) > 0 ? '▲ ' : gradeAt(s.x) < 0 ? '▼ ' : ''}${Math.abs(gradeAt(s.x)).toFixed(1)}% · 승객 약 ${s.onboard}명`, rx + 10, SH + 82);
      g.fillStyle = s.doors > 0 ? '#ffb020' : '#4cd964'; g.fillRect(rx + 10, SH + 94, 12, 12); g.fillStyle = '#cfd6e4'; g.fillText(s.doors === 1 ? '출입문 열림' : s.doors === 0 ? '출입문 닫힘' : '출입문 동작 중…', rx + 28, SH + 104);
      g.fillStyle = '#9aa6bd'; g.fillText(`승차감 ${Math.round(s.comfort)}`, rx + 140, SH + 104); g.fillStyle = '#2d3646'; g.fillRect(rx + 190, SH + 96, 100, 8); g.fillStyle = s.comfort > 60 ? '#4cd964' : s.comfort > 30 ? '#ffb020' : '#e5484d'; g.fillRect(rx + 190, SH + 96, s.comfort, 8);
      g.fillStyle = '#ffd400'; g.font = "bold 16px 'Galmuri11',sans-serif"; g.fillText(`점수 ${Math.round(s.score)}`, rx + 10, SH + 124);
      g.font = '12px sans-serif'; g.fillStyle = s.rev === 1 ? '#4cd964' : '#ffb020'; g.fillText(`전후진 ${s.rev === 1 ? '전진 ▶' : s.rev === -1 ? '◀ 후진' : '중립 ■'}`, rx + 130, SH + 124);
      const warn = s.dsd > 20, blink = warn && Math.floor(performance.now() / 300) % 2; g.fillStyle = warn ? (blink ? '#ff453a' : '#7a2a26') : '#4cd964'; g.fillText(`DSD ${warn ? '⚠ 누르세요!' : '●'}`, rx + 225, SH + 124);
      /* 하단 메시지 */
      g.fillStyle = '#05070a'; g.fillRect(0, SH + 138, W, H - SH - 138);
      g.font = "13px 'Galmuri11',sans-serif"; g.textAlign = 'left'; g.fillStyle = s.msgT > 0 ? (s.bad ? '#ff6b61' : '#6fb1ff') : '#7d8aa3'; g.fillText(s.msg || '', 12, SH + 164);
      g.fillStyle = '#556'; g.font = '11px sans-serif'; g.textAlign = 'right'; g.fillText(s.phase === 'dwell' ? (s.doors === 0 ? '정차 중 · O: 문 열기 / ↑: 출발' : s.doors === 1 ? '승객 승하차 중 · O: 문 닫기' : '') : 'Q/A/Z 가감속 · , . 제동 · ↑↓ 전후진 · Space DSD · Backspace EB', W - 10, H - 8);
      if (s.eb) { g.fillStyle = 'rgba(229,72,77,.85)'; g.fillRect(W / 2 - 80, 22, 160, 30); g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText('🛑 비상제동 (EB)', W / 2, 43); }
      if (s.phase === 'dwell' && s.doors === 1) { g.fillStyle = 'rgba(30,110,230,.85)'; g.fillRect(W / 2 - 130, 22, 260, 26); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText(`${LINE[s.idx].n}역 — 승객 승하차 중 (${Math.min(18, Math.round(s.openT))}/18초)`, W / 2, 40); }
    }
    function loop(now) { const dt = Math.min(.05, (now - last) / 1000); last = now; if (s && !s.over) { const m = spd(); for (let i = 0; i < m; i++) sim(dt); } draw(); raf = requestAnimationFrame(loop); }
    const ok = () => s && !s.over && !s.eb;
    const act = {
      q: () => { if (ok() && s.type === 'one') { s.L = Math.min(4, s.L + 1); sync(); } },
      a: () => { if (!ok()) return; if (s.type === 'two') { s.pn = Math.min(4, s.pn + 1); } else if (s.L > 0) s.L -= 1; sync(); },
      z: () => { if (!ok()) return; if (s.type === 'one') s.L = Math.max(-7, s.L - 1); else if (s.pn > 0) s.pn -= 1; else s.bn = Math.min(7, s.bn + 1); sync(); },
      brk: () => { if (!ok()) return; if (s.type === 'one') s.L = s.L > 0 ? 0 : Math.max(-7, s.L - 1); else { s.bn = Math.min(7, s.bn + 1); } sync(); },
      rel: () => { if (!ok()) return; if (s.type === 'one') { if (s.L < 0) s.L += 1; } else s.bn = Math.max(0, s.bn - 1); sync(); },
      fwd: () => { if (s && !s.over) s.rev = Math.min(1, s.rev + 1); },
      bwd: () => { if (s && !s.over) { s.rev = Math.max(-1, s.rev - 1); if (s.rev === -1) say('후진 운전은 지원하지 않아요. 전진(↑)으로 놓아 주세요.', true); } },
      dsd: () => { if (s && !s.over) { s.dsd = 0; } },
      eb: () => { if (s && s.phase === 'run' && !s.eb) triggerEB('수동') }
    };
    const door = () => {
      if (!s || s.phase !== 'dwell' || s.v > 0) return;
      if (s.doorCmd === 0 && s.doors === 0) { s.doorCmd = 1; s.openT = 0; say('출입문을 엽니다.'); beep(660, .15); }
      else if (s.doorCmd === 1 && s.doors === 1) { if (s.openT < 8) return say('승객이 타고 내리는 중이에요. 조금만 기다려 주세요.', true); s.doorCmd = 0; say('출입문을 닫습니다. 문이 닫히면 출발하세요.'); beep(520, .2); }
    };
    const key = e => { if (!$('#swC') || /input|textarea|select/i.test((e.target || {}).tagName || '')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', ' ', 'Backspace'].includes(k)) e.preventDefault();
      if (k === 'q') act.q(); else if (k === 'a') act.a(); else if (k === 'z') act.z(); else if (k === ',') act.brk(); else if (k === '.') act.rel();
      else if (k === 'ArrowUp') act.fwd(); else if (k === 'ArrowDown') act.bwd(); else if (k === ' ') act.dsd(); else if (k === 'Backspace') act.eb(); else if (k === 'o') door(); };
    window.addEventListener('keydown', key);
    [['swQ', 'q'], ['swA', 'a'], ['swZ', 'z'], ['swBk', 'brk'], ['swRl', 'rel'], ['swRu', 'fwd'], ['swRd', 'bwd'], ['swDsd', 'dsd'], ['swE', 'eb']].forEach(([id, f]) => { $('#' + id).onclick = act[f]; });
    $('#swD').onclick = door;
    main.querySelectorAll('[data-course]').forEach(b => b.onclick = () => { beep(1, .01); start(b.dataset.course); });
    dbg = () => s; cleanup.push(() => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); dbg = null; });
    raf = requestAnimationFrame(loop);
  }

  window.AdminGames = { stop, subway, debug: () => dbg && dbg() };
})();
