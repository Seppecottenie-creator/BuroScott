/* ============================================================
   Gedeelde login voor alle beheerpagina's (overzicht, galerijen, tours).
   "Onthoud mij" bewaart de login 30 dagen op dit toestel (localStorage),
   anders enkel zolang het tabblad open is (sessionStorage).
============================================================ */
window.AdminSession = (function () {
  var KEY = 'kz-admin';
  function read(store) {
    try { var s = JSON.parse(store.getItem(KEY) || 'null'); return s && s.expiresAt > Date.now() ? s : null; } catch (e) { return null; }
  }
  return {
    get: function () { return read(localStorage) || read(sessionStorage); },
    set: function (r, remember) {
      try { (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(r)); } catch (e) {}
    },
    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
      try { sessionStorage.removeItem(KEY); } catch (e) {}
    },
  };
})();
