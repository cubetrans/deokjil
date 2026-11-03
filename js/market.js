/* ==========================================================
   market.js — 덕질역 중고거래 (철도·버스 덕질 용품 게시판)
   돈은 사이트를 거치지 않아요. 글 올리기 + 쪽지로 연락, 결제·배송은 두 분이 직접 해요.
   app.js 가 Market.init(ctx) 로 연결하고, 주소 #/market… 은 Market.view(a, b) 가 그려요.
   ========================================================== */
(function () {
  'use strict';
  const C = window.SITE_CONFIG, A = window.API, K = window.Common;
  const { esc, fmtShort, alertBox, confirmBox } = K;
  const M = () => C.market || {};
  let X = null;                                  // app.js 가 넘겨 준 도구들
  const $ = (s, r) => (r || document).querySelector(s);
  const won = n => n === 0 ? '나눔 🎁' : Number(n).toLocaleString('ko-KR') + '원';
  const cat = id => (M().categories || []).find(c => c.id === id) || { name: '기타', icon: '📦' };
  const stBadge = s => `<span class="mk-st mk-${esc(s)}">${esc((M().status || {})[s] || s)}</span>`;
  const nl = t => esc(t).replace(/\n/g, '<br>');
  const filt = { q: '', cat: '', onlySale: true };

  /* 거래 전 꼭 읽어야 할 안내 (대한민국 법령 기준) */
  const RULES_HTML = `
    <ul class="mk-rules">
      <li><b>덕질역은 게시판만 제공해요.</b> 거래·결제·배송·환불은 판매자와 구매자 두 분의 책임이고, 덕질역은 거래 당사자가 아니에요. (전자상거래법)</li>
      <li><b>팔 수 없는 것</b>: 유효한 승차권·정기권·할인권(철도사업법 — 사용이 끝난 <u>수집용</u>만 가능. 출장비·세금 정산 같은 <u>증빙용으로 쓰일 줄 알면서</u> 파는 것, 모바일 승차권 화면 캡처·공유도 안 돼요),복지카드·경로·장애인·청소년·국가유공자 등 <u>특수(우대) 카드</u>와 이름이 등록된 기명 카드, 모조품·위조품(상표법), 도난·횡령이 의심되는 공용 물품, 불법 복제물, 음란물, 그 밖에 법으로 거래가 막힌 물건.</li>
      <li><b>팔 수 있는 것</b>: 일반 교통카드(잔액이 남아 있어도 돼요), 철도·버스 회사 제복·사원증·명찰 등은 <b>이름·사진·사번·소속 등 개인정보를 모두 지운 경우</b>에 가능해요.</li>
      <li><b>개인정보는 글에 쓰지 마세요.</b> 전화번호·계좌번호·이메일은 글에 쓸 수 없고, 연락은 <b>쪽지</b>로 해요. (개인정보 보호법)</li>
      <li><b>사기 조심!</b> 선입금만 요구하거나, 외부 메신저로 옮기자고 하거나, 시세보다 너무 싸면 의심하세요. 직거래는 사람 많은 공공장소에서 낮에 하세요. 피해를 입었다면 <a href="https://ecrm.police.go.kr" target="_blank" rel="noopener noreferrer">경찰청 사이버범죄 신고시스템</a>(ecrm.police.go.kr)에 신고하세요.</li>
      <li>돈을 벌 목적으로 <b>계속·반복해서</b> 팔면 사업자 등록·통신판매업 신고가 필요할 수 있어요. 만 19세 미만은 보호자와 상의해 주세요.</li>
      <li>신고가 서로 다른 ${M().reportHide || 3}명에게서 들어오면 글이 자동으로 숨겨지고 운영진이 확인해요. 숨겨진 글이 2개 이상이면 ${M().banDays || 7}일간 새 글을 쓸 수 없어요. 권리침해 게시중단 요청은 <a href="#/inquiry">문의·건의</a>로 보내 주세요.</li>
    </ul>`;
  const rulesBox = open => `<details class="mk-notice"${open ? ' open' : ''}><summary>📌 거래 전 꼭 읽어 주세요 (금지 품목 · 안전 수칙)</summary>${RULES_HTML}</details>`;

  /* ---------- 목록 ---------- */
  async function viewList() {
    X.buildTree('market'); X.setAddr('중고거래', '중고거래');
    let list; try { list = await A.marketList({ category: filt.cat, onlySale: filt.onlySale, q: filt.q }); } catch (e) { X.content.innerHTML = X.errBox(e); return; }
    const me = X.me();
    X.content.innerHTML = `
      <h2 class="page-title">🛒 중고거래 <small>철도·버스 덕질 용품 장터</small></h2>
      <div class="mk-bar">
        <form class="mk-search" id="mkQ"><input class="input" id="mkQi" maxlength="30" placeholder="🔍 찾는 물건 (예: 노선도, 모형)" value="${esc(filt.q)}" aria-label="검색"><button class="btn" type="submit">검색</button></form>
        <span class="mk-bar-r"><label class="check"><input type="checkbox" id="mkSale"${filt.onlySale ? ' checked' : ''}> 판매중만</label>
          ${me ? '<a class="btn" href="#/market/my">내 판매글</a>' : ''} <a class="btn primary" href="#/market/new">✏ 판매글 쓰기</a></span>
      </div>
      <div class="mk-cats" role="tablist"><button type="button" class="mk-chip${filt.cat ? '' : ' on'}" data-c="">전체</button>${(M().categories || []).map(c => `<button type="button" class="mk-chip${filt.cat === c.id ? ' on' : ''}" data-c="${esc(c.id)}">${c.icon} ${esc(c.name)}</button>`).join('')}</div>
      ${rulesBox(false)}
      ${list.length ? `<div class="mk-grid">${list.map(card).join('')}</div>` : '<div class="empty">조건에 맞는 물건이 아직 없어요. 첫 판매글의 주인공이 되어 보세요 🚉</div>'}`;
    $('#mkQ').onsubmit = e => { e.preventDefault(); filt.q = $('#mkQi').value.trim(); viewList(); };
    $('#mkSale').onchange = e => { filt.onlySale = e.target.checked; viewList(); };
    X.content.querySelectorAll('.mk-chip').forEach(b => b.onclick = () => { filt.cat = b.dataset.c; viewList(); });
    X.setStatus(`물건 ${list.length}개`, '');
  }
  function card(i) {
    const c = cat(i.category);
    return `<a class="mk-card${i.status === 'sold' ? ' done' : ''}" href="#/market/${esc(i.id)}">
      <div class="mk-thumb">${i.images && i.images[0] ? `<img src="${esc(i.images[0])}" alt="" loading="lazy">` : `<span class="mk-noimg">${c.icon}</span>`}${i.status !== 'selling' ? `<span class="mk-over">${esc((M().status || {})[i.status] || '')}</span>` : ''}</div>
      <div class="mk-info"><div class="mk-t">${esc(i.title)}</div><div class="mk-p">${won(i.price)}</div>
        <div class="mk-m">${esc(i.region || (M().methods || {})[i.method] || '')} · ${esc(i.seller)} · ${X.ago(i.bumped)}</div></div></a>`;
  }

  /* ---------- 내 판매글 ---------- */
  async function viewMine() {
    X.buildTree('market');
    if (!X.me()) return X.needMe('내 판매글', '🛒');
    X.setAddr('중고거래\\내 판매글', '내 판매글');
    const [list, ban] = await Promise.all([A.marketMine(), A.marketBan()]);
    X.content.innerHTML = `<h2 class="page-title">🛒 내 판매글</h2>
      ${ban ? `<div class="msg err">⛔ 신고가 쌓여 <b>${fmtShort(ban)}</b> 까지 새 판매글을 쓸 수 없어요. 억울하다면 <a href="#/inquiry">문의·건의</a>로 알려 주세요.</div>` : ''}
      <div style="margin-bottom:8px"><a class="btn" href="#/market">◀ 장터</a> <a class="btn primary" href="#/market/new">✏ 판매글 쓰기</a></div>
      ${list.length ? `<div class="mk-grid">${list.map(i => card(i).replace('class="mk-m">', 'class="mk-m">' + (['hidden'].includes(i.status) ? '⛔ 숨김 · ' : ''))).join('')}</div>` : '<div class="empty">아직 올린 글이 없어요.</div>'}`;
    X.setStatus(`내 글 ${list.length}개`, '');
  }

  /* ---------- 글쓰기 / 고치기 ---------- */
  async function viewWrite(editId) {
    X.buildTree('market');
    const me = X.me();
    if (!me) { X.setAddr('중고거래\\판매글 쓰기', '판매글 쓰기'); return X.needMe('판매글 쓰기', '✏'); }
    let it = null;
    if (editId) {
      it = await A.marketGet(editId, false);
      if (!it || !it.mine) return X.notFound();
      if (['hidden', 'removed'].includes(it.status)) { X.content.innerHTML = '<div class="msg err">숨겨진 글은 고칠 수 없어요.</div><a class="btn" href="#/market/my">◀ 내 판매글</a>'; return; }
    } else {
      const ban = await A.marketBan();
      if (ban) { X.content.innerHTML = `<h2 class="page-title">✏ 판매글 쓰기</h2><div class="msg err">⛔ 신고가 쌓여 <b>${fmtShort(ban)}</b> 까지 새 판매글을 쓸 수 없어요.</div><a class="btn" href="#/market">◀ 장터</a>`; return; }
    }
    X.setAddr('중고거래\\' + (it ? '글 고치기' : '판매글 쓰기'), it ? '글 고치기' : '판매글 쓰기');
    const sel = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    const imgs = it ? [...it.images] : [];
    X.content.innerHTML = `<h2 class="page-title">✏ ${it ? '판매글 고치기' : '판매글 쓰기'}</h2>
      ${rulesBox(!it)}
      <form id="mkF" class="panel raised mk-form" novalidate>
        <div class="field"><label for="mk-t">제목 <small>(2~60자)</small></label><input class="input" id="mk-t" maxlength="60" value="${esc(it ? it.title : '')}" placeholder="예: 9호선 급행 노선도 포스터 (A2)"></div>
        <div class="mk-row">
          <div class="field"><label for="mk-c">종류</label><select class="input" id="mk-c">${(M().categories || []).map(c => `<option value="${esc(c.id)}"${it && it.category === c.id ? ' selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="mk-p">가격 (원) <small>0 = 나눔</small></label><input class="input" id="mk-p" inputmode="numeric" maxlength="8" value="${it ? it.price : ''}" placeholder="예: 5000"></div>
          <div class="field"><label for="mk-d">상품 상태</label><select class="input" id="mk-d">${sel(M().conds || {}, it ? it.cond : 'used')}</select></div>
        </div>
        <div class="mk-row">
          <div class="field"><label for="mk-m">거래 방법</label><select class="input" id="mk-m">${sel(M().methods || {}, it ? it.method : 'both')}</select></div>
          <div class="field"><label for="mk-r">거래 지역 <small>(선택, 20자)</small></label><input class="input" id="mk-r" maxlength="20" value="${esc(it ? it.region : '')}" placeholder="예: 서울 강남구"></div>
        </div>
        <div class="field"><label for="mk-b">설명 <small>(5~2000자)</small></label><textarea class="input" id="mk-b" rows="7" maxlength="2000" placeholder="상태, 구성품, 구매 시기, 하자 등을 솔직하게 적어 주세요.&#10;※ 전화번호·계좌번호·이메일은 쓸 수 없어요. 연락은 쪽지로 받아요.">${esc(it ? it.body : '')}</textarea></div>
        <div class="field"><b>사진</b> <small>(최대 ${M().maxImages || 4}장 · 실제 물건 사진을 올려 주세요)</small>
          <div class="mk-imgs" id="mkImgs"></div>
          <input type="file" id="mkFile" accept="image/*" multiple hidden>
          <button class="btn sm" type="button" id="mkAdd">📷 사진 올리기</button> <small id="mkUp"></small></div>
        ${it ? '' : `<label class="check mk-agree"><input type="checkbox" id="mk-a"> 위의 <b>금지 품목·안전 수칙</b>을 읽었고, 덕질역은 거래 당사자가 아니며 거래 책임은 저에게 있음을 확인합니다.</label>`}
        <div class="err-line" id="mkE" role="alert"></div>
        <div class="row" style="justify-content:flex-end;gap:6px"><a class="btn" href="${it ? '#/market/' + esc(it.id) : '#/market'}">취소</a><button class="btn primary" type="submit" id="mkGo">${it ? '💾 저장' : '올리기'}</button></div>
      </form>`;
    const paint = () => {
      $('#mkImgs').innerHTML = imgs.map((u, n) => `<span class="mk-im"><img src="${esc(u)}" alt="올린 사진 ${n + 1}"><button type="button" data-x="${n}" aria-label="사진 지우기">✕</button></span>`).join('');
      $('#mkImgs').querySelectorAll('[data-x]').forEach(b => b.onclick = () => { imgs.splice(+b.dataset.x, 1); paint(); });
      $('#mkAdd').disabled = imgs.length >= (M().maxImages || 4);
    };
    paint();
    $('#mkAdd').onclick = () => $('#mkFile').click();
    $('#mkFile').onchange = async e => {
      const files = [...e.target.files].filter(f => /^image\//.test(f.type)); e.target.value = '';
      if (A.mode !== 'supabase') return alertBox('사진 올리기는 Supabase를 연결한 뒤에 쓸 수 있어요. (지금은 사진 없이 글만 올릴 수 있어요)', '데모 모드', 'ℹ️');
      for (const f of files) {
        if (imgs.length >= (M().maxImages || 4)) break;
        try { $('#mkUp').textContent = '업로드 중…'; imgs.push(await A.uploadImage(await K.prepareImage(f))); paint(); $('#mkUp').textContent = ''; }
        catch (x) { $('#mkUp').textContent = ''; alertBox(x.message, '사진 올리기 실패', '⚠️'); }
      }
    };
    $('#mkF').onsubmit = async e => {
      e.preventDefault(); const er = $('#mkE'); er.textContent = '';
      const d = { title: $('#mk-t').value, category: $('#mk-c').value, price: $('#mk-p').value.replace(/[,\s원]/g, ''), cond: $('#mk-d').value, method: $('#mk-m').value, region: $('#mk-r').value, body: $('#mk-b').value, images: imgs, agree: it ? true : $('#mk-a').checked };
      d.price = d.price === '' ? NaN : Number(d.price);
      if (!d.agree) { er.textContent = '⚠ 금지 품목·안전 수칙을 확인하고 체크해 주세요.'; return; }
      $('#mkGo').disabled = true;
      try {
        if (it) { await A.marketEdit(it.id, d); K.toast('글을 고쳤어요.'); location.hash = '#/market/' + it.id; }
        else { const r = await A.marketPost(d); K.toast('판매글을 올렸어요.'); location.hash = '#/market/' + (r && r.id || ''); }
      } catch (x) { er.textContent = '⚠ ' + x.message; $('#mkGo').disabled = false; }
    };
    X.setStatus(it ? '글 고치기' : '판매글 쓰기', '');
  }

  /* ---------- 상세 ---------- */
  const RATE = { 3: '👍 좋아요', 2: '👌 보통이에요', 1: '👎 별로예요' };
  async function viewItem(id) {
    X.buildTree('market');
    const it = await A.marketGet(id, true); if (!it) return X.notFound();
    const me = X.me(), staff = !!me && A.isStaff(me.role), c = cat(it.category);
    X.setAddr('중고거래\\' + it.title, it.title);
    const [stats, reviews, reviewed] = await Promise.all([A.marketSellerStats(it.seller), A.marketReviews(it.seller), it.isBuyer && it.status === 'sold' ? A.marketMyReview(it.id) : Promise.resolve(true)]);
    const live = ['selling', 'reserved'].includes(it.status);
    let acts = '';
    if (it.mine) {
      acts = `<div class="mk-acts">${live ? ['selling', 'reserved'].filter(s => s !== it.status).map(s => `<button class="btn" type="button" data-s="${s}">${s === 'selling' ? '↩ 판매중으로' : '🔒 예약중으로'}</button>`).join('') + '<button class="btn primary" type="button" data-s="sold">✅ 판매완료</button><button class="btn" type="button" data-bump>⬆ 끌어올리기</button>' : ''}
        ${it.status === 'sold' ? '<button class="btn" type="button" data-s="selling">↩ 다시 판매중으로</button>' : ''}
        ${!['hidden', 'removed'].includes(it.status) ? `<a class="btn" href="#/market/edit/${esc(it.id)}">✏ 수정</a>` : ''}<button class="btn danger" type="button" data-del>🗑 삭제</button></div>`;
    } else if (live || it.status === 'sold') {
      acts = me
        ? `<div class="mk-acts">${live ? `<button class="btn primary" type="button" data-dm>✉ 쪽지로 문의하기</button>` : ''}<button class="btn" type="button" data-rep>🚨 신고</button></div>`
        : `<div class="mk-acts"><button class="btn primary" type="button" data-login>🔑 로그인하고 문의하기</button></div>`;
    }
    const staffBar = staff ? `<div class="mk-acts mk-staff"><b>🛠 운영진</b> ${['hidden', 'removed'].includes(it.status) ? '<button class="btn" type="button" data-st="restore">♻ 다시 열기</button>' : ''}${it.status !== 'removed' ? '<button class="btn danger" type="button" data-st="remove">🗑 정책 위반 삭제</button>' : ''} <a class="btn sm" href="admin.html#/market">신고 내역</a></div>` : '';
    X.content.innerHTML = `
      <div class="post-head"><a href="#/market">🛒 중고거래</a> › <a href="#/market" data-cat="${esc(it.category)}">${c.icon} ${esc(c.name)}</a></div>
      ${['hidden', 'removed'].includes(it.status) ? `<div class="msg err">⛔ ${it.status === 'hidden' ? '신고로 숨겨진 글이에요 (판매자와 운영진에게만 보여요)' : '삭제된 글이에요'}${it.hiddenWhy ? ' — ' + esc(it.hiddenWhy) : ''}</div>` : ''}
      <div class="mk-detail">
        <div class="mk-gal">${it.images.length ? it.images.map((u, n) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="${esc(it.title)} 사진 ${n + 1}"></a>`).join('') : `<div class="mk-noimg big">${c.icon}</div>`}</div>
        <div class="mk-side">
          <div>${stBadge(it.status)} <small>${esc(c.name)}</small></div>
          <h1 class="post-title">${esc(it.title)}</h1>
          <div class="mk-price">${won(it.price)}</div>
          <dl class="mk-dl"><dt>상품 상태</dt><dd>${esc((M().conds || {})[it.cond] || '')}</dd><dt>거래 방법</dt><dd>${esc((M().methods || {})[it.method] || '')}</dd>${it.region ? `<dt>지역</dt><dd>${esc(it.region)}</dd>` : ''}<dt>올린 때</dt><dd>${fmtShort(it.created)} <small>(끌올 ${X.ago(it.bumped)})</small></dd><dt>조회</dt><dd>${it.views}</dd></dl>
          <div class="mk-seller">👤 <a href="#/user/${encodeURIComponent(it.seller)}"><b>${esc(it.seller)}</b></a> <small>거래 ${stats.sold}건 · 👍 ${stats.good} · 👌 ${stats.ok} · 👎 ${stats.bad}</small></div>
          ${acts}
        </div>
      </div>
      <div class="panel sunken mk-body">${nl(it.body)}</div>
      ${staffBar}
      ${it.isBuyer && it.status === 'sold' && !reviewed ? `<form class="panel raised mk-rv" id="mkRv"><b>⭐ 판매자 후기를 남겨 주세요</b>
        <div class="mk-rate">${[3, 2, 1].map(n => `<label class="check"><input type="radio" name="rt" value="${n}"${n === 3 ? ' checked' : ''}> ${RATE[n]}</label>`).join('')}</div>
        <input class="input" id="mkRvB" maxlength="100" placeholder="한 줄 후기 (선택, 100자)"><div class="err-line" id="mkRvE" role="alert"></div><button class="btn primary" type="submit">후기 남기기</button></form>` : ''}
      ${rulesBox(false)}
      <div class="sub-title"><span>📝 ${esc(it.seller)}님의 거래 후기 (${reviews.length})</span></div>
      ${reviews.length ? `<div class="mk-rvs">${reviews.map(r => `<div class="mk-rvi"><b>${RATE[r.rating]}</b> <small>${esc(r.reviewer)} · ${fmtShort(r.created)}${r.title ? ' · 「' + esc(r.title) + '」' : ''}</small>${r.body ? `<div>${esc(r.body)}</div>` : ''}</div>`).join('')}</div>` : '<div class="empty">아직 후기가 없어요.</div>'}
      <div style="margin-top:10px"><a class="btn" href="#/market">◀ 장터로</a></div>`;
    X.content.querySelectorAll('[data-cat]').forEach(a => a.onclick = () => { filt.cat = a.dataset.cat; });
    const run = async (fn, ok) => { try { await fn(); if (ok) K.toast(ok); X.route(); } catch (e) { alertBox(e.message, '처리하지 못했어요', '⚠️'); } };
    X.content.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => {
      const s = b.dataset.s; let buyer = '';
      if (s === 'sold') {
        buyer = await K.askText('판매 완료', '구매자 닉네임 (덕질역 회원이면 적어 주세요. 구매자가 후기를 남길 수 있어요. 모르면 비워 두세요)');
        if (buyer === null) return;
      }
      run(() => A.marketSetStatus(it.id, s, buyer), '상태를 바꿨어요.');
    });
    const bump = $('[data-bump]'); if (bump) bump.onclick = () => run(() => A.marketBump(it.id), '맨 위로 끌어올렸어요.');
    const del = $('[data-del]'); if (del) del.onclick = async () => { if (!(await confirmBox('이 판매글을 지울까요?', '글 삭제', '삭제', '취소'))) return; try { await A.marketDelete(it.id); K.toast('지웠어요.'); location.hash = '#/market/my'; } catch (e) { alertBox(e.message, '오류', '⚠️'); } };
    const dm = $('[data-dm]'); if (dm) dm.onclick = () => { X.setDmDraft(`안녕하세요, 덕질역 중고거래 「${it.title.slice(0, 30)}」 (${won(it.price)}) 아직 구매 가능한가요?`); location.hash = '#/messages/' + encodeURIComponent(it.seller); };
    const lg = $('[data-login]'); if (lg) lg.onclick = () => X.needLogin();
    const rep = $('[data-rep]'); if (rep) rep.onclick = () => reportDialog(it);
    X.content.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => {
      const act = b.dataset.st; let note = '';
      if (act === 'remove') { note = await K.askText('정책 위반 삭제', '사유 (판매자에게 알림으로 가요, 60자)'); if (note === null) return; }
      run(() => A.marketStaff(it.id, act, note), act === 'restore' ? '글을 다시 열었어요.' : '삭제했어요.');
    });
    const rv = $('#mkRv'); if (rv) rv.onsubmit = async e => {
      e.preventDefault();
      try { await A.marketReview(it.id, rv.rt.value, $('#mkRvB').value); K.toast('후기를 남겼어요.'); X.route(); } catch (x) { $('#mkRvE').textContent = '⚠ ' + x.message; }
    };
    X.setStatus(it.title, `조회 ${it.views}`);
  }

  function reportDialog(it) {
    const w = K.openWin({ title: '🚨 판매글 신고', width: 400, html: `<form class="dlg-body" style="display:block">
      <p><small>「${esc(it.title)}」 — 서로 다른 ${M().reportHide || 3}명이 신고하면 글이 자동으로 숨겨지고 운영진이 확인해요. 허위 신고는 제재될 수 있어요.</small></p>
      <div class="field"><label for="rp-r">사유</label><select class="input" id="rp-r">${Object.entries(M().reasons || {}).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="rp-n">자세한 내용 <small>(선택, 200자)</small></label><textarea class="input" id="rp-n" rows="3" maxlength="200"></textarea></div>
      <div class="err-line" id="rp-e" role="alert"></div>
      <div class="dlg-btns"><button class="btn danger" type="submit">신고하기</button><button class="btn" type="button" data-c>취소</button></div></form>` });
    const f = w.el.querySelector('form');
    f.querySelector('[data-c]').onclick = () => w.close();
    f.onsubmit = async e => {
      e.preventDefault();
      try { await A.marketReport(it.id, f.querySelector('#rp-r').value, f.querySelector('#rp-n').value); w.close(); K.toast('신고했어요. 운영진이 확인할게요.'); X.route(); }
      catch (x) { f.querySelector('#rp-e').textContent = '⚠ ' + x.message; }
    };
  }

  window.Market = {
    init(ctx) { X = ctx; },
    async view(a, b) {
      if (a === 'new') return viewWrite(null);
      if (a === 'edit') return viewWrite(b);
      if (a === 'my') return viewMine();
      if (a) return viewItem(a);
      return viewList();
    }
  };
})();
