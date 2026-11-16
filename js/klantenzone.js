/* ============================================================
   BURO SCOTT — KLANTENZONE (klantkant)
   Inloggen met galerijcode + wachtwoord, beelden bekijken per soort,
   groot openen en downloaden (per stuk of alles als .zip).
============================================================ */
import { downloadZip } from './vendor/client-zip.js';

const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const KEY = 'kz-session';
const CAT_LABEL = { fotos: "Foto's", drone: 'Drone', plannen: 'Plannen', overig: 'Overig' };
const $ = (id) => document.getElementById(id);

const state = { token: null, code: null, gallery: null, filter: 'alle', visible: [], index: 0 };

document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- Sessie ---------- */
function saveSession(s) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
function loadSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return s && s.expiresAt > Date.now() ? s : null;
  } catch (e) { return null; }
}
function clearSession() { try { sessionStorage.removeItem(KEY); } catch (e) {} }

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}), ...(opts.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) { const err = new Error(data.error || 'Er ging iets mis. Probeer het opnieuw.'); err.status = res.status; throw err; }
  return data;
}
const fileUrl = (f, kind, download) =>
  `${API}/api/file?g=${encodeURIComponent(state.code)}&n=${encodeURIComponent(f.name)}&k=${kind}&t=${encodeURIComponent(state.token)}${download ? '&download=1' : ''}`;

/* ---------- Weergave ---------- */
function show(view) {
  $('kz-login-view').hidden = view !== 'login';
  $('kz-gallery-view').hidden = view !== 'gallery';
  $('kz-setup').hidden = view !== 'setup';
  $('kz-logout').hidden = view !== 'gallery';
}

function fmtBytes(b) {
  if (b > 1024 ** 3) return (b / 1024 ** 3).toFixed(1).replace('.', ',') + ' GB';
  if (b > 1024 ** 2) return Math.round(b / 1024 ** 2) + ' MB';
  return Math.max(1, Math.round(b / 1024)) + ' kB';
}
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
}
const isImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name);

/* ---------- Inloggen ---------- */
$('kz-pw-toggle').addEventListener('click', (e) => {
  const input = $('kz-password');
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  e.currentTarget.textContent = showing ? 'Toon' : 'Verberg';
  e.currentTarget.setAttribute('aria-pressed', String(!showing));
});

$('kz-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('kz-code').value.trim().toLowerCase();
  const password = $('kz-password').value;
  const err = $('kz-login-error');
  err.hidden = true;
  if (!code || !password) {
    err.textContent = 'Vul zowel de galerijcode als het wachtwoord in.';
    err.hidden = false;
    (!code ? $('kz-code') : $('kz-password')).focus();
    return;
  }
  const btn = $('kz-login-btn');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  btn.querySelector('span').textContent = 'Even geduld…';
  try {
    const r = await api('/api/login', { method: 'POST', body: JSON.stringify({ code, password }) });
    state.token = r.token; state.code = code;
    saveSession({ token: r.token, code, expiresAt: r.expiresAt });
    await openGallery();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
    $('kz-password').focus();
  } finally {
    btn.disabled = false; btn.removeAttribute('aria-busy');
    btn.querySelector('span').textContent = 'Bekijk mijn beelden';
  }
});

$('kz-logout').addEventListener('click', () => {
  clearSession();
  state.token = state.code = state.gallery = null;
  $('kz-password').value = '';
  show('login');
  $('kz-code').focus();
});

/* ---------- Galerij ---------- */
async function openGallery() {
  try {
    state.gallery = await api('/api/gallery');
  } catch (ex) {
    if (ex.status === 401) { clearSession(); show('login'); return; }
    throw ex;
  }
  const g = state.gallery;
  const order = Object.keys(CAT_LABEL);
  g.files.sort((a, b) => (order.indexOf(a.cat) - order.indexOf(b.cat)) || a.name.localeCompare(b.name, 'nl', { numeric: true }));
  document.title = `${g.title} — Buro Scott`;
  $('kz-title').textContent = g.title;
  $('kz-subtitle').textContent = g.subtitle || '';
  $('kz-subtitle').hidden = !g.subtitle;
  const total = g.files.reduce((s, f) => s + f.size, 0);
  $('kz-meta').textContent = `${g.files.length} ${g.files.length === 1 ? 'bestand' : 'bestanden'} · ${fmtBytes(total)} · beschikbaar tot ${fmtDate(g.expires)}`;
  const tour = $('kz-tour');
  tour.hidden = !g.tourUrl;
  if (g.tourUrl) tour.href = g.tourUrl;
  $('kz-zip').disabled = g.files.length === 0;
  renderTabs();
  renderGrid();
  show('gallery');
  $('kz-title').setAttribute('tabindex', '-1');
  $('kz-title').focus({ preventScroll: true });
}

function renderTabs() {
  const counts = {};
  state.gallery.files.forEach((f) => { counts[f.cat] = (counts[f.cat] || 0) + 1; });
  const cats = Object.keys(CAT_LABEL).filter((c) => counts[c]);
  const tabs = $('kz-tabs');
  tabs.hidden = cats.length < 2;
  tabs.innerHTML = '';
  [['alle', 'Alles', state.gallery.files.length], ...cats.map((c) => [c, CAT_LABEL[c], counts[c]])].forEach(([key, label, n]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kz-tab';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(state.filter === key));
    b.innerHTML = `${label} <span>${n}</span>`;
    b.addEventListener('click', () => { state.filter = key; renderTabs(); renderGrid(); });
    tabs.appendChild(b);
  });
}

