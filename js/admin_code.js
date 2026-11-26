/* 운영진 센터 — 🎨 디자인(CSS 바로 수정) · 🧩 코드(GitHub 파일 수정) */
(function () {
  'use strict';
  const A = window.API, { esc, alertBox, confirmBox, openWin } = window.Common;
  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- 🎨 디자인: 추가 CSS (DB에 저장, 배포 필요 없음) ---------- */
  async function viewDesign(main) {
    const s = await A.getSettings();
    const css = s.customCss || '';
    main.innerHTML = `<h2 class="page-title">🎨 디자인 (추가 CSS)</h2>
      <div class="msg info">여기에 쓴 CSS는 사이트 모든 페이지에 <b>기본 디자인 위에 덮어서</b> 적용돼요. 저장하면 <b>배포 없이 바로</b> 반영돼요. 지우면 원래대로 돌아와요.</div>
      <form id="cf" class="form">
        <div class="field"><label for="cssIn">추가 CSS</label>
          <textarea class="input code" id="cssIn" rows="18" spellcheck="false" maxlength="30000" placeholder="/* 예시 */\n:root { --brand: #e11d48; }\n.site-title { letter-spacing: 2px; }">${esc(css)}</textarea>
          <small id="cssCount"></small></div>
        <div class="row"><button class="btn" type="button" id="cssPrev">👀 이 화면에서 미리보기</button>
          <button class="btn primary" type="submit">💾 저장해서 사이트에 적용</button>
          <button class="btn" type="button" id="cssClear">🧹 모두 지우기</button></div>
        <div class="err-line" role="alert"></div>
      </form>
      <details class="panel raised" style="margin-top:12px"><summary><b>자주 쓰는 색 변수</b></summary>
        <p><code>--brand</code> 포인트 색 · <code>--gnb</code> 위쪽 메뉴 줄 색 · <code>--ink</code> 글자색 · <code>--line</code> 테두리색 · <code>--r</code> 모서리 둥글기<br>
        예) <code>:root { --gnb: #7c3aed; --r: 10px; }</code></p></details>`;
    const ta = $('#cssIn'), cnt = $('#cssCount');
    const upd = () => { cnt.textContent = `${ta.value.length.toLocaleString()} / 30,000자`; };
    ta.oninput = upd; upd();
    const st = () => { let e = $('#previewCss'); if (!e) { e = document.createElement('style'); e.id = 'previewCss'; document.head.appendChild(e); } return e; };
    $('#cssPrev').onclick = () => { st().textContent = ta.value.replace(/<\/style/gi, ''); alertBox('이 화면에만 임시로 적용했어요. 마음에 들면 [저장]을 눌러 주세요.', '미리보기', '👀'); };
    $('#cssClear').onclick = async () => { if (await confirmBox('추가 CSS를 모두 지울까요?', '지우기', '지우기')) { ta.value = ''; upd(); st().textContent = ''; } };
    $('#cf').onsubmit = async e => {
      e.preventDefault();
      try {
        const cur = await A.getSettings();
        await A.saveSettings({ ...cur, customCss: ta.value.replace(/<\/style/gi, '').slice(0, 30000) });
        st().textContent = '';
        alertBox('저장했어요! 사이트를 새로고침하면 바로 적용돼요.', '저장 완료', '✅');
      } catch (x) { $('#cf .err-line').textContent = x.message; }
    };
  }

  /* ---------- 🧩 코드: GitHub 저장소의 파일을 직접 수정 ---------- */
  const KEY = 'deokjil_gh_v1';
  const TEXT_EXT = /\.(html?|css|js|json|svg|txt|xml|md)$/i;
  const DANGER = /^(js\/(admin|api|common|config)\.js|admin\.html)$/;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const keep = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const b64d = b => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\s/g, '')), c => c.charCodeAt(0)));
  const b64e = t => { const u = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

  /* 서버 방식: 토큰은 Supabase 서버에 있고, 로그인한 운영진만 쓸 수 있어요 */
  function ghServer(url, anon, token) {
    const call = async body => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
      let j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok || j.error) throw new Error(j.error || (r.status === 404 ? '코드 편집 서버 함수(code)가 아직 없어요. Supabase에 배포해 주세요.' : '서버 오류 (' + r.status + ')'));
      return j;
    };
    return {
      info: null,
      tree: async function () { const j = await call({ action: 'tree' }); this.info = { repo: j.repo, branch: j.branch }; this.all = j.all || j.files; return j.files; },
      all: [],
      rawCommit: async (files, message) => call({ action: 'commit', files, message }),
      get: (path, ref) => call({ action: 'get', path, ref }),
      put: async (path, text, sha, msg) => { const j = await call({ action: 'put', path, text, sha: sha || '', message: msg }); return { content: { sha: j.sha } }; },
      log: async path => (await call({ action: 'log', path })).log
    };
  }
  async function pickBackend() {
    const C = window.SITE_CONFIG || {};
    const token = A.accessToken ? await A.accessToken() : null;
    if (token && C.supabaseUrl) return { g: ghServer(C.supabaseUrl.replace(/\/$/, '') + '/functions/v1/code', C.supabaseAnonKey, token), server: true };
    return null;
  }
  async function reauth() {
    return new Promise(res => {
      let ok = false;
      const w = openWin({ title: '🔒 비밀번호 확인', width: 320, onClose: () => res(ok),
        html: `<form class="dlg-body" style="display:block" autocomplete="off"><p>사이트 코드를 바꾸는 중요한 작업이에요.<br>비밀번호를 한 번 더 입력해 주세요.</p>
          <div class="field"><input class="input" name="pw" type="password" autocomplete="current-password" required></div>
          <div class="err-line" role="alert" style="min-height:1.4em;color:#c0392b"></div>
          <div class="dlg-btns"><button class="btn primary" type="submit">확인</button><button class="btn" type="button" data-c>취소</button></div></form>` });
      const f = w.el.querySelector('form'); f.pw.focus();
      f.querySelector('[data-c]').onclick = () => w.close();
      f.onsubmit = async e => { e.preventDefault(); try { await A.login(A.me().nick, f.pw.value); ok = true; w.close(); } catch (x) { f.querySelector('.err-line').textContent = '비밀번호가 맞지 않아요.'; } };
    });
  }

  function gh(cfg) {
    const base = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
    const call = async (path, opt = {}) => {
      const r = await fetch(base + path, { ...opt, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
      if (!r.ok) {
        const m = r.status === 401 ? '토큰이 맞지 않거나 만료됐어요.' : r.status === 403 ? '권한이 부족해요. 토큰의 Contents 권한을 Read and write로 해 주세요.' : r.status === 404 ? '저장소나 파일을 찾을 수 없어요. 이름과 토큰의 저장소 선택을 확인해 주세요.' : r.status === 409 || r.status === 422 ? '그 사이에 파일이 바뀌었어요. 파일을 다시 열어 주세요.' : 'GitHub 오류 (' + r.status + ')';
        throw new Error(m);
      }
      return r.json();
    };
    return {
      tree: async () => (await call('/git/trees/' + encodeURIComponent(cfg.branch) + '?recursive=1')).tree.filter(x => x.type === 'blob' && TEXT_EXT.test(x.path)).map(x => x.path).sort(),
      get: async (path, ref) => { const j = await call('/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(ref || cfg.branch)); if (j.content == null || j.encoding !== 'base64') throw new Error('이 파일은 너무 커서 여기서 열 수 없어요.'); return { text: b64d(j.content), sha: j.sha }; },
      put: (path, text, sha, msg) => call('/contents/' + path.split('/').map(encodeURIComponent).join('/'), { method: 'PUT', body: JSON.stringify({ message: msg, content: b64e(text), sha, branch: cfg.branch }) }),
      log: async path => (await call('/commits?sha=' + encodeURIComponent(cfg.branch) + '&path=' + encodeURIComponent(path) + '&per_page=10'))
    };
  }

  async function viewCode(main) {
    const be = await pickBackend();
    const cfg = be ? { owner: '', repo: '', branch: '' } : load();
    if (!be && (!cfg.token || !cfg.owner || !cfg.repo)) return connectForm(main, cfg);
    const g = be ? be.g : gh(cfg);
    if (!be) g.commit = async (files, msg) => { for (const f of files) { f.sha = (await g.put(f.path, f.text, drafts[f.path] && drafts[f.path].sha, msg)).content.sha; } };
    else g.commit = async (files, msg) => { const r = await g.rawCommit(files, msg); return r; };
    main.innerHTML = '<div class="loading">⏳ GitHub에서 파일 목록을 불러오는 중…</div>';
    let files;
    try { files = await g.tree(); } catch (e) { main.innerHTML = `<div class="msg err">${esc(e.message)}</div>${be ? '<p><small>Supabase Edge Function <code>code</code>와 비밀 값(GITHUB_TOKEN, GITHUB_REPO)을 확인해 주세요.</small></p>' : '<p><button class="btn" id="reconf" type="button">🔧 연결 설정 다시 하기</button></p>'}`; if ($('#reconf')) $('#reconf').onclick = () => connectForm(main, cfg); return; }
    const TXT = /\.(html?|css|js|json|svg|txt|xml|md)$/i, BIN = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|mp4|webm|pdf)$/i;
    const drafts = {};            // path → { text, orig, sha, isNew } 또는 { b64, size, bin: true }
    let cur = null;
    main.innerHTML = `<h2 class="page-title">🧩 코드 편집 <small style="font-weight:400">${be ? esc((g.info || {}).repo || '') + ' · ' + esc((g.info || {}).branch || '') : esc(cfg.owner) + '/' + esc(cfg.repo) + ' · ' + esc(cfg.branch)}</small></h2>
      <div class="msg info">여러 파일을 고친 다음 <b>한 번에 저장</b>할 수 있어요. 저장하면 GitHub에 반영되고, 호스팅이 <b>1~2분 안에</b> 사이트를 새로 올려요. 잘못 고쳤으면 [기록]에서 예전 버전을 불러와 다시 저장하면 돼요.</div>
      <div class="code-wrap">
        <div class="code-files" role="listbox" aria-label="파일 목록"></div>
        <div class="code-ed">
          <div class="code-bar"><b id="cPath">파일을 골라 주세요</b><span id="cMsg"></span></div>
          <textarea class="input code" id="cText" spellcheck="false" rows="22" disabled></textarea>
          <div class="row"><button class="btn" type="button" id="cHist" disabled>🕘 기록(예전 버전)</button>
            ${be ? '<button class="btn" type="button" id="cNew">➕ 새 파일</button><button class="btn" type="button" id="cUp">⬆ 파일 올리기</button><input type="file" id="cFile" multiple hidden>' : ''}
            ${be ? '' : '<button class="btn" type="button" id="cOut">🔌 연결 해제</button>'}</div>
          <div class="code-save"><div id="cChanges" class="code-changes"></div>
            <button class="btn primary" type="button" id="cSaveAll" disabled>💾 변경 0개 저장</button></div>
          <div id="cHistBox"></div>
        </div></div>`;
    const msg = (t, bad) => { const m = $('#cMsg'); m.textContent = t; m.style.color = bad ? '#c0392b' : ''; };
    const list = new Set(files);
    const isChanged = p => { const d = drafts[p]; return !!d && (d.bin || d.isNew || d.text !== d.orig); };
    const changed = () => Object.keys(drafts).filter(isChanged).sort();
    const stash = () => { if (cur && drafts[cur] && !drafts[cur].bin && !$('#cText').disabled) drafts[cur].text = $('#cText').value; };
    const drawList = () => {
      $('.code-files').innerHTML = [...list].sort().map(f => `<button type="button" class="code-f${f === cur ? ' on' : ''}" data-p="${esc(f)}">${isChanged(f) ? '● ' : ''}${esc(f)}</button>`).join('');
      $('.code-files').querySelectorAll('.code-f').forEach(b => b.onclick = () => openFile(b.dataset.p));
      const ch = changed();
      $('#cSaveAll').textContent = `💾 변경 ${ch.length}개 한 번에 저장`; $('#cSaveAll').disabled = !ch.length;
      $('#cChanges').innerHTML = ch.length ? ch.map(p => `<span class="code-chg">${esc(p)}${drafts[p].bin ? ' (올림)' : drafts[p].isNew ? ' (새 파일)' : ''} <a role="button" tabindex="0" data-x="${esc(p)}" title="이 변경 취소">✕</a></span>`).join('') : '<small>바뀐 파일이 없어요.</small>';
      $('#cChanges').querySelectorAll('[data-x]').forEach(a => a.onclick = () => { const p = a.dataset.x; if (drafts[p].isNew || drafts[p].bin) { delete drafts[p]; if (!files.includes(p)) list.delete(p); if (cur === p) closeEditor(); } else { drafts[p].text = drafts[p].orig; if (cur === p) $('#cText').value = drafts[p].orig; } drawList(); });
    };
    const closeEditor = () => { cur = null; $('#cText').value = ''; $('#cText').disabled = true; $('#cHist').disabled = true; $('#cPath').textContent = '파일을 골라 주세요'; };
    const openFile = async path => {
      stash();
      try {
        if (!drafts[path]) { msg('불러오는 중…'); const r = await g.get(path); drafts[path] = { text: r.text, orig: r.text, sha: r.sha }; }
        cur = path; msg('');
        if (drafts[path].bin) { $('#cText').value = `(올린 파일이에요 — ${(drafts[path].size / 1024).toFixed(1)}KB, 저장하면 올라가요)`; $('#cText').disabled = true; $('#cHist').disabled = true; }
        else { $('#cText').value = drafts[path].text; $('#cText').disabled = false; $('#cHist').disabled = !!drafts[path].isNew; }
        $('#cPath').textContent = path + (drafts[path].isNew ? ' (새 파일)' : ''); $('#cHistBox').innerHTML = '';
        drawList();
      } catch (e) { msg(e.message, true); }
    };
    $('#cText').oninput = () => { if (cur && drafts[cur] && !drafts[cur].bin) { const was = isChanged(cur); drafts[cur].text = $('#cText').value; if (was !== isChanged(cur)) drawList(); else { const n = changed().length; $('#cSaveAll').textContent = `💾 변경 ${n}개 한 번에 저장`; $('#cSaveAll').disabled = !n; } } };
    $('#cSaveAll').onclick = async () => {
      stash();
      const ch = changed(); if (!ch.length) return;
      for (const p of ch) { if (/\.js$/i.test(p) && !drafts[p].bin) { try { new Function(drafts[p].text); } catch (e) { if (!(await confirmBox(`${p}에 문법 오류가 있어요:\n${e.message}\n\n그대로 저장하면 사이트가 깨질 수 있어요. 그래도 저장할까요?`, '문법 오류', '그래도 저장'))) return; } } }
      if (ch.some(p => DANGER.test(p)) && !(await confirmBox('핵심 파일이 들어 있어요:\n' + ch.filter(p => DANGER.test(p)).join('\n') + '\n\n잘못 고치면 운영진 센터가 안 열려서 고치기 어려울 수 있어요. (GitHub 웹사이트에서는 언제든 되돌릴 수 있어요.)\n\n계속할까요?', '핵심 파일', '계속'))) return;
      if (be && !(await reauth())) return;
      try {
        msg('저장 중…'); $('#cSaveAll').disabled = true;
        const payload = ch.map(p => drafts[p].bin ? { path: p, b64: drafts[p].b64 } : { path: p, text: drafts[p].text });
        const label = ch.length === 1 ? `운영진 센터에서 수정: ${ch[0]}` : `운영진 센터에서 ${ch.length}개 파일 수정 (${ch[0]} 외)`;
        await g.commit(payload, label);
        ch.forEach(p => { if (drafts[p].bin) { delete drafts[p]; } else { drafts[p].orig = drafts[p].text; drafts[p].isNew = false; } if (!(g.all || []).includes(p)) (g.all = g.all || []).push(p); });
        drawList(); msg(`✅ ${ch.length}개를 저장했어요. 1~2분 뒤 사이트에 반영돼요.`);
        if (cur && drafts[cur]) $('#cHist').disabled = false;
      } catch (e) { msg(e.message, true); drawList(); }
    };
    window.onbeforeunload = () => changed().length ? '저장하지 않은 변경이 있어요.' : undefined;
    const askPath = (title, label, val) => new Promise(res => {
      let out = null;
      const w = openWin({ title, width: 360, onClose: () => res(out), html: `<form class="dlg-body" style="display:block"><div class="field"><label>${label}</label><input class="input" name="v" value="${esc(val)}" maxlength="150"></div><div class="dlg-btns"><button class="btn primary" type="submit">확인</button><button class="btn" type="button" data-c>취소</button></div></form>` });
      const f = w.el.querySelector('form'); f.v.focus(); f.v.select();
      f.querySelector('[data-c]').onclick = () => w.close();
      f.onsubmit = e => { e.preventDefault(); out = f.v.value.trim(); w.close(); };
    });
    const okName = p => /^[\w\-./가-힣]+$/.test(p) && !p.includes('..') && !p.startsWith('/') && !p.startsWith('.') && !p.includes('/.') && !p.endsWith('/');
    if ($('#cNew')) $('#cNew').onclick = async () => {
      const path = await askPath('➕ 새 파일', '파일 경로 (예: css/my.css, about.html)', '');
      if (!path) return;
      if (!okName(path)) return msg('경로에 쓸 수 없는 글자가 있어요.', true);
      if (!TXT.test(path)) return msg('글자 파일(html, css, js, json, svg, txt, xml, md)만 새로 만들 수 있어요. 사진 등은 [파일 올리기]를 쓰세요.', true);
      if ((g.all || []).includes(path) || drafts[path]) return msg('이미 있는 파일이에요. 목록에서 열어 주세요.', true);
      stash(); drafts[path] = { text: '', orig: '', isNew: true }; list.add(path); await openFile(path); msg('내용을 쓰고 [변경 저장]을 누르면 만들어져요.');
    };
    if ($('#cUp')) { $('#cUp').onclick = () => $('#cFile').click(); $('#cFile').onchange = async () => {
      const picked = [...$('#cFile').files]; $('#cFile').value = '';
      if (!picked.length) return;
      const bad = picked.find(f => !(TXT.test(f.name) || BIN.test(f.name)));
      if (bad) return msg(`올릴 수 없는 형식이에요: ${bad.name} (사진·글꼴·글자 파일·pdf·mp3·mp4만 돼요)`, true);
      const big = picked.find(f => f.size > 5 * 1024 * 1024);
      if (big) return msg(`${big.name}은(는) 5MB가 넘어서 올릴 수 없어요.`, true);
      const dirIn = await askPath('⬆ 파일 올리기', '올릴 폴더 (예: images/ — 맨 위에 올리려면 비워 두기)', 'images/');
      if (dirIn === null) return;
      let dir = dirIn.replace(/^\/+/, ''); if (dir && !dir.endsWith('/')) dir += '/';
      const items = picked.map(f => ({ f, path: dir + f.name.replace(/\s+/g, '-') }));
      if (items.some(i => !okName(i.path))) return msg('폴더나 파일 이름에 쓸 수 없는 글자가 있어요. (영어, 숫자, 한글, - _ . 만)', true);
      const dup = items.filter(i => (g.all || []).includes(i.path) || drafts[i.path]);
      if (dup.length && !(await confirmBox('이미 있는 파일이 있어요:\n' + dup.map(i => i.path).join('\n') + '\n\n덮어쓸까요?', '덮어쓰기', '덮어쓰기'))) return;
      stash();
      for (const i of items) {
        const buf = new Uint8Array(await i.f.arrayBuffer()); let b = ''; for (let k = 0; k < buf.length; k += 0x8000) b += String.fromCharCode.apply(null, buf.subarray(k, k + 0x8000));
        drafts[i.path] = TXT.test(i.path) ? { text: new TextDecoder().decode(buf), orig: (drafts[i.path] && drafts[i.path].orig) || '', isNew: true } : { bin: true, b64: btoa(b), size: buf.length };
        list.add(i.path);
      }
      drawList(); msg(`${items.length}개를 담았어요. [변경 저장]을 누르면 올라가요. 사진 주소: ${items[0].path}`);
    }; }
    $('#cHist').onclick = async () => {
      try {
        const l = await g.log(cur);
        $('#cHistBox').innerHTML = l.length ? `<div class="sub-title"><span>🕘 ${esc(cur)} 기록</span></div><div class="code-hist">${l.map(c => `<button type="button" class="btn sm" data-sha="${esc(c.sha)}">${esc((c.commit.author.date || '').slice(0, 16).replace('T', ' '))} · ${esc((c.commit.message || '').split('\n')[0].slice(0, 50))}</button>`).join('')}</div><small>누르면 그 버전이 편집창에 들어와요. [변경 저장]을 눌러야 적용돼요.</small>` : '<small>기록이 없어요.</small>';
        $('#cHistBox').querySelectorAll('[data-sha]').forEach(b => b.onclick = async () => { try { const r = await g.get(cur, b.dataset.sha); $('#cText').value = r.text; drafts[cur].text = r.text; drawList(); msg('예전 버전을 불러왔어요. 저장해야 적용돼요.'); } catch (e) { msg(e.message, true); } });
      } catch (e) { msg(e.message, true); }
    };
    if ($('#cOut')) $('#cOut').onclick = async () => { if (await confirmBox('이 브라우저에 저장된 GitHub 연결(토큰)을 지울까요?', '연결 해제', '해제')) { keep({}); viewCode(main); } };
    drawList();
  }

  function connectForm(main, cfg) {
    main.innerHTML = `<h2 class="page-title">🧩 코드 편집 — GitHub 연결</h2>
      <div class="msg info">사이트 코드를 GitHub 저장소에 올려 두면, 여기서 파일을 열어 고치고 저장할 수 있어요. 저장하면 호스팅(GitHub Pages 등)이 알아서 새로 배포해요.</div>
      <ol class="hint"><li>GitHub → 오른쪽 위 프로필 → <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</b></li>
        <li><b>Repository access</b>: Only select repositories → 덕질역 저장소 하나만 고르기</li>
        <li><b>Permissions → Repository permissions → Contents: Read and write</b></li>
        <li>만들어진 토큰(<code>github_pat_…</code>)을 아래에 붙여넣기</li></ol>
      <form id="gf" class="form">
        <div class="field"><label>GitHub 사용자 이름</label><input class="input" name="owner" value="${esc(cfg.owner || '')}" required maxlength="60" autocomplete="off"></div>
        <div class="field"><label>저장소 이름</label><input class="input" name="repo" value="${esc(cfg.repo || '')}" required maxlength="100" autocomplete="off"></div>
        <div class="field"><label>브랜치</label><input class="input" name="branch" value="${esc(cfg.branch || 'main')}" required maxlength="60" autocomplete="off"></div>
        <div class="field"><label>토큰 (이 브라우저에만 저장돼요)</label><input class="input" name="token" type="password" value="${esc(cfg.token || '')}" required autocomplete="off"></div>
        <div class="err-line" role="alert"></div>
        <button class="btn primary" type="submit">🔌 연결하기</button>
      </form>
      <div class="msg info" style="margin-top:12px">⚠️ 토큰은 비밀번호와 같아요. <b>남의 컴퓨터에서는 쓰지 말고</b>, 다 쓴 뒤에는 [연결 해제]로 지워 주세요. 이 사이트의 DB에는 저장하지 않아요.</div>`;
    $('#gf').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const v = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim(), token: f.token.value.trim() };
      try { await gh(v).tree(); keep(v); viewCode(main); } catch (x) { $('#gf .err-line').textContent = x.message; }
    };
  }

  window.AdminCode = { viewDesign, viewCode };
})();