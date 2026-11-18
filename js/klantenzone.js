/* ============================================================
   BURO SCOTT — KLANTENZONE (klantkant, Picflow-stijl)
   Inloggen met galerijcode + wachtwoord, omslagfoto, secties per
   soort in een "justified" raster, schermvullende viewer met
   miniaturen, downloaden per beeld of alles als .zip.
============================================================ */
import { downloadZip } from './vendor/client-zip.js';

const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const KEY = 'kz-session';
const CAT_LABEL = { fotos: "Foto's", drone: 'Drone', plannen: 'Plannen', overig: 'Overig' };
const ORDER = Object.keys(CAT_LABEL);
const GAP = 6;
const $ = (id) => document.getElementById(id);
const state = { token: null, code: null, gallery: null, viewable: [], index: 0, admin: false };

$('year').textContent = new Date().getFullYear();

/* ---------- Sessie & API ---------- */
function saveSession(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
function loadSession() { try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return s && s.expiresAt > Date.now() ? s : null; } catch (e) { return null; } }
function clearSession() { try { sessionStorage.removeItem(KEY); } catch (e) {} }
async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}), ...(opts.headers || {}) } });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) { const err = new Error(data.error || 'Er ging iets mis. Probeer het opnieuw.'); err.status = res.status; throw err; }
  return data;
}
const fileUrl = (f, kind, download) =>
  `${API}/api/file?g=${encodeURIComponent(state.code)}&n=${encodeURIComponent(f.name)}&k=${kind}&t=${encodeURIComponent(state.token)}${download ? '&download=1' : ''}`;

/* ---------- Hulpjes ---------- */
function show(view) {
  $('kz-login-view').hidden = view !== 'login';
  $('kz-gallery-view').hidden = view !== 'gallery';
  $('kz-setup').hidden = view !== 'setup';
  $('kz-logout').hidden = true;
  document.body.classList.toggle('is-gallery', view === 'gallery');
}
function fmtBytes(b) {
  if (b > 1024 ** 3) return (b / 1024 ** 3).toFixed(1).replace('.', ',') + ' GB';
  if (b > 1024 ** 2) return Math.round(b / 1024 ** 2) + ' MB';
  return Math.max(1, Math.round(b / 1024)) + ' kB';
}
const fmtDate = (ms) => new Date(ms).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14"/></svg>';

/* ---------- Inloggen ---------- */
$('kz-pw-toggle').addEventListener('click', (e) => {
  const input = $('kz-password'); const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  e.currentTarget.textContent = showing ? 'Toon' : 'Verberg';
  e.currentTarget.setAttribute('aria-pressed', String(!showing));
});
$('kz-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('kz-code').value.trim().toLowerCase();
  const password = $('kz-password').value;
  const err = $('kz-login-error'); err.hidden = true;
  if (!code || !password) { err.textContent = 'Vul zowel de galerijcode als het wachtwoord in.'; err.hidden = false; (!code ? $('kz-code') : $('kz-password')).focus(); return; }
  const btn = $('kz-login-btn'); btn.disabled = true; btn.querySelector('span').textContent = 'Even geduld…';
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ code, password }) });
    state.token = r.token; state.code = code;
    saveSession({ token: r.token, code, expiresAt: r.expiresAt });
    await openGallery();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; $('kz-password').focus(); }
  finally { btn.disabled = false; btn.querySelector('span').textContent = 'Bekijk mijn beelden'; }
});
function logout() {
  clearSession(); state.token = state.code = state.gallery = null;
  $('kz-password').value = ''; show('login'); window.scrollTo(0, 0); $('kz-code').focus();
}
$('kz-logout').addEventListener('click', logout);
$('kz-logout-2').addEventListener('click', logout);

/* ---------- Galerij ---------- */
async function openGallery() {
  try { state.gallery = await api('/api/gallery' + (state.admin ? '?g=' + encodeURIComponent(state.code) : '')); }
  catch (ex) { if (ex.status === 401) { clearSession(); show('login'); return; } throw ex; }
  const g = state.gallery;
  g.files.sort((a, b) => (ORDER.indexOf(a.cat) - ORDER.indexOf(b.cat)) || a.name.localeCompare(b.name, 'nl', { numeric: true }));
  document.title = `${g.title} — Buro Scott`;
  $('kz-title').textContent = g.title;
  $('pf-bar-name').textContent = g.title;
  $('kz-subtitle').textContent = g.subtitle || '';
  $('kz-subtitle').hidden = !g.subtitle;
  $('pf-date').textContent = `Beelden · ${fmtDate(g.created)}`;
  const total = g.files.reduce((s, f) => s + f.size, 0);
  $('kz-meta').textContent = `${g.files.length} ${g.files.length === 1 ? 'bestand' : 'bestanden'} · ${fmtBytes(total)} · beschikbaar tot ${fmtDate(g.expires)}`;
  const tour = $('kz-tour'); tour.hidden = !g.tourUrl; if (g.tourUrl) tour.href = g.tourUrl;
  $('kz-zip').disabled = g.files.length === 0;

  // Omslag: gekozen omslagfoto, anders de eerste foto
  const imgs = g.files.filter((f) => isImage(f) && f.preview);
  const cover = imgs.find((f) => f.name === g.cover) || imgs.find((f) => f.cat === 'fotos') || imgs[0];
  const coverEl = $('pf-cover');
  if (cover) { $('pf-cover-img').src = fileUrl(cover, 'p'); coverEl.classList.remove('is-plain'); }
  else coverEl.classList.add('is-plain');

  state.viewable = imgs;
  show('gallery');
  renderSections();
  requestAnimationFrame(layout);
  window.scrollTo(0, 0);
  $('kz-title').setAttribute('tabindex', '-1'); $('kz-title').focus({ preventScroll: true });
}

