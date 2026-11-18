/* ============================================================
   BURO SCOTT — KLANTENZONE BEHEER
   Galerijen aanmaken, beelden uploaden (met automatische
   voorbeeldversie), bericht voor de klant kopiëren, opruimen.
============================================================ */
const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const KEY = 'kz-admin';
const CAT_LABEL = { fotos: "Foto's", drone: 'Drone', plannen: 'Plannen', overig: 'Overig' };
const PREVIEW_MAX = 1600;
const $ = (id) => document.getElementById(id);
const state = { token: null, current: null };

/* ---------- Hulpjes ---------- */
function show(view) {
  document.body.classList.toggle('is-library', view === 'ad-list-view');
  for (const v of ['ad-login-view', 'ad-list-view', 'ad-detail-view', 'ad-setup']) $(v).hidden = v !== view;
  $('ad-logout').hidden = !['ad-list-view', 'ad-detail-view'].includes(view);
  window.scrollTo(0, 0);
}
function fmtBytes(b) {
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2).replace('.', ',') + ' GB';
  if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(1).replace('.', ',') + ' MB';
  return Math.max(1, Math.round(b / 1024)) + ' kB';
}
const fmtDate = (ms) => new Date(ms).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function rand(n, chars = 'abcdefghjkmnpqrstuvwxyz23456789') {
  const v = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(v, (x) => chars[x % chars.length]).join('');
}
const newPassword = () => `${rand(4)}-${rand(4)}-${rand(4)}`;
function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '');
}
const newCode = (title) => `${slug(title) || 'galerij'}-${rand(4)}`;
function clientLink(code) {
  const base = location.href.replace(/klantenzone-beheer\.html.*$/, 'klantenzone.html');
  return `${base}?g=${encodeURIComponent(code)}`;
}
function cleanName(name, taken) {
  const dot = name.lastIndexOf('.');
  let base = (dot > 0 ? name.slice(0, dot) : name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'bestand';
  const ext = dot > 0 ? '.' + name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) : '';
  let out = base + ext, i = 2;
  while (taken.has(out)) out = `${base}-${i++}${ext}`;
  taken.add(out);
  return out;
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}), ...(opts.headers || {}) },
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && path !== '/api/admin/login') { logout(); throw new Error('Je sessie is verlopen. Log opnieuw in.'); }
  if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
  return data;
}
function confirmBox(title, text, okLabel = 'Verwijderen') {
  const d = $('ad-confirm');
  $('ad-confirm-title').textContent = title;
  $('ad-confirm-text').textContent = text;
  $('ad-confirm-ok').textContent = okLabel;
  d.showModal();
  return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
}

/* ---------- Inloggen ---------- */
function logout() {
  AdminSession.clear();
  state.token = null;
  show('ad-login-view');
}
$('ad-logout').addEventListener('click', logout);
$('ad-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('ad-login-error');
  err.hidden = true;
  try {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('ad-password').value, remember: $('ad-remember').checked }) });
    state.token = r.token;
    AdminSession.set(r, $('ad-remember').checked);
    $('ad-password').value = '';
    if (location.search) { location.reload(); return; }
    await openList();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

/* ---------- Overzicht ---------- */
function resetCreateForm() {
  $('ad-create-form').reset();
  $('ad-pw').value = newPassword();
  $('ad-code').value = '';
  $('ad-code').dataset.touched = '';
}
$('ad-title').addEventListener('input', () => { if (!$('ad-code').dataset.touched) $('ad-code').value = newCode($('ad-title').value); });
$('ad-code').addEventListener('input', () => { $('ad-code').dataset.touched = '1'; });
$('ad-pw-new').addEventListener('click', () => { $('ad-pw').value = newPassword(); });

