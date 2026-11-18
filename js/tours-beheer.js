/* ============================================================
   BURO SCOTT — 360°-TOURS BEHEER
   Tours aanmaken, panorama's uploaden, ruimtes benoemen,
   navigatiepijlen plaatsen en de startblik kiezen.
============================================================ */
const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const KEY = 'kz-admin';
const PANO_MAX = 6144;
const $ = (id) => document.getElementById(id);
const state = { token: null, tour: null, current: null, viewer: null, placing: false, dirty: false };

/* ---------- Hulpjes ---------- */
function show(v) {
  for (const x of ['te-login-view', 'te-list-view', 'te-edit-view', 'te-setup']) $(x).hidden = x !== v;
  $('te-logout').hidden = !['te-list-view', 'te-edit-view'].includes(v);
  window.scrollTo(0, 0);
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (ms) => new Date(ms).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
function rand(n) { const c = 'abcdefghjkmnpqrstuvwxyz23456789'; return Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => c[x % c.length]).join(''); }
function slug(s, max = 30) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, ''); }
const tourLink = (id) => location.href.replace(/tours-beheer\.html.*$/, 'tour.html') + '?id=' + encodeURIComponent(id);
const embedCode = (id) => `<iframe src="${tourLink(id)}" width="100%" height="560" style="border:0;border-radius:12px" allow="fullscreen; accelerometer; gyroscope" allowfullscreen loading="lazy" title="Virtuele tour"></iframe>`;
const fileUrl = (id, scene, kind) => `${API}/api/tourfile?id=${encodeURIComponent(id)}&s=${encodeURIComponent(scene)}${kind ? '&k=' + kind : ''}&v=${state.tour ? state.tour.updated : 0}`;
function status(msg) { $('te-status').textContent = msg; }
function markDirty() { state.dirty = true; status('Niet-opgeslagen wijzigingen. Klik op "Opslaan".'); }

async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}), ...(opts.headers || {}) } });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && path !== '/api/admin/login') { logout(); throw new Error('Je sessie is verlopen. Log opnieuw in.'); }
  if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
  return data;
}
function confirmBox(title, text) {
  const d = $('te-confirm');
  $('te-confirm-title').textContent = title; $('te-confirm-text').textContent = text;
  d.showModal();
  return new Promise((r) => d.addEventListener('close', () => r(d.returnValue === 'ok'), { once: true }));
}

/* ---------- Inloggen (gedeeld met de galerijen) ---------- */
function logout() { try { sessionStorage.removeItem(KEY); } catch (e) {} state.token = null; show('te-login-view'); }
$('te-logout').addEventListener('click', logout);
$('te-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('te-login-error'); err.hidden = true;
  try {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('te-password').value }) });
    state.token = r.token;
    try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch (e2) {}
    await openList();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

