/* 덕질역 브라우저 알림 (푸시)
   · 서버 푸시: config.js 의 push.vapidPublicKey 가 있고 Supabase 모드일 때 — 사이트를 닫아도 와요 (supabase/functions/push-notify 필요)
   · 열린 탭 알림: 서버 설정이 없어도, 덕질역이 열려 있는 동안(다른 탭에 있어도) 새 알림·쪽지를 브라우저 알림으로 알려 줘요
   켜고 끄는 건 알림 화면·회원정보 수정 화면의 "브라우저 알림" 상자에서 해요. */
(function () {
  'use strict';
  const C = window.SITE_CONFIG || {};
  const A = window.API || null;
  const KEY = 'deokjil_push';
  const get = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const set = v => { try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) {} };
  const supported = () => 'Notification' in window && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const vapid = () => (C.push && C.push.vapidPublicKey) || '';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };

  let regP = null;
  function reg() {
    if (!supported()) return Promise.reject(new Error('이 브라우저에서는 알림을 쓸 수 없어요. (주소가 https 여야 해요)'));
    if (!regP) regP = navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready);
    return regP;
  }
  const enabled = () => supported() && get() && Notification.permission === 'granted';

  /* 사이트가 열려 있을 때 쓰는 알림 */
  async function notify(title, body, url, tag) {
    if (!enabled()) return false;
    try {
      const r = await reg();
      await r.showNotification(title, { body, tag: tag || 'dj-news', renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: url || './index.html#/notifications' } });
      return true;
    } catch (e) { return false; }
  }

  async function serverSub(on) {
    const key = vapid(); if (!key || !A || A.mode === 'local' || !A.pushSubscribe) return 'none';
    const r = await reg();
    let sub = await r.pushManager.getSubscription();
    if (on) {
      if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
      await A.pushSubscribe(sub.toJSON());
      return 'ok';
    }
    if (sub) { try { await A.pushUnsubscribe(sub.endpoint); } catch (e) {} try { await sub.unsubscribe(); } catch (e) {} }
    return 'off';
  }

  async function enable() {
    if (!supported()) throw new Error('이 브라우저에서는 알림을 쓸 수 없어요. (주소가 https 여야 하고, 아이폰은 "홈 화면에 추가"한 뒤에 돼요)');
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (p !== 'granted') throw new Error(p === 'denied' ? '브라우저에서 알림이 막혀 있어요. 주소창 왼쪽 자물쇠에서 허용으로 바꿔 주세요.' : '알림 허용을 누르지 않았어요.');
    await reg(); set(true);
    let mode = 'tab';
    try { if ((await serverSub(true)) === 'ok') mode = 'server'; } catch (e) { console.warn('[푸시 구독 실패]', e); }
    notify('덕질역', '알림을 켰어요. 이렇게 알려 드릴게요 🔔', './index.html#/', 'dj-test');
    return mode;
  }
  async function disable() { set(false); try { await serverSub(false); } catch (e) {} }

  /* 알림 켜기 상자 */
  function panel(el, me) {
    if (!el) return;
    const paint = () => {
      const on = enabled(), ok = supported(), blocked = ok && Notification.permission === 'denied';
      const srv = !!vapid() && A && A.mode !== 'local';
      el.innerHTML = `<div class="push-box"><div><b>🔔 브라우저 알림</b><div class="draft-note">${
        !ok ? '이 브라우저·주소에서는 알림을 쓸 수 없어요. (https 주소여야 해요. 아이폰은 사파리에서 "홈 화면에 추가" 후에 가능해요)'
          : blocked ? '브라우저에서 알림이 막혀 있어요. 주소창 왼쪽 자물쇠에서 "허용"으로 바꿔 주세요.'
            : on ? (srv ? '켜짐 · 새 쪽지·댓글·공감 소식을 사이트를 닫아도 알려 드려요.' : '켜짐 · 덕질역이 열려 있는 동안(다른 탭에 있어도) 새 소식을 알려 드려요.')
              : '새 쪽지·댓글·공감이 오면 브라우저 알림으로 알려 드려요. 쪽지 내용은 알림에 나오지 않아요.'}</div></div>
        <button class="btn ${on ? '' : 'primary'}" type="button" id="pushBtn" ${ok && !blocked ? '' : 'disabled'}>${on ? '알림 끄기' : '알림 켜기'}</button></div>`;
      const b = el.querySelector('#pushBtn');
      if (b) b.onclick = async () => {
        b.disabled = true;
        try { if (on) await disable(); else await enable(); }
        catch (e) { const t = el.querySelector('.draft-note'); if (t) t.textContent = '⚠ ' + (e.message || e); }
        const msg = el.querySelector('.draft-note') && el.querySelector('.draft-note').textContent.startsWith('⚠') ? el.querySelector('.draft-note').textContent : '';
        paint(); if (msg) el.querySelector('.draft-note').textContent = msg;
      };
    };
    paint();
  }

  /* 로그인할 때마다 서버 구독을 맞춰 둬요 (다른 기기에서 껐다 켜도 안 꼬이게) */
  async function sync() { if (enabled()) { try { await serverSub(true); } catch (e) {} } }

  window.Push = { supported, enabled, enable, disable, notify, panel, sync };
  if (enabled()) reg().catch(() => {});
})();
