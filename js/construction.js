/* ============================================================
   WEBSITE IN OPBOUW
   Bezoekers zien een "in opbouw"-scherm. Jij ziet de volledige site via:
     https://<jouw-site>/?voorbeeld=buroscott   → voorbeeldmodus aan (onthouden op dit toestel)
     https://<jouw-site>/?voorbeeld=uit         → voorbeeldmodus uit
   Klaar om echt live te gaan? Zet LIVE hieronder op true.
   Let op: dit is geen beveiliging. Wie de code leest, vindt de link.
============================================================ */
(function () {
  var LIVE = false;
  var CODE = 'buroscott';
  var KEY = 'buroscott-voorbeeld';
  if (LIVE) return;

  var root = document.documentElement;
  var preview = false;
  try {
    var params = new URLSearchParams(window.location.search);
    var v = params.get('voorbeeld');
    if (v === CODE) localStorage.setItem(KEY, '1');
    if (v === 'uit') localStorage.removeItem(KEY);
    if (v !== null) {
      params.delete('voorbeeld');
      var q = params.toString();
      history.replaceState(null, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
    }
    preview = localStorage.getItem(KEY) === '1';
  } catch (e) {
    preview = /[?&]voorbeeld=buroscott\b/.test(window.location.search);
  }

  root.classList.add(preview ? 'is-preview' : 'is-construction');

  document.addEventListener('DOMContentLoaded', function () {
    if (preview) {
      var bar = document.createElement('div');
      bar.className = 'preview-bar';
      bar.innerHTML = '<span><b>Voorbeeldmodus</b> · bezoekers zien "Website in opbouw"</span>' +
        '<a href="?voorbeeld=uit">Afsluiten</a>';
      document.body.appendChild(bar);
      return;
    }
    var year = new Date().getFullYear();
    var el = document.createElement('div');
    el.className = 'construction';
    el.setAttribute('role', 'main');
    el.innerHTML =
      '<div class="construction-inner">' +
        '<p class="construction-eyebrow">Vastgoedmedia · Vlaanderen</p>' +
        '<h1 class="construction-title">Buro Scott<span class="brand-dot">.</span></h1>' +
        '<p class="construction-status"><span class="construction-pulse" aria-hidden="true"></span>Website in opbouw</p>' +
        '<p class="construction-text">Binnenkort vind je hier vastgoedfotografie, drone-opnames, 360° tours en plannen voor makelaars en projectontwikkelaars.</p>' +
        '<ul class="construction-services" aria-label="Diensten">' +
          '<li>Fotografie</li><li>Drone</li><li>360° tours</li><li>Plannen</li>' +
        '</ul>' +
      '</div>' +
      '<p class="construction-foot">© ' + year + ' Buro Scott</p>';
    document.body.insertBefore(el, document.body.firstChild);
  });
})();