/* ---------- Overzicht ---------- */
async function openList() {
  show('te-list-view');
  const ul = $('te-list'); ul.innerHTML = '<li class="ad-empty">Laden…</li>';
  const r = await api('/api/admin/tours');
  ul.innerHTML = '';
  if (!r.tours.length) { ul.innerHTML = '<li class="ad-empty">Nog geen tours. Maak er hierboven een aan.</li>'; return; }
  for (const t of r.tours) {
    const li = document.createElement('li'); li.className = 'ad-item';
    li.innerHTML = `<button type="button" class="ad-item-main"><span class="ad-item-title">${esc(t.title)}</span><span class="ad-item-meta">${esc(t.id)} · ${t.scenes} ${t.scenes === 1 ? 'ruimte' : 'ruimtes'} · ${fmtDate(t.created)}</span></button><span class="ad-pill">Vaste link</span>`;
    li.querySelector('button').addEventListener('click', () => openTour(t.id));
    ul.appendChild(li);
  }
}
$('te-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('te-create-error'); err.hidden = true;
  const title = $('te-title').value.trim();
  try {
    const t = await api('/api/admin/tours', { method: 'POST', body: JSON.stringify({ title, id: `${slug(title) || 'tour'}-${rand(4)}` }) });
    $('te-title').value = '';
    await openTour(t.id);
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

/* ---------- Editor ---------- */
$('te-back').addEventListener('click', async () => {
  if (state.dirty && !(await confirmBox('Niet opgeslagen', 'Je wijzigingen gaan verloren als je nu teruggaat.'))) return;
  state.dirty = false; destroyViewer(); openList();
});
async function openTour(id) {
  show('te-edit-view');
  state.tour = await api('/api/admin/tours/' + encodeURIComponent(id));
  state.dirty = false; status('');
  $('te-id').textContent = state.tour.id;
  $('te-heading').textContent = state.tour.title;
  $('te-open').href = tourLink(state.tour.id);
  $('te-link').value = tourLink(state.tour.id);
  $('te-embed').value = embedCode(state.tour.id);
  renderScenes();
  if (state.tour.scenes.length) selectScene(state.tour.firstScene || state.tour.scenes[0].id);
  else { $('te-editor-card').hidden = true; destroyViewer(); }
}
document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  const input = $(b.dataset.copy);
  try { await navigator.clipboard.writeText(input.value); b.textContent = 'Gekopieerd ✓'; }
  catch (e) { input.select(); b.textContent = 'Ctrl+C'; }
  setTimeout(() => { b.textContent = 'Kopieer'; }, 2000);
}));

