/* ==========================================================
   common.js — 공개 사이트/관리자 공용 도구
   (이스케이프, 본문 렌더러, 대화상자, 로그인 창, 테마, 등급 배지, 토스트, 글쓰기 편집기)
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtShort = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };

  /* ---------- 본문 렌더러 (마크다운 지원) ----------
     제목  # 큰제목 / ## 중간 / ### 작은 제목     구분선  ---
     글자  **굵게** *기울임* ~~취소선~~ `코드`      링크  [글자](https://주소)  또는 주소만 붙여넣기
     인용  > 글                                    목록  - 항목 / 1. 항목 / - [ ] 할 일 / - [x] 완료
     코드블록  ``` 로 감싸기                        표    | 머리1 | 머리2 | 줄 아래에 |---|---|
     사진  주소(.jpg .png …) 한 줄 / [img 50%]주소 / ![설명](주소)    유튜브 주소 한 줄 → 영상
     모든 HTML 은 이스케이프되어 스크립트를 넣을 수 없어요. */
  const reImgExt = /^((?:https?:\/\/|images\/)\S+\.(?:png|jpe?g|gif|webp|bmp)(?:\?\S*)?)$/i;
  const reImgTag = /^\[img(?:\s+(\d{1,3})%?)?\]\s*((?:https?:\/\/|images\/)\S+)$/i;
  const reImgMd = /^!\[[^\]]*\]\(\s*((?:https?:\/\/|images\/)[^\s)]+)\s*\)$/i;
  const reYt = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:\S*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})\S*$/i;
  /* 일반 회원 글의 사진은 덕질역 저장소(images/ 폴더, Supabase 사진 보관함)만 보여 주고,
     그 밖의 외부 사진 주소는 링크로만 보여 줘요. (운영진 글은 external: true 로 모두 보여 줘요) */
  const storagePrefix = () => (C.supabaseUrl ? C.supabaseUrl.replace(/\/+$/, '') + '/storage/v1/object/public/' : '\u0000');
  const imgAllowed = (url, external) => external || /^images\//i.test(url) || url.indexOf(storagePrefix()) === 0;
  const A_ATTR = 'target="_blank" rel="noopener noreferrer nofollow ugc"';
  /* 한 줄 안의 서식 */
  function inline(raw) {
    const stash = [];
    const keep = h => { stash.push(h); return '\u0001' + (stash.length - 1) + '\u0001'; };
    let t = esc(raw);
    t = t.replace(/`([^`]+)`/g, (_, c) => keep('<code>' + c + '</code>'));
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, txt, url) => keep(`<a href="${url}" ${A_ATTR}>${txt}</a>`));
    t = t.replace(/(https?:\/\/[^\s<\u0001]+)/g, (u) => {
      const tail = (u.match(/[.,;:!?)\]]+$/) || [''])[0];
      const url = u.slice(0, u.length - tail.length);
      return keep(`<a href="${url}" ${A_ATTR}>${url}</a>`) + tail;
    });
    t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<b>$1</b>')
         .replace(/(^|[^*\w])\*(?!\s)([^*]+?)(?<!\s)\*(?![*\w])/g, '$1<i>$2</i>')
         .replace(/~~(.+?)~~/g, '<s>$1</s>');
    return t.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[+i]);
  }
  function renderBody(src, opts) {
    const external = !!(opts && opts.external);
    const toc = opts && opts.toc || null, cnt = [0, 0, 0];
    const out = [];
    const img = (url, w) => imgAllowed(url, external)
      ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer"${w < 100 ? ` style="width:${w}%"` : ''}>`
      : `<div class="ln">🖼 <a href="${esc(url)}" ${A_ATTR}>외부 사진 보기</a> <small>(외부 사진은 링크로만 보여요)</small></div>`;
    const lines = String(src || '').replace(/\r/g, '').split('\n');
    const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim());
    const isSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.indexOf('-') >= 0 && (l.indexOf('|') >= 0);
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i], line = raw.trim();
      let m;
      if ((m = line.match(/^```/))) {                         // 코드 블록
        const buf = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) out.push('<hr>');
      else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        const lv = m[1].length, tag = lv === 1 ? 'h3' : lv === 2 ? 'h4' : 'h5';
        if (toc) {                                            // 문서형: 번호 + 목차
          const L = Math.min(lv, 3) - 1; cnt[L]++; for (let k = L + 1; k < 3; k++) cnt[k] = 0;
          const num = cnt.slice(0, L + 1).map(n => n || 1).join('.') + '.';
          const id = 'bh' + (toc.length + 1);
          toc.push({ id, lv: L + 1, num, text: m[2].replace(/[*_`~]/g, '') });
          out.push(`<${tag} id="${id}">${num} ${inline(m[2])}</${tag}>`);
        } else out.push(`<${tag}>${inline(m[2])}</${tag}>`);
      } else if ((m = line.match(reImgTag))) out.push(img(m[2], m[1] ? Math.max(10, Math.min(100, +m[1])) : 100));
      else if ((m = line.match(reImgMd))) out.push(img(m[1], 100));
      else if ((m = line.match(reImgExt))) out.push(img(m[1], 100));
      else if ((m = line.match(reYt)))
        out.push(`<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" allowfullscreen loading="lazy" title="유튜브 영상"></iframe></div>`);
      else if (/^>/.test(line)) {                             // 인용
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
        i--; out.push('<blockquote>' + buf.map(x => x ? inline(x) : '<br>').join('<br>') + '</blockquote>');
      } else if (/^([-*+]|\d+[.)])\s+/.test(line)) {          // 목록
        const ordered = /^\d/.test(line), buf = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && /^\d/.test(lines[i].trim()) === ordered) {
          let t = lines[i].trim().replace(/^([-*+]|\d+[.)])\s+/, ''), box = '';
          if ((m = t.match(/^\[( |x|X)\]\s+(.*)$/))) { box = m[1] === ' ' ? '☐ ' : '☑ '; t = m[2]; }
          buf.push('<li>' + box + inline(t) + '</li>'); i++;
        }
        i--; out.push((ordered ? '<ol>' : '<ul>') + buf.join('') + (ordered ? '</ol>' : '</ul>'));
      } else if (line.indexOf('|') >= 0 && i + 1 < lines.length && isSep(lines[i + 1])) {   // 표
        const head = cells(line); const rows = []; i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) { rows.push(cells(lines[i])); i++; }
        i--;
        out.push('<div class="tbl-wrap"><table class="md"><thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>' +
          rows.map(r => '<tr>' + head.map((_, k) => '<td>' + inline(r[k] || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
      } else if (!line) out.push('<div class="ln">&nbsp;</div>');
      else out.push('<div class="ln">' + inline(raw) + '</div>');
    }
    return out.join('');
  }

  /* ---------- 대화 상자 ---------- */
  function openWin({ title, html, width = 340, onClose }) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="window raised dlg" role="dialog" aria-modal="true" style="width:${width}px">
      <div class="titlebar"><span class="ttxt">${esc(title)}</span><div class="tbtns"><button class="tbtn" type="button" data-x aria-label="닫기">✕</button></div></div>
      <div class="dlg-content">${html}</div></div>`;
    document.body.appendChild(ov);
    const el = ov.querySelector('.dlg'), tb = ov.querySelector('.titlebar');
    let closed = false;
    const kd = e => { if (e.key === 'Escape') close(); };
    function close(v) {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', kd); ov.remove(); if (onClose) onClose(v);
    }
    document.addEventListener('keydown', kd);
    ov.querySelector('[data-x]').onclick = () => close();
    let sx, sy, ox, oy, drag = false;
    tb.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      drag = true; const r = el.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY;
      el.style.position = 'fixed'; el.style.left = ox + 'px'; el.style.top = oy + 'px'; el.style.margin = '0';
      try { tb.setPointerCapture(e.pointerId); } catch (x) {}
    });
    tb.addEventListener('pointermove', e => {
      if (!drag) return;
      el.style.left = Math.max(0, Math.min(innerWidth - 60, ox + e.clientX - sx)) + 'px';
      el.style.top = Math.max(0, Math.min(innerHeight - 40, oy + e.clientY - sy)) + 'px';
    });
    tb.addEventListener('pointerup', () => { drag = false; });
    return { el, close };
  }

  function msgBox({ title, text, icon, buttons }) {
    return new Promise(res => {
      let result = false;
      const w = openWin({
        title, width: 340, onClose: () => res(result),
        html: `<div class="dlg-body"><div class="big">${icon}</div><div class="grow">${text}</div></div><div class="dlg-btns">${
          buttons.map((b, i) => `<button class="btn${b.primary ? ' primary' : ''}" type="button" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`
      });
      w.el.querySelectorAll('[data-i]').forEach(btn => btn.onclick = () => { result = buttons[+btn.dataset.i].value; w.close(); });
      const first = w.el.querySelector('.primary') || w.el.querySelector('[data-i]'); if (first) first.focus();
    });
  }
  const alertBox = (text, title = '알림', icon = 'ℹ️') =>
    msgBox({ title, icon, text: esc(text).replace(/\n/g, '<br>'), buttons: [{ label: '확인', value: true, primary: true }] });
  const confirmBox = (text, title = '확인', yes = '예', no = '아니오') =>
    msgBox({ title, icon: '❓', text: esc(text).replace(/\n/g, '<br>'), buttons: [{ label: yes, value: true, primary: true }, { label: no, value: false }] });

  /* 한 줄 입력 창 */
  function askText(title, label, placeholder = '') {
    return new Promise(res => {
      let val = null;
      const w = openWin({
        title, width: 380, onClose: () => res(val),
        html: `<form class="dlg-body" style="display:block"><div class="field"><label>${esc(label)}</label><input class="input" name="v" placeholder="${esc(placeholder)}" autocomplete="off"></div>
        <div class="dlg-btns"><button class="btn primary" type="submit">확인</button><button class="btn" type="button" data-c>취소</button></div></form>`
      });
      const f = w.el.querySelector('form'); f.v.focus();
      f.onsubmit = e => { e.preventDefault(); val = f.v.value.trim(); w.close(); };
      f.querySelector('[data-c]').onclick = () => w.close();
    });
  }

  /* ---------- 가입·동의 체크 (개인정보 보호법: 수집·이용 동의 + 만 14세 미만 보호자 동의) ---------- */
  const consentFields = () => `<div class="consent">
    <label class="check"><input type="checkbox" name="agree"> <b>[필수]</b> <a href="./#/privacy" target="_blank" rel="noopener">개인정보 수집·이용</a>에 동의해요</label>
    <div class="hint">수집 항목: 이메일·닉네임·비밀번호(암호화) / 목적: 가입 확인·로그인·커뮤니티 운영 / 보유: 탈퇴할 때까지(탈퇴하면 바로 삭제) / 동의하지 않으면 가입할 수 없어요.</div>
    <label class="check"><input type="checkbox" name="rules"> <b>[필수]</b> <a href="./#/policy" target="_blank" rel="noopener">운영정책</a>을 읽었어요</label>
    <label class="check"><input type="checkbox" name="u14"> 저는 <b>만 14세 미만</b>이에요</label>
    <label class="check" data-g hidden><input type="checkbox" name="guardian"> <b>[필수]</b> 보호자(법정대리인)의 동의를 받았어요</label></div>`;
  const bindConsent = f => { const g = f.querySelector('[data-g]'); f.u14.onchange = () => { g.hidden = !f.u14.checked; if (!f.u14.checked) f.guardian.checked = false; }; };
  const readConsent = f => ({ agree: f.agree.checked, rules: f.rules.checked, under14: f.u14.checked, guardian: f.guardian.checked });

  /* 예전에 가입한 회원에게 한 번 물어요 */
  function consentDialog() {
    return new Promise(res => {
      let done = false;
      const w = openWin({ title: '개인정보 수집·이용 동의 확인', width: 380, onClose: () => res(done),
        html: `<form class="dlg-body" style="display:block"><p style="margin:0 0 8px;line-height:1.6">덕질역이 <b>개인정보처리방침</b>과 <b>운영정책</b>을 새로 정비했어요. 계속 이용하려면 아래를 확인하고 동의해 주세요.</p>
          ${consentFields()}<div class="err-line" role="alert"></div>
          <div class="dlg-btns"><button class="btn primary" type="submit">동의하고 계속</button><button class="btn" type="button" data-later>나중에</button></div></form>` });
      const f = w.el.querySelector('form'); bindConsent(f);
      w.el.querySelector('[data-later]').onclick = () => w.close();
      f.onsubmit = async e => {
        e.preventDefault(); const er = f.querySelector('.err-line'); er.textContent = '';
        try { const c = readConsent(f); if (!c.agree) throw new Error('개인정보 수집·이용에 동의해 주세요.'); if (!c.rules) throw new Error('운영정책을 읽고 체크해 주세요.'); await API.recordConsent(c); done = true; w.close(true); }
        catch (x) { er.textContent = '⚠ ' + x.message; }
      };
    });
  }

  /* ---------- 로그인 / 가입 ---------- */
  function loginDialog({ signup = true, title = '덕질역 로그인', mode: startMode = 'login' } = {}) {
    return new Promise(res => {
      let result = null, view = 'login', pend = null;   // pend: 인증 대기 중인 { email, pw, remember, demoCode }
      const w = openWin({
        title, width: 370, onClose: () => res(result),
        html: `${signup ? `<div class="tabs" data-tabs><button class="tab on" type="button" data-m="login">로그인</button><button class="tab" type="button" data-m="signup">회원가입</button></div>` : ''}<div data-body></div>`
      });
      const body = w.el.querySelector('[data-body]'), tabs = w.el.querySelector('[data-tabs]');
      const wrap = inner => `<form class="dlg-body" style="display:block;border-top:2px solid #fff;margin:0 8px;padding-top:12px" autocomplete="on">${inner}<div class="err-line" role="alert"></div></form>`;
      const setTab = m => { if (tabs) { tabs.hidden = !(m === 'login' || m === 'signup'); tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.m === m)); } };
      const errOf = () => body.querySelector('.err-line');
      const fail = x => { const e = errOf(); if (e) e.textContent = '⚠ ' + x.message; };
      const busy = (btn, v) => { if (btn) btn.disabled = v; };

      function show(v) {
        view = v; setTab(v);
        if (v === 'login') {
          body.innerHTML = wrap(`
          <div class="field"><label for="lg-n">닉네임 또는 이메일</label><input id="lg-n" class="input" name="id" maxlength="120" autocomplete="username" required></div>
          <div class="field"><label for="lg-p">비밀번호</label><input id="lg-p" class="input" type="password" name="pw" autocomplete="current-password" required></div>
          <label class="check" style="display:flex;gap:6px;align-items:center;margin:2px 0 6px;font-size:13px"><input type="checkbox" name="remember" checked> 자동 로그인 <small style="opacity:.7">(이 기기에서 로그인 유지)</small></label>
          <div class="hint" style="font-size:11px;color:#555">이메일로 가입한 회원은 <b>이메일</b>로 로그인해요. (예전에 닉네임으로 가입한 회원은 닉네임으로도 돼요)</div>
          <div class="dlg-btns" style="padding:4px 0 4px"><button class="btn primary" type="submit" data-ok>로그인</button><button class="btn" type="button" data-c>취소</button></div>
          <div style="text-align:center;padding:0 0 10px"><a href="javascript:void 0" data-forgot style="font-size:12px">비밀번호를 잊었어요</a></div>`);
          const f = body.querySelector('form'), ok = body.querySelector('[data-ok]');
          body.querySelector('[data-c]').onclick = () => w.close();
          body.querySelector('[data-forgot]').onclick = () => show('forgot');
          f.id.focus();
          f.onsubmit = async e => {
            e.preventDefault(); errOf().textContent = ''; busy(ok, true);
            try { result = await API.login(f.id.value, f.pw.value, f.remember.checked); w.close(); }
            catch (x) {
              busy(ok, false);
              if (x.code === 'unverified') { pend = { email: x.email, pw: f.pw.value, remember: f.remember.checked, demoCode: x.demoCode || '' }; show('verify'); }
              else fail(x);
            }
          };
        } else if (v === 'signup') {
          body.innerHTML = wrap(`
          <div class="field"><label for="su-e">이메일</label><input id="su-e" class="input" type="email" name="email" maxlength="120" autocomplete="email" required placeholder="you@example.com"></div>
          <div class="field"><label for="su-n">닉네임</label><input id="su-n" class="input" name="nick" maxlength="10" autocomplete="nickname" required></div>
          <div class="field"><label for="su-p">비밀번호</label><input id="su-p" class="input" type="password" name="pw" autocomplete="new-password" required></div>
          <div class="field"><label for="su-p2">비밀번호 확인</label><input id="su-p2" class="input" type="password" name="pw2" autocomplete="new-password" required></div>
          <label class="check" style="display:flex;gap:6px;align-items:center;margin:2px 0 6px;font-size:13px"><input type="checkbox" name="remember" checked> 자동 로그인 <small style="opacity:.7">(이 기기에서 로그인 유지)</small></label>
          ${consentFields()}
          <div class="hint" style="font-size:11px;color:#555">가입하면 <b>인증번호</b>가 메일로 가요. 번호를 입력해야 가입이 끝나요.<br>닉네임 2~10자(한글·영문·숫자·_), 비밀번호 6자 이상. 이메일은 다른 회원에게 보이지 않고, 비밀번호를 잊었을 때 써요.</div>
          <div class="dlg-btns" style="padding:12px 0 10px"><button class="btn primary" type="submit" data-ok>인증번호 받고 가입하기</button><button class="btn" type="button" data-c>취소</button></div>`);
          const f = body.querySelector('form'), ok = body.querySelector('[data-ok]');
          body.querySelector('[data-c]').onclick = () => w.close();
          f.email.focus(); bindConsent(f);
          f.onsubmit = async e => {
            e.preventDefault(); errOf().textContent = ''; busy(ok, true);
            try {
              if (f.pw.value !== f.pw2.value) throw new Error('비밀번호 확인이 달라요.');
              const r = await API.signup(f.nick.value, f.pw.value, f.remember.checked, f.email.value, readConsent(f));
              if (r && r.verify) { pend = { email: r.email, pw: f.pw.value, remember: f.remember.checked, demoCode: r.demoCode || '', fresh: true }; show('verify'); }
              else { result = r; w.close(); }
            } catch (x) { fail(x); busy(ok, false); }
          };
        } else if (v === 'verify') {
          const demo = API.mode === 'local';
          body.innerHTML = wrap(`
          <p style="margin:0 0 8px;line-height:1.5">📧 <b>${esc(pend.email)}</b> 로 <b>인증번호</b>를 ${pend.fresh ? '보냈어요' : '보낼게요'}.</p>
          ${demo ? `<div class="msg info" style="margin:0 0 8px">데모 모드라 진짜 메일은 안 가요. 인증번호: <b data-demo style="font-size:16px;letter-spacing:2px">${esc(pend.demoCode)}</b></div>`
            : `<p style="margin:0 0 8px;font-size:13px;line-height:1.5">메일에 적힌 인증번호를 아래에 입력해 주세요. 메일이 안 보이면 스팸함도 확인해 보세요.</p>`}
          <div class="field"><label for="vf-c">인증번호</label><input id="vf-c" class="input" name="code" inputmode="numeric" maxlength="10" autocomplete="one-time-code" required placeholder="메일에 적힌 숫자" style="letter-spacing:2px"></div>
          <div class="dlg-btns" style="padding:4px 0 4px"><button class="btn primary" type="submit" data-ok>인증하기</button><button class="btn" type="button" data-resend>📧 번호 다시 받기</button></div>
          <div style="text-align:center;padding:0 0 10px"><a href="javascript:void 0" data-later style="font-size:12px">나중에 할게요</a></div>`);
          const f = body.querySelector('form'), ok = body.querySelector('[data-ok]'), rs = body.querySelector('[data-resend]');
          f.code.focus();
          body.querySelector('[data-later]').onclick = () => w.close();
          rs.onclick = async () => {
            errOf().textContent = ''; busy(rs, true);
            try { const r = await API.resendVerify(pend.email); if (demo && r && r.demoCode) { pend.demoCode = r.demoCode; body.querySelector('[data-demo]').textContent = r.demoCode; } errOf().textContent = '✔ 인증번호를 다시 보냈어요.'; }
            catch (x) { fail(x); }
            setTimeout(() => busy(rs, false), 4000);
          };
          f.onsubmit = async e => {
            e.preventDefault(); errOf().textContent = ''; busy(ok, true);
            try { result = await API.verifyEmail(pend.email, f.code.value, pend.remember); w.close(); }
            catch (x) { busy(ok, false); fail(x); }
          };
        } else if (v === 'forgot') {
          body.innerHTML = wrap(`
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5">가입한 <b>이메일</b>을 입력하면 비밀번호를 다시 정할 수 있는 <b>인증번호</b>를 보내 드려요.</p>
          <div class="field"><label for="fg-e">이메일</label><input id="fg-e" class="input" type="email" name="email" maxlength="120" autocomplete="email" required></div>
          <div class="dlg-btns" style="padding:4px 0 10px"><button class="btn primary" type="submit" data-ok>인증번호 보내기</button><button class="btn" type="button" data-back>◀ 돌아가기</button></div>`);
          const f = body.querySelector('form'), ok = body.querySelector('[data-ok]');
          body.querySelector('[data-back]').onclick = () => show('login');
          f.email.focus();
          f.onsubmit = async e => {
            e.preventDefault(); errOf().textContent = ''; busy(ok, true);
            try { await API.forgotPassword(f.email.value); pend = { email: f.email.value.trim().toLowerCase(), remember: true }; show('reset'); }
            catch (x) { fail(x); busy(ok, false); }
          };
        } else if (v === 'reset') {
          body.innerHTML = wrap(`
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5"><b>${esc(pend.email)}</b> 로 인증번호를 보냈어요. (가입한 이메일이 맞다면 곧 도착해요)</p>
          <div class="field"><label for="rs-c">인증번호</label><input id="rs-c" class="input" name="code" inputmode="numeric" maxlength="10" autocomplete="one-time-code" required style="letter-spacing:2px"></div>
          <div class="field"><label for="rs-p">새 비밀번호 (6자 이상)</label><input id="rs-p" class="input" type="password" name="p1" autocomplete="new-password" required></div>
          <div class="field"><label for="rs-p2">새 비밀번호 확인</label><input id="rs-p2" class="input" type="password" name="p2" autocomplete="new-password" required></div>
          <div class="dlg-btns" style="padding:4px 0 10px"><button class="btn primary" type="submit" data-ok>비밀번호 바꾸고 로그인</button><button class="btn" type="button" data-back>◀ 처음으로</button></div>`);
          const f = body.querySelector('form'), ok = body.querySelector('[data-ok]');
          body.querySelector('[data-back]').onclick = () => show('login');
          f.code.focus();
          f.onsubmit = async e => {
            e.preventDefault(); errOf().textContent = ''; busy(ok, true);
            try {
              if (f.p1.value !== f.p2.value) throw new Error('비밀번호 확인이 달라요.');
              result = await API.resetPassword(pend.email, f.code.value, f.p1.value); w.close();
            } catch (x) { fail(x); busy(ok, false); }
          };
        }
      }
      if (tabs) tabs.querySelectorAll('.tab').forEach(t => t.onclick = () => show(t.dataset.m));
      show(signup && startMode === 'signup' ? 'signup' : 'login');
    });
  }

  /* ---------- 사진 줄이기 ----------
     긴 쪽을 1600px 이하로 줄이고 JPEG(품질 85%)로 바꿔서 저장 공간을 아껴요.
     움직이는 GIF는 그대로 올려요. */
  async function prepareImage(file, maxDim = 1600, quality = 0.85) {
    if (!/^image\//.test(file.type || '')) throw new Error('사진 파일만 올릴 수 있어요.');
    if (file.type === 'image/gif') return file;
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (e) {
      bmp = await new Promise((res, rej) => {
        const img = new Image(), u = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(u); res(img); };
        img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('사진을 읽을 수 없어요. (아이폰 HEIC 사진은 JPG로 바꿔 주세요)')); };
        img.src = u;
      });
    }
    const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
    const k = Math.min(1, maxDim / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    if (!blob) throw new Error('사진을 변환하지 못했어요.');
    return blob;
  }


  /* ---------- 테마 ----------
     station = 기본(밝은 역사 안내판), mono·ios-dark(야간 승강장)는 무료, 그 밖은 상점에서 사는 테마 */
  const THEME_IDS = ['station', 'mono', 'ios-dark', 'midnight', 'line1', 'line2', 'line3', 'line4', 'line5', 'line6', 'line7', 'line8', 'line9', 'ktx', 'airport', 'sand', 'night-bus'];
  const DARK_THEMES = ['ios-dark', 'midnight', 'night-bus'];
  function applyTheme(id) {
    if (id === 'ios' || id === 'win98') id = 'station';
    if (THEME_IDS.indexOf(id) < 0) id = 'station';
    document.documentElement.dataset.theme = id;
    try { localStorage.setItem('deokjil_theme', id); } catch (e) {}
    syncThemeCookie(id);
    return id;
  }
  /* rail.deokjil.xyz 와 테마를 맞추려고 .deokjil.xyz 쿠키에도 적어둬요 (다른 주소에서는 건너뜀) */
  function syncThemeCookie(id) {
    try {
      const h = location.hostname;
      if (h === 'deokjil.xyz' || h.endsWith('.deokjil.xyz'))
        document.cookie = 'dj_theme=' + encodeURIComponent(id) + '; domain=.deokjil.xyz; path=/; max-age=31536000; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    } catch (e) {}
  }
  syncThemeCookie(document.documentElement.dataset.theme || 'station');
  const currentTheme = () => document.documentElement.dataset.theme || 'station';

  /* ---------- 토스트(잠깐 떴다 사라지는 알림) ---------- */
  function toast(text, kind) {
    let c = document.getElementById('toasts');
    if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.setAttribute('role', 'status'); c.setAttribute('aria-live', 'polite'); document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = text;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, kind === 'up' ? 5200 : 3200);
  }
  function rewardToast(r) {
    if (!r) return;
    if (r.points > 0) toast(`✨ +${r.points}P 적립!`, 'pts');
    if (r.gradeUp) { const g = window.API.gradeByLevel(r.gradeUp.to); toast(`🎉 ${g.icon} ${g.name} 등급이 되었어요!`, 'up'); }
  }

  /* ---------- 글 라이선스 표시 (글 맨 위) ---------- */
  function licenseBar(id) {
    const l = window.API.licenseOf(id);
    const link = l.url ? ` <a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">라이선스 자세히 ↗</a>` : '';
    return `<div class="lic ${l.id === 'arr' ? 'arr' : 'cc'}" role="note"><span class="lic-ic">${esc(l.icon)}</span><div><b>${esc(l.name)}</b> <span class="lic-s">${esc(l.short)}</span>${link}<div class="lic-d">${esc(l.desc)}</div></div></div>`;
  }

  /* ---------- 사진 확대 보기 (본문 사진을 누르면 크게) ---------- */
  /* 모바일: 사진 자세히 보기(라이트박스)에서만 확대 허용, 나머지 화면은 확대 잠금 */
  const vpMeta = document.querySelector('meta[name=viewport]');
  const VP_LOCK = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  const VP_FREE = 'width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover';
  function setZoomable(on) { if (vpMeta) vpMeta.setAttribute('content', on ? VP_FREE : VP_LOCK); }
  setZoomable(false);
  ['gesturestart', 'gesturechange'].forEach(ev => document.addEventListener(ev, e => { if (!document.body.classList.contains('lb-open')) e.preventDefault(); }, { passive: false }));
  function openLightbox(src) {
    if (document.getElementById('lightbox')) return;
    const ov = document.createElement('div');
    ov.id = 'lightbox'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', '사진 확대 보기');
    ov.innerHTML = `<div class="lb-bar"><span class="lb-hint">사진을 누르면 확대/축소 · 바깥을 누르거나 Esc 로 닫기</span><a class="lb-btn" href="${esc(src)}" target="_blank" rel="noopener noreferrer">원본 ↗</a><button class="lb-btn" type="button" data-x aria-label="닫기">✕</button></div><div class="lb-stage"><img alt="" src="${esc(src)}"></div>`;
    const img = ov.querySelector('img'), stage = ov.querySelector('.lb-stage');
    const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); document.body.classList.remove('lb-open'); setZoomable(false); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    img.onclick = e => { e.stopPropagation(); ov.classList.toggle('zoom'); };
    stage.onclick = e => { if (e.target === stage) close(); };
    ov.querySelector('[data-x]').onclick = close;
    ov.onclick = e => { if (e.target === ov) close(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('lb-open'); setZoomable(true); document.body.appendChild(ov);
  }
  document.addEventListener('click', e => {
    const im = e.target && e.target.closest && e.target.closest('.post-body img, .bio-body img, .pcard .avatar img');
    if (im && im.src) { e.preventDefault(); openLightbox(im.src); }
  });


  /* ---------- 프로필 사진: 가운데를 정사각형으로 잘라 작은 JPEG 로 ---------- */
  async function makeAvatar(file, size = 256) {
    if (!file || !/^image\//.test(file.type)) throw new Error('사진 파일을 골라 주세요.');
    if (file.size > 15 * 1024 * 1024) throw new Error('사진이 너무 커요. (15MB 이하)');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('사진을 열 수 없어요.')); i.src = url; });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      if (!side) throw new Error('사진을 열 수 없어요.');
      for (const q of [0.88, 0.78, 0.68, 0.55, 0.4]) {
        const c = document.createElement('canvas'); c.width = c.height = size;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
        g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        const out = c.toDataURL('image/jpeg', q);
        if (out.length <= 55000) return out;
      }
      throw new Error('사진을 충분히 줄이지 못했어요. 다른 사진으로 해 보세요.');
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------- 운영진 채팅 (오른쪽 아래, 부관리자 이상만 보여요) ---------- */
  const StaffChat = (function () {
    let root = null, me = null, timer = null, roleTimer = null, lastId = 0, open = false, unread = 0, busy = false, started = false, all = [], reads = [], myRead = 0, readsOk = true;
    const A = () => window.API;
    const isStaffNow = () => !!me && A().isStaff(me.role);
    const hhmm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
    function build() {
      if (root) return;
      root = document.createElement('div'); root.id = 'schat'; root.hidden = true;
      root.innerHTML = `<button class="sc-fab" type="button" aria-label="운영진 채팅 열기">💬<span class="sc-badge" hidden></span></button>
        <section class="sc-box raised" hidden aria-label="운영진 채팅">
          <header><b>💬 운영진 채팅</b><small>부관리자 이상 · 자동 참여</small><button type="button" class="sc-x" aria-label="닫기">✕</button></header>
          <div class="sc-list" role="log" aria-live="polite"></div>
          <form class="sc-form"><input class="input" name="t" maxlength="500" placeholder="메시지를 입력하세요" autocomplete="off"><button class="btn primary sm" type="submit">보내기</button></form>
        </section>`;
      document.body.appendChild(root);
      const fab = root.querySelector('.sc-fab'), box = root.querySelector('.sc-box'), list = root.querySelector('.sc-list');
      fab.onclick = () => toggle(true);
      root.querySelector('.sc-x').onclick = () => toggle(false);
      root.querySelector('form').onsubmit = async e => {
        e.preventDefault(); const inp = e.target.t, v = inp.value.trim(); if (!v) return;
        inp.disabled = true;
        try { await A().chatSend(v); inp.value = ''; await poll(true); } catch (x) { addSys('⚠ ' + x.message); }
        inp.disabled = false; inp.focus();
      };
      list.addEventListener('click', async e => {
        const b = e.target.closest('[data-del]'); if (!b) return;
        try { await A().chatDelete(+b.dataset.del || b.dataset.del); const row = b.closest('.sc-m'); if (row) row.remove(); } catch (x) { addSys('⚠ ' + x.message); }
      });
    }
    function el(sel) { return root.querySelector(sel); }
    function addSys(t) { const l = el('.sc-list'); const d = document.createElement('div'); d.className = 'sc-sys'; d.textContent = t; l.appendChild(d); l.scrollTop = l.scrollHeight; }
    function append(msgs) {
      const l = el('.sc-list'); const stick = l.scrollTop + l.clientHeight >= l.scrollHeight - 40;
      msgs.forEach(m => {
        if (l.querySelector(`[data-id="${m.id}"]`)) return;
        const mine = me && m.userId === me.id;
        const d = document.createElement('div'); d.className = 'sc-m' + (mine ? ' me' : ''); d.dataset.id = m.id;
        d.innerHTML = `<div class="sc-who">${mine ? '' : `<b>${esc(m.nick)}</b> `}<small>${hhmm(m.created)}</small>${mine || (me && A().isManager(me.role)) ? ` <button type="button" class="sc-del" data-del="${esc(String(m.id))}" title="삭제">🗑</button>` : ''}</div><div class="sc-row"><div class="sc-t">${esc(m.body)}</div><em class="sc-un" hidden></em></div>`;
        l.appendChild(d); all.push({ id: m.id, userId: m.userId }); lastId = Math.max(lastId, typeof m.id === 'number' ? m.id : 0);
      });
      if (stick || open) l.scrollTop = l.scrollHeight;
    }
    function paintReads() {
      el('.sc-list').querySelectorAll('.sc-m').forEach(row => {
        const id = +row.dataset.id, m = all.find(x => x.id === id), b = row.querySelector('.sc-un'); if (!m || !b) return;
        const n = readsOk ? reads.filter(r => r.userId !== m.userId && r.lastId < id).length : 0;
        b.hidden = !n; b.textContent = n || ''; b.title = n + '명이 아직 안 읽었어요';
      });
      unread = all.filter(m => !(me && m.userId === me.id) && m.id > myRead).length;
    }
    async function poll(force) {
      if (busy || !isStaffNow()) return; busy = true;
      try {
        const msgs = await A().chatList(lastId || undefined);
        if (msgs.length) append(msgs);
        try {
          if (open && lastId > myRead) { await A().chatMarkRead(lastId); myRead = lastId; }
          reads = await A().chatReads(); readsOk = true;
          const mine = reads.find(r => me && r.userId === me.id); if (mine && mine.lastId > myRead) myRead = mine.lastId;
        } catch (e) { readsOk = false; }
        if (readsOk) paintReads(); else unread = 0;
        if (open) unread = 0;
        showBadge();
      } catch (e) { /* 일시 오류는 다음 주기에 다시 */ }
      busy = false;
      schedule();
    }
    function schedule() { clearTimeout(timer); if (isStaffNow()) timer = setTimeout(poll, open ? 3000 : 12000); }
    function showBadge() { const b = el('.sc-badge'); b.hidden = !unread; b.textContent = unread > 9 ? '9+' : unread; }
    function toggle(v) {
      open = v; el('.sc-box').hidden = !v; el('.sc-fab').hidden = v;
      if (v) { unread = 0; showBadge(); const l = el('.sc-list'); l.scrollTop = l.scrollHeight; setTimeout(() => { const i = root.querySelector('input[name=t]'); i && i.focus(); }, 30); poll(true); }
      else schedule();
    }
    function teardown() {
      clearTimeout(timer); clearInterval(roleTimer); roleTimer = null; lastId = 0; unread = 0; open = false; all = []; reads = []; myRead = 0;
      if (root) { root.hidden = true; el('.sc-list').innerHTML = ''; el('.sc-box').hidden = true; el('.sc-fab').hidden = false; showBadge(); }
    }
    async function checkRole() {
      if (!me) return;
      try {
        const before = A().isStaff(me.role);
        const m = await A().syncRole();
        if (m) me = m;
        if (before && !(m && A().isStaff(m.role))) { teardown(); window.dispatchEvent(new Event('deokjil-role')); }
      } catch (e) {}
    }
    /* 로그인·로그아웃·역할이 바뀔 때 부르면 알아서 켜고 꺼요 */
    function update(user) {
      const prev = me; me = user ? Object.assign({}, user) : null;
      if (!isStaffNow()) { started = false; teardown(); return; }
      build(); root.hidden = false;
      if (started && prev && prev.id === me.id) return;
      started = true; lastId = 0; all = []; reads = []; myRead = 0; el('.sc-list').innerHTML = ''; poll(true);
      if (!roleTimer) roleTimer = setInterval(checkRole, 30000);
    }
    return { update };
  })();

  /* ---------- 등급 배지 · 칭호 ---------- */
  function gradeBadge(role, grade, label) {
    const A = window.API;
    if (role === 'admin' || role === 'manager' || role === 'subadmin') {
      const s = C.staffGrades[role];
      return `<span class="gb staff ${role}" style="--gc:${s.color}" title="${esc(s.name)}">${s.icon}${label ? ' ' + esc(s.name) : ''}</span>`;
    }
    const g = A.gradeByLevel(grade || 1);
    return `<span class="gb g${g.level}" style="--gc:${g.color}" title="${esc(g.name)}">${g.icon}${label ? ' ' + esc(g.name) : ''}</span>`;
  }
  function titleChip(id) {
    if (!id) return '';
    const it = window.API.catalog(id);
    return it ? `<span class="tchip">${esc(it.name)}</span>` : '';
  }

  /* ---------- 글쓰기 편집기 (공개 사이트와 관리자 센터에서 같이 써요) ----------
     opts: { box, id, preset, onDone(saved, isEdit), onCancel(), setStatus(a,b) } */
  async function mountEditor(opts) {
    const A = window.API, box = opts.box, me = A.me();
    const $ = (sel, r = box) => r.querySelector(sel);
    const setStatus = opts.setStatus || (() => {});
    const id = opts.id || null;
    if (!me) { box.innerHTML = '<div class="msg info">🔒 글쓰기는 로그인한 분만 할 수 있어요.</div>'; return; }
    const staff = A.isStaff(me.role), adm = A.isManager(me.role);
    let ktx = staff;
    if (!staff) { try { ktx = !!(await A.getProfile(me.nick)).ktxEligible; } catch (e) {} }
    const allowed = b => (!b.staffOnly || staff) && (!b.ktxOnly || ktx);
    const defBoard = (C.boards.find(b => allowed(b) && !b.staffOnly && !b.ktxOnly) || C.boards[0]).id;
    let p = { board: (C.boards.find(b => b.id === opts.preset && allowed(b)) || {}).id || defBoard, title: '', body: '', tags: [], pinned: false };
    if (id) {
      p = await A.getPost(id, false);
      if (!p) { box.innerHTML = '<div class="msg err">글을 찾을 수 없어요.</div>'; return; }
      if (!adm && p.authorId !== me.id) { box.innerHTML = '<div class="msg err">내가 쓴 글만 고칠 수 있어요.</div>'; return; }
    }
    const draftKey = 'deokjil_draft_' + (id || 'new');
    if (!id) { try { const d = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (d && (d.title || d.body)) p = Object.assign(p, d); } catch (e) {} }
    const boards = C.boards.filter(b => allowed(b) || b.id === p.board);
    if (!boards.some(b => b.id === p.board)) p.board = defBoard;
    box.innerHTML = `
      <h2 class="page-title">${id ? '✏️ 글 수정' : '✏️ 새 글 쓰기'}</h2>
      <form id="ef">
        <div class="row" style="align-items:flex-end">
          <div class="field" style="flex:1;min-width:150px"><label for="eb">게시판</label><select class="input" id="eb" name="board">${boards.map(b => `<option value="${b.id}"${b.id === p.board ? ' selected' : ''}>${b.icon} ${esc(b.name)}</option>`).join('')}</select></div>
          <div class="field" style="min-width:210px"><label for="el">라이선스 <small>(글 맨 위에 표시)</small></label><select class="input" id="el" name="license">${(C.licenses || []).map(l => `<option value="${l.id}"${l.id === (p.license || C.defaultLicense) ? ' selected' : ''}>${esc(l.name)} — ${esc(l.short)}</option>`).join('')}</select></div>
          ${staff ? `<div class="field"><label class="check"><input type="checkbox" name="pinned"${p.pinned ? ' checked' : ''}> 📌 상단 고정</label></div>` : ''}
        </div>
        <div class="field"><label for="et">제목</label><input class="input" id="et" name="title" maxlength="100" value="${esc(p.title)}" required></div>
        <div class="field"><label for="eg">태그 <small>(쉼표로 구분, 최대 8개)</small></label><input class="input" id="eg" name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="예: 탑사기, 인천, 노선버스"></div>
        <div class="field ed-area"><label for="ec">내용</label>
          <div class="ed-tools">
            <button class="btn sm" type="button" data-t="bold"><b>B</b> 굵게</button><button class="btn sm" type="button" data-t="h1">큰 제목</button><button class="btn sm" type="button" data-t="h2">작은 제목</button>
            <button class="btn sm" type="button" data-t="italic"><i>I</i> 기울임</button><button class="btn sm" type="button" data-t="quote">❝ 인용</button><button class="btn sm" type="button" data-t="list">• 목록</button><button class="btn sm" type="button" data-t="code">&lt;/&gt; 코드</button><button class="btn sm" type="button" data-t="link">🔗 링크</button>
            <button class="btn sm" type="button" data-t="hr">구분선</button><button class="btn sm" type="button" data-t="upload">📤 사진 올리기</button><button class="btn sm" type="button" data-t="img">🖼 사진 주소</button><button class="btn sm" type="button" data-t="yt">▶ 유튜브</button>
            <button class="btn sm" type="button" id="pvBtn">👁 미리보기</button>
            <label for="szSel" style="margin-left:6px">사진 크기</label> <select class="input" id="szSel" style="width:auto;padding:1px 2px"><option value="30">30%</option><option value="50">50%</option><option value="70" selected>70%</option><option value="100">100%</option></select>
            <input type="file" id="fileIn" accept="image/*" multiple hidden> <small id="upMsg" style="color:var(--c-acc)"></small></div>
          <textarea class="input" id="ec" name="body" required>${esc(p.body)}</textarea>
          <div class="preview-box sunken post-body" id="pv" hidden></div>
          <div class="hint"><b>📤 사진 올리기</b> 버튼, 내용칸에 <b>사진 붙여넣기(Ctrl+V)</b>, 또는 <b>끌어다 놓기</b>로 올릴 수 있어요 (한 장 5MB 이하·자동으로 줄여 줘요). 올린 사진 줄에 커서를 두고 <b>사진 크기</b>를 고르면 그 사진 크기가 바뀌어요. 유튜브 주소는 <b>한 줄에 붙여 넣기</b>만 해도 돼요. <b>마크다운</b>도 써요 (<code>**굵게** *기울임* ~~취소선~~ &#96;코드&#96; &gt; 인용 - 목록 [글자](주소)</code>, 표는 <code>| 머리 | 머리 |</code> 아래에 <code>|---|---|</code>).${staff ? '' : '<br>일반 회원 글의 외부 사진 주소는 링크로만 보여요. (사진은 올리기 버튼으로 올려 주세요)'}</div></div>
        <div class="err-line" role="alert"></div>
        <div class="row"><button class="btn primary" type="submit">💾 ${id ? '수정 저장' : '발행'}</button><button class="btn" type="button" id="edCancel">취소</button>
          ${id ? '' : '<small style="color:var(--c-txt2)">제목·내용은 이 브라우저에 자동 임시저장돼요.</small>'}</div>
      </form>`;
    const f = $('#ef'), ta = f.body;
    const ins = (before, after = '', ph = '') => {
      const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
      ta.setRangeText(before + sel + after, s, e, 'end'); ta.focus(); ta.dispatchEvent(new Event('input'));
    };
    const lineIns = t => { const s = ta.selectionStart; const pre = ta.value.slice(0, s); const nl = pre === '' || pre.endsWith('\n') ? '' : '\n'; ta.setRangeText(nl + t, s, ta.selectionEnd, 'end'); ta.focus(); ta.dispatchEvent(new Event('input')); };
    const upMsg = $('#upMsg'), fileIn = $('#fileIn'), szSel = $('#szSel');
    /* 커서가 사진 줄 위에 있으면 크기 선택 시 그 줄의 크기를 바꿈 */
    szSel.onchange = () => {
      const v = ta.value, s0 = ta.selectionStart;
      const a = v.lastIndexOf('\n', s0 - 1) + 1; let b = v.indexOf('\n', s0); if (b < 0) b = v.length;
      const m = v.slice(a, b).trim().match(/^(?:\[img(?:\s+\d{1,3}%?)?\]\s*)?((?:https?:\/\/|images\/)\S+)$/i);
      if (!m) { upMsg.textContent = `새로 올릴 사진은 ${szSel.value}%로 들어가요`; return; }
      ta.setRangeText('[img ' + szSel.value + '%]' + m[1], a, b, 'end'); ta.dispatchEvent(new Event('input'));
      upMsg.textContent = `이 사진을 ${szSel.value}%로 바꿨어요`;
    };
    let uploading = false;
    const uploadFiles = async files => {
      files = [...files].filter(x => /^image\//.test(x.type));
      if (!files.length || uploading) return;
      if (A.mode !== 'supabase') { await alertBox('사진 올리기는 Supabase를 연결한 뒤에 쓸 수 있어요.\n지금은 사진 주소를 붙여 넣어 주세요.', '데모 모드', 'ℹ️'); return; }
      uploading = true; let ok = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          upMsg.textContent = `업로드 중… (${i + 1}/${files.length})`;
          try {
            const blob = await prepareImage(files[i]);
            const url = await A.uploadImage(blob);
            lineIns('\n[img ' + szSel.value + '%]' + url + '\n'); ok++;
          } catch (e) { await alertBox(`${files[i].name || '사진'}: ${e.message || '업로드에 실패했어요.'}`, '사진 올리기 실패', '⚠️'); }
        }
      } finally { uploading = false; upMsg.textContent = ok ? `✅ ${ok}장 올렸어요` : ''; if (ok) setTimeout(() => { upMsg.textContent = ''; }, 4000); }
    };
    fileIn.onchange = () => { uploadFiles(fileIn.files); fileIn.value = ''; };
    ta.addEventListener('paste', e => { const fs = [...(e.clipboardData && e.clipboardData.files || [])].filter(x => /^image\//.test(x.type)); if (fs.length) { e.preventDefault(); uploadFiles(fs); } });
    ta.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    ta.addEventListener('drop', e => { const fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) { e.preventDefault(); uploadFiles(fs); } });
    box.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => {
      const t = b.dataset.t;
      if (t === 'upload') { fileIn.click(); return; }
      if (t === 'bold') ins('**', '**', '굵게');
      else if (t === 'italic') ins('*', '*', '기울임');
      else if (t === 'quote') lineIns('> ');
      else if (t === 'list') lineIns('- ');
      else if (t === 'code') { const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (sel.indexOf('\n') >= 0) ins('\n```\n', '\n```\n'); else ins('`', '`', '코드'); }
      else if (t === 'link') { const u = await askText('링크 넣기', '주소 (https://…)'); if (u) ins('[', '](' + u + ')', '링크 글자'); }
      else if (t === 'h1') lineIns('# ');
      else if (t === 'h2') lineIns('## ');
      else if (t === 'hr') lineIns('\n---\n');
      else if (t === 'img') { const u = await askText('사진 넣기', '사진 주소 (https://… 또는 images/파일명.jpg)'); if (u) lineIns('\n[img]' + u + '\n'); }
      else if (t === 'yt') { const u = await askText('유튜브 넣기', '유튜브 영상 주소'); if (u) lineIns('\n' + u + '\n'); }
    });
    const pv = $('#pv'), pvBtn = $('#pvBtn');
    pvBtn.onclick = () => {
      const on = pv.hidden; pv.hidden = !on; ta.hidden = on;
      pvBtn.textContent = on ? '✏ 편집으로' : '👁 미리보기'; if (on) pv.innerHTML = renderBody(ta.value, { external: staff }) || '<div class="empty">내용이 비어 있어요</div>';
    };
    if (!id) f.addEventListener('input', () => { try { localStorage.setItem(draftKey, JSON.stringify({ board: f.board.value, title: f.title.value, body: f.body.value, license: f.license.value })); } catch (e) {} });
    $('#edCancel').onclick = () => { if (opts.onCancel) opts.onCancel(); };
    f.onsubmit = async e => {
      e.preventDefault();
      const err = f.querySelector('.err-line'); err.textContent = '';
      const tags = [...new Set(f.tags.value.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 8);
      const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      try {
        const saved = await A.savePost({ id: id || undefined, board: f.board.value, title: f.title.value, body: f.body.value, tags, license: f.license.value, pinned: f.pinned ? f.pinned.checked : !!p.pinned });
        try { localStorage.removeItem(draftKey); } catch (x) {}
        rewardToast(saved.reward);
        if (saved.status === 'pending') await alertBox('표현을 확인하기 위해 운영진 검토 후에 공개돼요.\n내 글 목록에서는 지금도 볼 수 있어요.', '검토 대기', '🕓');
        else if (!saved.reward || !saved.reward.points) toast(id ? '수정했어요.' : '발행했어요!');
        if (opts.onDone) opts.onDone(saved, !!id);
      } catch (x) { err.textContent = '⚠ ' + x.message; btn.disabled = false; }
    };
    setStatus(id ? '글 수정' : '새 글', '');
  }


  /* ---------- 서울교덕체 감지 · 글꼴/글자 크기 설정 · 맨 위로 ---------- */
  const fontReady = (function () {
    const root = document.documentElement;
    let pr;
    try {
      pr = (document.fonts && document.fonts.load ? document.fonts.load('16px SeoulGyodeok', '가') : Promise.resolve([]))
        .then(l => { const ok = !!(l && l.length); if (ok) root.dataset.fontok = '1'; return ok; }, () => false);
    } catch (e) { pr = Promise.resolve(false); }
    return pr;
  })();
  try { document.documentElement.dataset.fw = localStorage.getItem('deokjil_fw') || 'xb'; } catch (e) { document.documentElement.dataset.fw = 'xb'; }
  const getPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  function mountPrefs(host) {
    if (!host || host.querySelector('.prefs')) return;
    const root = document.documentElement;
    const box = document.createElement('div'); box.className = 'prefs';
    box.innerHTML = `<label>글꼴 <select id="prefFont" aria-label="글꼴 설정"><option value="title">서울교덕체 (제목만)</option><option value="all">서울교덕체 (전체)</option><option value="off">기본 글꼴</option></select></label>
      <label>굵기 <select id="prefFw" aria-label="글자 굵기"><option value="n">보통</option><option value="b">굵게</option><option value="xb">아주 굵게</option></select></label>
      <label>글자 크기 <select id="prefFs" aria-label="글자 크기"><option value="s">작게</option><option value="m">보통</option><option value="l">크게</option><option value="xl">아주 크게</option></select></label>
      <a href="#/font">🔤 서울교덕체 받기</a>`;
    host.appendChild(box);
    const sf = box.querySelector('#prefFont'), ss = box.querySelector('#prefFs');
    const sw = box.querySelector('#prefFw'); sw.value = getPref('deokjil_fw', 'xb'); root.dataset.fw = sw.value;
    sw.onchange = () => { root.dataset.fw = sw.value; setPref('deokjil_fw', sw.value); };
    sf.value = getPref('deokjil_font', 'off'); ss.value = getPref('deokjil_fs', 'm');
    sf.onchange = () => { root.dataset.font = sf.value; setPref('deokjil_font', sf.value); };
    ss.onchange = () => { root.dataset.fs = ss.value; setPref('deokjil_fs', ss.value); };
  }
  function mountToTop() {
    if (document.getElementById('totop')) return;
    const b = document.createElement('button'); b.id = 'totop'; b.type = 'button'; b.title = '맨 위로'; b.setAttribute('aria-label', '맨 위로'); b.textContent = '↑'; b.hidden = true;
    b.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(b);
    const upd = () => { b.hidden = (window.scrollY || document.documentElement.scrollTop) < 400; };
    window.addEventListener('scroll', upd, { passive: true }); upd();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountToTop); else mountToTop();

  window.Common = { fontReady, mountPrefs, makeAvatar, StaffChat, esc, fmtDate, fmtShort, renderBody, openWin, alertBox, confirmBox, askText, loginDialog, consentDialog, prepareImage,
    applyTheme, currentTheme, toast, rewardToast, gradeBadge, titleChip, mountEditor, licenseBar, openLightbox, THEME_IDS, DARK_THEMES };
})();