const lib = { galleries: [], folder: 'alle', query: '' };
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'zonet';
  if (m < 60) return `${m} min geleden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.round(h / 24);
  if (d === 1) return 'gisteren';
  if (d < 30) return `${d} dagen geleden`;
  return fmtDate(ms);
}
function statusOf(g) {
  const days = Math.ceil((g.expires - Date.now()) / 86400e3);
  if (days <= 0) return { cls: 'is-off', label: 'Verlopen' };
  if (days <= 7) return { cls: 'is-warn', label: `Nog ${days} ${days === 1 ? 'dag' : 'dagen'}` };
  return { cls: '', label: `Online · ${days} d` };
}
async function openList() {
  show('ad-list-view');
  resetCreateForm();
  $('ad-list').innerHTML = '<li class="lib-empty">Laden…</li>';
  const r = await api('/api/admin/galleries');
  lib.galleries = r.galleries.sort((a, b) => (b.updated || b.created) - (a.updated || a.created));
  const pct = Math.min(100, (r.totalBytes / r.limitBytes) * 100);
  $('ad-storage').innerHTML = `<span class="lib-storage-label"><b>${fmtBytes(r.totalBytes)}</b> van 10 GB gratis</span><span class="ad-bar"><span style="width:${Math.max(1, pct).toFixed(1)}%"></span></span>`;
  renderFolders();
  renderLibrary();
}
function renderFolders() {
  const years = [...new Set(lib.galleries.map((g) => new Date(g.created).getFullYear()))].sort((a, b) => b - a);
  const now = Date.now();
  const items = [['alle', 'Alle galerijen', lib.galleries.length], ...years.map((y) => [String(y), String(y), lib.galleries.filter((g) => new Date(g.created).getFullYear() === y).length])];
  const expired = lib.galleries.filter((g) => g.expires < now).length;
  if (expired) items.push(['verlopen', 'Verlopen', expired]);
  $('lib-folders').innerHTML = items.map(([key, label, n]) => `<li><button type="button" data-folder="${key}" ${lib.folder === key ? 'aria-current="true"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span>${label}</span><em>${n}</em></button></li>`).join('');
  $('lib-folders').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { lib.folder = b.dataset.folder; renderFolders(); renderLibrary(); }));
}
function renderLibrary() {
  const now = Date.now();
  const q = lib.query.toLowerCase();
  let list = lib.galleries;
  if (lib.folder === 'verlopen') list = list.filter((g) => g.expires < now);
  else if (lib.folder !== 'alle') list = list.filter((g) => String(new Date(g.created).getFullYear()) === lib.folder);
  if (q) list = list.filter((g) => [g.title, g.subtitle, g.code].join(' ').toLowerCase().includes(q));
  $('lib-folder-title').textContent = lib.folder === 'alle' ? 'Alle galerijen' : lib.folder === 'verlopen' ? 'Verlopen galerijen' : `Map ${lib.folder}`;
  $('lib-count').textContent = `${list.length} ${list.length === 1 ? 'galerij' : 'galerijen'}`;
  const grid = $('ad-list');
  if (!list.length) {
    grid.innerHTML = lib.galleries.length
      ? '<li class="lib-empty">Geen galerijen gevonden.</li>'
      : '<li class="lib-empty lib-empty-big"><b>Nog geen galerijen.</b><span>Maak je eerste galerij aan met de blauwe knop.</span></li>';
    return;
  }
  grid.innerHTML = '';
  list.forEach((g, i) => {
    const st = statusOf(g);
    const cover = g.cover ? `${API}/api/file?g=${encodeURIComponent(g.code)}&n=${encodeURIComponent(g.cover)}&k=p&t=${encodeURIComponent(state.token)}` : '';
    const li = document.createElement('li');
    li.className = 'lib-card' + (g.expires < now ? ' is-expired' : '');
    li.style.setProperty('--d', `${Math.min(i, 12) * 40}ms`);
    li.innerHTML = `
      <button type="button" class="lib-card-open" aria-label="Open ${esc(g.title)}">
        ${cover ? `<img src="${cover}" alt="" loading="lazy">` : '<span class="lib-card-empty">BS<b>.</b></span>'}
      </button>
      <span class="lib-pill ${st.cls}">${st.label}</span>
      ${g.tourUrl ? '<span class="lib-tour" title="Met 360° tour">360°</span>' : ''}
      <div class="lib-card-text">
        <span class="lib-card-title">${esc(g.title)}</span>
        <span class="lib-card-meta">${g.fileCount} ${g.fileCount === 1 ? 'bestand' : 'bestanden'} · ${ago(g.updated || g.created)}</span>
      </div>
      <div class="lib-card-actions">
        <a href="${clientLink(g.code)}&beheer=1" target="_blank" rel="noopener">Bekijk als klant ↗</a>
        <a href="activiteit.html?g=${encodeURIComponent(g.code)}">Activiteit</a>
      </div>`;
    li.querySelector('.lib-card-open').addEventListener('click', () => openDetail(g.code));
    grid.appendChild(li);
  });
}
$('lib-search').addEventListener('input', (e) => { lib.query = e.target.value.trim(); renderLibrary(); });
$('lib-new').addEventListener('click', () => { resetCreateForm(); $('ad-new-dialog').showModal(); $('ad-title').focus(); });
$('ad-new-close').addEventListener('click', () => $('ad-new-dialog').close());

