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
  var NAMES = { foto: "foto's", drone: "dronefoto's" };

  // Alles in het keuzeblok hoort niet los in de mail: het overzicht vat het samen
  qa('.o-choice input, .o-choice select').forEach(function (el) { el.setAttribute('data-mail-skip', ''); });

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

  /* ---------- Keuze: pakket / zelf / advies ---------- */
  function syncPanels() {
    var mode = val('keuze');
    ['pakket', 'zelf', 'advies'].forEach(function (m) {
      var p = $('o-panel-' + m), on = m === mode;
      p.hidden = !on;
      p.querySelectorAll('input,select').forEach(function (i) {
        if (!on) i.disabled = true;
        else i.disabled = !!(i.closest('.o-not-lot') && isLot()) || (i.name === 'pakket' && isLot() && i.value !== 'Basic');
      });
    });
    // extra's die al in het gekozen pakket zitten, verbergen
    var P = PK[val('pakket')];
    qa('.o-need-drone').forEach(function (el) { el.hidden = !!(P && P.drone); el.querySelector('select').disabled = !!(P && P.drone) || mode !== 'pakket'; });
    qa('.o-need-tour').forEach(function (el) { var hide = !!(P && P.tour) || isLot(); el.hidden = hide; el.querySelector('input').disabled = hide || mode !== 'pakket'; });
    qa('.o-need-plan').forEach(function (el) { var hide = !!(P && P.plan) || isLot(); el.hidden = hide; el.querySelector('input').disabled = hide || mode !== 'pakket'; });
    update();
  }
  qa('[name="keuze"], [name="pakket"]').forEach(function (r) { r.addEventListener('change', syncPanels); });
  qa('#o-panel-pakket select, #o-panel-pakket input[type=checkbox], #o-panel-zelf select, #o-panel-zelf input, #o-verdiepingen, #o-oppervlakte, #o-perceel')
    .forEach(function (el) { el.addEventListener('input', update); el.addEventListener('change', update); });

  /* ---------- Berekening ---------- */
  function floors() { return Math.min(8, Math.max(1, num('o-verdiepingen') || 1)); }
  function planCost(n) { return n * PR.plan; }
  function fotoCost(n) { return n ? PR.foto[n] : 0; }
  function customLines(c) {
    var L = [];
    if (c.foto) L.push([c.foto + " foto's", fotoCost(c.foto)]);
    if (c.drone) L.push([c.drone + " dronefoto's", PR.drone[c.drone]]);
    if (c.tour) L.push(['360° tour (3 maanden online)', PR.tour]);
    if (c.plan) L.push(['2D-plattegrond, ' + c.floors + (c.floors === 1 ? ' verdieping' : ' verdiepingen'), planCost(c.floors)]);
    if (c.spoed) L.push(['Spoedlevering (24 u)', PR.spoed]);
    return L;
  }
  function packageLines(key, x) {
    var P = PK[key], L = [[P.label, P.price]];
    if (x.extraFoto) L.push(['+' + x.extraFoto + " extra foto's", x.extraFoto / 10 * PR.fotoExtra10]);
    if (!P.drone && x.drone) L.push([x.drone + " dronefoto's", PR.drone[x.drone]]);
    if (!P.tour && x.tour) L.push(['360° tour (3 maanden online)', PR.tour]);
    if (P.plan && !x.lot && x.floors > P.plan) L.push(['Plattegrond: ' + (x.floors - P.plan) + ' extra verdieping' + (x.floors - P.plan > 1 ? 'en' : ''), planCost(x.floors - P.plan)]);
    if (!P.plan && x.plan) L.push(['2D-plattegrond, ' + x.floors + (x.floors === 1 ? ' verdieping' : ' verdiepingen'), planCost(x.floors)]);
    if (x.spoed) L.push(['Spoedlevering (24 u)', PR.spoed]);
    return L;
  }
  var sum = function (L) { return L.reduce(function (s, l) { return s + l[1]; }, 0); };
  // zoals de klant het ziet: elke regel afgerond, totaal = som van die regels
  var rg = function (v) { var g = BSPrice.gross(v); return v % 1 ? Math.round(g * 100) / 100 : Math.round(g); };
  var dsum = function (L) { return L.reduce(function (s, l) { return s + rg(l[1]); }, 0); };
  var money = function (v) { return BSPrice.fmt(v, v % 1 !== 0); };

  // Welk pakket dekt de eigen keuze, en wat kost het dan?
  function packageFor(c) {
    var best = null;
    Object.keys(PK).forEach(function (k) {
      var P = PK[k];
      if (c.lot && k !== 'Basic') return;
      if (P.foto < c.foto || P.drone < c.drone || (c.tour && !P.tour)) return;
      var L = packageLines(k, { floors: c.floors, plan: c.plan && !P.plan, spoed: c.spoed, lot: c.lot });
      if (P.plan && !c.plan) L = L.filter(function (l) { return l[0].indexOf('extra verdieping') < 0; });
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
    var lot = isLot(), fl = floors();
    var L = [], tip = '';
    $('o-tip').hidden = true;
    if (mode === 'pakket' && val('pakket')) {
      L = packageLines(val('pakket'), {
        extraFoto: +$('o-p-foto').value, drone: $('o-p-drone').disabled ? 0 : +$('o-p-drone').value,
        tour: !$('o-p-tour').disabled && $('o-p-tour').checked, plan: !$('o-p-plan').disabled && $('o-p-plan').checked,
        spoed: $('o-p-spoed').checked, floors: fl, lot: lot,
      });
    } else if (mode === 'zelf') {
      var c = { foto: +$('o-z-foto').value, drone: +$('o-z-drone').value, tour: !lot && $('o-z-tour').checked, plan: !lot && $('o-z-plan').checked, spoed: $('o-z-spoed').checked, floors: fl, lot: lot };
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
          $('o-tip').dataset.plan = c.plan ? '1' : ''; $('o-tip').dataset.spoed = c.spoed ? '1' : '';
        }
      }
    }
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
    var ex = function (v) { return BSPrice.fmt(v, v % 1 !== 0); };
    var incTotal = L.reduce(function (s, l) { return s + (l[1] % 1 ? Math.round(l[1] * (1 + PR.vat) * 100) / 100 : Math.round(l[1] * (1 + PR.vat))); }, 0);
    var lines = [];
    if (mode === 'advies') lines.push('Keuze: twijfelt nog, wil advies');
    else if (L.length) {
      lines.push('Keuze: ' + (mode === 'pakket' ? 'pakket' : 'zelf samengesteld'));
      L.forEach(function (l) { lines.push('- ' + l[0] + ': ' + ex(l[1]) + ' excl. btw'); });
      lines.push('Totaal vanaf: ' + ex(total) + ' excl. btw / ' + money(incTotal) + ' incl. btw');
      if (tip) lines.push('Getoonde tip: ' + $('o-tip').textContent.replace(/Neem .*→/, '').trim());
      if (big.length) lines.push('Let op: ' + big.join(' en '));
    }
    $('o-samenvatting').value = lines.join('\n');
    $('o-samenvatting').disabled = !lines.length;
  }

  $('o-tip').addEventListener('click', function (e) {
    var b = e.target.closest('[data-take]'); if (!b) return;
    var plan = this.dataset.plan, spoed = this.dataset.spoed;
    q('[name="keuze"][value="pakket"]').checked = true;
    q('[name="pakket"][value="' + b.dataset.take + '"]').checked = true;
    syncPanels();
    $('o-p-spoed').checked = !!spoed;
    if (!$('o-p-plan').disabled) $('o-p-plan').checked = !!plan;
    update();
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
    var bad = mode === 'zelf' && !(+$('o-z-foto').value || +$('o-z-drone').value || $('o-z-tour').checked || $('o-z-plan').checked);
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
    q('[name="keuze"][value="zelf"]').checked = true;
    if (dienst === 'fotografie') $('o-z-foto').value = '20';
    if (dienst === 'drone') $('o-z-drone').value = '5';
    if (dienst === '360-tours') $('o-z-tour').checked = true;
    if (dienst === 'plannen') $('o-z-plan').checked = true;
  }
  syncKlant(); syncType(); syncDate();
})();
