/* ==========================================================
   로그인 공유 저장소 — 덕질역(deokjil.xyz)과 제보 사이트(rail.deokjil.xyz)가 같은 로그인을 쓰게 해요.
   · 주소가 *.deokjil.xyz 이면 세션을 ".deokjil.xyz" 쿠키에 저장해서 두 사이트가 같이 써요.
   · 쿠키 하나는 4KB 까지라서 세션을 잘라(1000자) 여러 개에 나눠 담아요.
   · 그 밖의 주소(localhost, netlify.app 미리보기)에서는 그냥 localStorage 를 써요.
   · 예전 localStorage 로그인은 처음 읽을 때 쿠키로 옮겨 줘요. 로그아웃하면 둘 다 지워요.
   덕질역과 제보 사이트 모두 이 파일을 똑같이 넣어야 해요.
   ========================================================== */
(function () {
  var CHUNK = 1000, DAYS = 60;
  var host = (location && location.hostname) || '';
  var DOMAIN = /(^|\.)deokjil\.xyz$/i.test(host) ? '.deokjil.xyz' : null;
  var secure = location.protocol === 'https:' ? '; Secure' : '';
  var ls = (function () { try { var t = '__t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; } catch (e) { return null; } })();

  function readCookies() {
    var out = {}; (document.cookie || '').split(/;\s*/).forEach(function (p) { var i = p.indexOf('='); if (i > 0) out[p.slice(0, i)] = p.slice(i + 1); });
    return out;
  }
  function setCookie(name, val, maxAge) {
    document.cookie = name + '=' + val + '; Domain=' + DOMAIN + '; Path=/; Max-Age=' + maxAge + '; SameSite=Lax' + secure;
  }
  function cookieGet(key) {
    var c = readCookies(), n = parseInt(c[key + '.n'] || '', 10); if (!(n > 0)) return null;
    var s = '';
    for (var i = 0; i < n; i++) { var p = c[key + '.' + i]; if (p == null) return null; s += decodeURIComponent(p); }
    return s;
  }
  function cookieRemove(key) {
    var c = readCookies(), n = parseInt(c[key + '.n'] || '0', 10) || 0;
    for (var i = 0; i < Math.max(n, 12); i++) if (c[key + '.' + i] != null) setCookie(key + '.' + i, '', 0);
    setCookie(key + '.n', '', 0);
  }
  function cookieSet(key, val) {
    cookieRemove(key);
    var parts = []; for (var i = 0; i < val.length; i += CHUNK) parts.push(val.slice(i, i + CHUNK));
    var age = DAYS * 86400;
    parts.forEach(function (p, i) { setCookie(key + '.' + i, encodeURIComponent(p), age); });
    setCookie(key + '.n', String(parts.length), age);
  }

  window.DeokjilSessionStorage = {
    getItem: function (key) {
      if (!DOMAIN) return ls ? ls.getItem(key) : null;
      var v = cookieGet(key);
      if (v == null && ls) {                       // 예전 로그인(localStorage)을 쿠키로 옮기기
        var old = ls.getItem(key);
        if (old != null) { try { cookieSet(key, old); ls.removeItem(key); } catch (e) {} return old; }
      }
      return v;
    },
    setItem: function (key, value) {
      if (!DOMAIN) { if (ls) ls.setItem(key, value); return; }
      cookieSet(key, String(value)); if (ls) { try { ls.removeItem(key); } catch (e) {} }
    },
    removeItem: function (key) {
      if (DOMAIN) cookieRemove(key);
      if (ls) { try { ls.removeItem(key); } catch (e) {} }
    }
  };
})();
