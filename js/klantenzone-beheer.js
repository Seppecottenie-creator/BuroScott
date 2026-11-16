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
  try { sessionStorage.removeItem(KEY); } catch (e) {}
  state.token = null;
  show('ad-login-view');
}
$('ad-logout').addEventListener('click', logout);
$('ad-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('ad-login-error');
  err.hidden = true;
  try {
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('ad-password').value }) });
    state.token = r.token;
    try { sessionStorage.setItem(KEY, JSON.stringify(r)); } catch (e2) {}
    $('ad-password').value = '';
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

async function openList() {
  show('ad-list-view');
  resetCreateForm();
  const list = $('ad-list');
  list.innerHTML = '<li class="ad-empty">Laden…</li>';
  const r = await api('/api/admin/galleries');
  const pct = Math.min(100, (r.totalBytes / r.limitBytes) * 100);
  $('ad-storage').innerHTML = `<span>Opslag: <b>${fmtBytes(r.totalBytes)}</b> van ${fmtBytes(r.limitBytes)} gratis</span><span class="ad-bar"><span style="width:${pct.toFixed(1)}%"></span></span>`;
  list.innerHTML = '';
  if (!r.galleries.length) { list.innerHTML = '<li class="ad-empty">Nog geen galerijen. Maak er hierboven een aan.</li>'; return; }
  for (const g of r.galleries) {
    const expired = g.expires < Date.now();
    const li = document.createElement('li');
    li.className = 'ad-item';
    li.innerHTML = `
      <button type="button" class="ad-item-main">
        <span class="ad-item-title">${esc(g.title)}</span>
        <span class="ad-item-meta">${esc(g.code)} · ${g.fileCount} bestanden · ${fmtBytes(g.bytes)}</span>
      </button>
      <span class="ad-pill ${expired ? 'is-off' : ''}">${expired ? 'Verlopen' : 'Tot ' + fmtDate(g.expires)}</span>`;
    li.querySelector('button').addEventListener('click', () => openDetail(g.code));
    list.appendChild(li);
  }
}

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
  $('ad-d-open').href = clientLink(g.code);
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
      <button type="button" class="ad-file-del" aria-label="${esc(f.name)} verwijderen">✕</button>`;
    li.querySelector('.ad-file-del').addEventListener('click', async () => {
      if (!(await confirmBox('Bestand verwijderen?', `${f.name} wordt definitief verwijderd.`))) return;
      await api(`/api/admin/galleries/${encodeURIComponent(g.code)}/files/${encodeURIComponent(f.name)}`, { method: 'DELETE' });
      await refreshDetail(g.code);
    });
    ul.appendChild(li);
  }
}

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
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (s && s.expiresAt > Date.now()) { state.token = s.token; await openList(); return; }
  } catch (e) {}
  show('ad-login-view');
  $('ad-password').focus();
})();
