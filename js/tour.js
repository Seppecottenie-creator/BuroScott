/* ============================================================
   BURO SCOTT — 360°-TOUR (openbare viewer)
   tour.html?id=<tourcode>   ·   werkt ook ingesloten via <iframe>
============================================================ */
(function () {
  var API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
  var id = new URLSearchParams(location.search).get('id') || '';
  var $ = function (i) { return document.getElementById(i); };
  var viewer = null;
  var tour = null;

  function file(sceneId, kind) {
    return API + '/api/tourfile?id=' + encodeURIComponent(id) + '&s=' + encodeURIComponent(sceneId) + (kind ? '&k=' + kind : '');
  }
  function fail(msg) {
    $('tr-loading').classList.add('is-error');
    $('tr-loading-text').textContent = msg;
  }
  function done() {
    $('tr-loading').classList.add('is-done');
    setTimeout(function () { $('tr-hint').classList.add('is-gone'); }, 6000);
  }

  // Navigatiepunt: rond, met pijl en de naam van de volgende ruimte
  function hotspot(div, label) {
    div.classList.add('tr-hs');
    var ring = document.createElement('span');
    ring.className = 'tr-hs-ring';
    ring.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    var tip = document.createElement('span');
    tip.className = 'tr-hs-label';
    tip.textContent = label;
    div.appendChild(ring);
    div.appendChild(tip);
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', 'Ga naar ' + label);
  }

  function buildScenes() {
    var nav = $('tr-scenes');
    nav.innerHTML = '';
    if (tour.scenes.length < 2) { nav.hidden = true; return; }
    tour.scenes.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tr-scene';
      b.dataset.scene = s.id;
      b.innerHTML = '<img src="' + file(s.id, 'p') + '" alt="" loading="lazy"><span>' + escapeHtml(s.title) + '</span>';
      b.addEventListener('click', function () { if (viewer.getScene() !== s.id) viewer.loadScene(s.id); });
      nav.appendChild(b);
    });
  }
  function markScene(sceneId) {
    Array.prototype.forEach.call(document.querySelectorAll('.tr-scene'), function (b) {
      var on = b.dataset.scene === sceneId;
      b.classList.toggle('is-on', on);
      if (on) { b.setAttribute('aria-current', 'true'); b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }
      else b.removeAttribute('aria-current');
    });
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function start() {
    var titles = {};
    tour.scenes.forEach(function (s) { titles[s.id] = s.title; });
    var scenes = {};
    tour.scenes.forEach(function (s) {
      scenes[s.id] = {
        title: s.title,
        type: 'equirectangular',
        panorama: file(s.id),
        preview: file(s.id, 'p'),
        yaw: s.yaw || 0,
        pitch: s.pitch || 0,
        hfov: window.innerWidth < 700 ? 100 : 110,
        hotSpots: (s.hotSpots || []).map(function (h) {
          return { pitch: h.pitch, yaw: h.yaw, type: 'scene', sceneId: h.scene, createTooltipFunc: hotspot, createTooltipArgs: titles[h.scene] || 'Volgende ruimte' };
        }),
      };
    });
    viewer = pannellum.viewer('pano', {
      default: {
        firstScene: tour.firstScene || tour.scenes[0].id,
        sceneFadeDuration: 900,
        autoLoad: true,
        showControls: false,
        showZoomCtrl: false,
        showFullscreenCtrl: false,
        compass: false,
        mouseZoom: true,
        crossOrigin: 'anonymous',
        strings: { loadingLabel: 'Laden…', loadButtonLabel: 'Klik om te laden' },
      },
      scenes: scenes,
    });
    window.buroTourViewer = viewer;
    viewer.on('load', function () { done(); markScene(viewer.getScene()); });
    viewer.on('scenechange', function (sid) { markScene(sid); });
    viewer.on('error', function () { fail('Deze ruimte kon niet geladen worden. Probeer de pagina te verversen.'); });
    buildScenes();
  }

  // Bediening
  $('tr-full').addEventListener('click', function () {
    var el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
  });
  $('tr-rotate').addEventListener('click', function (e) {
    if (!viewer) return;
    var on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (on) viewer.startAutoRotate(-3); else viewer.stopAutoRotate();
  });

  if (!API || !id) { fail(!id ? 'Er ontbreekt een tourcode in de link.' : 'De tourdienst is nog niet gekoppeld.'); return; }
  fetch(API + '/api/tour?id=' + encodeURIComponent(id))
    .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Tour niet gevonden.'); return d; }); })
    .then(function (d) {
      tour = d;
      if (!tour.scenes || !tour.scenes.length) throw new Error('Deze tour heeft nog geen ruimtes.');
      document.title = tour.title + ' — virtuele tour — Buro Scott';
      $('tr-title').textContent = tour.title;
      start();
    })
    .catch(function (e) { fail(e.message); });
})();
