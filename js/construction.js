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
  var v = null;
  try { v = new URLSearchParams(window.location.search).get('voorbeeld'); } catch (e) {}

  // Op 3 manieren onthouden (localStorage, sessionStorage, cookie): sommige
  // gsm-browsers en ingebouwde app-browsers wissen er één van.
  function remember(on) {
    try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) {}
    try { on ? sessionStorage.setItem(KEY, '1') : sessionStorage.removeItem(KEY); } catch (e) {}
    try { document.cookie = KEY + '=' + (on ? '1; max-age=31536000' : '; max-age=0') + '; path=/; SameSite=Lax'; } catch (e) {}
  }
  function remembered() {
    try { if (localStorage.getItem(KEY) === '1') return true; } catch (e) {}
    try { if (sessionStorage.getItem(KEY) === '1') return true; } catch (e) {}
    try { if (document.cookie.indexOf(KEY + '=1') !== -1) return true; } catch (e) {}
    return false;
  }
  if (v === CODE) remember(true);
  if (v === 'uit') remember(false);
  preview = v === CODE || (v !== 'uit' && remembered());

  root.classList.add(preview ? 'is-preview' : 'is-construction');

  document.addEventListener('DOMContentLoaded', function () {
    if (preview) {
      // Zet de voorbeeldcode op elke interne link, zodat ook een browser die
      // niets onthoudt op elke pagina de volledige site toont.
      Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
        var href = a.getAttribute('href');
        if (!href || /^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) return;
        if (!/\.html(\?|#|$)/.test(href) || /[?&]voorbeeld=/.test(href)) return;
        var hash = '';
        var i = href.indexOf('#');
        if (i !== -1) { hash = href.slice(i); href = href.slice(0, i); }
        a.setAttribute('href', href + (href.indexOf('?') === -1 ? '?' : '&') + 'voorbeeld=' + CODE + hash);
      });
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
