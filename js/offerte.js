/* ============================================================
   BURO SCOTT — OFFERTE: pakket of zelf samenstellen
   Rekent een richtprijs uit en stelt een pakket voor als dat
   voor de klant goedkoper is. Prijzen komen uit js/prijzen.js.
============================================================ */
(function () {
  var form = document.getElementById('offerte-form');
  if (!form || !window.BS_PRICES) return;
  var PR = window.BS_PRICES, PK = PR.packages;
  var $ = function (id) { return document.getElementById(id); };
  var q = function (sel) { return form.querySelector(sel); };
  var qa = function (sel) { return Array.prototype.slice.call(form.querySelectorAll(sel)); };
  var val = function (name) { var el = q('[name="' + name + '"]:checked'); return el ? el.value : ''; };
  var num = function (id) { var v = parseInt($(id).value, 10); return isFinite(v) ? v : 0; };
  var show = function (v) { return BSPrice.show(v); };

  // Alles in het keuzeblok hoort niet los in de mail: het overzicht vat het samen
  qa('.o-choice input, .o-choice select').forEach(function (el) { el.setAttribute('data-mail-skip', ''); });

  /* ---------- Pakketkaartjes: inhoud en info-knop ---------- */
  function packItems(P) {
    var L = [P.foto + " professionele foto's, binnen en buiten"];
    if (P.drone) L.push(P.drone + " dronefoto's van pand, tuin en omgeving");
    if (P.tour) L.push('Volledige 360° tour (tot ' + PR.tourPts + ' punten), 3 maanden online');
    if (P.plan) L.push('2D-plattegrond, tot ' + P.plan + (P.plan === 1 ? ' verdieping' : ' verdiepingen'));
    L.push('Lichtbewerking en rechte lijnen');
    if (P.voorrang) L.push('Voorrang bij de planning');
    L.push('Levering binnen 48 uur');
    return L;
  }
  qa('.o-pack').forEach(function (card) {
    var P = PK[card.dataset.pack];
    var bits = [P.foto + " foto's"];
    if (P.drone) bits.push(P.drone + ' drone');
    if (P.tour) bits.push('360° tour');
    if (P.plan) bits.push('plan tot ' + P.plan + ' verd.');
    card.querySelector('.o-pack-sum').textContent = bits.join(' · ');
    card.querySelector('.o-pack-info').innerHTML = packItems(P).map(function (t) { return '<li>' + t + '</li>'; }).join('');
    var btn = card.querySelector('.o-info');
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      card.querySelector('.o-pack-info').hidden = !open;
    });
  });

  /* ---------- Particulier / professioneel ---------- */
  function syncKlant() {
    var pro = val('klant') === 'Professioneel';
    $('o-pro').hidden = !pro;
    $('o-bedrijf').required = pro;
    $('o-bedrijf').disabled = !pro; $('o-btw').disabled = !pro;
    if (BSPrice.mode() !== (pro ? 'pro' : 'part')) BSPrice.set(pro ? 'pro' : 'part');
    update();
  }
  (function () {
    var r = q('[name="klant"][value="' + (BSPrice.mode() === 'pro' ? 'Professioneel' : 'Particulier') + '"]');
    if (r) r.checked = true;
  })();
  qa('[name="klant"]').forEach(function (r) { r.addEventListener('change', syncKlant); });
  document.addEventListener('bs-price-mode', function () { update(); });

  /* ---------- Grond / perceel ---------- */
  function isLot() { return $('o-type').value === 'Grond / perceel'; }
  function syncType() {
    var lot = isLot();
    qa('.o-not-lot').forEach(function (el) {
      el.hidden = lot;
      el.querySelectorAll('input,select').forEach(function (i) { i.disabled = lot; if (lot && i.type === 'checkbox') i.checked = false; });
      if (el.matches('input,select')) el.disabled = lot;
    });
    ['Signature', 'Prestige'].forEach(function (k) {
      var r = q('[name="pakket"][value="' + k + '"]');
      r.disabled = lot; r.closest('.o-pack').classList.toggle('is-off', lot);
      if (lot && r.checked) r.checked = false;
    });
    $('o-lot-note').hidden = !lot;
    syncPanels();
  }
  $('o-type').addEventListener('change', syncType);
  // Bij een appartement telt het aantal bouwlagen van het appartement zelf, niet de verdieping waarop het ligt
  var flLabel = q('label[for="o-verdiepingen"]'), flOrig = flLabel.innerHTML;
  $('o-type').addEventListener('change', function () {
    var apt = $('o-type').value === 'Appartement';
    flLabel.innerHTML = apt ? 'Aantal bouwlagen van het appartement <span class="hint">(meestal 1; duplex = 2)</span>' : flOrig;
    if (apt && num('o-verdiepingen') > 2) $('o-verdiepingen').value = 1;
    update();
  });

  /* ---------- Keuze: pakket / zelf / advies ---------- */
  function setVis(el, on) { el.hidden = !on; el.querySelectorAll('input,select,button').forEach(function (i) { i.disabled = !on; }); if (el.matches('input,select')) el.disabled = !on; }
  var pendingDienst = null;
  function syncPanels() {
    var mode = val('keuze'), lot = isLot();
    if (mode === 'zelf' && pendingDienst) { applyDienst(pendingDienst); pendingDienst = null; }
    ['pakket', 'zelf', 'advies'].forEach(function (m) {
      var p = $('o-panel-' + m), on = m === mode;
      p.hidden = !on;
      p.querySelectorAll('input,select,button').forEach(function (i) {
        if (!on) i.disabled = true;
        else i.disabled = !!(i.closest('.o-not-lot') && lot) || (i.name === 'pakket' && lot && i.value !== 'Basic');
      });
    });
    $('o-wait').hidden = !!mode;
    $('o-stage').classList.toggle('is-on', !!mode);
    var mc = mode && q('[name="keuze"][value="' + mode + '"]').closest('.o-mode');
    if (mc) { var sb = $('o-stage').getBoundingClientRect(), mb = mc.getBoundingClientRect(); $('o-stage').style.setProperty('--arrow-x', (mb.left + mb.width / 2 - sb.left) + 'px'); }
    var P = PK[val('pakket')], inP = mode === 'pakket', inZ = mode === 'zelf';
    if (inP) {
      q('label[for="o-p-drone"]').textContent = P && P.drone ? "Extra dronefoto's" : "Dronefoto's";
      setVis(q('.o-need-tour'), !lot && !(P && P.tour));
      setVis(q('.o-p-pts'), !lot && !!P && (P.tour || $('o-p-tour').checked));
      setVis(q('.o-need-plan'), !lot && !(P && P.plan));
      setVis(q('.o-p-fl'), !lot && !!P && (P.plan || $('o-p-plan').checked));
      q('label[for="o-p-fl"]').textContent = 'Verdiepingen op het plan' + (P && P.plan ? ' (' + P.plan + ' inbegrepen)' : '');
      q('#o-panel-pakket .o-pts-tip').hidden = !(!lot && P && (P.tour || $('o-p-tour').checked));
    }
    if (inZ) {
      setVis(q('.o-z-pts'), !lot && $('o-z-tour').checked);
      setVis(q('.o-z-fl'), !lot && $('o-z-plan').checked);
      q('#o-panel-zelf .o-pts-tip').hidden = !(!lot && $('o-z-tour').checked);
    }
    update();
  }
  qa('[name="keuze"]').forEach(function (r) { r.setAttribute('autocomplete', 'off'); });
  qa('[name="keuze"], [name="pakket"], #o-p-tour, #o-p-plan, #o-z-tour, #o-z-plan').forEach(function (r) { r.addEventListener('change', syncPanels); });
  qa('#o-panel-pakket select, #o-panel-pakket input, #o-panel-zelf select, #o-panel-zelf input, #o-verdiepingen, #o-oppervlakte, #o-perceel')
    .forEach(function (el) { el.addEventListener('input', update); el.addEventListener('change', update); });

  /* ---------- Aantallen: −/+ knoppen en minimums ---------- */
  var MINS = { 'o-z-foto': PR.fotoMin, 'o-z-drone': PR.droneMin };
  function clampNum(inp) {
    var v = parseInt(inp.value, 10); if (!isFinite(v) || v < 0) v = 0;
    var mx = +inp.max || 999; if (v > mx) v = mx;
    var mn = MINS[inp.id]; if (mn && v > 0 && v < mn) v = mn;
    inp.value = v;
  }
  form.addEventListener('click', function (e) {
    var b = e.target.closest('.o-num [data-step]'); if (!b) return;
    var inp = b.parentNode.querySelector('input'), st = +b.dataset.step, v = parseInt(inp.value, 10) || 0, mn = MINS[inp.id];
    if (mn && st > 0 && v < mn) v = mn; else if (mn && st < 0 && v <= mn) v = 0; else v += st;
    inp.value = v; clampNum(inp);
    if (inp.id === 'o-p-fl' || inp.id === 'o-z-fl') inp.dataset.touched = '1';
    update();
  });
  qa('.o-num input').forEach(function (inp) {
    inp.addEventListener('change', function () { clampNum(inp); if (inp.id === 'o-p-fl' || inp.id === 'o-z-fl') inp.dataset.touched = '1'; update(); });
  });
  // verdiepingen op het plan volgen het aantal verdiepingen van het pand (tot je ze zelf aanpast)
  $('o-verdiepingen').addEventListener('input', function () {
    ['o-p-fl', 'o-z-fl'].forEach(function (id) { if (!$(id).dataset.touched) $(id).value = Math.min(8, Math.max(1, num('o-verdiepingen') || 1)); });
    update();
  });

  /* ---------- Verplaatsing (schatting via postcode) ---------- */
  function distance() {
    var z = ($('o-postcode').value || '').trim();
    var pc = form.dataset.lat ? [+form.dataset.lat, +form.dataset.lng] : (/^[1-9][0-9]{3}$/.test(z) && window.BS_POSTCODES && BS_POSTCODES[z]);
    if (!pc) return null;
    var R = 6371, rad = Math.PI / 180, a = PR.base;
    var dLat = (pc[0] - a[0]) * rad, dLng = (pc[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * rad) * Math.cos(pc[0] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(h)) * PR.roadFactor);
  }
  function travelLine() {
    var km = distance();
    if (km == null || km <= PR.kmFree) return null;
    return ['Verplaatsing ± ' + km + ' km (heen en terug)', Math.round(2 * km * PR.kmRate)];
  }

  /* ---------- Postcode ↔ gemeente ---------- */
  var PCS = window.BS_POSTCODES || {};
  var byName = {};
  Object.keys(PCS).forEach(function (z) {
    PCS[z][2].split('|').forEach(function (n) { var k = n.toLowerCase(); (byName[k] = byName[k] || { name: n, zips: [] }).zips.push(z); });
  });
  (function () {
    var names = Object.keys(byName).sort().map(function (k) { return byName[k]; });
    $('o-gemeenten').innerHTML = names.map(function (o) { return '<option value="' + o.name + '">' + o.zips.slice(0, 3).join(', ') + '</option>'; }).join('');
  })();
  $('o-postcode').addEventListener('input', function () {
    var el = $('o-postcode');
    el.value = el.value.replace(/\D/g, '').slice(0, 4);
    delete form.dataset.lat; delete form.dataset.lng;
    var hit = PCS[el.value];
    if (hit) {
      var names = hit[2].split('|'), cur = $('o-gemeente').value.trim().toLowerCase();
      if (!names.some(function (n) { return n.toLowerCase() === cur; })) $('o-gemeente').value = names[0];
    }
    update();
  });
  $('o-gemeente').addEventListener('input', function () {
    delete form.dataset.lat; delete form.dataset.lng;
    var hit = byName[$('o-gemeente').value.trim().toLowerCase()];
    if (hit && hit.zips.indexOf($('o-postcode').value) < 0) $('o-postcode').value = hit.zips[0];
    update();
  });

  /* ---------- Adresvoorstellen (Vlaamse adresdienst, Geopunt) ---------- */
  var GEO = 'https://geo.api.vlaanderen.be/geolocation/v4/';
  var acList = $('o-adres-list'), acInput = $('o-adres'), acTimer = null, acItems = [], acActive = -1, acSeq = 0;
  function acClose() { acList.hidden = true; acInput.setAttribute('aria-expanded', 'false'); acInput.removeAttribute('aria-activedescendant'); acActive = -1; }
  function acRender() {
    if (!acItems.length) { acClose(); return; }
    acList.innerHTML = acItems.map(function (t, i) { return '<li role="option" id="o-ac-' + i + '"' + (i === acActive ? ' aria-selected="true"' : '') + ' data-i="' + i + '">' + t.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</li>'; }).join('');
    acList.hidden = false; acInput.setAttribute('aria-expanded', 'true');
    if (acActive >= 0) acInput.setAttribute('aria-activedescendant', 'o-ac-' + acActive);
  }
  function acSearch() {
    var qv = acInput.value.trim();
    if (qv.length < 4 || !/[a-zA-Z]{3}/.test(qv)) { acItems = []; acClose(); return; }
    var extra = $('o-gemeente').value.trim() && qv.toLowerCase().indexOf($('o-gemeente').value.trim().toLowerCase()) < 0 ? ' ' + $('o-gemeente').value.trim() : '';
    var seq = ++acSeq;
    fetch(GEO + 'Suggestion?c=6&q=' + encodeURIComponent(qv + extra))
      .then(function (r) { return r.ok ? r.json() : { SuggestionResult: [] }; })
      .then(function (d) { if (seq !== acSeq) return; acItems = (d.SuggestionResult || []).slice(0, 6); acActive = -1; acRender(); })
      .catch(function () { acItems = []; acClose(); });
  }
  function acPick(i) {
    var text = acItems[i]; if (!text) return;
    var cut = text.lastIndexOf(', ');
    acInput.value = cut > 0 ? text.slice(0, cut) : text;
    var muni = cut > 0 ? text.slice(cut + 2) : '';
    acClose();
    if (muni) {
      $('o-gemeente').value = muni;
      var hit = byName[muni.toLowerCase()];
      if (hit) $('o-postcode').value = hit.zips[0];
    }
    update();
    // exacte postcode en ligging opvragen
    fetch(GEO + 'Location?c=1&q=' + encodeURIComponent(text))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var L = d && d.LocationResult && d.LocationResult[0];
        if (!L) return;
        if (L.Zipcode) $('o-postcode').value = L.Zipcode;
        if (L.Municipality) $('o-gemeente').value = L.Municipality;
        if (L.Location && L.Location.Lat_WGS84) { form.dataset.lat = L.Location.Lat_WGS84; form.dataset.lng = L.Location.Lon_WGS84; }
        update();
      }).catch(function () {});
  }
  acInput.addEventListener('input', function () { clearTimeout(acTimer); acTimer = setTimeout(acSearch, 250); });
  acInput.addEventListener('keydown', function (e) {
    if (acList.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); acActive = (acActive + (e.key === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length; acRender(); }
    else if (e.key === 'Enter' && acActive >= 0) { e.preventDefault(); acPick(acActive); }
    else if (e.key === 'Escape') acClose();
  });
  acList.addEventListener('mousedown', function (e) { var li = e.target.closest('li'); if (li) { e.preventDefault(); acPick(+li.dataset.i); } });
  acInput.addEventListener('blur', function () { setTimeout(acClose, 150); });

  /* ---------- Berekening ---------- */
  function fl(id) { return Math.min(8, Math.max(1, num(id) || 1)); }
  function verd(n) { return n + (n === 1 ? ' verdieping' : ' verdiepingen'); }
  function tourLine(pts, base) { return ['360° tour, ' + (pts <= PR.tourPts ? 'tot ' + PR.tourPts : pts) + ' punten', (base ? PR.tour : 0) + PR.tourExtra(pts)]; }
  function customLines(c) {
    var L = [];
    if (c.foto) L.push([c.foto + " foto's", PR.fotoCost(c.foto)]);
    if (c.drone) L.push([c.drone + " dronefoto's", PR.droneCost(c.drone)]);
    if (c.tour) L.push(tourLine(c.pts, true));
    if (c.plan) L.push(['2D-plattegrond, ' + verd(c.fl), c.fl * PR.plan]);
    if (c.spoed) L.push(['Spoedlevering (24 u)', PR.spoed]);
    return L;
  }
  function packageLines(key, x) {
    var P = PK[key], L = [[P.label, P.price]];
    if (x.extraFoto) L.push(['+' + x.extraFoto + " extra foto's", x.extraFoto * PR.fotoPer]);
    if (x.drone) L.push(P.drone ? ['+' + x.drone + " extra dronefoto's", x.drone * PR.dronePer] : [x.drone + " dronefoto's", PR.droneCost(x.drone)]);
    if (P.tour && PR.tourExtra(x.pts) > 0) L.push(['360° tour: ' + x.pts + ' punten (meer dan ' + PR.tourPts + ')', PR.tourExtra(x.pts)]);
    if (!P.tour && x.tour) L.push(tourLine(x.pts, true));
    if (P.plan && !x.lot && x.planFl > P.plan) L.push(['Plattegrond: ' + (x.planFl - P.plan) + ' extra ' + (x.planFl - P.plan > 1 ? 'verdiepingen' : 'verdieping'), (x.planFl - P.plan) * PR.plan]);
    if (!P.plan && x.plan) L.push(['2D-plattegrond, ' + verd(x.planFl), x.planFl * PR.plan]);
    if (x.spoed) L.push(['Spoedlevering (24 u)', PR.spoed]);
    return L;
  }
  var sum = function (L) { return L.reduce(function (s, l) { return s + l[1]; }, 0); };
  // zoals de klant het ziet: elke regel afgerond, totaal = som van die regels
  var rg = function (v) { var g = BSPrice.gross(v); return v % 1 ? Math.round(g * 100) / 100 : Math.round(g); };
  var dsum = function (L) { return L.reduce(function (s, l) { return s + rg(l[1]); }, 0); };
  var money = function (v) { return BSPrice.fmt(v, Math.round(v * 100) % 100 !== 0); };

  // Welk pakket dekt de eigen keuze, en wat kost het dan?
  function packageFor(c) {
    var best = null;
    Object.keys(PK).forEach(function (k) {
      var P = PK[k];
      if (c.lot && k !== 'Basic') return;
      if (P.foto < c.foto || P.drone < c.drone || (c.tour && !P.tour)) return;
      var L = packageLines(k, { pts: c.tour ? c.pts : PR.tourPts, plan: c.plan && !P.plan, planFl: c.plan ? c.fl : P.plan, spoed: c.spoed, lot: c.lot });
      var price = dsum(L), more = [];
      if (P.foto > c.foto) more.push((P.foto - c.foto) + " foto's extra");
      if (P.drone > c.drone) more.push((P.drone - c.drone) + " dronefoto's extra");
      if (P.tour && !c.tour) more.push('een 360° tour');
      if (P.plan && !c.plan) more.push('een plattegrond');
      if (!best || price < best.price) best = { key: k, price: price, more: more };
    });
    return best;
  }

  function update() {
    var mode = val('keuze');
    var lot = isLot();
    var L = [], tip = '';
    $('o-tip').hidden = true;
    if (mode === 'pakket' && val('pakket')) {
      L = packageLines(val('pakket'), {
        extraFoto: num('o-p-foto'), drone: num('o-p-drone'),
        tour: !$('o-p-tour').disabled && $('o-p-tour').checked, pts: +$('o-p-pts').value || PR.tourPts,
        plan: !$('o-p-plan').disabled && $('o-p-plan').checked, planFl: fl('o-p-fl'),
        spoed: $('o-p-spoed').checked, lot: lot,
      });
    } else if (mode === 'zelf') {
      var c = { foto: num('o-z-foto') ? Math.max(PR.fotoMin, num('o-z-foto')) : 0, drone: num('o-z-drone') ? Math.max(PR.droneMin, num('o-z-drone')) : 0,
        tour: !lot && $('o-z-tour').checked, pts: +$('o-z-pts').value || PR.tourPts, plan: !lot && $('o-z-plan').checked, fl: fl('o-z-fl'), spoed: $('o-z-spoed').checked, lot: lot };
      L = customLines(c);
      if (L.length && (c.foto || c.drone || c.tour || c.plan)) {
        var own = dsum(L), best = packageFor(c);
        if (best && best.price < own) {
          tip = '<b>Tip: kies ' + PK[best.key].label + '.</b> Je betaalt ' + money(own - best.price) + ' minder' + (best.more.length ? ' en krijgt er ' + best.more.join(', ') + ' bij' : '') + '.';
        } else if (best && best.price === own && best.more.length) {
          tip = '<b>Zelfde prijs als ' + PK[best.key].label + '</b>, maar daar krijg je ' + best.more.join(', ') + ' bij.';
        } else if (best && best.price - own <= 100 && best.more.length) {
          tip = 'Voor ' + money(best.price - own) + ' meer krijg je <b>' + PK[best.key].label + '</b>: ' + best.more.join(', ') + '.';
        }
        if (tip) {
          $('o-tip').innerHTML = tip + ' <button type="button" class="o-tip-btn" data-take="' + best.key + '">Neem ' + PK[best.key].label + ' →</button>';
          $('o-tip').hidden = false;
          $('o-tip').dataset.plan = c.plan ? String(c.fl) : ''; $('o-tip').dataset.spoed = c.spoed ? '1' : ''; $('o-tip').dataset.pts = c.tour ? String(c.pts) : '';
        }
      }
    }
    // verplaatsing komt bij elke keuze bovenop (niet in de pakketvergelijking)
    var tl = L.length ? travelLine() : null;
    if (tl) L.push(tl);
    var km = distance();
    var pcTyped = /^[1-9][0-9]{3}$/.test(($('o-postcode').value || '').trim());
    $('o-fine').textContent = 'Vanafprijs. Je krijgt altijd eerst een offerte op maat. ' + (km == null && pcTyped
      ? 'Deze postcode kennen we niet: controleer ze even. De verplaatsing staat in je offerte.'
      : km == null
      ? 'Verplaatsing: tot ' + PR.kmFree + ' km van Waregem gratis, daarna ' + money(rg(PR.kmRate)) + '/km heen en terug.'
      : km <= PR.kmFree ? 'Verplaatsing gratis (binnen ' + PR.kmFree + ' km van Waregem).' : 'Afstand geschat vanaf Waregem; de juiste afstand staat in je offerte.');
    // prijzen op de pakketkaartjes
    qa('[data-pk]').forEach(function (el) { el.textContent = 'vanaf ' + show(PK[el.dataset.pk].price); });

    var total = sum(L);
    $('o-summary').hidden = !L.length;
    $('o-lines').innerHTML = L.map(function (l) { return '<li><span>' + l[0] + '</span><span>' + money(rg(l[1])) + '</span></li>'; }).join('');
    $('o-total').textContent = 'vanaf ' + money(dsum(L));
    var big = [];
    if (!lot && num('o-oppervlakte') > PR.bigHouse) big.push('een woning groter dan ' + PR.bigHouse + ' m²');
    if (num('o-perceel') > PR.bigLot) big.push('een perceel groter dan ' + PR.bigLot.toLocaleString('nl-BE') + ' m²');
    $('o-big').hidden = !big.length;
    $('o-big').textContent = big.length ? 'Voor ' + big.join(' en ') + ' kan de prijs hoger uitvallen. Je ziet dat vooraf in je offerte.' : '';
    BSPrice.render($('o-summary'));

    // overzicht voor de mail (excl. én incl. btw)
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    var exTotal = L.reduce(function (s, l) { return s + r2(l[1]); }, 0);
    var incTotal = L.reduce(function (s, l) { return s + r2(l[1] * (1 + PR.vat)); }, 0);
    var lines = [];
    if (mode === 'advies') lines.push('Keuze: twijfelt nog, wil advies');
    else if (L.length) {
      lines.push('Keuze: ' + (mode === 'pakket' ? 'pakket' : 'zelf samengesteld'));
      L.forEach(function (l) { lines.push('- ' + l[0] + ': ' + money(r2(l[1])) + ' excl. btw'); });
      lines.push('Totaal vanaf: ' + money(r2(exTotal)) + ' excl. btw / ' + money(r2(incTotal)) + ' incl. btw');
      if (tip) lines.push('Getoonde tip: ' + $('o-tip').textContent.replace(/Neem .*→/, '').trim());
      if (big.length) lines.push('Let op: ' + big.join(' en '));
    }
    $('o-samenvatting').value = lines.join('\n');
    $('o-samenvatting').disabled = !lines.length;
  }

  $('o-tip').addEventListener('click', function (e) {
    var b = e.target.closest('[data-take]'); if (!b) return;
    var d = this.dataset, P = PK[b.dataset.take];
    q('[name="keuze"][value="pakket"]').checked = true;
    q('[name="pakket"][value="' + b.dataset.take + '"]').checked = true;
    $('o-p-spoed').checked = !!d.spoed;
    $('o-p-plan').checked = !!d.plan && !P.plan;
    if (d.plan) { $('o-p-fl').value = d.plan; $('o-p-fl').dataset.touched = '1'; }
    if (d.pts) $('o-p-pts').value = d.pts;
    $('o-p-foto').value = 0; $('o-p-drone').value = 0;
    syncPanels();
    $('o-panel-pakket').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  /* ---------- Timing ---------- */
  function syncDate() {
    var on = $('o-snelheid').value === 'Op een specifieke datum';
    $('o-datum-field').hidden = !on;
    $('o-datum').disabled = !on; $('o-datum').required = on;
    var t = new Date(); t.setDate(t.getDate() + 1);
    $('o-datum').min = t.toISOString().slice(0, 10);
  }
  $('o-snelheid').addEventListener('change', syncDate);

  /* ---------- Extra controle bij verzenden ---------- */
  form.bsValidate = function () {
    var mode = val('keuze');
    var box = $('o-panel-zelf').querySelector('.o-opts');
    var err = box.querySelector('.field-error') || box.appendChild(Object.assign(document.createElement('p'), { className: 'field-error o-err', id: 'o-zelf-error' }));
    var bad = mode === 'zelf' && !(num('o-z-foto') || num('o-z-drone') || $('o-z-tour').checked || $('o-z-plan').checked);
    err.textContent = bad ? 'Kies minstens één dienst (spoedlevering alleen kan niet).' : '';
    err.hidden = !bad;
    box.classList.toggle('is-invalid', bad);
    return bad ? $('o-z-foto') : null;
  };

  /* ---------- Voorinvullen vanuit een knop elders op de site ---------- */
  var params = new URLSearchParams(location.search);
  var pk = params.get('pakket'), dienst = params.get('dienst');
  if (pk && PK[pk]) {
    q('[name="keuze"][value="pakket"]').checked = true;
    q('[name="pakket"][value="' + pk + '"]').checked = true;
  } else if (dienst) {
    // de klant kiest zelf eerst hoe hij bestelt; kiest hij "zelf samenstellen", dan staat deze dienst al aangeduid
    pendingDienst = dienst;
  }
  function applyDienst(d) {
    if (d === 'fotografie' && !num('o-z-foto')) $('o-z-foto').value = PR.fotoMin;
    if (d === 'drone' && !num('o-z-drone')) $('o-z-drone').value = PR.droneMin;
    if (d === '360-tours') $('o-z-tour').checked = true;
    if (d === 'plannen') $('o-z-plan').checked = true;
  }
  syncKlant(); syncType(); syncDate();
})();