function renderScenes() {
  const t = state.tour;
  const ul = $('te-scenes'); ul.innerHTML = '';
  t.scenes.forEach((s) => {
    const li = document.createElement('li');
    li.className = 'te-scene' + (state.current === s.id ? ' is-on' : '');
    li.innerHTML = `
      <button type="button" class="te-scene-img" aria-label="Bewerk ${esc(s.title)}"><img src="${fileUrl(t.id, s.id, 'p')}" alt=""></button>
      <div class="te-scene-body">
        <label class="visually-hidden" for="sc-${s.id}">Naam van de ruimte</label>
        <input type="text" id="sc-${s.id}" value="${esc(s.title)}" maxlength="60">
        <div class="te-scene-meta">
          <label class="te-start"><input type="radio" name="te-first" ${t.firstScene === s.id ? 'checked' : ''}> Start hier</label>
          <span>${s.hotSpots.length} ${s.hotSpots.length === 1 ? 'pijl' : 'pijlen'}</span>
          <button type="button" class="te-del" aria-label="${esc(s.title)} verwijderen">Verwijder</button>
        </div>
      </div>`;
    li.querySelector('.te-scene-img').addEventListener('click', () => selectScene(s.id));
    li.querySelector('input[type=text]').addEventListener('input', (e) => { s.title = e.target.value; markDirty(); fillTargets(); if (state.current === s.id) $('te-cur').textContent = s.title; });
    li.querySelector('input[type=radio]').addEventListener('change', () => { t.firstScene = s.id; markDirty(); });
    li.querySelector('.te-del').addEventListener('click', async () => {
      if (!(await confirmBox('Ruimte verwijderen?', `"${s.title}" en alle pijlen ernaartoe worden verwijderd.`))) return;
      await api(`/api/admin/tours/${encodeURIComponent(t.id)}/scenes/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      t.scenes = t.scenes.filter((x) => x.id !== s.id);
      t.scenes.forEach((x) => { x.hotSpots = x.hotSpots.filter((h) => h.scene !== s.id); });
      if (t.firstScene === s.id) t.firstScene = t.scenes[0] ? t.scenes[0].id : '';
      await save('Ruimte verwijderd.');
      if (state.current === s.id) { state.current = null; if (t.scenes[0]) selectScene(t.scenes[0].id); else { $('te-editor-card').hidden = true; destroyViewer(); } }
    });
    ul.appendChild(li);
  });
}

function fillTargets() {
  const sel = $('te-target');
  const opts = state.tour.scenes.filter((s) => s.id !== state.current);
  sel.innerHTML = opts.map((s) => `<option value="${s.id}">Pijl naar: ${esc(s.title)}</option>`).join('');
  $('te-add').disabled = !opts.length;
}
function destroyViewer() { if (state.viewer) { try { state.viewer.destroy(); } catch (e) {} state.viewer = null; } }

function selectScene(id) {
  const s = state.tour.scenes.find((x) => x.id === id);
  if (!s) return;
  state.current = id; state.placing = false;
  $('te-editor-card').hidden = false;
  $('te-cur').textContent = s.title;
  $('te-add').textContent = '+ Pijl plaatsen';
  document.querySelectorAll('.te-scene').forEach((li, i) => li.classList.toggle('is-on', state.tour.scenes[i] && state.tour.scenes[i].id === id));
  fillTargets();
  destroyViewer();
  state.viewer = pannellum.viewer('te-pano', {
    type: 'equirectangular', panorama: fileUrl(state.tour.id, id), preview: fileUrl(state.tour.id, id, 'p'),
    autoLoad: true, showZoomCtrl: false, showFullscreenCtrl: true, compass: false, crossOrigin: 'anonymous',
    yaw: s.yaw || 0, pitch: s.pitch || 0, hfov: 100,
    hotSpots: s.hotSpots.map((h) => spotFor(h)),
  });
  renderHotspotList();
}
function spotFor(h) {
  const target = state.tour.scenes.find((x) => x.id === h.scene);
  return { pitch: h.pitch, yaw: h.yaw, cssClass: 'te-hs-wrap', createTooltipFunc: (div, label) => {
    div.classList.add('tr-hs');
    div.innerHTML = `<span class="tr-hs-ring"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></span><span class="tr-hs-label">${esc(label)}</span>`;
  }, createTooltipArgs: target ? target.title : '?' };
}
function renderHotspotList() {
  const s = state.tour.scenes.find((x) => x.id === state.current);
  const ul = $('te-hotspots'); ul.innerHTML = '';
  if (!s.hotSpots.length) { ul.innerHTML = '<li class="ad-empty">Nog geen pijlen in deze ruimte.</li>'; return; }
  s.hotSpots.forEach((h, i) => {
    const target = state.tour.scenes.find((x) => x.id === h.scene);
    const li = document.createElement('li');
    li.innerHTML = `<span>→ ${esc(target ? target.title : '?')}</span><button type="button" class="kz-pw-toggle">Bekijk</button><button type="button" class="kz-pw-toggle te-hs-del">Verwijder</button>`;
    li.children[1].addEventListener('click', () => state.viewer.lookAt(h.pitch, h.yaw, 100, 600));
    li.children[2].addEventListener('click', () => { s.hotSpots.splice(i, 1); markDirty(); selectScene(s.id); renderScenes(); });
    ul.appendChild(li);
  });
}
$('te-add').addEventListener('click', () => {
  state.placing = !state.placing;
  $('te-add').textContent = state.placing ? 'Klik nu in het panorama…' : '+ Pijl plaatsen';
  $('te-pano').classList.toggle('is-placing', state.placing);
});
$('te-pano').addEventListener('click', (e) => {
  if (!state.placing || !state.viewer) return;
  const [pitch, yaw] = state.viewer.mouseEventToCoords(e);
  const s = state.tour.scenes.find((x) => x.id === state.current);
  const h = { pitch: +pitch.toFixed(2), yaw: +yaw.toFixed(2), scene: $('te-target').value };
  s.hotSpots.push(h);
  state.viewer.addHotSpot(spotFor(h));
  state.placing = false; $('te-pano').classList.remove('is-placing'); $('te-add').textContent = '+ Pijl plaatsen';
  markDirty(); renderHotspotList(); renderScenes();
});
$('te-start').addEventListener('click', () => {
  const s = state.tour.scenes.find((x) => x.id === state.current);
  s.yaw = +state.viewer.getYaw().toFixed(2); s.pitch = +state.viewer.getPitch().toFixed(2);
  markDirty(); status('Startblik ingesteld voor ' + s.title + '. Vergeet niet op te slaan.');
});

async function save(msg) {
  const t = state.tour;
  state.tour = await api('/api/admin/tours/' + encodeURIComponent(t.id), { method: 'PUT', body: JSON.stringify({ title: t.title, firstScene: t.firstScene, scenes: t.scenes }) });
  state.dirty = false;
  status(msg || 'Opgeslagen ✓');
  renderScenes();
}
$('te-save').addEventListener('click', () => save().catch((e) => status(e.message)));
$('te-delete').addEventListener('click', async () => {
  if (!(await confirmBox('Tour verwijderen?', `"${state.tour.title}" wordt definitief verwijderd. De link werkt daarna niet meer.`))) return;
  await api('/api/admin/tours/' + encodeURIComponent(state.tour.id), { method: 'DELETE' });
  destroyViewer(); state.dirty = false; openList();
});

/* ---------- Panorama's uploaden ---------- */
const drop = $('te-drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
drop.addEventListener('drop', (e) => { e.preventDefault(); uploadPanos(Array.from(e.dataTransfer.files)); });
$('te-files').addEventListener('change', (e) => { uploadPanos(Array.from(e.target.files)); e.target.value = ''; });

async function resize(file, maxW, quality) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  return { blob, w: bmp.width, h: bmp.height };
}
function put(url, blob) {
  return fetch(url, { method: 'PUT', headers: { Authorization: 'Bearer ' + state.token, 'Content-Type': 'image/jpeg' }, body: blob })
    .then((r) => { if (!r.ok) throw new Error('Upload mislukt'); });
}
async function uploadPanos(files) {
  const t = state.tour; if (!t || !files.length) return;
  const list = $('te-progress');
  const taken = new Set(t.scenes.map((s) => s.id));
  for (const f of files) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="ad-p-name">${esc(f.name)}</span><span class="ad-p-bar"><span></span></span><span class="ad-p-state">Voorbereiden…</span>`;
    list.appendChild(li);
    const st = li.querySelector('.ad-p-state'), bar = li.querySelector('.ad-p-bar span');
    try {
      const big = await resize(f, PANO_MAX, 0.85);
      if (Math.abs(big.w / big.h - 2) > 0.05) throw new Error('Geen 360°-panorama (verhouding moet 2:1 zijn)');
      const prev = await resize(f, 1024, 0.75);
      const base = f.name.replace(/\.[^.]+$/, '');
      let id = slug(base, 34) || 'ruimte', n = 2;
      while (taken.has(id)) id = `${slug(base, 30) || 'ruimte'}-${n++}`;
      taken.add(id);
      bar.style.width = '30%'; st.textContent = 'Uploaden…';
      await put(`${API}/api/admin/tours/${encodeURIComponent(t.id)}/scenes/${id}`, big.blob);
      bar.style.width = '85%';
      await put(`${API}/api/admin/tours/${encodeURIComponent(t.id)}/scenes/${id}?k=p`, prev.blob);
      const pretty = base.replace(/[-_]+/g, ' ').trim();
      t.scenes.push({ id, title: pretty.charAt(0).toUpperCase() + pretty.slice(1), yaw: 0, pitch: 0, hotSpots: [] });
      if (!t.firstScene) t.firstScene = id;
      bar.style.width = '100%'; st.textContent = 'Klaar ✓'; li.classList.add('is-done');
    } catch (ex) { st.textContent = ex.message; li.classList.add('is-error'); }
  }
  await save('Ruimtes toegevoegd en opgeslagen ✓');
  if (!state.current && t.scenes[0]) selectScene(t.scenes[0].id);
}

/* ---------- Start ---------- */
(async function init() {
  if (!API) { show('te-setup'); return; }
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (s && s.expiresAt > Date.now()) { state.token = s.token; await openList(); return; }
  } catch (e) {}
  show('te-login-view');
})();
window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
