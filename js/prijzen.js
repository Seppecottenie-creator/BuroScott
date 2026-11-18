/* ============================================================
   BURO SCOTT — PRIJZEN (één plek voor de hele site)
   Alle bedragen exclusief btw. Particulieren zien ze inclusief
   21% btw, professionals exclusief (keuze wordt onthouden).
   Prijs aanpassen? Enkel hier.
============================================================ */
window.BS_PRICES = {
  vat: 0.21,
  fotoBase: 179, fotoMin: 20, fotoPer: 4.9,   // fotografie: 20 foto's €179, elke extra foto €4,90 (10 = €49)
  droneBase: 99, droneMin: 5, dronePer: 14,   // drone: 5 foto's €99, elke extra €14 (10 = €169)
  tour: 199, tourPts: 10, tourPer5: 49,       // 360° tour tot 10 punten, per 5 extra punten €49; 3 maanden online
  plan: 89,                              // 2D-plattegrond per verdieping
  spoed: 49,                             // levering binnen 24 u
  tourMonth: 7.5, tourQuarter: 19, tourYear: 59,
  // vanafprijzen gelden tot deze grootte; daarboven offerte op maat
  bigHouse: 250, bigLot: 1000,
  // verplaatsing: tot 20 km (enkele rit, vertrek Desselgem; op de site 'Waregem') gratis, daarna per km heen én terug
  kmFree: 20, kmRate: 0.4132, base: [50.883, 3.367], roadFactor: 1.35,
  packages: {
    Basic:     { price: 179, foto: 20, drone: 0,  tour: false, plan: 0, label: 'Scott Basic' },
    Signature: { price: 389, foto: 30, drone: 5,  tour: false, plan: 2, label: 'Scott Signature' },
    Prestige:  { price: 699, foto: 40, drone: 10, tour: true,  plan: 3, label: 'Scott Prestige', voorrang: true },
  },
};

// Prijsregels (excl. btw)
BS_PRICES.fotoCost = function (n) { var P = BS_PRICES; return n > 0 ? P.fotoBase + Math.max(0, n - P.fotoMin) * P.fotoPer : 0; };
BS_PRICES.droneCost = function (n) { var P = BS_PRICES; return n > 0 ? P.droneBase + Math.max(0, n - P.droneMin) * P.dronePer : 0; };
BS_PRICES.tourExtra = function (pts) { var P = BS_PRICES; return Math.max(0, Math.ceil((pts - P.tourPts) / 5)) * P.tourPer5; };

window.BSPrice = (function () {
  var KEY = 'bs-price-mode';
  function mode() { try { return localStorage.getItem(KEY) === 'pro' ? 'pro' : 'part'; } catch (e) { return 'part'; } }
  function gross(v, m) { return (m || mode()) === 'pro' ? v : v * (1 + BS_PRICES.vat); }
  // Mooi afgeronde prijs zoals de klant ze ziet:
  // particulier (incl. btw): vanaf €50 op €5, €10–50 op €1, onder €10 op €0,50
  // professioneel (excl. btw): hele euro's, onder €10 op de cent
  function nice(v, m) {
    m = m || mode();
    var g = gross(v, m);
    if (m === 'pro') return g < 10 ? Math.round(g * 100) / 100 : Math.round(g);
    if (g >= 50) return Math.round(g / 5) * 5;
    if (g >= 10) return Math.round(g);
    return Math.round(g * 2) / 2;
  }
  function fmt(v, exact) {
    var r = exact ? Math.round(v * 100) / 100 : Math.round(v);
    var s = r % 1 ? r.toFixed(2).replace('.', ',') : String(r);
    return '€' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function show(v) { var n = nice(v); return fmt(n, Math.round(n * 100) % 100 !== 0); }
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
  return { mode: mode, set: set, gross: gross, nice: nice, fmt: fmt, show: show, render: render };
})();