function renderSections() {
  const g = state.gallery;
  const wrap = $('kz-grid'); wrap.innerHTML = '';
  const tabs = $('kz-tabs'); tabs.innerHTML = '';
  if (!g.files.length) { wrap.innerHTML = '<p class="kz-empty">Er staan nog geen beelden in deze galerij. We laten het weten zodra ze klaarstaan.</p>'; tabs.hidden = true; return; }
  const cats = ORDER.filter((c) => g.files.some((f) => f.cat === c));
  tabs.hidden = cats.length < 2;
  cats.forEach((c) => {
    const files = g.files.filter((f) => f.cat === c);
    const a = document.createElement('a');
    a.href = `#pf-${c}`; a.className = 'pf-tab'; a.innerHTML = `${CAT_LABEL[c]} <span>${files.length}</span>`;
    tabs.appendChild(a);
    const sec = document.createElement('section');
    sec.className = 'pf-section'; sec.id = `pf-${c}`;
    sec.innerHTML = `<header class="pf-section-head"><h2>${CAT_LABEL[c]}</h2><span>${files.length}</span></header><div class="pf-grid"></div>`;
    const grid = sec.querySelector('.pf-grid');
    files.forEach((f) => grid.appendChild(tile(f)));
    wrap.appendChild(sec);
  });
  layout();
  observeTabs(cats);
}

function tile(f) {
  const el = document.createElement('div');
  el.className = 'pf-item';
  if (isImage(f) && f.preview) {
    el.dataset.ratio = f.w && f.h ? f.w / f.h : 1.5;
    el.innerHTML = `
      <button type="button" class="pf-thumb" aria-label="${esc(f.name)} groot bekijken"><img src="${fileUrl(f, 'p')}" alt="" loading="lazy" decoding="async"></button>
      <a class="pf-dl" href="${fileUrl(f, 'o', true)}" aria-label="${esc(f.name)} downloaden">${DL_ICON}</a>`;
    el.querySelector('.pf-thumb').addEventListener('click', () => openLightbox(state.viewable.indexOf(f)));
    const img = el.querySelector('img');
    img.addEventListener('load', () => el.classList.add('is-loaded'));
  } else {
    el.dataset.ratio = 1.2;
    const ext = (f.name.split('.').pop() || '').toUpperCase().slice(0, 4);
    el.classList.add('is-file', 'is-loaded');
    el.innerHTML = `<a class="pf-file" href="${fileUrl(f, 'o', true)}"><span class="pf-file-ext">${esc(ext)}</span><span class="pf-file-name">${esc(f.name)}</span><span class="pf-file-size">${fmtBytes(f.size)} · ${DL_ICON} downloaden</span></a>`;
  }
  return el;
}

// "Justified" raster: elke rij even hoog, elke foto in zijn eigen verhouding
function layout() {
  const target = window.innerWidth < 640 ? 170 : window.innerWidth < 1100 ? 250 : 320;
  document.querySelectorAll('.pf-grid').forEach((grid) => {
    const W = grid.clientWidth;
    const items = Array.from(grid.children);
    let row = [], sum = 0, prevH = target;
    const flush = (last) => {
      if (!row.length) return;
      const gaps = GAP * (row.length - 1);
      let h = (W - gaps) / sum;
      if (last && h > prevH) h = prevH;
      prevH = h;
      row.forEach((el) => { const r = +el.dataset.ratio; el.style.width = `${Math.floor(r * h)}px`; el.style.height = `${Math.round(h)}px`; });
      row = []; sum = 0;
    };
    items.forEach((el) => {
      row.push(el); sum += +el.dataset.ratio;
      if (sum * target + GAP * (row.length - 1) >= W) flush(false);
    });
    flush(true);
  });
}
let resizeT;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(layout, 120); });