$('ad-create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('ad-create-error');
  err.hidden = true;
  const body = {
    title: $('ad-title').value.trim(),
    subtitle: $('ad-subtitle').value.trim(),
    code: $('ad-code').value.trim().toLowerCase(),
    password: $('ad-pw').value.trim(),
    days: Number($('ad-days').value),
    tourUrl: $('ad-tour').value.trim(),
  };
  try {
    const g = await api('/api/admin/galleries', { method: 'POST', body: JSON.stringify(body) });
    $('ad-new-dialog').close();
    await openDetail(g.code, body.password);
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

/* ---------- Eén galerij ---------- */
$('ad-back').addEventListener('click', () => openList());

function shareText(g, password) {
  return `Dag,\n\nDe beelden van ${g.title} staan klaar in onze klantenzone. Je kan ze daar bekijken en downloaden (per stuk of alles in één keer).\n\nLink: ${clientLink(g.code)}\nGalerijcode: ${g.code}\nWachtwoord: ${password}\n\nDe galerij blijft beschikbaar tot ${fmtDate(g.expires)}.\n\nVriendelijke groeten,\nBuro Scott`;
}
function showShare(g, password) {
  $('ad-share').hidden = false;
  $('ad-share-text').value = shareText(g, password);
}
$('ad-share-copy').addEventListener('click', async () => {
  const t = $('ad-share-text');
  try { await navigator.clipboard.writeText(t.value); $('ad-share-copy').textContent = 'Gekopieerd ✓'; }
  catch (e) { t.select(); $('ad-share-copy').textContent = 'Geselecteerd: druk Ctrl+C'; }
  setTimeout(() => { $('ad-share-copy').textContent = 'Kopieer bericht'; }, 2500);
});

async function openDetail(code, freshPassword) {
  show('ad-detail-view');
  $('ad-share').hidden = true;
  $('ad-progress').innerHTML = '';
  $('ad-d-status').textContent = '';
  await refreshDetail(code);
  if (freshPassword) showShare(state.current, freshPassword);
}
async function refreshDetail(code) {
  const g = await api('/api/admin/galleries/' + encodeURIComponent(code));
  state.current = g;
  $('ad-d-code').textContent = g.code;
  $('ad-d-title').textContent = g.title;
  const total = g.files.reduce((s, f) => s + f.size, 0);
  $('ad-d-meta').textContent = `${g.subtitle ? g.subtitle + ' · ' : ''}${g.files.length} bestanden · ${fmtBytes(total)} · beschikbaar tot ${fmtDate(g.expires)}`;
  $('ad-d-open').href = clientLink(g.code) + '&beheer=1';
  $('ad-d-activity-link').href = 'activiteit.html?g=' + encodeURIComponent(g.code);
  loadGalleryActivity(g.code);
  $('ad-d-tour').value = g.tourUrl || '';
  $('ad-d-count').textContent = `(${g.files.length})`;
  const ul = $('ad-d-files');
  ul.innerHTML = '';
  if (!g.files.length) { ul.innerHTML = '<li class="ad-empty">Nog geen bestanden. Voeg ze hierboven toe.</li>'; return; }
  for (const f of g.files) {
    const li = document.createElement('li');
    li.className = 'ad-file';
    const thumb = f.preview
      ? `<img src="${API}/api/file?g=${encodeURIComponent(g.code)}&n=${encodeURIComponent(f.name)}&k=p&t=${encodeURIComponent(state.token)}" alt="" loading="lazy">`
      : `<span class="ad-file-ext">${esc((f.name.split('.').pop() || '').toUpperCase().slice(0, 4))}</span>`;
    li.innerHTML = `${thumb}
      <span class="ad-file-info"><b>${esc(f.name)}</b><span>${CAT_LABEL[f.cat] || f.cat} · ${fmtBytes(f.size)}</span></span>
      <button type="button" class="ad-file-del" aria-label="${esc(f.name)} verwijderen">✕</button>
      ${f.preview ? `<button type="button" class="ad-file-cover${g.cover === f.name ? ' is-on' : ''}">${g.cover === f.name ? '★ Omslag' : 'Als omslag'}</button>` : ''}`;
    li.querySelector('.ad-file-del').addEventListener('click', async () => {
      if (!(await confirmBox('Bestand verwijderen?', `${f.name} wordt definitief verwijderd.`))) return;
      await api(`/api/admin/galleries/${encodeURIComponent(g.code)}/files/${encodeURIComponent(f.name)}`, { method: 'DELETE' });
      await refreshDetail(g.code);
    });
    const cb = li.querySelector('.ad-file-cover');
    if (cb) cb.addEventListener('click', () => patch({ cover: f.name }, `${f.name} is nu de omslagfoto.`));
    ul.appendChild(li);
  }
  loadTourPicker(g);
}

async function loadGalleryActivity(code) {
  const ul = $('ad-d-activity');
  try {
    const r = await api('/api/admin/activity?limit=8&g=' + encodeURIComponent(code));
    const label = { login: 'Klant logde in', 'login-fail': 'Mislukte login (fout wachtwoord)', visit: 'Galerij bekeken', download: 'Gedownload:', zip: 'Alles gedownload (zip)' };
    const st = r.stats[code] || {};
    $('ad-d-activity-sum').textContent = `${st.visits || 0} bezoeken · ${(st.downloads || 0) + (st.zips || 0)} downloads`;
    ul.innerHTML = r.events.length ? r.events.map((e) => `<li class="ac-item"><div class="ac-body"><span class="ac-text">${label[e.type] || e.type}${e.file ? ` <b>${esc(e.file)}</b>` : ''}${e.n ? ` · ${e.n} bestanden` : ''}</span><span class="ac-meta">${[e.loc, e.dev].filter(Boolean).map(esc).join(' · ')}</span></div><time class="ac-time">${new Date(e.t).toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></li>`).join('')
      : '<li class="ad-empty">Je klant heeft de galerij nog niet geopend.</li>';
  } catch (e) { ul.innerHTML = '<li class="ad-empty">Activiteit kon niet geladen worden.</li>'; }
}

async function loadTourPicker(g) {
  const sel = $('ad-d-tourpick');
  try {
    const r = await api('/api/admin/tours');
    const base = location.href.replace(/klantenzone-beheer\.html.*$/, 'tour.html?id=');
    sel.innerHTML = '<option value="">— Kies een tour —</option>' + r.tours.map((t) => `<option value="${base}${encodeURIComponent(t.id)}"${g.tourUrl === base + encodeURIComponent(t.id) ? ' selected' : ''}>${esc(t.title)} (${t.scenes} ruimtes)</option>`).join('');
  } catch (e) { sel.innerHTML = '<option value="">Tours konden niet geladen worden</option>'; }
}
$('ad-d-tourpick-save').addEventListener('click', () => {
  const v = $('ad-d-tourpick').value;
  patch({ tourUrl: v }, v ? 'Tour gekoppeld aan deze galerij.' : 'Tour losgekoppeld.');
});

/* ---------- Uploaden ---------- */
const drop = $('ad-drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
drop.addEventListener('drop', (e) => { e.preventDefault(); uploadAll(Array.from(e.dataTransfer.files)); });
$('ad-files').addEventListener('change', (e) => { uploadAll(Array.from(e.target.files)); e.target.value = ''; });

async function makePreview(file) {
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) return null;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, PREVIEW_MAX / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return { blob, w: bmp.width, h: bmp.height };
  } catch (e) { return null; }
}
function put(url, body, type, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', url);
    x.setRequestHeader('Authorization', 'Bearer ' + state.token);
    if (type) x.setRequestHeader('Content-Type', type);
    x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error((JSON.parse(x.responseText || '{}').error) || 'Upload mislukt')));
    x.onerror = () => reject(new Error('Geen verbinding'));
    x.send(body);
  });
}
async function uploadAll(files) {
  if (!files.length || !state.current) return;
  const g = state.current;
  const cat = $('ad-cat').value;
  const taken = new Set(g.files.map((f) => f.name));
  const list = $('ad-progress');
  const jobs = files.map((file) => {
    const li = document.createElement('li');
    const name = cleanName(file.name, taken);
    li.innerHTML = `<span class="ad-p-name">${esc(name)}</span><span class="ad-p-bar"><span></span></span><span class="ad-p-state">Wachten…</span>`;
    list.appendChild(li);
    return { file, name, li };
  });
  for (const j of jobs) {
    const bar = j.li.querySelector('.ad-p-bar span');
    const st = j.li.querySelector('.ad-p-state');
    try {
      st.textContent = 'Voorbereiden…';
      const prev = await makePreview(j.file);
      const base = `${API}/api/admin/galleries/${encodeURIComponent(g.code)}/files/${encodeURIComponent(j.name)}`;
      st.textContent = 'Uploaden…';
      await put(`${base}?cat=${cat}&w=${prev ? prev.w : 0}&h=${prev ? prev.h : 0}`, j.file, j.file.type || 'application/octet-stream', (p) => { bar.style.width = (p * 95).toFixed(0) + '%'; });
      if (prev) await put(`${base}?k=p`, prev.blob, 'image/jpeg');
      bar.style.width = '100%';
      st.textContent = 'Klaar ✓';
      j.li.classList.add('is-done');
    } catch (ex) {
      st.textContent = ex.message;
      j.li.classList.add('is-error');
    }
  }
  await refreshDetail(g.code);
}

