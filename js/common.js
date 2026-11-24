/* ==========================================================
   common.js — 공개 사이트/관리자 공용 도구
   (이스케이프, 본문 렌더러, 윈도우98 대화상자, 로그인 창, 바탕화면 색)
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtShort = iso => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };

  /* ---------- 본문 렌더러 ----------
     한 줄 규칙:  # 큰제목 / ## 작은제목 / --- 구분선 / **굵게**
     이미지 주소(.jpg .png .gif .webp 또는 images/폴더) 한 줄 → 사진
     [img]주소 → 확장자 없는 사진 주소   /   [img 50%]주소 → 본문 폭의 50%로 표시 (10~100)
     유튜브 주소 한 줄 → 영상  /  그 밖의 주소 → 자동 링크   */
  const reImgExt = /^((?:https?:\/\/|images\/)\S+\.(?:png|jpe?g|gif|webp|bmp)(?:\?\S*)?)$/i;
  const reImgTag = /^\[img(?:\s+(\d{1,3})%?)?\]\s*((?:https?:\/\/|images\/)\S+)$/i;
  const reYt = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:\S*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})\S*$/i;
  /* ==========================================================
     마크다운 렌더러 — 기본 문법 + GFM(표·체크리스트·취소선·자동링크)
     · 제목 #~###### / === 밑줄 제목, 굵게·기울임·취소선·==강조==, `코드`, ``` 코드 블록
     · 링크 [글](주소 "설명") / [글][참조] / <주소> / 주소만 붙여넣기, 사진 ![설명](주소)
     · 인용(중첩 가능) > , 목록(중첩 가능)·번호 목록·체크리스트, 표(정렬 :---:), 구분선, 각주 [^1]
     · 사이트 전용: [img 50%]주소, 사진·유튜브 주소 한 줄, 한 줄마다 줄바꿈
     · 모든 HTML 은 이스케이프되어 스크립트를 넣을 수 없어요. */
  const reImgMd = /^!\[[^\]]*\]\(\s*((?:https?:\/\/|images\/)[^\s)]+)\s*\)$/i;
  const A_ATTR = 'target="_blank" rel="noopener noreferrer nofollow"';
  const safeHref = u => {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:\/\/|mailto:|tel:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) return '';          // javascript: data: 같은 건 막아요
    return u;
  };
  function renderBody(src) {
    const lines0 = String(src || '').replace(/\r\n?/g, '\n').replace(/\u0001/g, '').replace(/\t/g, '    ').split('\n');
    const refs = {}, fnDef = {}, fnOrder = [], stash = [];
    const lines = [];
    let inFence = false;
    lines0.forEach(l => {                                   // 1차: 참조 링크·각주 정의 모으기 (코드 블록 안은 제외)
      if (/^ {0,3}(```|~~~)/.test(l)) inFence = !inFence;
      if (!inFence) {
        let m;
        if ((m = l.match(/^ {0,3}\[\^([^\]\s]+)\]:\s*(.+)$/))) { fnDef[m[1]] = m[2]; return; }
        if ((m = l.match(/^ {0,3}\[([^\]^][^\]]*)\]:\s*(https?:\/\/\S+|images\/\S+|\/\S+|#\S*|mailto:\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/))) {
          refs[m[1].toLowerCase()] = { url: m[2], title: m[3] || m[4] || m[5] || '' }; return;
        }
      }
      lines.push(l);
    });

    const keep = h => { stash.push(h); return '\u0001' + (stash.length - 1) + '\u0001'; };
    const restore = t => { let n = 0; while (/\u0001\d+\u0001/.test(t) && n++ < 8) t = t.replace(/\u0001(\d+)\u0001/g, (_, i) => stash[+i]); return t; };
    const titleAttr = t => t ? ` title="${t}"` : '';
    const linkTag = (href, inner, title) => {
      const h = safeHref(href);
      if (!h) return null;
      return `<a href="${h}"${/^(https?:|mailto:|tel:)/i.test(h) ? ' ' + A_ATTR : ''}${titleAttr(title)}>${inner}</a>`;
    };
    const imgTag = (url, alt, title) => `<img class="inl" src="${url}" alt="${alt}"${titleAttr(title)} loading="lazy" referrerpolicy="no-referrer">`;
    const okImg = u => /^(https?:\/\/|images\/)/i.test(u);
    const URLP = '((?:[^\\s()]|\\([^\\s()]*\\))+)';
    const reLink = new RegExp('\\[([^\\]]+)\\]\\(\\s*' + URLP + '(?:\\s+&quot;(.*?)&quot;)?\\s*\\)', 'g');
    const reImgI = new RegExp('!\\[([^\\]]*)\\]\\(\\s*' + URLP + '(?:\\s+&quot;(.*?)&quot;)?\\s*\\)', 'g');

    const inl = t => {                                      // t: 이미 esc() 한 문자열
      t = t.replace(/\\([\\`*_{}\[\]()#+\-.!|~=^])/g, (_, c) => keep(c));                       // \* 같은 이스케이프
      t = t.replace(/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, b, c) => keep('<code>' + c.trim() + '</code>'));
      t = t.replace(reImgI, (all, alt, u, ti) => okImg(u) ? keep(imgTag(u, alt, ti)) : all);
      t = t.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (all, alt, id) => { const r = refs[(id || alt).toLowerCase()]; return r && okImg(r.url) ? keep(imgTag(esc(r.url), alt, esc(r.title))) : all; });
      t = t.replace(reLink, (all, txt, u, ti) => { const a = linkTag(u, inl(txt), ti); return a ? keep(a) : all; });
      t = t.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (all, txt, id) => { const r = refs[(id || txt).toLowerCase()]; const a = r && linkTag(esc(r.url), inl(txt), esc(r.title)); return a ? keep(a) : all; });
      t = t.replace(/\[\^([^\]\s]+)\]/g, (all, id) => {
        if (!(id in fnDef)) return all;
        if (fnOrder.indexOf(id) < 0) fnOrder.push(id);
        return keep(`<sup class="fnref" title="${esc(fnDef[id])}">${fnOrder.indexOf(id) + 1}</sup>`);
      });
      t = t.replace(/\[([^\]^][^\]]*)\](?![(\[:])/g, (all, id) => { const r = refs[id.toLowerCase()]; const a = r && linkTag(esc(r.url), id, esc(r.title)); return a ? keep(a) : all; });
      t = t.replace(/&lt;((?:https?:\/\/|mailto:)[^\s]+?)&gt;/gi, (_, u) => keep(`<a href="${u}" ${A_ATTR}>${u}</a>`));
      t = t.replace(/(https?:\/\/[^\s<\u0001]+)/g, u => {
        const tail = (u.match(/(?:[.,;:!?)\]]|&gt;|&quot;)+$/) || [''])[0];
        const url = u.slice(0, u.length - tail.length);
        return keep(`<a href="${url}" ${A_ATTR}>${url}</a>`) + tail;
      });
      t = t.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
      t = t.replace(/\[교덕체\]([\s\S]*?)\[\/교덕체\]/g, '<span class="f-gyo">$1</span>');
      t = t.replace(/\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*/g, '<b><i>$1</i></b>')
           .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<b>$1</b>')
           .replace(/(^|[^\w])__(?=\S)(.+?)(?<=\S)__(?!\w)/g, '$1<b>$2</b>')
           .replace(/(^|[^*\w])\*(?=\S)([^*]+?)(?<=\S)\*(?![*\w])/g, '$1<i>$2</i>')
           .replace(/(^|[^_\w])_(?=\S)([^_]+?)(?<=\S)_(?![_\w])/g, '$1<i>$2</i>')
           .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<s>$1</s>')
           .replace(/==(?=\S)(.+?)(?<=\S)==/g, '<mark>$1</mark>');
      return t;
    };
    const inline = raw => restore(inl(esc(raw)));

    const indentOf = l => l.match(/^ */)[0].length;
    const itemRe = /^( *)([-*+]|\d{1,9}[.)])\s+(.*)$/;
    const hrRe = /^ {0,3}([-*_])(?: *\1){2,} *$/;
    const splitRow = l => l.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(x => x.trim().replace(/\\\|/g, '|'));
    const isSep = l => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(l) && l.indexOf('-') >= 0 && l.indexOf('|') >= 0;
    const dedent = arr => {
      const a = arr.slice(); while (a.length && !a[0].trim()) a.shift(); while (a.length && !a[a.length - 1].trim()) a.pop();
      const min = Math.min(...a.filter(x => x.trim()).map(indentOf), 99);
      return a.map(x => x.slice(Math.min(min, indentOf(x))));
    };

    function list(ls, s) {
      const first = ls[s].match(itemRe), base = first[1].length, ordered = /\d/.test(first[2]);
      const startNum = ordered ? parseInt(first[2], 10) : 1;
      const items = []; let i = s, last = s;
      while (i < ls.length) {
        const l = ls[i], m2 = l.match(itemRe);
        if (m2 && m2[1].length >= base && m2[1].length < base + 2) {
          if (/\d/.test(m2[2]) !== ordered) break;
          items.push({ head: m2[3], rest: [] }); last = i; i++; continue;
        }
        if (!items.length) break;
        if (!l.trim()) {
          let j = i + 1; while (j < ls.length && !ls[j].trim()) j++;
          if (j < ls.length) {
            const nm = ls[j].match(itemRe), ind = indentOf(ls[j]);
            if ((nm && ind >= base && ind < base + 2 && /\d/.test(nm[2]) === ordered) || ind >= base + 2) {
              for (let k = i; k < j; k++) items[items.length - 1].rest.push('');
              i = j; continue;
            }
          }
          break;
        }
        if (indentOf(l) >= base + 2) { items[items.length - 1].rest.push(l); last = i; i++; continue; }
        break;
      }
      const html = items.map(it => {
        let t = it.head, box = '', m3;
        if ((m3 = t.match(/^\[( |x|X)\]\s+(.*)$/))) { box = `<span class="chk">${m3[1] === ' ' ? '☐' : '☑'}</span> `; t = m3[2]; }
        const rest = dedent(it.rest);
        return '<li>' + box + inline(t) + (rest.length ? blocks(rest) : '') + '</li>';
      }).join('');
      return { html: (ordered ? `<ol${startNum !== 1 ? ` start="${startNum}"` : ''}>` : '<ul>') + html + (ordered ? '</ol>' : '</ul>'), end: last };
    }

    function blocks(ls) {
      const out = [];
      for (let i = 0; i < ls.length; i++) {
        const raw = ls[i], line = raw.trim();
        let m;
        if ((m = raw.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/))) {                  // 코드 블록
          const ch = m[1][0], lang = m[2], buf = []; i++;
          const close = new RegExp('^ {0,3}' + (ch === '`' ? '`' : '~') + '{3,}\\s*$');
          while (i < ls.length && !close.test(ls[i])) { buf.push(ls[i]); i++; }
          out.push(`<pre><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`);
          continue;
        }
        if (!line) { out.push('<div class="ln">&nbsp;</div>'); continue; }
        if (hrRe.test(raw)) { out.push('<hr>'); continue; }
        if ((m = raw.match(/^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/))) {              // 제목
          const lv = m[1].length, tag = lv === 1 ? 'h3' : lv === 2 ? 'h4' : lv === 3 ? 'h5' : 'h6';
          out.push(`<${tag}>${inline(m[2])}</${tag}>`); continue;
        }
        if ((m = line.match(reImgTag))) {
          const w = m[1] ? Math.max(10, Math.min(100, +m[1])) : 100;
          out.push(`<img src="${esc(m[2])}" alt="" loading="lazy" referrerpolicy="no-referrer"${w < 100 ? ` style="width:${w}%"` : ''}>`); continue;
        }
        if ((m = line.match(reImgMd)) || (m = line.match(reImgExt))) { out.push(`<img src="${esc(m[1])}" alt="" loading="lazy" referrerpolicy="no-referrer">`); continue; }
        if ((m = line.match(reYt))) { out.push(`<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" allowfullscreen loading="lazy" title="유튜브 영상"></iframe></div>`); continue; }
        if (/^ {0,3}>/.test(raw)) {                                                  // 인용 (중첩 가능)
          const buf = [];
          while (i < ls.length && /^ {0,3}>/.test(ls[i])) { buf.push(ls[i].replace(/^ {0,3}>\s?/, '')); i++; }
          i--; out.push('<blockquote>' + blocks(buf) + '</blockquote>'); continue;
        }
        if (itemRe.test(raw)) { const r = list(ls, i); out.push(r.html); i = r.end; continue; }   // 목록 (중첩 가능)
        if (line.indexOf('|') >= 0 && i + 1 < ls.length && isSep(ls[i + 1])) {       // 표
          const head = splitRow(line), al = splitRow(ls[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : '');
          const rows = []; i += 2;
          while (i < ls.length && ls[i].trim() && ls[i].indexOf('|') >= 0) { rows.push(splitRow(ls[i])); i++; }
          i--;
          const st = k => al[k] ? ` style="text-align:${al[k]}"` : '';
          out.push('<div class="tbl-wrap"><table class="md"><thead><tr>' + head.map((c, k) => `<th${st(k)}>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
            rows.map(r => '<tr>' + head.map((_, k) => `<td${st(k)}>${inline(r[k] || '')}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
          continue;
        }
        if (i + 1 < ls.length && /^ {0,3}=+\s*$/.test(ls[i + 1])) { out.push(`<h3>${inline(line)}</h3>`); i++; continue; }   // 밑줄(===) 제목
        out.push('<div class="ln">' + inline(raw) + '</div>');
      }
      return out.join('');
    }

    let html = blocks(lines);
    if (fnOrder.length) html += '<div class="fn"><hr><ol>' + fnOrder.map(id => `<li>${inline(fnDef[id])}</li>`).join('') + '</ol></div>';
    return restore(html);
  }

  /* ---------- 윈도우 창 ---------- */
  function openWin({ title, html, width = 340, onClose }) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="dlg raised" role="dialog" aria-modal="true" style="width:${width}px">
      <div class="titlebar"><span class="ttxt">${esc(title)}</span><button class="btn sm" type="button" data-x aria-label="닫기">닫기</button></div>
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

  /* ---------- 로그인 / 가입 ---------- */
  function loginDialog({ signup = true, title = '덕질역 로그인' } = {}) {
    return new Promise(res => {
      let result = null, mode = 'login';
      const w = openWin({
        title, width: 360, onClose: () => res(result),
        html: `${signup ? `<div class="tabs"><button class="tab on" type="button" data-m="login">로그인</button><button class="tab" type="button" data-m="signup">회원가입</button></div>` : ''}
        <form class="dlg-body" style="display:block;border-top:2px solid #fff;margin:0 8px;padding-top:12px" autocomplete="on">
          <div class="field"><label for="lg-n">닉네임</label><input id="lg-n" class="input" name="nick" maxlength="10" autocomplete="username" required></div>
          <div class="field"><label for="lg-p">비밀번호</label><input id="lg-p" class="input" type="password" name="pw" autocomplete="current-password" required></div>
          <div class="field" data-su hidden><label for="lg-p2">비밀번호 확인</label><input id="lg-p2" class="input" type="password" name="pw2" autocomplete="new-password"></div>
          <div class="hint" data-hint style="font-size:11px;color:#555"></div>
          <div class="err-line" role="alert"></div>
          <div class="dlg-btns" style="padding:4px 0 10px"><button class="btn primary" type="submit" data-ok>로그인</button><button class="btn" type="button" data-c>취소</button></div>
        </form>`
      });
      const f = w.el.querySelector('form'), err = w.el.querySelector('.err-line');
      const hint = w.el.querySelector('[data-hint]'), su = w.el.querySelector('[data-su]'), ok = w.el.querySelector('[data-ok]');
      function setMode(m) {
        mode = m; const s = m === 'signup';
        su.hidden = !s; ok.textContent = s ? '가입하기' : '로그인';
        f.pw.autocomplete = s ? 'new-password' : 'current-password'; err.textContent = '';
        hint.innerHTML = s ? '이메일·실명은 필요 없어요. 닉네임 2~10자(한글·영문·숫자·_), 비밀번호 6자 이상.<br>⚠ 비밀번호를 잊으면 찾을 수 없으니 꼭 기억해 두세요.' : '';
        w.el.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.m === m));
      }
      setMode('login');
      w.el.querySelectorAll('.tab').forEach(t => t.onclick = () => setMode(t.dataset.m));
      w.el.querySelector('[data-c]').onclick = () => w.close();
      f.nick.focus();
      f.onsubmit = async e => {
        e.preventDefault(); err.textContent = ''; ok.disabled = true;
        try {
          if (mode === 'signup') {
            if (f.pw.value !== f.pw2.value) throw new Error('비밀번호 확인이 달라요.');
            result = await API.signup(f.nick.value, f.pw.value);
          } else result = await API.login(f.nick.value, f.pw.value);
          w.close();
        } catch (x) { err.textContent = '⚠ ' + x.message; ok.disabled = false; }
      };
    });
  }

  /* ---------- 바탕화면 색 (서울 지하철 노선색 포함) ---------- */
  const DESKS = [
    { n: '기본 청록', c: '#008080' }, { n: '1호선 남색', c: '#0052a4' }, { n: '2호선 초록', c: '#00a84d' },
    { n: '3호선 주황', c: '#ef7c1c' }, { n: '4호선 하늘', c: '#00a5de' }, { n: '5호선 보라', c: '#996cac' },
    { n: '7호선 올리브', c: '#747f00' }, { n: '9호선 금색', c: '#bdb092' }, { n: '회색', c: '#808080' }, { n: '검정', c: '#000000' }
  ];

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

  window.Common = { esc, fmtDate, fmtShort, renderBody, openWin, alertBox, confirmBox, askText, loginDialog, prepareImage };
})();