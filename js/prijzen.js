/* ============================================================
   BURO SCOTT — PRIJZEN (één plek voor de hele site)
   Alle bedragen exclusief btw. Particulieren zien ze inclusief
   21% btw, professionals exclusief (keuze wordt onthouden).
   Prijs aanpassen? Enkel hier.
============================================================ */
window.BS_PRICES = {
  vat: 0.21,
  foto: { 20: 179, 30: 228, 40: 277 },   // fotografie: 20 foto's, elke 10 extra = 49
  fotoExtra10: 49,
  drone: { 5: 99, 10: 169 },             // dronefoto's
  tour: 199,                             // 360° tour, 3 maanden online
  plan: 89,                              // 2D-plattegrond per verdieping
  spoed: 49,                             // levering binnen 24 u
  tourMonth: 7.5, tourQuarter: 19, tourYear: 59,
  // vanafprijzen gelden tot deze grootte; daarboven offerte op maat
  bigHouse: 250, bigLot: 1000,
  // verplaatsing: tot 20 km (enkele rit, vertrek Desselgem; op de site 'Waregem') gratis, daarna per km heen én terug
  kmFree: 20, kmRate: 0.5, base: [50.883, 3.367], roadFactor: 1.35,
  packages: {
    Basic:     { price: 179, foto: 20, drone: 0,  tour: false, plan: 0, label: 'Scott Basic' },
    Signature: { price: 389, foto: 30, drone: 5,  tour: false, plan: 1, label: 'Scott Signature' },
    Prestige:  { price: 699, foto: 40, drone: 10, tour: true,  plan: 2, label: 'Scott Prestige', voorrang: true },
  },
};

window.BSPrice = (function () {
  var KEY = 'bs-price-mode';
  function mode() { try { return localStorage.getItem(KEY) === 'pro' ? 'pro' : 'part'; } catch (e) { return 'part'; } }
  function gross(v) { return mode() === 'pro' ? v : v * (1 + BS_PRICES.vat); }
  function fmt(v, exact) {
    var r = exact ? Math.round(v * 100) / 100 : Math.round(v);
    var s = r % 1 ? r.toFixed(2).replace('.', ',') : String(r);
    return '€' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function show(v) { return fmt(gross(v), v % 1 !== 0); }
  function render(root) {
    (root || document).querySelectorAll('[data-price]').forEach(function (el) {
      var v = parseFloat(el.dataset.price);
      el.textContent = (el.dataset.prefix ? el.dataset.prefix + ' ' : '') + show(v) + (el.dataset.suffix || '');
    });
    (root || document).querySelectorAll('[data-vat-label]').forEach(function (el) {
      el.textContent = mode() === 'pro' ? 'excl. btw' : 'incl. 21% btw';
    });
    document.querySelectorAll('[data-price-mode] button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode()));
    });
  }
  function set(m) {
    try { localStorage.setItem(KEY, m === 'pro' ? 'pro' : 'part'); } catch (e) {}
    render();
    document.dispatchEvent(new CustomEvent('bs-price-mode', { detail: mode() }));
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-price-mode] button');
    if (b) set(b.dataset.mode);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { render(); });
  else render();
  return { mode: mode, set: set, gross: gross, fmt: fmt, show: show, render: render };
})();
