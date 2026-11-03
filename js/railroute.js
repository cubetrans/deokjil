/* 철도 선로 위에서 두 역 사이의 경로를 찾아요. (선로 데이터: js/rails.js, OpenStreetMap 기여자)
   RailRoute.route([위도,경도], [위도,경도], 비용규칙) → { pts: [[위도,경도],...], km } 또는 null */
(function () {
  let G = null;
  const MLAT = 110574, MLNG = 111320;
  function build() {
    if (G) return G;
    const D = window.RAIL_DATA; if (!D) throw new Error('선로 데이터가 없어요');
    const key = new Map(), vx = [], vy = [], adj = [], wname = [], wflag = [];
    const vid = (x, y) => { const k = x * 1e8 + y; let i = key.get(k); if (i === undefined) { i = vx.length; key.set(k, i); vx.push(x); vy.push(y); adj.push([]); } return i; };
    D.w.forEach((row, wi) => {
      wname.push(row[0]); wflag.push(row[1]);
      let x = row[2], y = row[3], a = vid(x, y);
      for (let i = 4; i < row.length; i += 2) {
        x += row[i]; y += row[i + 1]; const b = vid(x, y);
        if (a !== b) {
          const dx = row[i] * 1e-5 * MLNG * Math.cos(y * 1e-5 * Math.PI / 180), dy = row[i + 1] * 1e-5 * MLAT, len = Math.sqrt(dx * dx + dy * dy);
          adj[a].push(b, len, wi); adj[b].push(a, len, wi);
        }
        a = b;
      }
    });
    const grid = new Map();
    for (let i = 0; i < vx.length; i++) { const k = Math.floor(vx[i] * 1e-3) * 100000 + Math.floor(vy[i] * 1e-3); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
    G = { names: D.n, vx, vy, adj, wname, wflag, grid };
    return G;
  }
  /* 비용규칙: { names:[이 노선으로 치는 선로 이름] }  또는  { hs: true(고속선 선호) | false(일반선 선호) | null } */
  function costs(g, spec) {
    const set = spec.names ? new Set(spec.names) : null;
    return Float32Array.from(g.wname, (ni, wi) => {
      const fl = g.wflag[wi], hs = fl & 1, bad = fl & 2, urban = fl & 4; let w;
      if (set) { w = set.has(g.names[ni]) ? 1 : (urban ? 2.5 : 4); if (hs) w *= 5; }
      else { w = 1; if (spec.hs === true && !hs) w = 2; if (spec.hs === false && hs) w = 4; if (urban) w *= 6; }
      return bad ? w * 3 : w;
    });
  }
  function cands(g, wc, p, maxM) {
    const x = p[1] * 1e5, y = p[0] * 1e5, cx = Math.floor(x * 1e-3), cy = Math.floor(y * 1e-3), out = [], cosl = Math.cos(p[0] * Math.PI / 180);
    for (let ax = -2; ax <= 2; ax++) for (let ay = -2; ay <= 2; ay++) {
      const L = g.grid.get((cx + ax) * 100000 + cy + ay); if (!L) continue;
      for (const v of L) {
        const dx = (g.vx[v] - x) * 1e-5 * MLNG * cosl, dy = (g.vy[v] - y) * 1e-5 * MLAT, d = Math.sqrt(dx * dx + dy * dy);
        if (d > maxM) continue; const a = g.adj[v]; let vw = Infinity;
        for (let i = 2; i < a.length; i += 3) vw = Math.min(vw, wc[a[i]]);
        if (vw !== Infinity) out.push([v, d * vw, vw, d]);
      }
    }
    out.sort((a, b) => a[1] - b[1]);
    /* 가까운 4곳 + 이 노선 선로 위에서 가장 가까운 곳 하나(끊어진 선로에 잘못 붙는 걸 막아요) */
    const top = out.slice(0, 4), pref = out.filter(o => o[2] === 1).sort((a, b) => a[3] - b[3])[0];
    if (pref && !top.includes(pref)) top.push(pref);
    return top.map(o => [o[0], o[1]]);
  }
  function route(p, q, spec) {
    const g = build(), wc = costs(g, spec || {});
    const S = cands(g, wc, p, 2500), T = cands(g, wc, q, 2500); if (!S.length || !T.length) return null;
    const n = g.vx.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), tgt = new Map(T);
    const heap = []; // [d, v] 이진 힙
    const push = (d, v) => { let i = heap.length; heap.push([d, v]); while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
    S.forEach(([v, c]) => { if (c < dist[v]) { dist[v] = c; push(c, v); } });
    let best = Infinity, bv = -1;
    while (heap.length) {
      const [d, v] = pop(); if (d > dist[v]) continue; if (d >= best) break;
      if (tgt.has(v) && d + tgt.get(v) < best) { best = d + tgt.get(v); bv = v; }
      const a = g.adj[v];
      for (let i = 0; i < a.length; i += 3) { const u = a[i], nd = d + a[i + 1] * wc[a[i + 2]]; if (nd < dist[u]) { dist[u] = nd; prev[u] = v; push(nd, u); } }
    }
    if (bv < 0) return null;
    const pts = []; let km = 0, v = bv, last = -1;
    while (v >= 0) { pts.push([g.vy[v] * 1e-5, g.vx[v] * 1e-5]); if (last >= 0) { const dx = (g.vx[v] - g.vx[last]) * 1e-5 * MLNG * Math.cos(g.vy[v] * 1e-5 * Math.PI / 180), dy = (g.vy[v] - g.vy[last]) * 1e-5 * MLAT; km += Math.sqrt(dx * dx + dy * dy) / 1000; } last = v; v = prev[v]; }
    pts.reverse(); return { pts, km };
  }
  window.RailRoute = { route };
})();
