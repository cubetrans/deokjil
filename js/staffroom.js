/* ==========================================================
   staffroom.js — 운영진 전용 휴게실(미니게임) · 회의실
   admin.js 가 불러 써요. 부관리자 이상만 들어올 수 있어요.
   ========================================================== */
(function () {
  'use strict';
  const A = window.API, K = window.Common;
  const { esc, toast, alertBox, confirmBox, fmtDate } = K;
  const $ = (s, r = document) => r.querySelector(s);
  const timers = [], offs = [];
  function cleanup() { timers.splice(0).forEach(t => clearInterval(t)); offs.splice(0).forEach(f => { try { f(); } catch (e) {} }); }
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; };
  const on = (target, ev, fn, opt) => { target.addEventListener(ev, fn, opt); offs.push(() => target.removeEventListener(ev, fn, opt)); };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const errMsg = e => (e && e.message) || String(e);

  /* ================= 휴게실 ================= */
  const STATIONS = ['서울역', '시청', '종각', '종로3가', '종로5가', '동대문', '신당', '왕십리', '건대입구', '잠실', '강남', '교대', '서초', '사당', '신림', '대림', '구로디지털단지', '신도림', '영등포구청', '당산', '합정', '홍대입구', '신촌', '이대', '아현', '충정로', '용산', '이태원', '한강진', '버티고개', '약수', '청구', '동묘앞', '혜화', '성신여대입구', '미아사거리', '수유', '노원', '창동', '도봉산', '수서', '가락시장', '오금', '고속터미널', '압구정', '옥수', '응봉', '청량리', '회기', '의정부', '수원', '세류', '병점', '천안', '대전', '동대구', '부산', '광명', '신용산', '디지털미디어시티', '공덕', '김포공항', '인천공항', '검암', '계양'];
  const GAMES = [
    { id: 'memory', icon: '🃏', name: '교통 카드 짝맞추기', desc: '같은 탈것 카드 8쌍을 가장 적게 뒤집어서 맞춰요.', fmt: v => v + '번', hint: '적을수록 좋아요' },
    { id: 'reaction', icon: '⚡', name: '반응속도 테스트', desc: '화면이 초록색으로 바뀌면 바로 눌러요. 3번 평균이 기록이에요.', fmt: v => Math.round(v) + 'ms', hint: '빠를수록 좋아요' },
    { id: 'g2048', icon: '🔢', name: '2048', desc: '방향키(또는 스와이프)로 같은 숫자를 합쳐요.', fmt: v => v.toLocaleString('ko-KR') + '점', hint: '높을수록 좋아요' },
    { id: 'snake', icon: '🐍', name: '열차 뱀 (스네이크)', desc: '방향키로 열차를 몰아 승객을 태워요. 벽과 내 몸에 부딪히면 끝!', fmt: v => v + '명', hint: '많을수록 좋아요' },
    { id: 'typing', icon: '⌨️', name: '역 이름 타이핑', desc: '30초 동안 역 이름을 빠르게 쳐요. 한 글자라도 틀리면 안 넘어가요.', fmt: v => v + '개', hint: '많을수록 좋아요' }
  ];

  /* --- 게임 구현: mount(stage, finish) → destroy --- */
  function gMemory(stage, finish) {
    const em = ['🚌', '🚆', '🚇', '🚄', '🚋', '🚲', '🛤️', '🚏'];
    let cards, open, tries, matched, lock;
    function init() {
      cards = shuffle(em.concat(em)); open = []; tries = 0; matched = 0; lock = false;
      stage.innerHTML = `<div class="lg-stat">시도 <b id="mTry">0</b>번 · 맞춘 쌍 <b id="mOk">0</b>/8 <button class="btn sm" type="button" id="mReset">↻ 다시</button></div>
        <div class="mem-grid">${cards.map((c, i) => `<button class="mem-c" type="button" data-i="${i}" aria-label="카드 ${i + 1}"><span class="mem-f">?</span><span class="mem-b">${c}</span></button>`).join('')}</div>`;
      $('#mReset', stage).onclick = init;
      stage.querySelectorAll('.mem-c').forEach(b => b.onclick = () => flip(b));
    }
    function flip(b) {
      if (lock || b.classList.contains('up') || b.classList.contains('ok')) return;
      b.classList.add('up'); open.push(b);
      if (open.length < 2) return;
      tries++; $('#mTry', stage).textContent = tries;
      const [x, y] = open;
      if (cards[+x.dataset.i] === cards[+y.dataset.i]) {
        x.classList.add('ok'); y.classList.add('ok'); open = []; matched++; $('#mOk', stage).textContent = matched;
        if (matched === 8) setTimeout(() => finish(tries), 400);
      } else { lock = true; setTimeout(() => { x.classList.remove('up'); y.classList.remove('up'); open = []; lock = false; }, 700); }
    }
    init(); return () => {};
  }

  function gReaction(stage, finish) {
    let times = [], state = 'idle', t0 = 0, to = null;
    const pad = () => $('#rPad', stage), txt = (s, c, sub) => { pad().className = 'rx-pad ' + c; pad().innerHTML = `<b>${s}</b><small>${sub || ''}</small>`; };
    function idle() { state = 'idle'; txt(times.length ? `${times.length}/3 완료` : '시작하려면 누르세요', 'idle', times.length ? '다음 라운드 시작하려면 누르세요' : '초록색이 되면 최대한 빨리 클릭!'); }
    function wait() { state = 'wait'; txt('기다리세요…', 'wait', '초록색이 되면 클릭'); to = setTimeout(() => { state = 'go'; t0 = performance.now(); txt('지금!', 'go', ''); }, 1500 + Math.random() * 2500); }
    stage.innerHTML = `<div class="lg-stat">라운드 3번의 평균 · <span id="rList">-</span></div><button class="rx-pad idle" id="rPad" type="button"></button>`;
    idle();
    pad().onclick = () => {
      if (state === 'idle') return wait();
      if (state === 'wait') { clearTimeout(to); state = 'early'; txt('너무 빨랐어요!', 'early', '다시 누르면 이 라운드를 다시 시작해요'); return; }
      if (state === 'early') return wait();
      if (state === 'go') {
        const ms = performance.now() - t0; times.push(ms); $('#rList', stage).textContent = times.map(t => Math.round(t) + 'ms').join(' · ');
        if (times.length >= 3) { const avg = times.reduce((a, b) => a + b, 0) / 3; state = 'done'; txt(Math.round(avg) + 'ms', 'idle', '평균 기록'); setTimeout(() => finish(Math.max(80, Math.round(avg))), 300); return; }
        txt(Math.round(ms) + 'ms', 'idle', `${times.length}/3 · 다음 라운드는 눌러서 시작`); state = 'idle';
      } else if (state === 'done') { times = []; $('#rList', stage).textContent = '-'; idle(); }
    };
    return () => clearTimeout(to);
  }

  function g2048(stage, finish) {
    let g, score, over, saved;
    const keymap = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'L', d: 'R', w: 'U', s: 'D' };
    function spawn() { const e = []; g.forEach((r, y) => r.forEach((v, x) => { if (!v) e.push([y, x]); })); if (!e.length) return; const [y, x] = e[Math.floor(Math.random() * e.length)]; g[y][x] = Math.random() < .9 ? 2 : 4; }
    function slide(line) { const a = line.filter(Boolean), out = []; let gain = 0; for (let i = 0; i < a.length; i++) { if (a[i] === a[i + 1]) { out.push(a[i] * 2); gain += a[i] * 2; i++; } else out.push(a[i]); } while (out.length < 4) out.push(0); return [out, gain]; }
    function move(d) {
      if (over) return; const before = JSON.stringify(g); let gain = 0;
      const rows = d === 'L' || d === 'R';
      for (let i = 0; i < 4; i++) {
        let line = rows ? g[i].slice() : g.map(r => r[i]); if (d === 'R' || d === 'D') line.reverse();
        let [o, gn] = slide(line); gain += gn; if (d === 'R' || d === 'D') o.reverse();
        if (rows) g[i] = o; else o.forEach((v, y) => { g[y][i] = v; });
      }
      if (JSON.stringify(g) === before) return; score += gain; spawn(); draw();
      const full = g.every(r => r.every(Boolean)); let can = !full;
      if (full) for (let y = 0; y < 4 && !can; y++) for (let x = 0; x < 4; x++) { if ((x < 3 && g[y][x] === g[y][x + 1]) || (y < 3 && g[y][x] === g[y + 1][x])) { can = true; break; } }
      if (!can) { over = true; draw(); end(); }
    }
    function end() { if (saved) return; saved = true; if (score > 0) finish(score); }
    function draw() {
      $('#gScore', stage).textContent = score.toLocaleString('ko-KR');
      $('#gBoard', stage).innerHTML = g.map(r => r.map(v => `<i class="t t${v > 2048 ? 'x' : v}">${v || ''}</i>`).join('')).join('') + (over ? '<div class="g-over">게임 끝!</div>' : '');
    }
    function init() { g = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; score = 0; over = false; saved = false; spawn(); spawn(); draw(); }
    stage.innerHTML = `<div class="lg-stat">점수 <b id="gScore">0</b> <button class="btn sm" type="button" id="gSave">💾 지금 기록 저장</button> <button class="btn sm" type="button" id="gNew">↻ 새 게임</button></div>
      <div class="g-board" id="gBoard" tabindex="0" aria-label="2048 판"></div>
      <div class="dpad"><button type="button" data-d="U" aria-label="위">▲</button><div><button type="button" data-d="L" aria-label="왼쪽">◀</button><button type="button" data-d="D" aria-label="아래">▼</button><button type="button" data-d="R" aria-label="오른쪽">▶</button></div></div>`;
    init();
    $('#gNew', stage).onclick = () => { if (!saved && score > 0 && !over) { end(); } init(); };
    $('#gSave', stage).onclick = () => { if (score > 0 && !saved) { over = true; draw(); end(); } };
    stage.querySelectorAll('.dpad [data-d]').forEach(b => b.onclick = () => move(b.dataset.d));
    on(document, 'keydown', e => { const d = keymap[e.key]; if (!d || e.target.matches('input,textarea,select')) return; if (!stage.isConnected) return; e.preventDefault(); move(d); });
    let sx = 0, sy = 0; const bd = $('#gBoard', stage);
    bd.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    bd.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); }, { passive: true });
    bd.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    return () => {};
  }

  function gSnake(stage, finish) {
    const N = 18, S = 18; let snake, dir, nd, food, alive, tm, score;
    stage.innerHTML = `<div class="lg-stat">승객 <b id="sScore">0</b>명 <button class="btn sm" type="button" id="sStart">▶ 시작</button></div>
      <canvas id="sCv" width="${N * S}" height="${N * S}" class="sn-cv" tabindex="0"></canvas>
      <div class="dpad"><button type="button" data-d="U" aria-label="위">▲</button><div><button type="button" data-d="L" aria-label="왼쪽">◀</button><button type="button" data-d="D" aria-label="아래">▼</button><button type="button" data-d="R" aria-label="오른쪽">▶</button></div></div>`;
    const cv = $('#sCv', stage), cx = cv.getContext('2d');
    const V = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] }, opp = { U: 'D', D: 'U', L: 'R', R: 'L' };
    const km = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D', a: 'L', d: 'R', w: 'U', s: 'D' };
    function place() { let p; do { p = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; } while (snake.some(s => s[0] === p[0] && s[1] === p[1])); return p; }
    function draw(dead) {
      cx.fillStyle = '#10151f'; cx.fillRect(0, 0, N * S, N * S);
      cx.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if ((i + j) % 2) cx.fillRect(i * S, j * S, S, S);
      cx.font = (S - 2) + 'px serif'; cx.textBaseline = 'top'; cx.fillText('🧍', food[0] * S, food[1] * S + 1);
      snake.forEach((s, i) => { cx.fillStyle = i ? (dead ? '#777' : '#3b82f6') : (dead ? '#999' : '#60a5fa'); cx.fillRect(s[0] * S + 1, s[1] * S + 1, S - 2, S - 2); });
      if (snake[0]) { cx.fillStyle = '#fff'; cx.fillRect(snake[0][0] * S + 4, snake[0][1] * S + 4, 3, 3); cx.fillRect(snake[0][0] * S + 11, snake[0][1] * S + 4, 3, 3); }
    }
    function die() { alive = false; clearInterval(tm); draw(true); $('#sStart', stage).textContent = '↻ 다시'; if (score > 0) finish(score); }
    function tick() {
      dir = nd; const h = [snake[0][0] + V[dir][0], snake[0][1] + V[dir][1]];
      if (h[0] < 0 || h[1] < 0 || h[0] >= N || h[1] >= N || snake.some(s => s[0] === h[0] && s[1] === h[1])) return die();
      snake.unshift(h);
      if (h[0] === food[0] && h[1] === food[1]) { score++; $('#sScore', stage).textContent = score; food = place(); clearInterval(tm); tm = setInterval(tick, Math.max(60, 130 - score * 3)); timers.push(tm); }
      else snake.pop();
      draw();
    }
    function start() { clearInterval(tm); snake = [[9, 9], [8, 9], [7, 9]]; dir = nd = 'R'; food = place(); alive = true; score = 0; $('#sScore', stage).textContent = 0; $('#sStart', stage).textContent = '진행 중…'; draw(); tm = setInterval(tick, 130); timers.push(tm); cv.focus(); }
    snake = [[9, 9], [8, 9], [7, 9]]; food = [13, 9]; draw();
    $('#sStart', stage).onclick = start;
    const turn = d => { if (alive && d !== opp[dir]) nd = d; };
    on(document, 'keydown', e => { const d = km[e.key]; if (!d || e.target.matches('input,textarea,select') || !stage.isConnected) return; e.preventDefault(); if (!alive) return; turn(d); });
    stage.querySelectorAll('.dpad [data-d]').forEach(b => b.onclick = () => turn(b.dataset.d));
    let sx = 0, sy = 0;
    cv.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    cv.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); }, { passive: true });
    cv.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    return () => clearInterval(tm);
  }

  function gTyping(stage, finish) {
    let cnt = 0, left = 30, tm = null, word = '', running = false;
    stage.innerHTML = `<div class="lg-stat">남은 시간 <b id="tLeft">30</b>초 · 맞힌 역 <b id="tCnt">0</b>개 <button class="btn sm" type="button" id="tStart">▶ 시작</button></div>
      <div class="ty-word" id="tWord">시작을 누르세요</div>
      <input class="input ty-in" id="tIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="여기에 입력" disabled aria-label="역 이름 입력">`;
    const inp = $('#tIn', stage);
    function next() { let w; do { w = STATIONS[Math.floor(Math.random() * STATIONS.length)]; } while (w === word); word = w; $('#tWord', stage).textContent = word; inp.value = ''; }
    function stop() { clearInterval(tm); running = false; inp.disabled = true; $('#tWord', stage).textContent = `끝! ${cnt}개`; $('#tStart', stage).textContent = '↻ 다시'; if (cnt > 0) finish(cnt); }
    $('#tStart', stage).onclick = () => {
      clearInterval(tm); cnt = 0; left = 30; running = true; $('#tCnt', stage).textContent = 0; $('#tLeft', stage).textContent = 30; inp.disabled = false; next(); inp.focus();
      tm = setInterval(() => { left--; $('#tLeft', stage).textContent = left; if (left <= 0) stop(); }, 1000); timers.push(tm);
    };
    inp.addEventListener('input', () => { if (running && !inp.matches(':disabled') && inp.value.trim() === word) { cnt++; $('#tCnt', stage).textContent = cnt; next(); } });
    return () => clearInterval(tm);
  }
  const IMPL = { memory: gMemory, reaction: gReaction, g2048, snake: gSnake, typing: gTyping };

  async function viewLounge(main) {
    cleanup();
    main.innerHTML = `<h2 class="page-title">🛋 운영진 휴게실</h2>
      <div class="msg info">☕ 부관리자 이상만 들어올 수 있는 비밀 휴식 공간이에요. 잠깐 쉬면서 미니게임으로 겨뤄 보세요. 기록은 운영진끼리만 보여요.</div>
      <div class="lg-tabs" id="lgTabs">${GAMES.map(g => `<button class="btn" type="button" data-g="${g.id}"><span>${g.icon}</span> ${esc(g.name)}</button>`).join('')}</div>
      <div class="lg-wrap"><div class="lg-stage panel raised" id="lgStage"></div><aside class="lg-board panel raised" id="lgBoard"></aside></div>`;
    let cur = null, destroy = null;
    const me = A.me();
    async function board(g) {
      const box = $('#lgBoard', main); if (!box) return;
      let rows = []; try { rows = await A.loungeBoard(g.id); } catch (e) { box.innerHTML = `<div class="msg err">${esc(errMsg(e))}</div>`; return; }
      box.innerHTML = `<h3>🏆 ${esc(g.name)}</h3><small>${esc(g.hint)}</small>` + (rows.length ? `<ol class="lg-rank">${rows.map((r, i) => `<li class="${me && r.userId === me.id ? 'me' : ''}"><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span><b>${esc(r.nick)}</b><span class="sc">${esc(g.fmt(r.best))}</span><small>${r.plays}판</small></li>`).join('')}</ol>` : '<div class="empty">아직 기록이 없어요. 첫 기록의 주인공이 되어 보세요!</div>');
    }
    function pick(id) {
      cleanup(); if (destroy) { try { destroy(); } catch (e) {} } cur = GAMES.find(g => g.id === id) || GAMES[0];
      main.querySelectorAll('#lgTabs button').forEach(b => b.classList.toggle('primary', b.dataset.g === cur.id));
      const st = $('#lgStage', main); st.innerHTML = '';
      const head = document.createElement('div'); head.className = 'lg-head'; head.innerHTML = `<h3>${cur.icon} ${esc(cur.name)}</h3><p>${esc(cur.desc)}</p>`; st.appendChild(head);
      const body = document.createElement('div'); st.appendChild(body);
      const g = cur;
      destroy = IMPL[g.id](body, async score => {
        try { const r = await A.loungeSubmit(g.id, score); toast(r.isBest ? `🏆 개인 최고 기록! ${g.fmt(score)}` : `기록 ${g.fmt(score)} (내 최고 ${g.fmt(r.best)})`); }
        catch (e) { toast('기록을 저장하지 못했어요: ' + errMsg(e)); }
        board(g);
      });
      board(g);
    }
    main.querySelectorAll('#lgTabs button').forEach(b => b.onclick = () => pick(b.dataset.g));
    pick(GAMES[0].id);
  }

  /* ================= 회의실 ================= */
  const PH = { upcoming: ['예정', 'ph-up'], open: ['● 진행 중', 'ph-open'], wrap: ['마무리 중', 'ph-wrap'], ended: ['종료', 'ph-end'] };
  const RS = { yes: '✔ 참석', no: '✖ 불참', maybe: '？ 미정' };
  const fmtRange = (s, e) => { const a = new Date(s), b = new Date(e), p = n => String(n).padStart(2, '0');
    return `${a.getMonth() + 1}/${a.getDate()}(${'일월화수목금토'[a.getDay()]}) ${p(a.getHours())}:${p(a.getMinutes())} ~ ${p(b.getHours())}:${p(b.getMinutes())}`; };
  const toLocalInput = iso => { const d = new Date(iso), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const cd = ms => { const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (d ? d + '일 ' : '') + (h ? h + '시간 ' : '') + (d ? '' : m + '분 ') + (d || h ? '' : x + '초'); };
  const phChip = ph => `<span class="ph ${PH[ph][1]}">${PH[ph][0]}</span>`;

  function meetForm(m) {
    const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 1);
    const st = m ? toLocalInput(m.start) : toLocalInput(now), en = m ? toLocalInput(m.end) : toLocalInput(new Date(now.getTime() + 3600000));
    return `<form class="mt-form" id="mtForm"><label>회의 제목<input class="input" name="title" maxlength="80" required value="${esc(m ? m.title : '')}" placeholder="예: 10월 운영 회의"></label>
      <div class="mt-row"><label>시작<input class="input" type="datetime-local" name="start" required value="${st}"></label><label>끝<input class="input" type="datetime-local" name="end" required value="${en}"></label></div>
      <label>안건 (한 줄에 하나씩)<textarea class="input" name="agenda" rows="4" maxlength="3000" placeholder="1. 공지 정리&#10;2. 등업 기준 논의">${esc(m ? m.agenda : '')}</textarea></label>
      <div class="mt-err msg err" id="mtErr" hidden></div>
      <div><button class="btn primary" type="submit">${m ? '💾 저장' : '🗓 회의 만들기'}</button> <button class="btn" type="button" id="mtCancel">취소</button></div></form>`;
  }
  function readMeetForm(f) { return { title: f.title.value, agenda: f.agenda.value, start: new Date(f.start.value).toISOString(), end: new Date(f.end.value).toISOString() }; }

  async function viewMeetings(main, id, route) {
    cleanup();
    const me = A.me(), mgr = !!me && A.isManager(me.role);
    if (id) return viewRoom(main, id, route, me, mgr);
    const list = await A.meetList();
    const live = list.filter(m => A.meetPhase(m) !== 'ended').sort((a, b) => new Date(a.start) - new Date(b.start));
    const past = list.filter(m => A.meetPhase(m) === 'ended');
    const card = m => { const ph = A.meetPhase(m);
      return `<a class="mt-card ${ph}" href="#/meetings/${esc(m.id)}"><div class="mt-top">${phChip(ph)}<b>${esc(m.title)}</b></div><div class="mt-time">🗓 ${esc(fmtRange(m.start, m.end))}</div>
        <div class="mt-sub">참석 ${m.yes} · 불참 ${m.no} · 미정 ${m.maybe}${m.joined ? ` · 입장 ${m.joined}` : ''}${ph !== 'ended' ? ` · 내 응답: ${m.myRsvp ? RS[m.myRsvp] : '아직 안 함'}` : ''}</div></a>`; };
    main.innerHTML = `<h2 class="page-title">🗓 운영진 회의실</h2>
      <div class="msg info">회의 일정은 총관리자·관리자가 만들어요. 회의 시간 10분 전부터 입장해서 채팅하고 투표할 수 있어요.</div>
      ${mgr ? '<div style="margin:8px 0"><button class="btn primary" type="button" id="mtNew">＋ 회의 만들기</button></div><div id="mtFormBox" hidden></div>' : ''}
      <div class="sub-title"><span>📌 예정·진행 중</span></div>
      <div class="mt-list">${live.length ? live.map(card).join('') : '<div class="empty">예정된 회의가 없어요.</div>'}</div>
      <div class="sub-title"><span>📁 지난 회의</span></div>
      <div class="mt-list">${past.length ? past.map(card).join('') : '<div class="empty">지난 회의가 없어요.</div>'}</div>`;
    if (mgr) {
      $('#mtNew', main).onclick = () => {
        const box = $('#mtFormBox', main); box.hidden = false; box.innerHTML = meetForm(null);
        $('#mtCancel', box).onclick = () => { box.hidden = true; box.innerHTML = ''; };
        $('#mtForm', box).onsubmit = async e => { e.preventDefault(); try { const m = await A.meetSave(readMeetForm(e.target)); toast('회의를 만들었어요. 운영진에게 알림이 갔어요.'); location.hash = '#/meetings/' + m.id; } catch (x) { const el = $('#mtErr', box); el.hidden = false; el.textContent = '⚠ ' + errMsg(x); } };
      };
    }
  }

  async function viewRoom(main, id, route, me, mgr) {
    let m = await A.meetGet(id);
    if (!m) { main.innerHTML = '<div class="msg err">회의를 찾을 수 없어요.</div><a class="btn" href="#/meetings">◀ 회의 목록</a>'; return; }
    main.innerHTML = `<div class="nt-acts"><a class="btn sm" href="#/meetings">◀ 회의 목록</a></div>
      <div id="mrTop"></div>
      <div class="mr-cols"><div class="mr-main">
        <div class="sub-title"><span>📋 안건</span></div><div class="panel sunken mr-agenda" id="mrAgenda"></div>
        <div class="sub-title"><span>🗳 투표</span></div><div id="mrPolls"></div>
        <div class="sub-title"><span>📝 회의록</span></div><div id="mrMin"></div>
      </div><aside class="mr-side">
        <div class="sub-title"><span>👥 참석 현황</span></div><div id="mrMem"></div>
        <div class="sub-title"><span>💬 회의 채팅</span></div>
        <div class="mr-chat" id="mrChat"><div class="mr-msgs" id="mrMsgs"></div>
        <form class="mr-send" id="mrSend"><input class="input" id="mrIn" maxlength="500" autocomplete="off" placeholder="메시지 입력" aria-label="회의 채팅 입력"><button class="btn primary" type="submit">전송</button></form></div>
      </aside></div>`;
    const ph = () => A.meetPhase(m);
    const mine = () => m.members.find(x => me && x.userId === me.id) || {};

    const editOpen = () => { const b = $('#mrEditBox', main); return !!b && !b.hidden; };
    function countLine() {
      const p = ph(), now = Date.now(), st = new Date(m.start).getTime(), en = new Date(m.end).getTime();
      if (p === 'upcoming') return `시작까지 <b>${cd(st - now)}</b> (10분 전부터 입장)`;
      if (p === 'open') return now < st ? `곧 시작해요 · 시작까지 <b>${cd(st - now)}</b>` : `진행 중 · 종료까지 <b>${cd(en - now)}</b>`;
      if (p === 'wrap') return '회의는 끝났어요. 마무리 채팅·투표는 한 시간 동안 가능해요.';
      return '끝난 회의예요. 대화와 투표 결과는 그대로 볼 수 있어요.';
    }
    let shownPhase = '';
    function tickTop() { const c = $('#mrCount', main); if (ph() !== shownPhase && !editOpen()) { drawTop(); drawPolls(); } else if (c) c.innerHTML = countLine(); }
    function drawTop() {
      const p = ph(), my = mine(); shownPhase = p;
      $('#mrTop', main).innerHTML = `<div class="panel raised mr-head"><div class="mt-top">${phChip(p)}<h2 class="page-title" style="margin:0;border:0">${esc(m.title)}</h2></div>
        <div class="mt-time">🗓 ${esc(fmtRange(m.start, m.end))} · 만든 사람 ${esc(m.creator)}</div><div class="mr-count" id="mrCount">${countLine()}</div>
        <div class="mr-act">${p !== 'ended' && p !== 'wrap' ? `<span class="mr-rsvp">${['yes', 'no', 'maybe'].map(k => `<button class="btn sm${my.rsvp === k ? ' primary' : ''}" type="button" data-rs="${k}">${RS[k]}</button>`).join('')}</span>` : ''}
        ${p === 'open' ? `<button class="btn primary" type="button" id="mrJoin" ${my.joinedAt ? 'disabled' : ''}>${my.joinedAt ? '✔ 입장함' : '🚪 입장하기 (출석)'}</button>` : ''}
        ${mgr ? '<button class="btn sm" type="button" id="mrEdit">✏ 일정 수정</button> <button class="btn sm danger" type="button" id="mrDel">🗑 회의 삭제</button>' : ''}</div>
        <div id="mrEditBox" hidden></div></div>`;
      main.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => { try { await A.meetRsvp(m.id, b.dataset.rs); await reload(); } catch (e) { alertBox(errMsg(e), '오류', '⚠️'); } });
      const j = $('#mrJoin', main); if (j) j.onclick = async () => { try { await A.meetJoin(m.id); toast('입장했어요! 출석이 기록됐어요 ✔'); await reload(); } catch (e) { alertBox(errMsg(e), '오류', '⚠️'); } };
      if (mgr) {
        $('#mrEdit', main).onclick = () => {
          const box = $('#mrEditBox', main); box.hidden = !box.hidden; if (box.hidden) return; box.innerHTML = meetForm(m);
          $('#mtCancel', box).onclick = () => { box.hidden = true; };
          $('#mtForm', box).onsubmit = async e => { e.preventDefault(); try { await A.meetSave({ ...readMeetForm(e.target), id: m.id }); toast('저장했어요.'); await reload(true); } catch (x) { const el = $('#mtErr', box); el.hidden = false; el.textContent = '⚠ ' + errMsg(x); } };
        };
        $('#mrDel', main).onclick = async () => { if (!(await confirmBox('이 회의를 지울까요?\n(채팅·투표·회의록이 모두 사라져요)', '회의 삭제'))) return; try { await A.meetDelete(m.id); location.hash = '#/meetings'; } catch (e) { alertBox(errMsg(e), '오류', '⚠️'); } };
      }
    }
    function drawBody() {
      $('#mrAgenda', main).innerHTML = m.agenda ? esc(m.agenda).replace(/\n/g, '<br>') : '<span class="muted">등록된 안건이 없어요.</span>';
      const ms = m.members.slice().sort((a, b) => (b.joinedAt ? 1 : 0) - (a.joinedAt ? 1 : 0));
      $('#mrMem', main).innerHTML = ms.length ? `<ul class="mr-mem">${ms.map(x => `<li><b>${esc(x.nick)}</b> ${x.rsvp ? `<small>${RS[x.rsvp]}</small>` : ''}${x.joinedAt ? ' <span class="ok">입장 ✔</span>' : ''}</li>`).join('')}</ul>` : '<div class="empty">아직 응답한 사람이 없어요.</div>';
      drawPolls();
    }
    function drawPolls() {
      const p = ph(), box = $('#mrPolls', main);
      const dn = box.querySelector('.poll-new'); if (dn && dn.open) return;
      box.innerHTML = (m.polls.length ? m.polls.map(q => { const tot = q.counts.reduce((a, b) => a + b, 0), can = !q.closed && p !== 'ended';
        return `<div class="poll panel raised"><div class="poll-q"><b>${esc(q.question)}</b> ${q.closed ? '<span class="ph ph-end">마감</span>' : ''}</div>
          ${q.options.map((o, i) => `<button class="poll-o${q.mine === i ? ' mine' : ''}" type="button" data-poll="${esc(q.id)}" data-i="${i}" ${can ? '' : 'disabled'}>
            <i style="width:${tot ? Math.round(q.counts[i] / tot * 100) : 0}%"></i><span>${esc(o)}${q.mine === i ? ' ✔' : ''}</span><em>${q.counts[i]}표${tot ? ' · ' + Math.round(q.counts[i] / tot * 100) + '%' : ''}</em></button>
            ${q.voters[i].length ? `<small class="poll-v">${esc(q.voters[i].join(', '))}</small>` : ''}`).join('')}
          ${mgr ? `<div class="mr-act"><button class="btn sm" type="button" data-pclose="${esc(q.id)}" data-v="${q.closed ? 0 : 1}">${q.closed ? '다시 열기' : '마감하기'}</button> <button class="btn sm danger" type="button" data-pdel="${esc(q.id)}">삭제</button></div>` : ''}</div>`; }).join('')
        : '<div class="empty">진행 중인 투표가 없어요.</div>')
        + (mgr && p !== 'ended' ? `<details class="poll-new"><summary>＋ 투표 만들기</summary><form id="pollForm"><input class="input" name="q" maxlength="100" placeholder="질문" required><textarea class="input" name="o" rows="3" placeholder="선택지 (한 줄에 하나, 2~6개)&#10;찬성&#10;반대" required></textarea><div class="msg err" id="pollErr" hidden></div><button class="btn primary" type="submit">투표 올리기</button></form></details>` : '');
      box.querySelectorAll('[data-poll]').forEach(b => b.onclick = async () => { try { await A.pollVote(b.dataset.poll, +b.dataset.i); await reload(); } catch (e) { alertBox(errMsg(e), '오류', '⚠️'); } });
      box.querySelectorAll('[data-pclose]').forEach(b => b.onclick = async () => { try { await A.pollClose(b.dataset.pclose, b.dataset.v === '1'); await reload(); } catch (e) { alertBox(errMsg(e), '오류', '⚠️'); } });
      box.querySelectorAll('[data-pdel]').forEach(b => b.onclick = async () => { if (!(await confirmBox('이 투표를 지울까요?', '투표 삭제'))) return; try { await A.pollDelete(b.dataset.pdel); await reload(); } catch (e) { alertBox(errMsg(e), '오류', '⚠️'); } });
      const pf = $('#pollForm', box); if (pf) pf.onsubmit = async e => { e.preventDefault(); try { await A.pollCreate(m.id, pf.q.value, pf.o.value.split('\n')); box.querySelector('.poll-new').open = false; await reload(); } catch (x) { const el = $('#pollErr', box); el.hidden = false; el.textContent = '⚠ ' + errMsg(x); } };
    }
    function drawMinutes(first) {
      const box = $('#mrMin', main);
      if (!mgr) { box.innerHTML = m.minutes ? `<div class="panel sunken mr-agenda">${esc(m.minutes).replace(/\n/g, '<br>')}</div>` : '<div class="empty">아직 회의록이 없어요.</div>'; return; }
      if (!first) return;
      box.innerHTML = `<textarea class="input mr-min" id="mrMinTa" maxlength="8000" rows="6" placeholder="회의록을 적어 두세요 (운영진 모두에게 보여요)">${esc(m.minutes)}</textarea><div style="margin-top:6px"><button class="btn primary sm" type="button" id="mrMinSave">💾 회의록 저장</button></div>`;
      $('#mrMinSave', box).onclick = async () => { try { await A.meetSave({ id: m.id, title: m.title, agenda: m.agenda, start: m.start, end: m.end, minutes: $('#mrMinTa', box).value }); toast('회의록을 저장했어요.'); } catch (e) { alertBox(errMsg(e), '오류', '⚠️'); } };
    }
    async function reload(full) { const g = await A.meetGet(id); if (!g) { location.hash = '#/meetings'; return; } m = g; if (full || !editOpen()) drawTop(); drawBody(); }

    /* 채팅 */
    let lastId = 0; const msgs = $('#mrMsgs', main);
    const addMsgs = list => {
      if (!list.length) return; const atEnd = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 50 || !lastId;
      list.forEach(x => { lastId = Math.max(lastId, +x.id);
        const d = document.createElement('div'); d.className = 'mr-m' + (me && x.userId === me.id ? ' me' : '');
        d.innerHTML = `<b>${esc(x.nick)}</b> <span>${esc(x.body)}</span> <small>${new Date(x.created).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })}</small>${(me && x.userId === me.id) || mgr ? ` <a role="button" tabindex="0" data-del="${esc(String(x.id))}" title="삭제">✕</a>` : ''}`;
        d.dataset.id = x.id; msgs.appendChild(d); });
      if (atEnd) msgs.scrollTop = msgs.scrollHeight;
    };
    msgs.addEventListener('click', async e => { const a = e.target.closest('[data-del]'); if (!a) return; try { await A.meetChatDelete(id, isNaN(+a.dataset.del) ? a.dataset.del : +a.dataset.del); const row = a.closest('.mr-m'); if (row) row.remove(); } catch (x) { alertBox(errMsg(x), '오류', '⚠️'); } });
    async function poll() { try { addMsgs(await A.meetChatList(id, lastId || undefined)); } catch (e) { /* 조용히 */ } }
    $('#mrSend', main).onsubmit = async e => {
      e.preventDefault(); const inp = $('#mrIn', main), v = inp.value.trim(); if (!v) return;
      try { await A.meetChatSend(id, v); inp.value = ''; await poll(); } catch (x) { alertBox(errMsg(x), '보내지 못했어요', '⚠️'); }
    };
    drawTop(); drawBody(); drawMinutes(true); await poll();
    every(() => { if (!document.hidden) tickTop(); }, 1000);
    every(() => { if (!document.hidden) poll(); }, 3000);
    every(() => { if (!document.hidden) reload().then(() => drawMinutes(false)).catch(() => {}); }, 8000);
  }

  /* 대시보드 배너 */
  async function banner() {
    let n = null; try { n = await A.meetNext(); } catch (e) { return ''; }
    if (!n) return '';
    const p = A.meetPhase(n), now = Date.now(), st = new Date(n.start).getTime();
    return `<a class="mt-banner ${p}" href="#/meetings/${esc(n.id)}">🗓 ${p === 'open' ? '<b>회의 진행 중</b>' : '다가오는 회의'} · ${esc(n.title)} <small>${esc(fmtRange(n.start, n.end))}${p === 'upcoming' ? ' · ' + cd(st - now) + ' 후' : ''}</small> <span class="btn sm primary">${p === 'open' || p === 'wrap' ? '입장하기' : '자세히'}</span></a>`;
  }

  window.StaffRoom = { viewLounge, viewMeetings, banner, cleanup };
})();