function renderGrid() {
  const grid = $('kz-grid');
  const files = state.gallery.files.filter((f) => state.filter === 'alle' || f.cat === state.filter);
  state.visible = files;
  grid.innerHTML = '';
  if (!files.length) {
    grid.innerHTML = '<li class="kz-empty">Er staan nog geen beelden in deze galerij. We laten het weten zodra ze klaarstaan.</li>';
    return;
  }
  files.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'kz-item';
    li.style.setProperty('--d', `${Math.min(i, 12) * 40}ms`);
    if (isImage(f) && f.preview) {
      const ratio = f.w && f.h ? `${f.w} / ${f.h}` : '3 / 2';
      li.innerHTML = `
        <button type="button" class="kz-thumb" style="aspect-ratio:${ratio}" aria-label="${escapeHtml(f.name)} groot bekijken">
          <img src="${fileUrl(f, 'p')}" alt="" loading="lazy" decoding="async">
        </button>
        <a class="kz-dl" href="${fileUrl(f, 'o', true)}" aria-label="${escapeHtml(f.name)} downloaden">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14"/></svg>
        </a>`;
      li.querySelector('.kz-thumb').addEventListener('click', () => openLightbox(i));
      const img = li.querySelector('img');
      img.addEventListener('load', () => li.classList.add('is-loaded'));
    } else {
      const ext = (f.name.split('.').pop() || '').toUpperCase().slice(0, 4);
      li.innerHTML = `
        <a class="kz-file" href="${fileUrl(f, 'o', true)}">
          <span class="kz-file-ext">${escapeHtml(ext)}</span>
          <span class="kz-file-name">${escapeHtml(f.name)}</span>
          <span class="kz-file-size">${fmtBytes(f.size)} · downloaden</span>
        </a>`;
      li.classList.add('is-loaded');
    }
    grid.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Groot bekijken ---------- */
const lb = $('kz-lightbox');
function viewable() { return state.visible.filter((f) => isImage(f) && f.preview); }
function openLightbox(visibleIndex) {
  const list = viewable();
  const f = state.visible[visibleIndex];
  state.index = Math.max(0, list.indexOf(f));
  updateLightbox();
  lb.showModal();
}
function updateLightbox() {
  const list = viewable();
  const f = list[state.index];
  if (!f) return;
  const img = $('kz-lb-img');
  img.classList.remove('is-in');
  img.onload = () => img.classList.add('is-in');
  img.src = fileUrl(f, 'p');
  img.alt = f.name;
  $('kz-lb-name').textContent = f.name;
  $('kz-lb-count').textContent = `${state.index + 1} / ${list.length}`;
  $('kz-lb-download').href = fileUrl(f, 'o', true);
  $('kz-lb-prev').disabled = list.length < 2;
  $('kz-lb-next').disabled = list.length < 2;
  // Volgende beeld alvast laden
  const next = list[(state.index + 1) % list.length];
  if (next) { const pre = new Image(); pre.src = fileUrl(next, 'p'); }
}
function step(d) {
  const n = viewable().length;
  state.index = (state.index + d + n) % n;
  updateLightbox();
}
$('kz-lb-prev').addEventListener('click', () => step(-1));
$('kz-lb-next').addEventListener('click', () => step(1));
$('kz-lb-close').addEventListener('click', () => lb.close());
lb.addEventListener('click', (e) => { if (e.target === lb || e.target.classList.contains('kz-lb-stage')) lb.close(); });
lb.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});
// Vegen op touchscreens
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
  const btn = $('kz-zip');
  const status = $('kz-zip-status');
  const files = state.gallery.files;
  if (!files.length) return;
  const zipName = `${state.code}.zip`;
  btn.disabled = true;
  let done = 0;
  status.textContent = `Zip wordt voorbereid…`;
  async function* entries() {
    for (const f of files) {
      const res = await fetch(fileUrl(f, 'o'));
      if (!res.ok) throw new Error(`Kon ${f.name} niet ophalen.`);
      yield { name: `${CAT_LABEL[f.cat] || 'Overig'}/${f.name}`, input: res, lastModified: new Date(f.uploaded || Date.now()) };
      done++;
      status.textContent = `Bezig: ${done} van ${files.length} bestanden…`;
    }
  }
  try {
    const zip = downloadZip(entries());
    if ('showSaveFilePicker' in window) {
      // Chrome/Edge: rechtstreeks naar schijf schrijven, ook bij grote galerijen
      let handle;
      try {
        handle = await window.showSaveFilePicker({ suggestedName: zipName, types: [{ description: 'Zip-bestand', accept: { 'application/zip': ['.zip'] } }] });
      } catch (e) { status.textContent = ''; btn.disabled = false; return; }
      await zip.body.pipeTo(await handle.createWritable());
    } else {
      const blob = await zip.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = zipName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    status.textContent = `Klaar. ${files.length} bestanden staan in ${zipName}.`;
  } catch (ex) {
    status.textContent = `Downloaden is niet gelukt (${ex.message}). Probeer het opnieuw of download de beelden apart.`;
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Start ---------- */
(async function init() {
  if (!API) { show('setup'); return; }
  const params = new URLSearchParams(location.search);
  const g = params.get('g');
  if (g) $('kz-code').value = g;
  const s = loadSession();
  if (s && (!g || g === s.code)) {
    state.token = s.token; state.code = s.code;
    try { await openGallery(); return; } catch (e) { clearSession(); }
  }
  show('login');
  (g ? $('kz-password') : $('kz-code')).focus();
})();