/* ---------- Instellingen ---------- */
async function patch(body, msg) {
  const g = state.current;
  try {
    await api('/api/admin/galleries/' + encodeURIComponent(g.code), { method: 'PATCH', body: JSON.stringify(body) });
    $('ad-d-status').textContent = msg;
    await refreshDetail(g.code);
  } catch (ex) { $('ad-d-status').textContent = ex.message; }
}
$('ad-d-days-save').addEventListener('click', () => patch({ days: Number($('ad-d-days').value) }, 'Vervaldatum aangepast.'));
$('ad-d-tour-save').addEventListener('click', () => patch({ tourUrl: $('ad-d-tour').value.trim() }, 'Tourlink opgeslagen.'));
$('ad-d-newpw').addEventListener('click', async () => {
  if (!(await confirmBox('Nieuw wachtwoord?', 'Het oude wachtwoord werkt daarna niet meer. Je krijgt meteen een nieuw bericht voor je klant.', 'Nieuw wachtwoord'))) return;
  const pw = newPassword();
  await patch({ password: pw }, 'Nieuw wachtwoord ingesteld.');
  showShare(state.current, pw);
  $('ad-share').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('ad-d-delete').addEventListener('click', async () => {
  const g = state.current;
  if (!(await confirmBox('Galerij verwijderen?', `"${g.title}" en alle ${g.files.length} bestanden worden definitief verwijderd. Je klant kan er daarna niet meer aan.`))) return;
  await api('/api/admin/galleries/' + encodeURIComponent(g.code), { method: 'DELETE' });
  await openList();
});

/* ---------- Start ---------- */
(async function init() {
  if (!API) { show('ad-setup'); return; }
  try {
    const s = AdminSession.get();
    if (s) {
      state.token = s.token;
      const q = new URLSearchParams(location.search);
      if (q.get('g')) { await openDetail(q.get('g')); return; }
      await openList();
      if (q.get('nieuw')) { $('ad-new-dialog').showModal(); $('ad-title').focus(); }
      return;
    }
  } catch (e) {}
  show('ad-login-view');
  $('ad-password').focus();
})();
