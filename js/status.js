/* ==========================================================
   status.js — 덕질역 서비스 상태 페이지
   · 실시간 점검: 이 브라우저가 직접 각 서비스에 요청을 보내 보고, 응답 시간으로 정상/느림/장애를 정해요.
   · 운영진 공지: 관리자 센터 → 📡 상태 공지에 올린 글(진행 중 / 지난 기록)과 최근 90일 막대를 보여줘요.
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG, A = window.API, app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const DAYS = 90, SLOW_MS = 1800, TIMEOUT_MS = 7000, EVERY_MS = 60000;
  const COMPS = C.statusComponents || [];
  const ST = { investigating: '확인 중', identified: '원인 파악', monitoring: '지켜보는 중', resolved: '해결됨' };
  const RANK = { ok: 0, na: 0, info: 1, slow: 2, down: 3 };
  const IMPACT_TO_STATE = { none: 'info', minor: 'slow', major: 'down' };
  const STATE_TEXT = { ok: '정상', slow: '느리거나 일부 불편', down: '장애', na: '점검 안 함', info: '안내' };
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const fmtDT = iso => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

  /* ---------- 실시간 점검 ---------- */
  async function timed(url, opts) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT_MS), t0 = performance.now();
    try {
      const r = await fetch(url, Object.assign({ cache: 'no-store', signal: ctl.signal }, opts || {}));
      const ms = Math.round(performance.now() - t0);
      return { ok: r.type === 'opaque' || r.ok, ms };
    } catch (e) { return { ok: false, ms: Math.round(performance.now() - t0), err: e.name === 'AbortError' ? '응답 없음(시간 초과)' : '연결 실패' }; }
    finally { clearTimeout(t); }
  }
  // 한 번 실패했다고 바로 장애로 보지 않고, 잠깐 뒤 한 번 더 확인해요 (순간적인 네트워크 끊김 방지)
  const timedRetry = async (url, opts) => { const r = await timed(url, opts); if (r.ok) return r; await new Promise(res => setTimeout(res, 1200)); const r2 = await timed(url, opts); return r2.ok ? r2 : r; };
  const grade = r => (!r.ok ? 'down' : r.ms >= SLOW_MS ? 'slow' : 'ok');
  async function runChecks() {
    const url = C.supabaseUrl, key = C.supabaseAnonKey, hasSb = !!(url && key), h = { apikey: key, Authorization: 'Bearer ' + key };
    const jobs = {
      site: timedRetry(location.pathname.replace(/[^/]*$/, '') + 'index.html', { method: 'HEAD' }),
      rail: C.railUrl ? timedRetry(C.railUrl, { mode: 'no-cors' }) : Promise.resolve(null),
      db: hasSb ? timedRetry(`${url}/rest/v1/profiles?select=id&limit=1`, { headers: h }) : Promise.resolve(null),
      auth: hasSb ? timedRetry(`${url}/auth/v1/health`, { headers: { apikey: key } }) : Promise.resolve(null),
      server: hasSb ? timedRetry(`${url}/functions/v1/remove-member`, { method: 'OPTIONS' }) : Promise.resolve(null)
    };
    const out = {};
    await Promise.all(Object.entries(jobs).map(async ([k, p]) => { const r = await p; out[k] = r ? { state: grade(r), ms: r.ms, err: r.err } : { state: 'na', ms: 0 }; }));
    return out;
  }

  /* ---------- 공지 계산 ---------- */
  const isActive = i => i.status !== 'resolved';
  const appliesTo = (inc, id) => !inc.components.length || inc.components.includes(id);
  function effective(live, incidents) {
    const res = {};
    COMPS.forEach(c => {
      const l = live[c.id] || { state: 'na', ms: 0 };
      let state = l.state, notes = [];
      incidents.filter(i => isActive(i) && appliesTo(i, c.id)).forEach(i => { state = worse(state, IMPACT_TO_STATE[i.impact] || 'info'); notes.push(i); });
      res[c.id] = { state, live: l, notes };
    });
    return res;
  }
  function dayBars(incidents, compId) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const bars = [];
    for (let n = DAYS - 1; n >= 0; n--) {
      const d0 = new Date(today); d0.setDate(d0.getDate() - n);
      const d1 = new Date(d0); d1.setDate(d1.getDate() + 1);
      let st = 'ok'; const hit = [];
      incidents.forEach(i => {
        if (compId && !appliesTo(i, compId)) return;
        const s = new Date(i.created), e = i.resolved ? new Date(i.resolved) : new Date();
        if (s < d1 && e >= d0) { st = worse(st, IMPACT_TO_STATE[i.impact] || 'info'); hit.push(i.title); }
      });
      bars.push({ day: dayKey(d0), st, hit });
    }
    return bars;
  }

  /* ---------- 그리기 ---------- */
  let incidents = [], live = null, lastAt = null, busy = false;
  function incHTML(i) {
    const st = IMPACT_TO_STATE[i.impact] || 'info';
    const names = i.components.map(id => (COMPS.find(c => c.id === id) || {}).name || id);
    return `<div class="st-inc"><h3>${esc(i.title)} <span class="st-tag ${i.status === 'resolved' ? 'ok' : st}">${ST[i.status] || i.status}</span>${names.length ? `<span class="st-tag">${names.map(esc).join(' · ')}</span>` : ''}</h3>
      <ul class="st-ups">${i.updates.slice().reverse().map(u => `<li><b>${ST[u.status] || u.status}</b> ${esc(u.body)}<small>${fmtDT(u.created)}</small></li>`).join('')}</ul></div>`;
  }
  function render() {
    const eff = effective(live || {}, incidents);
    const all = COMPS.reduce((w, c) => worse(w, eff[c.id].state === 'info' ? 'ok' : eff[c.id].state), 'ok');
    const act = incidents.filter(isActive);
    const banner = { ok: ['✅', '모든 시스템이 정상이에요', act.length ? '진행 중인 안내가 있어요. 아래를 확인해 주세요.' : '지금은 문제가 없어요.'],
      slow: ['⚠️', '일부 서비스가 느리거나 불편해요', '운영진이 확인하고 있어요.'],
      down: ['⛔', '장애가 발생했어요', '복구 중이에요. 진행 상황은 아래에서 확인할 수 있어요.'] }[all];
    const dayStart = new Date(); dayStart.setDate(dayStart.getDate() - DAYS);
    const past = incidents.filter(i => !isActive(i) && new Date(i.created) >= dayStart);
    let lastDay = '';
    app.innerHTML = `
      <div class="st-banner ${all}"><span class="ic">${banner[0]}</span><div>${banner[1]}<small>${banner[2]}</small></div></div>
      <div class="st-meta"><span>${lastAt ? '마지막 점검 ' + fmtTime(lastAt) : ''}</span><button class="st-btn" id="reBtn" type="button"${busy ? ' disabled' : ''}>${busy ? '확인 중…' : '↻ 다시 확인'}</button></div>
      ${act.length ? `<section class="st-card"><h2>🔔 진행 중인 문제 · 안내</h2>${act.map(incHTML).join('')}</section>` : ''}
      <section class="st-card"><h2>서비스별 상태</h2>
        ${COMPS.map(c => {
          const e = eff[c.id], bars = dayBars(incidents, c.id), l = e.live;
          const extra = l.state === 'down' && l.err && e.notes.length === 0 ? `<p class="st-note">자동 점검에서 문제가 감지됐어요. (${esc(l.err)}) 잠시 후 다시 확인해 주세요.</p>` : '';
          return `<div class="st-row"><div class="st-line"><span class="st-name">${esc(c.name)}</span>${l.state !== 'na' ? `<span class="st-lat">${l.ms}ms</span>` : ''}
            <span class="st-state ${e.state === 'info' ? 'ok' : e.state}"><i class="st-dot ${e.state === 'info' ? 'ok' : e.state}"></i>${e.state === 'info' ? '정상 (안내 있음)' : STATE_TEXT[e.state]}</span></div>${extra}
            <div class="st-bars" role="img" aria-label="${esc(c.name)} 최근 ${DAYS}일">${bars.map(b => `<i class="st-bar ${b.st === 'ok' ? '' : b.st}" title="${b.day}${b.hit.length ? ' · ' + esc(b.hit.join(', ')) : ' · 문제 없음'}"></i>`).join('')}</div>
            <div class="st-bar-legend"><span>${DAYS}일 전</span><span>오늘</span></div></div>`;
        }).join('')}
      </section>
      <section class="st-card"><h2>📜 지난 공지 (최근 ${DAYS}일)</h2>
        ${past.length ? past.map(i => { const k = dayKey(new Date(i.created)); const head = k !== lastDay ? `<div class="st-day">${k.replace(/-/g, '.')}</div>` : ''; lastDay = k; return head + incHTML(i); }).join('') : '<div class="st-empty">최근 90일 동안 올라온 공지가 없어요.</div>'}
      </section>`;
    document.getElementById('reBtn').onclick = refresh;
  }

  async function refresh() {
    if (busy) return; busy = true; if (live) render();
    try { [live, incidents] = await Promise.all([runChecks(), A.listIncidents().catch(() => incidents)]); lastAt = new Date(); }
    catch (e) { app.innerHTML = `<div class="st-load">⚠ 상태를 불러오지 못했어요. 새로고침해 주세요.</div>`; }
    busy = false; if (live) render();
  }
  (async function init() {
    try { await A.init(); } catch (e) {}
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, EVERY_MS);
  })();
})();