// Actieve sectie oplichten in de balk
function observeTabs(cats) {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      document.querySelectorAll('.pf-tab').forEach((t) => t.classList.toggle('is-on', t.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  cats.forEach((c) => io.observe($(`pf-${c}`)));
}
// Balk krijgt een schaduw zodra de omslag voorbij is
window.addEventListener('scroll', () => {
  const bar = $('pf-bar'); if (!bar) return;
  bar.classList.toggle('is-stuck', bar.getBoundingClientRect().top <= 0.5);
}, { passive: true });

/* ---------- Groot bekijken ---------- */
const lb = $('kz-lightbox');
function openLightbox(i) {
  state.index = Math.max(0, i);
  buildStrip();
  updateLightbox();
  lb.showModal();
}
function buildStrip() {
  const strip = $('pf-strip'); strip.innerHTML = '';
  state.viewable.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pf-strip-item'; b.setAttribute('aria-label', `Beeld ${i + 1}`);
    b.innerHTML = `<img src="${fileUrl(f, 'p')}" alt="" loading="lazy">`;
    b.addEventListener('click', () => { state.index = i; updateLightbox(); });
    strip.appendChild(b);
  });
}
function updateLightbox() {
  const f = state.viewable[state.index]; if (!f) return;
  const img = $('kz-lb-img');
  img.classList.remove('is-in');
  img.onload = () => img.classList.add('is-in');
  img.src = fileUrl(f, 'p'); img.alt = f.name;
  $('kz-lb-name').textContent = `${CAT_LABEL[f.cat] || ''} · ${f.name}`;
  $('kz-lb-count').textContent = `${state.index + 1} / ${state.viewable.length}`;
  $('kz-lb-download').href = fileUrl(f, 'o', true);
  const many = state.viewable.length > 1;
  $('kz-lb-prev').disabled = !many; $('kz-lb-next').disabled = !many;
  Array.from($('pf-strip').children).forEach((b, i) => {
    b.classList.toggle('is-on', i === state.index);
    if (i === state.index) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });
  const next = state.viewable[(state.index + 1) % state.viewable.length];
  if (next) { const pre = new Image(); pre.src = fileUrl(next, 'p'); }
}
function step(d) { const n = state.viewable.length; state.index = (state.index + d + n) % n; updateLightbox(); }
$('kz-lb-prev').addEventListener('click', () => step(-1));
$('kz-lb-next').addEventListener('click', () => step(1));
$('kz-lb-close').addEventListener('click', () => lb.close());
lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('kz-lb-stage')) lb.close(); });
lb.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); });
let touchX = null;
lb.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
  touchX = null;
});

/* ---------- Alles downloaden als .zip ---------- */
$('kz-zip').addEventListener('click', async () => {
  const btn = $('kz-zip'); const status = $('kz-zip-status');
  const files = state.gallery.files; if (!files.length) return;
  const zipName = `${state.code}.zip`;
  btn.disabled = true; let done = 0;
  status.textContent = 'Zip wordt voorbereid…';
  async function* entries() {
    for (const f of files) {
      const res = await fetch(fileUrl(f, 'o'));
      if (!res.ok) throw new Error(`Kon ${f.name} niet ophalen.`);
      yield { name: `${CAT_LABEL[f.cat] || 'Overig'}/${f.name}`, input: res, lastModified: new Date(f.uploaded || Date.now()) };
      done++; status.textContent = `Bezig: ${done} van ${files.length} bestanden…`;
    }
  }
  try {
    const zip = downloadZip(entries());
    if ('showSaveFilePicker' in window) {
      let handle;
      try { handle = await window.showSaveFilePicker({ suggestedName: zipName, types: [{ description: 'Zip-bestand', accept: { 'application/zip': ['.zip'] } }] }); }
      catch (e) { status.textContent = ''; btn.disabled = false; return; }
      await zip.body.pipeTo(await handle.createWritable());
    } else {
      const blob = await zip.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = zipName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    status.textContent = `Klaar. ${files.length} bestanden staan in ${zipName}.`;
    if (!state.admin) api('/api/activity', { method: 'POST', body: JSON.stringify({ type: 'zip', n: files.length }) }).catch(() => {});
  } catch (ex) { status.textContent = `Downloaden is niet gelukt (${ex.message}). Probeer opnieuw of download de beelden apart.`; }
  finally { btn.disabled = false; }
});

/* ---------- Start ---------- */
(async function init() {
  if (!API) { show('setup'); return; }
  const g = new URLSearchParams(location.search).get('g');
  if (g) $('kz-code').value = g;
  // Ingelogde beheerder: meteen bekijken, zonder wachtwoord
  const adm = window.AdminSession && AdminSession.get();
  if (g && adm && new URLSearchParams(location.search).get('beheer')) {
    state.token = adm.token; state.code = g.toLowerCase(); state.admin = true;
    try {
      await openGallery();
      $('pf-adminbar').hidden = false;
      $('kz-logout-2').hidden = true;
      $('pf-adminbar-back').href = 'klantenzone-beheer.html?g=' + encodeURIComponent(state.code);
      return;
    } catch (e) { state.admin = false; state.token = null; }
  }
  const s = loadSession();
  if (s && (!g || g === s.code)) {
    state.token = s.token; state.code = s.code;
    try { await openGallery(); return; } catch (e) { clearSession(); }
  }
  show('login');
  (g ? $('kz-password') : $('kz-code')).focus();
})();
