/* ============================================================
   BURO SCOTT — PLANNEN TEKENEN
   Schets een ruimte met je vinger: de hoeken worden recht gezet.
   Tik op een muur en vul de lengte in (binnenmaat, in meter).
   Alle maten in het plan zijn in centimeter.
============================================================ */
const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const r5 = (v) => Math.round(v / 5) * 5;
const fmtM = (cm) => (cm / 100).toFixed(2).replace('.', ',');
const fmtArea = (m2) => m2.toFixed(m2 < 10 ? 2 : 1).replace('.', ',') + ' m²';

const ROOM_TYPES = ['Woonkamer', 'Leefruimte', 'Keuken', 'Eetkamer', 'Slaapkamer', 'Badkamer', 'Douchekamer', 'Toilet', 'Inkomhal', 'Nachthal', 'Bureau', 'Berging', 'Wasplaats', 'Dressing', 'Garage', 'Zolder', 'Kelder', 'Veranda', 'Terras', 'Ruimte'];
const FURN = {
  bed2: ['Bed 2 personen', 160, 200], bed1: ['Bed 1 persoon', 90, 200], sofa: ['Zetel', 220, 90], armchair: ['Fauteuil', 80, 80],
  table: ['Tafel', 160, 90], rtable: ['Ronde tafel', 110, 110], chair: ['Stoel', 45, 50], desk: ['Bureau', 140, 70],
  wardrobe: ['Kast', 120, 60], tv: ['Tv-meubel', 180, 45], kitchen: ['Keukenblok', 240, 60], hob: ['Kookplaat', 60, 60],
  fridge: ['Koelkast', 60, 65], ksink: ['Spoelbak', 80, 60], bath: ['Bad', 170, 75], shower: ['Douche', 90, 90],
  wc: ['Toilet', 40, 65], sink: ['Lavabo', 60, 45], washer: ['Wasmachine', 60, 60], stairs: ['Trap', 90, 280],
};
const OPEN_KINDS = { door: 'Deur', double: 'Dubbele deur', slide: 'Schuifdeur', passage: 'Doorgang', window: 'Raam' };

const st = {
  token: null, plan: null, fi: 0, tool: 'select', sel: null,
  view: { s: 1, tx: 0, ty: 0 }, undo: [], redo: [], dirty: false, saveTimer: null,
};
const floor = () => st.plan.floors[st.fi];

/* ======================== API / inloggen ======================== */
function show(v) {
  for (const x of ['pl-login-view', 'pl-list-view', 'pl-setup']) $(x).hidden = x !== v;
  $('pl-logout').hidden = v !== 'pl-list-view';
}
async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.token, ...(opts.headers || {}) } });
  let d = {}; try { d = await res.json(); } catch (e) {}
  if (res.status === 401 && path !== '/api/admin/login') { AdminSession.clear(); st.token = null; closeEditor(true); show('pl-login-view'); throw new Error('Log opnieuw in.'); }
  if (!res.ok) throw new Error(d.error || 'Er ging iets mis.');
  return d;
}
$('pl-logout').addEventListener('click', () => { AdminSession.clear(); st.token = null; show('pl-login-view'); });
$('pl-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('pl-login-error'); err.hidden = true;
  try {
    const remember = $('pl-remember').checked;
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('pl-password').value, remember }) });
    st.token = r.token; AdminSession.set(r, remember); $('pl-password').value = '';
    await start();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
function confirmBox(title, text) {
  const d = $('pe-confirm');
  $('pe-confirm-title').textContent = title; $('pe-confirm-text').textContent = text;
  d.showModal();
  return new Promise((r) => d.addEventListener('close', () => r(d.returnValue === 'ok'), { once: true }));
}

/* ======================== Lijst ======================== */
async function openList() {
  show('pl-list-view');
  const ul = $('pl-list');
  const r = await api('/api/admin/plans');
  if (!r.plans.length) { ul.innerHTML = '<li class="pl-empty"><b>Nog geen plannen.</b><span>Maak je eerste plan met "+ Nieuw plan".</span></li>'; return; }
  ul.innerHTML = r.plans.map((p) => `
    <li class="pl-card">
      <button type="button" class="pl-card-open" data-open="${esc(p.id)}">
        <span class="pl-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 3h18v18H3zM3 12h7v9M14 3v6h7"/></svg></span>
        <span class="pl-card-title">${esc(p.title)}</span>
        <span class="pl-card-meta">${p.rooms} ${p.rooms === 1 ? 'ruimte' : 'ruimtes'} · ${String(p.area).replace('.', ',')} m²${p.floors > 1 ? ` · ${p.floors} verdiepingen` : ''}</span>
        <span class="pl-card-date">Bewerkt ${new Date(p.updated).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </button>
      <button type="button" class="pl-card-del" data-del="${esc(p.id)}" data-title="${esc(p.title)}" aria-label="Verwijder ${esc(p.title)}">✕</button>
    </li>`).join('');
}
$('pl-list').addEventListener('click', async (e) => {
  const o = e.target.closest('[data-open]');
  if (o) { openPlan(o.dataset.open); return; }
  const d = e.target.closest('[data-del]');
  if (d && await confirmBox('Plan verwijderen?', `"${d.dataset.title}" wordt definitief verwijderd.`)) {
    await api('/api/admin/plans/' + d.dataset.del, { method: 'DELETE' });
    openList();
  }
});
$('pl-new').addEventListener('click', async () => {
  const p = await api('/api/admin/plans', { method: 'POST', body: JSON.stringify({ title: 'Nieuw plan' }) });
  await openPlan(p.id, true);
});

/* ======================== Editor openen / bewaren ======================== */
async function openPlan(id, fresh) {
  const p = await api('/api/admin/plans/' + id);
  let backup = null;
  try { backup = JSON.parse(localStorage.getItem('pl-backup-' + id) || 'null'); } catch (e) {}
  st.plan = backup && backup.updatedLocal > (p.updated || 0) ? { ...backup, id } : p;
  st.plan.floors.forEach((f) => { f.rooms = f.rooms || []; f.items = f.items || []; });
  st.fi = 0; st.sel = null; st.undo = []; st.redo = [];
  $('pe').hidden = false;
  document.body.classList.add('is-editor');
  $('pe-title').value = st.plan.title;
  history.replaceState(null, '', '?p=' + id);
  setTool('select');
  renderFloors();
  render();
  fit();
  if (st.plan !== p) { setSave('Lokale wijzigingen hersteld'); markDirty(); }
  else setSave('Opgeslagen');
  if (fresh) { $('pe-title').focus(); $('pe-title').select(); }
}
function closeEditor(silent) {
  $('pe').hidden = true;
  document.body.classList.remove('is-editor');
  history.replaceState(null, '', location.pathname);
  if (!silent) openList();
}
$('pe-back').addEventListener('click', async () => { if (st.dirty) await saveNow(); closeEditor(); });
$('pe-title').addEventListener('input', () => { st.plan.title = $('pe-title').value; markDirty(); });

function setSave(t, cls) { const el = $('pe-save'); el.textContent = t; el.className = 'pe-save ' + (cls || ''); }
function markDirty() {
  st.dirty = true;
  st.plan.updatedLocal = Date.now();
  try { localStorage.setItem('pl-backup-' + st.plan.id, JSON.stringify(st.plan)); } catch (e) {}
  setSave('Niet opgeslagen', 'is-wait');
  clearTimeout(st.saveTimer);
  st.saveTimer = setTimeout(saveNow, 1200);
}
async function saveNow() {
  clearTimeout(st.saveTimer);
  if (!st.plan || !st.dirty) return;
  setSave('Opslaan…', 'is-wait');
  const { updatedLocal, ...body } = st.plan;
  try {
    const r = await api('/api/admin/plans/' + st.plan.id, { method: 'PUT', body: JSON.stringify(body) });
    st.plan.updated = r.updated; st.dirty = false;
    try { localStorage.removeItem('pl-backup-' + st.plan.id); } catch (e) {}
    setSave('Opgeslagen ✓', 'is-ok');
  } catch (e) {
    setSave('Offline: bewaard op dit toestel', 'is-err');
    st.saveTimer = setTimeout(saveNow, 8000);
  }
}
window.addEventListener('pagehide', () => {
  if (!st.dirty || !st.plan) return;
  const { updatedLocal, ...body } = st.plan;
  fetch(API + '/api/admin/plans/' + st.plan.id, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + st.token }, body: JSON.stringify(body) }).catch(() => {});
});

/* Ongedaan maken */
function snapshot() { st.undo.push(JSON.stringify(st.plan.floors)); if (st.undo.length > 80) st.undo.shift(); st.redo = []; syncUndo(); }
function syncUndo() { $('pe-undo').disabled = !st.undo.length; $('pe-redo').disabled = !st.redo.length; }
function restore(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(st.plan.floors));
  st.plan.floors = JSON.parse(from.pop());
  st.fi = Math.min(st.fi, st.plan.floors.length - 1);
  st.sel = null; renderFloors(); render(); markDirty(); syncUndo();
}
$('pe-undo').addEventListener('click', () => restore(st.undo, st.redo));
$('pe-redo').addEventListener('click', () => restore(st.redo, st.undo));

/* ======================== Verdiepingen ======================== */
function renderFloors() {
  $('pe-floors').innerHTML = st.plan.floors.map((f, i) => `<button type="button" data-fi="${i}"${i === st.fi ? ' aria-current="true"' : ''}>${esc(f.name)}${i === st.fi ? '<span class="pe-floor-edit" aria-hidden="true">⋯</span>' : ''}</button>`).join('');
}
$('pe-floors').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fi]'); if (!b) return;
  const i = +b.dataset.fi;
  if (i === st.fi) { openFloorDlg(); return; }
  st.fi = i; st.sel = null; renderFloors(); render(); fit();
});
$('pe-floor-add').addEventListener('click', () => {
  snapshot();
  const n = st.plan.floors.length;
  st.plan.floors.push({ id: uid(), name: n === 1 ? 'Verdieping 1' : `Verdieping ${n}`, rooms: [], items: [] });
  st.fi = st.plan.floors.length - 1; st.sel = null;
  renderFloors(); render(); markDirty();
  toast('Verdieping toegevoegd. Tik op de naam om ze te hernoemen.');
});
function openFloorDlg() {
  $('pe-floor-name').value = floor().name;
  $('pe-floor-del').hidden = st.plan.floors.length < 2;
  $('pe-floor-dlg').showModal();
}
$('pe-floor-form').addEventListener('submit', () => {
  const v = $('pe-floor-name').value.trim(); if (!v) return;
  floor().name = v.slice(0, 40); renderFloors(); markDirty();
});
$('pe-floor-del').addEventListener('click', async () => {
  $('pe-floor-dlg').close();
  if (!(await confirmBox('Verdieping verwijderen?', `"${floor().name}" en alles erop wordt verwijderd.`))) return;
  snapshot(); st.plan.floors.splice(st.fi, 1); st.fi = 0; st.sel = null; renderFloors(); render(); fit(); markDirty();
});
document.querySelectorAll('.pe-dlg [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

/* ======================== Meetkunde ======================== */
function signedArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
const areaM2 = (room) => Math.abs(signedArea(room.pts)) / 10000;
function edge(room, i) {
  const a = room.pts[i], b = room.pts[(i + 1) % room.pts.length];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const d = [dx / len, dy / len];
  const n = signedArea(room.pts) > 0 ? [d[1], -d[0]] : [-d[1], d[0]]; // naar buiten
  return { a, b, d, n, len };
}
const wallT = (room, i) => { const w = room.walls[i]; return w && w.t != null ? w.t : room.t; };
function lineX(p1, d1, p2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}
function outerPts(room) {
  const n = room.pts.length, E = [];
  for (let i = 0; i < n; i++) { const e = edge(room, i), t = wallT(room, i); E.push({ p: [e.a[0] + e.n[0] * t, e.a[1] + e.n[1] * t], d: e.d, b: [e.b[0] + e.n[0] * t, e.b[1] + e.n[1] * t] }); }
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = E[(i - 1 + n) % n], cur = E[i];
    out.push(lineX(prev.p, prev.d, cur.p, cur.d) || cur.p);
  }
  return out;
}
function centroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; const f = p[i][0] * q[1] - q[0] * p[i][1]; a += f; cx += (p[i][0] + q[0]) * f; cy += (p[i][1] + q[1]) * f; }
  if (Math.abs(a) < 1e-6) return p[0];
  return [cx / (3 * a), cy / (3 * a)];
}
function inPoly(pt, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (((p[i][1] > pt[1]) !== (p[j][1] > pt[1])) && pt[0] < (p[j][0] - p[i][0]) * (pt[1] - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) c = !c;
  }
  return c;
}
// Ramer–Douglas–Peucker
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0, max = 0;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
}
function cleanPoly(pts) {
  let p = pts.map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
  for (let pass = 0; pass < 4; pass++) {
    p = p.filter((q, i) => { const r = p[(i + 1) % p.length]; return Math.hypot(q[0] - r[0], q[1] - r[1]) > 0.5; });
    p = p.filter((q, i) => {
      const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length];
      return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) > 1;
    });
  }
  return p;
}
// Schets → rechte hoeken
function orthogonalize(raw) {
  const eps = 14 / st.view.s;
  let p = simplify(raw, eps);
  if (p.length > 2 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 40 / st.view.s) p = p.slice(0, -1);
  const segs = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const H = Math.abs(dx) >= Math.abs(dy);
    segs.push({ H, v: H ? (a[1] + b[1]) / 2 : (a[0] + b[0]) / 2, w: len });
  }
  // gelijke richtingen samenvoegen (ook rond de sluiting)
  let merged = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && last.H === s.H) { last.v = (last.v * last.w + s.v * s.w) / (last.w + s.w); last.w += s.w; } else merged.push({ ...s });
  }
  if (merged.length > 1 && merged[0].H === merged[merged.length - 1].H) {
    const a = merged.pop(); const b = merged[0];
    b.v = (a.v * a.w + b.v * b.w) / (a.w + b.w); b.w += a.w;
  }
  if (merged.length < 4) {
    const xs = raw.map((q) => q[0]), ys = raw.map((q) => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  const out = [];
  for (let k = 0; k < merged.length; k++) {
    const s = merged[k], t = merged[(k + 1) % merged.length];
    out.push(s.H ? [t.v, s.v] : [s.v, t.v]);
  }
  return out;
}
// Uitlijnen op andere ruimtes (met muurdikte ertussen)
function snapCoords(pts, exceptId, t) {
  const thr = 16 / st.view.s;
  const xs = [], ys = [];
  for (const r of floor().rooms) {
    if (r.id === exceptId) continue;
    for (const q of r.pts) for (const g of [0, t, -t, r.t, -r.t]) { xs.push(q[0] + g); ys.push(q[1] + g); }
  }
  const snap = (v, arr) => { let best = v, bd = thr; for (const c of arr) { const d = Math.abs(c - v); if (d < bd) { bd = d; best = c; } } return best === v ? r5(v) : best; };
  return pts.map((q) => [snap(q[0], xs), snap(q[1], ys)]);
}
// Beste uitlijning voor een verschoven ruimte (null = niets in de buurt)
function moveSnap(pts, exceptId, t) {
  const thr = 16 / st.view.s;
  let bx = null, by = null, dx = thr, dy = thr;
  for (const r of floor().rooms) {
    if (r.id === exceptId) continue;
    for (const q of r.pts) for (const g of [0, t, -t, r.t, -r.t]) for (const m of pts) {
      const ex = q[0] + g - m[0], ey = q[1] + g - m[1];
      if (Math.abs(ex) < dx) { dx = Math.abs(ex); bx = ex; }
      if (Math.abs(ey) < dy) { dy = Math.abs(ey); by = ey; }
    }
  }
  return [bx, by];
}
function newRoom(pts) {
  const t = st.plan.wallT || 10;
  let p = cleanPoly(snapCoords(pts, null, t));
  if (p.length < 3) return null;
  if (signedArea(p) < 0) p.reverse();
  // muur 1 = bovenste muur (linksboven, met de klok mee)
  let k0 = 0;
  p.forEach((q, k) => { if (q[1] < p[k0][1] - 0.5 || (Math.abs(q[1] - p[k0][1]) <= 0.5 && q[0] < p[k0][0])) k0 = k; });
  p = p.slice(k0).concat(p.slice(0, k0));
  if (selfCross(p)) return null;
  const n = floor().rooms.length + 1;
  return { id: uid(), name: 'Ruimte ' + n, type: 'Ruimte', h: 250, t, pts: p, walls: p.map(() => ({ ok: false, t: null })), open: [] };
}

// Elke muur behoudt zijn richting, niets kruist
function sameShape(a, b) {
  for (let k = 0; k < a.pts.length; k++) {
    const e1 = edge(a, k), e2 = edge(b, k);
    if (e2.len < 1 || e1.d[0] * e2.d[0] + e1.d[1] * e2.d[1] < 0.99) return false;
  }
  return !selfCross(b.pts);
}
// Kruisen of raken niet-aangrenzende muren elkaar?
function segHit(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const on = (p, q, r) => Math.min(p[0], q[0]) - 0.01 <= r[0] && r[0] <= Math.max(p[0], q[0]) + 0.01 && Math.min(p[1], q[1]) - 0.01 <= r[1] && r[1] <= Math.max(p[1], q[1]) + 0.01;
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b));
}
function selfCross(p) {
  const n = p.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (segHit(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
  }
  return false;
}

/* Muurlengte instellen: een evenwijdige, nog niet gemeten muur vangt het verschil op */
function parallel(a, b) { return Math.abs(a.d[0] * b.d[1] - a.d[1] * b.d[0]) < 1e-3; }
function wallStatus(room, i) {
  if (room.walls[i].ok) return 'ok';
  const e = edge(room, i);
  const group = room.pts.map((_, j) => j).filter((j) => parallel(edge(room, j), e));
  const open = group.filter((j) => !room.walls[j].ok);
  return open.length === 1 && group.length > 1 ? 'derived' : 'open';
}
function setWallLength(room, i, L) {
  const n = room.pts.length, e = edge(room, i), delta = L - e.len;
  if (Math.abs(delta) < 0.05) { room.walls[i].ok = true; return { ok: true }; }
  const tryAbsorb = (j) => {
    // verschuif hoekpunten i+1 .. j
    const test = room.pts.map((q) => q.slice());
    for (let k = (i + 1) % n; ; k = (k + 1) % n) { test[k][0] += e.d[0] * delta; test[k][1] += e.d[1] * delta; if (k === j) break; }
    const tmp = { ...room, pts: test };
    if (!sameShape(room, tmp)) return null;
    if (Math.abs(edge(tmp, i).len - L) > 0.5) return null;
    return test;
  };
  const order = [];
  for (let s = 2; s < n; s++) order.push((i + s) % n);
  const cands = order.filter((j) => parallel(edge(room, j), e));
  for (const j of cands.filter((j) => !room.walls[j].ok)) {
    const r = tryAbsorb(j); if (r) { room.pts = r; room.walls[i].ok = true; return { ok: true }; }
  }
  for (const j of cands) {
    const r = tryAbsorb(j);
    if (r) { room.pts = r; room.walls[i].ok = true; room.walls[j].ok = false; return { ok: true, warn: `Muur ${j + 1} werd aangepast (${delta > 0 ? '+' : ''}${Math.round(delta)} cm). Meet die opnieuw na.` }; }
  }
  return { ok: false, msg: 'Deze lengte past niet in de vorm van de ruimte.' };
}

/* ======================== Tekenen (SVG) ======================== */
const svg = $('pe-svg'), world = $('pe-world'), overlay = $('pe-overlay');
function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
const P = (pts) => pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
const pathD = (pts) => 'M' + pts.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('L') + 'Z';

function furnSymbol(g, it) {
  const w = it.w, d = it.d, x = -w / 2, y = -d / 2;
  const L = { fill: 'none', stroke: '#6B6A63', 'stroke-width': 1.4 };
  switch (it.kind) {
    case 'bed2': case 'bed1': {
      const pw = it.kind === 'bed2' ? (w - 18) / 2 : w - 12;
      for (let k = 0; k < (it.kind === 'bed2' ? 2 : 1); k++) el('rect', { x: x + 6 + k * (pw + 6), y: y + 6, width: pw, height: 28, rx: 6, ...L }, g);
      el('path', { d: `M${x} ${y + 48}H${x + w}`, ...L }, g); break;
    }
    case 'sofa': el('rect', { x, y, width: w, height: 22, ...L }, g); el('rect', { x, y, width: 18, height: d, ...L }, g); el('rect', { x: x + w - 18, y, width: 18, height: d, ...L }, g); break;
    case 'armchair': el('rect', { x, y, width: w, height: 20, ...L }, g); el('rect', { x, y, width: 14, height: d, ...L }, g); el('rect', { x: x + w - 14, y, width: 14, height: d, ...L }, g); break;
    case 'rtable': el('ellipse', { cx: 0, cy: 0, rx: w / 2 - 1, ry: d / 2 - 1, ...L }, g); return true;
    case 'chair': el('path', { d: `M${x} ${y + 8}H${x + w}`, ...L }, g); break;
    case 'wardrobe': el('path', { d: `M${x} ${y}L${x + w} ${y + d}M${x + w} ${y}L${x} ${y + d}`, ...L, 'stroke-width': 0.8 }, g); break;
    case 'hob': for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) el('circle', { cx: cx * w / 4, cy: cy * d / 4, r: Math.min(w, d) / 6, ...L }, g); break;
    case 'ksink': el('rect', { x: x + 8, y: y + 8, width: w - 16, height: d - 16, rx: 6, ...L }, g); break;
    case 'sink': el('ellipse', { cx: 0, cy: 3, rx: w / 2 - 8, ry: d / 2 - 8, ...L }, g); break;
    case 'bath': el('rect', { x: x + 6, y: y + 6, width: w - 12, height: d - 12, rx: 20, ...L }, g); break;
    case 'shower': el('path', { d: `M${x} ${y}L${x + w} ${y + d}M${x + w} ${y}L${x} ${y + d}`, ...L, 'stroke-width': 0.8 }, g); el('circle', { cx: 0, cy: 0, r: 5, ...L }, g); break;
    case 'wc': el('rect', { x: x + 2, y, width: w - 4, height: 16, rx: 3, ...L }, g); el('ellipse', { cx: 0, cy: y + 16 + (d - 18) / 2, rx: w / 2 - 3, ry: (d - 18) / 2, ...L }, g); break;
    case 'washer': el('circle', { cx: 0, cy: 3, r: Math.min(w, d) / 2 - 10, ...L }, g); break;
    case 'stairs': { const n = Math.max(3, Math.round(d / 25)); let s = ''; for (let k = 1; k < n; k++) s += `M${x} ${y + k * d / n}H${x + w}`; el('path', { d: s, ...L, 'stroke-width': 1 }, g); el('path', { d: `M0 ${y + d - 10}V${y + 14}M-8 ${y + 26}L0 ${y + 14}L8 ${y + 26}`, ...L, stroke: '#0E0F0D' }, g); break; }
    default: return false;
  }
  return true;
}

function drawFloor(f, root, opts) {
  const ex = !!opts.export;
  const fontF = ex ? 'Arial, Helvetica, sans-serif' : 'Archivo, Arial, sans-serif';
  const gFill = el('g', {}, root), gWall = el('g', {}, root), gHit = el('g', {}, root), gOpen = el('g', {}, root), gItem = el('g', {}, root), gText = el('g', { 'font-family': fontF, 'pointer-events': 'none' }, root);
  for (const r of f.rooms) {
    const selR = !ex && st.sel && st.sel.room === r.id;
    el('polygon', { points: P(r.pts), fill: selR ? '#EEF1FF' : '#FFFFFF', 'data-k': 'room', 'data-room': r.id }, gFill);
    el('path', { d: pathD(outerPts(r)) + pathD(r.pts.slice().reverse()), fill: '#1E1F1C', 'fill-rule': 'evenodd' }, gWall);
    if (!ex) r.pts.forEach((_, i) => { const e = edge(r, i); el('line', { x1: e.a[0], y1: e.a[1], x2: e.b[0], y2: e.b[1], class: 'pe-hit', 'data-k': 'wall', 'data-room': r.id, 'data-i': i }, gHit); });
    // Openingen
    for (const o of r.open || []) {
      if (o.wall >= r.pts.length) continue;
      const e = edge(r, o.wall), t = wallT(r, o.wall);
      const pos = Math.min(Math.max(o.pos, o.width / 2), e.len - o.width / 2);
      const A = [e.a[0] + e.d[0] * (pos - o.width / 2), e.a[1] + e.d[1] * (pos - o.width / 2)];
      const B = [e.a[0] + e.d[0] * (pos + o.width / 2), e.a[1] + e.d[1] * (pos + o.width / 2)];
      const off = (p, k) => [p[0] + e.n[0] * k, p[1] + e.n[1] * k];
      const g = el('g', ex ? {} : { 'data-k': 'open', 'data-room': r.id, 'data-open': o.id }, gOpen);
      el('polygon', { points: P([off(A, -1.5), off(B, -1.5), off(B, t + 1.5), off(A, t + 1.5)]), fill: '#FFFFFF' }, g);
      const S = { fill: 'none', stroke: '#1E1F1C', 'stroke-width': 1.6 };
      if (o.kind === 'window') {
        el('polygon', { points: P([A, B, off(B, t), off(A, t)]), ...S, 'stroke-width': 1.2 }, g);
        el('line', { x1: off(A, t / 2)[0], y1: off(A, t / 2)[1], x2: off(B, t / 2)[0], y2: off(B, t / 2)[1], ...S, 'stroke-width': 1.2 }, g);
      } else if (o.kind === 'slide') {
        el('line', { x1: off(A, t * 0.35)[0], y1: off(A, t * 0.35)[1], x2: off(B, t * 0.35)[0] - e.d[0] * o.width * 0.4, y2: off(B, t * 0.35)[1] - e.d[1] * o.width * 0.4, ...S, 'stroke-width': 2.4 }, g);
        el('line', { x1: off(A, t * 0.65)[0] + e.d[0] * o.width * 0.4, y1: off(A, t * 0.65)[1] + e.d[1] * o.width * 0.4, x2: off(B, t * 0.65)[0], y2: off(B, t * 0.65)[1], ...S, 'stroke-width': 2.4 }, g);
      } else if (o.kind !== 'passage') {
        const leaves = o.kind === 'double' ? [[A, B, o.width / 2], [B, A, o.width / 2]] : [[(o.flip & 1) ? B : A, (o.flip & 1) ? A : B, o.width]];
        const sn = (o.flip & 2) ? e.n : [-e.n[0], -e.n[1]];
        for (const [h, other, w] of leaves) {
          const base = (o.flip & 2) ? off(h, t) : h;
          const tip = [base[0] + sn[0] * w, base[1] + sn[1] * w];
          const to = [base[0] + (other[0] - h[0]) / o.width * w, base[1] + (other[1] - h[1]) / o.width * w];
          const v1 = [tip[0] - base[0], tip[1] - base[1]], v2 = [to[0] - base[0], to[1] - base[1]];
          const sweep = v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0;
          el('line', { x1: base[0], y1: base[1], x2: tip[0], y2: tip[1], ...S }, g);
          el('path', { d: `M${tip[0]} ${tip[1]}A${w} ${w} 0 0 ${sweep} ${to[0]} ${to[1]}`, ...S, 'stroke-width': 0.9, 'stroke-dasharray': '4 3' }, g);
        }
      }
      if (!ex && st.sel && st.sel.open === o.id) el('polygon', { points: P([off(A, -4), off(B, -4), off(B, t + 4), off(A, t + 4)]), fill: 'none', stroke: '#1D3FD6', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' }, g);
    }
    // Maten en naam
    if (opts.dims !== false) r.pts.forEach((_, i) => {
      const e = edge(r, i), s = ex ? 'ok' : wallStatus(r, i);
      const m = [(e.a[0] + e.b[0]) / 2 - e.n[0] * 20, (e.a[1] + e.b[1]) / 2 - e.n[1] * 20];
      let ang = Math.atan2(e.d[1], e.d[0]) * 180 / Math.PI;
      if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
      const t = el('text', { x: m[0], y: m[1], transform: `rotate(${ang.toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)})`, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 15, 'font-weight': s === 'ok' ? 700 : 500, fill: s === 'open' ? '#A3A197' : '#1E1F1C' }, gText);
      t.textContent = (s === 'open' ? '≈ ' : '') + fmtM(e.len);
    });
    const c = centroid(r.pts);
    const tn = el('text', { x: c[0], y: c[1] - 8, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: '#0E0F0D' }, gText); tn.textContent = r.name;
    const ta = el('text', { x: c[0], y: c[1] + 14, 'text-anchor': 'middle', 'font-size': 14, fill: '#6B6A63' }, gText); ta.textContent = fmtArea(areaM2(r)) + (opts.heights ? ` · h ${fmtM(r.h)} m` : '');
  }
  if (opts.furniture !== false) for (const it of f.items) {
    const g = el('g', { transform: `translate(${it.x} ${it.y}) rotate(${it.rot || 0})`, ...(ex ? {} : { 'data-k': 'item', 'data-item': it.id }) }, gItem);
    const sel = !ex && st.sel && st.sel.item === it.id;
    if (it.kind === 'rtable') el('ellipse', { cx: 0, cy: 0, rx: it.w / 2, ry: it.d / 2, fill: '#F7F6F2', stroke: sel ? '#1D3FD6' : '#6B6A63', 'stroke-width': sel ? 3 : 1.4 }, g);
    else el('rect', { x: -it.w / 2, y: -it.d / 2, width: it.w, height: it.d, rx: 2, fill: '#F7F6F2', stroke: sel ? '#1D3FD6' : '#6B6A63', 'stroke-width': sel ? 3 : 1.4 }, g);
    if (!furnSymbol(g, it) || ['table', 'desk', 'kitchen', 'fridge', 'tv'].includes(it.kind)) {
      const lt = el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': Math.min(13, it.w / 5, it.d / 2.2), fill: '#6B6A63', 'font-family': fontF, 'pointer-events': 'none', transform: `rotate(${-(it.rot || 0)})` }, g);
      lt.textContent = (FURN[it.kind] || [it.kind])[0];
    }
  }
}

function render() {
  if (!st.plan) return;
  world.textContent = ''; overlay.textContent = '';
  drawFloor(floor(), world, { dims: true, furniture: true });
  // geselecteerde muur
  if (st.sel && st.sel.wall != null) {
    const r = roomById(st.sel.room);
    if (r && st.sel.wall < r.pts.length) {
      const e = edge(r, st.sel.wall);
      el('line', { x1: e.a[0], y1: e.a[1], x2: e.b[0], y2: e.b[1], stroke: '#1D3FD6', 'stroke-width': 6, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }, overlay);
    }
  }
  if (st.sel && st.sel.room && st.sel.wall == null && !st.sel.open) {
    const r = roomById(st.sel.room);
    if (r) el('polygon', { points: P(r.pts), fill: 'none', stroke: '#1D3FD6', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 5', 'pointer-events': 'none' }, overlay);
  }
  applyView();
  renderPanel();
}
const roomById = (id) => floor().rooms.find((r) => r.id === id);
const itemById = (id) => floor().items.find((r) => r.id === id);

/* ======================== Beeld (zoomen/verschuiven) ======================== */
function applyView() {
  const v = st.view;
  $('pe-view').setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.s})`);
  $('pe-grid-major').setAttribute('stroke-width', 1 / v.s);
  $('pe-grid-minor').setAttribute('stroke-width', 0.7 / v.s);
}
function toWorld(cx, cy) { const b = svg.getBoundingClientRect(); return [(cx - b.left - st.view.tx) / st.view.s, (cy - b.top - st.view.ty) / st.view.s]; }
function bounds(f) {
  const xs = [], ys = [];
  for (const r of f.rooms) for (const q of outerPts(r)) { xs.push(q[0]); ys.push(q[1]); }
  for (const it of f.items) { xs.push(it.x - it.w / 2, it.x + it.w / 2); ys.push(it.y - it.d / 2, it.y + it.d / 2); }
  if (!xs.length) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function fit() {
  const b = svg.getBoundingClientRect(), bb = bounds(floor());
  if (!bb) { st.view = { s: Math.min(b.width, b.height) / 1000, tx: b.width / 2, ty: b.height / 2 }; applyView(); return; }
  const pad = 90, w = bb[2] - bb[0], h = bb[3] - bb[1];
  const s = Math.min((b.width - pad * 2) / Math.max(w, 100), (b.height - pad * 2) / Math.max(h, 100), 3);
  st.view = { s, tx: b.width / 2 - (bb[0] + w / 2) * s, ty: b.height / 2 - (bb[1] + h / 2) * s };
  applyView();
}
function zoomAt(f, cx, cy) {
  const b = svg.getBoundingClientRect();
  const x = cx == null ? b.width / 2 : cx - b.left, y = cy == null ? b.height / 2 : cy - b.top;
  const s = Math.min(8, Math.max(0.05, st.view.s * f));
  st.view.tx = x - (x - st.view.tx) * (s / st.view.s);
  st.view.ty = y - (y - st.view.ty) * (s / st.view.s);
  st.view.s = s; applyView();
}
$('pe-zoom-in').addEventListener('click', () => zoomAt(1.3));
$('pe-zoom-out').addEventListener('click', () => zoomAt(1 / 1.3));
$('pe-fit').addEventListener('click', fit);
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || !e.deltaX) zoomAt(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
  else { st.view.tx -= e.deltaX; st.view.ty -= e.deltaY; applyView(); }
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* ======================== Gereedschap ======================== */
const HINTS = {
  select: 'Tik op een muur om de lengte in te vullen. Sleep om te verschuiven. Twee vingers: zoomen en verplaatsen.',
  sketch: 'Teken de vorm van de ruimte met je vinger. Loslaten = klaar, de hoeken worden recht gezet.',
  rect: 'Sleep van hoek naar hoek om een rechthoekige ruimte te maken.',
  door: 'Tik op een muur om er een deur te plaatsen.',
  window: 'Tik op een muur om er een raam te plaatsen.',
};
function setTool(t) {
  if (t === 'furniture') { openLib(); return; }
  st.tool = t;
  document.querySelectorAll('.pe-tools [data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
  svg.dataset.tool = t;
  $('pe-hint').textContent = HINTS[t] || '';
  $('pe-hint').classList.remove('is-gone');
  clearTimeout(setTool.h); setTool.h = setTimeout(() => $('pe-hint').classList.add('is-gone'), 5000);
}
document.querySelectorAll('.pe-tools [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
function toast(msg) { const t = $('pe-toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('is-on'), 3800); }

function openLib() {
  $('pe-lib-grid').innerHTML = Object.entries(FURN).map(([k, [name, w, d]]) => {
    const sc = 56 / Math.max(w, d);
    return `<button type="button" data-furn="${k}"><svg viewBox="${-w / 2 - 4} ${-d / 2 - 4} ${w + 8} ${d + 8}" width="${(w + 8) * sc}" height="${(d + 8) * sc}" aria-hidden="true">${furnPreview(k, w, d)}</svg><b>${name}</b><span>${w} × ${d}</span></button>`;
  }).join('');
  $('pe-lib').showModal();
}
function furnPreview(kind, w, d) {
  const g = document.createElementNS(NS, 'g');
  if (kind === 'rtable') el('ellipse', { cx: 0, cy: 0, rx: w / 2, ry: d / 2, fill: '#F7F6F2', stroke: '#6B6A63', 'stroke-width': 1.4 }, g);
  else el('rect', { x: -w / 2, y: -d / 2, width: w, height: d, rx: 2, fill: '#F7F6F2', stroke: '#6B6A63', 'stroke-width': 1.4 }, g);
  furnSymbol(g, { kind, w, d });
  return g.innerHTML;
}
$('pe-lib-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-furn]'); if (!b) return;
  const [, w, d] = FURN[b.dataset.furn];
  const r = svg.getBoundingClientRect();
  const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
  snapshot();
  const it = { id: uid(), kind: b.dataset.furn, x: r5(c[0]), y: r5(c[1]), w, d, rot: 0 };
  floor().items.push(it);
  st.sel = { item: it.id };
  $('pe-lib').close(); setTool('select'); render(); markDirty();
  toast('Sleep het meubel naar de juiste plek.');
});

/* ======================== Aanraken ======================== */
const ptrs = new Map();
let G = null; // huidige beweging
let pinch = null;

function targetOf(e) {
  const t = e.target.closest && e.target.closest('[data-k]');
  if (!t) return { k: 'none' };
  return { k: t.dataset.k, room: t.dataset.room, i: t.dataset.i != null ? +t.dataset.i : null, open: t.dataset.open, item: t.dataset.item };
}
function nearestWall(pt, maxPx) {
  let best = null, bd = maxPx / st.view.s;
  for (const r of floor().rooms) r.pts.forEach((_, i) => {
    const e = edge(r, i);
    const v = [pt[0] - e.a[0], pt[1] - e.a[1]];
    const along = v[0] * e.d[0] + v[1] * e.d[1];
    if (along < 0 || along > e.len) return;
    const dist = Math.abs(v[0] * e.n[0] + v[1] * e.n[1] - wallT(r, i) / 2);
    if (dist < bd) { bd = dist; best = { room: r, i, along }; }
  });
  return best;
}

svg.addEventListener('pointerdown', (e) => {
  svg.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) {
    if (G && G.type === 'sketch') overlay.textContent = '';
    G = null;
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: { ...st.view } };
    return;
  }
  if (ptrs.size > 2) return;
  const w = toWorld(e.clientX, e.clientY);
  const tg = targetOf(e);
  G = { type: 'tap', start: [e.clientX, e.clientY], w0: w, tg, moved: false, view0: { ...st.view } };
  if (st.tool === 'sketch') G.type = 'sketch', G.pts = [w];
  else if (st.tool === 'rect') G.type = 'rect';
  else if (st.tool === 'door' || st.tool === 'window') G.type = 'pan';
  else if (st.tool === 'select') {
    if (tg.k === 'item') { const it = itemById(tg.item); G.type = 'item'; G.orig = [it.x, it.y]; }
    else if (tg.k === 'open') G.type = 'open';
    else if (tg.k === 'wall') { G.type = 'wall'; G.orig = roomById(tg.room).pts.map((q) => q.slice()); }
    else if (tg.k === 'room') {
      const r = roomById(tg.room);
      G.type = 'room'; G.orig = r.pts.map((q) => q.slice());
      G.items = floor().items.filter((it) => inPoly([it.x, it.y], r.pts)).map((it) => [it, it.x, it.y]);
    } else G.type = 'pan';
  }
});
svg.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const r = svg.getBoundingClientRect(), v0 = pinch.v;
    const s = Math.min(8, Math.max(0.05, v0.s * d / pinch.d));
    const wx = (pinch.c[0] - r.left - v0.tx) / v0.s, wy = (pinch.c[1] - r.top - v0.ty) / v0.s;
    st.view = { s, tx: c[0] - r.left - wx * s, ty: c[1] - r.top - wy * s };
    applyView(); return;
  }
  if (!G) return;
  const dx = e.clientX - G.start[0], dy = e.clientY - G.start[1];
  if (!G.moved && Math.hypot(dx, dy) < 6) return;
  if (!G.moved && ['item', 'open', 'wall', 'room'].includes(G.type)) { snapshot(); G.snap = true; }
  G.moved = true;
  const w = toWorld(e.clientX, e.clientY);
  const W = [w[0] - G.w0[0], w[1] - G.w0[1]];
  if (G.type === 'pan') { st.view.tx = G.view0.tx + dx; st.view.ty = G.view0.ty + dy; applyView(); }
  else if (G.type === 'sketch') {
    G.pts.push(w);
    overlay.textContent = '';
    el('polyline', { points: P(G.pts), fill: 'none', stroke: '#1D3FD6', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, overlay);
  } else if (G.type === 'rect') {
    const a = G.w0, b = w;
    G.pts = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
    overlay.textContent = '';
    el('polygon', { points: P(G.pts), fill: 'rgba(29,63,214,.08)', stroke: '#1D3FD6', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, overlay);
    const lab = el('text', { x: Math.max(a[0], b[0]) + 8 / st.view.s, y: Math.max(a[1], b[1]) + 18 / st.view.s, 'font-size': 14 / st.view.s, fill: '#1D3FD6', 'font-weight': 700 }, overlay);
    lab.textContent = `${fmtM(Math.abs(b[0] - a[0]))} × ${fmtM(Math.abs(b[1] - a[1]))} m`;
  } else if (G.type === 'item') {
    const it = itemById(G.tg.item); it.x = r5(G.orig[0] + W[0]); it.y = r5(G.orig[1] + W[1]); st.sel = { item: it.id }; render();
  } else if (G.type === 'open') {
    const r = roomById(G.tg.room), o = r.open.find((q) => q.id === G.tg.open), ed = edge(r, o.wall);
    const along = (w[0] - ed.a[0]) * ed.d[0] + (w[1] - ed.a[1]) * ed.d[1];
    o.pos = Math.round(Math.min(Math.max(along, o.width / 2), ed.len - o.width / 2));
    st.sel = { room: r.id, open: o.id }; render();
  } else if (G.type === 'wall') {
    const r = roomById(G.tg.room), i = G.tg.i, ed = edge({ ...r, pts: G.orig }, i);
    const k = r5(W[0] * ed.n[0] + W[1] * ed.n[1]);
    const n = r.pts.length;
    const test = G.orig.map((q) => q.slice());
    for (const j of [i, (i + 1) % n]) { test[j][0] += ed.n[0] * k; test[j][1] += ed.n[1] * k; }
    const tmp = { ...r, pts: test };
    if (sameShape({ ...r, pts: G.orig }, tmp) && test.every((_, j) => edge(tmp, j).len > 5)) {
      r.pts = test;
      r.walls[(i - 1 + n) % n].ok = false; r.walls[(i + 1) % n].ok = false;
    }
    st.sel = { room: r.id, wall: i }; render();
  } else if (G.type === 'room') {
    const r = roomById(G.tg.room);
    const moved = G.orig.map((q) => [q[0] + W[0], q[1] + W[1]]);
    const [cx, cy] = moveSnap(moved, r.id, r.t);
    const fx = cx == null ? r5(W[0]) : W[0] + cx, fy = cy == null ? r5(W[1]) : W[1] + cy;
    r.pts = G.orig.map((q) => [q[0] + fx, q[1] + fy]);
    for (const [it, x, y] of G.items) { it.x = x + fx; it.y = y + fy; }
    st.sel = { room: r.id }; render();
  }
});
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; G = null; return; }
  if (!G) return;
  const g = G; G = null;
  if (e.type === 'pointercancel') { overlay.textContent = ''; render(); return; }
  if (g.type === 'sketch') {
    overlay.textContent = '';
    if (!g.moved || g.pts.length < 4) { tapSelect(g); return; }
    const xs = g.pts.map((q) => q[0]), ys = g.pts.map((q) => q[1]);
    if (Math.max(...xs) - Math.min(...xs) < 40 || Math.max(...ys) - Math.min(...ys) < 40) { toast('Te klein. Teken de ruimte groter (of zoom uit).'); return; }
    addRoom(orthogonalize(g.pts));
    return;
  }
  if (g.type === 'rect') {
    overlay.textContent = '';
    if (!g.moved || !g.pts) { tapSelect(g); return; }
    const p = g.pts.map((q) => [q[0], q[1]]);
    if (Math.abs(p[1][0] - p[0][0]) < 40 || Math.abs(p[2][1] - p[1][1]) < 40) { toast('Te klein.'); return; }
    addRoom(p);
    return;
  }
  if (g.moved) { if (g.type !== 'pan') { markDirty(); render(); } return; }
  tapSelect(g);
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

function addRoom(pts) {
  const r = newRoom(pts);
  if (!r) { toast('Die vorm lukte niet. Probeer opnieuw.'); return; }
  snapshot();
  floor().rooms.push(r);
  st.sel = { room: r.id, wall: 0 };
  setTool('select');
  render(); markDirty();
  focusLength();
}
function tapSelect(g) {
  const tg = g.tg;
  if (st.tool === 'door' || st.tool === 'window') {
    const hit = nearestWall(g.w0, 30);
    if (!hit) { toast('Tik dichter bij een muur.'); return; }
    snapshot();
    const kind = st.tool === 'door' ? 'door' : 'window';
    const width = kind === 'door' ? 83 : Math.min(120, Math.max(40, hit.room.pts.length && edge(hit.room, hit.i).len - 20));
    const ed = edge(hit.room, hit.i);
    if (ed.len < width + 4) { st.undo.pop(); syncUndo(); toast('Deze muur is te kort.'); return; }
    const o = { id: uid(), wall: hit.i, pos: Math.round(Math.min(Math.max(hit.along, width / 2), ed.len - width / 2)), width, kind, flip: 0 };
    hit.room.open = hit.room.open || [];
    hit.room.open.push(o);
    st.sel = { room: hit.room.id, open: o.id };
    render(); markDirty();
    return;
  }
  if (tg.k === 'wall') st.sel = { room: tg.room, wall: tg.i };
  else if (tg.k === 'open') st.sel = { room: tg.room, open: tg.open };
  else if (tg.k === 'item') st.sel = { item: tg.item };
  else if (tg.k === 'room') st.sel = { room: tg.room };
  else st.sel = null;
  render();
  if (st.sel && st.sel.wall != null) focusLength();
}

/* ======================== Eigenschappen (paneel) ======================== */
function focusLength() {
  const i = $('pe-len');
  if (i) { i.focus({ preventScroll: true }); i.select(); }
}
function parseLen(v) {
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0) return null;
  if (!/[.]/.test(s) && n >= 30) return n; // centimeter
  return n * 100;
}
function renderPanel() {
  const p = $('pe-panel');
  const s = st.sel;
  if (!s) { p.hidden = true; p.innerHTML = ''; return; }
  p.hidden = false;
  if (s.item) {
    const it = itemById(s.item); if (!it) { p.hidden = true; return; }
    p.innerHTML = `
      <div class="pe-p-head"><b>${esc((FURN[it.kind] || [it.kind])[0])}</b><button type="button" class="pe-p-x" data-act="close" aria-label="Sluiten">✕</button></div>
      <div class="pe-p-row"><label>Breedte (cm)<input type="number" inputmode="numeric" id="pe-it-w" value="${it.w}" min="10" max="2000"></label>
      <label>Diepte (cm)<input type="number" inputmode="numeric" id="pe-it-d" value="${it.d}" min="10" max="2000"></label></div>
      <div class="pe-p-btns"><button type="button" data-act="rot">↻ Draai 90°</button><button type="button" data-act="dup">Dupliceer</button><button type="button" class="is-del" data-act="del">Verwijder</button></div>`;
    return;
  }
  const r = roomById(s.room); if (!r) { p.hidden = true; return; }
  if (s.open) {
    const o = (r.open || []).find((q) => q.id === s.open); if (!o) { p.hidden = true; return; }
    p.innerHTML = `
      <div class="pe-p-head"><b>${OPEN_KINDS[o.kind]}</b><button type="button" class="pe-p-x" data-act="close" aria-label="Sluiten">✕</button></div>
      <label class="pe-p-full">Soort<select id="pe-o-kind">${Object.entries(OPEN_KINDS).map(([k, v]) => `<option value="${k}"${k === o.kind ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="pe-p-full">Breedte (cm)<input type="number" inputmode="numeric" id="pe-o-w" value="${o.width}" min="30" max="600"></label>
      <div class="pe-p-btns">${['door', 'double'].includes(o.kind) ? '<button type="button" data-act="flip">⇄ Draairichting</button>' : ''}<button type="button" class="is-del" data-act="del">Verwijder</button></div>
      <p class="pe-p-tip">Sleep om te verschuiven langs de muur.</p>`;
    return;
  }
  if (s.wall != null) {
    const i = s.wall, e = edge(r, i), stt = wallStatus(r, i), n = r.pts.length;
    const done = r.walls.filter((w, j) => wallStatus(r, j) !== 'open').length;
    p.innerHTML = `
      <div class="pe-p-head"><b>${esc(r.name)} · muur ${i + 1}/${n}</b><button type="button" class="pe-p-x" data-act="close" aria-label="Sluiten">✕</button></div>
      <form class="pe-len-form" id="pe-len-form">
        <label for="pe-len">Lengte binnenmaat (m)</label>
        <div class="pe-len-row">
          <input type="text" inputmode="decimal" id="pe-len" autocomplete="off" value="${stt === 'open' ? '' : fmtM(e.len)}" placeholder="≈ ${fmtM(e.len)}">
          <button type="submit" class="pe-len-ok">OK →</button>
        </div>
      </form>
      <p class="pe-p-tip">${stt === 'derived' ? 'Deze muur wordt berekend uit de andere maten.' : stt === 'ok' ? 'Gemeten ✓' : 'Typ de maat van je meter, bv. 4,25.'} ${done}/${n} muren gekend.</p>
      <div class="pe-p-row"><label>Muurdikte (cm)<input type="number" inputmode="numeric" id="pe-w-t" value="${wallT(r, i)}" min="2" max="80"></label></div>
      <div class="pe-p-btns"><button type="button" data-act="prev">← Vorige</button><button type="button" data-act="next">Volgende →</button><button type="button" data-act="room">Ruimte</button></div>`;
    return;
  }
  p.innerHTML = `
    <div class="pe-p-head"><b>Ruimte</b><button type="button" class="pe-p-x" data-act="close" aria-label="Sluiten">✕</button></div>
    <label class="pe-p-full">Functie<select id="pe-r-type">${ROOM_TYPES.map((t) => `<option${t === r.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="pe-p-full">Naam op het plan<input type="text" id="pe-r-name" value="${esc(r.name)}" maxlength="40"></label>
    <div class="pe-p-row"><label>Hoogte (cm)<input type="number" inputmode="numeric" id="pe-r-h" value="${r.h}" min="100" max="1000"></label>
    <label>Muurdikte (cm)<input type="number" inputmode="numeric" id="pe-r-t" value="${r.t}" min="2" max="80"></label></div>
    <p class="pe-p-area">${fmtArea(areaM2(r))} · volume ${(areaM2(r) * r.h / 100).toFixed(1).replace('.', ',')} m³</p>
    <div class="pe-p-btns"><button type="button" data-act="walls">Maten invullen</button><button type="button" data-act="dup">Dupliceer</button><button type="button" class="is-del" data-act="del">Verwijder</button></div>`;
}
function nextWall(r, from, dir = 1) {
  const n = r.pts.length;
  for (let k = 1; k <= n; k++) { const j = (from + dir * k + n * 2) % n; if (wallStatus(r, j) === 'open') return j; }
  return null;
}
$('pe-panel').addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id !== 'pe-len-form') return;
  const r = roomById(st.sel.room), i = st.sel.wall;
  const L = parseLen($('pe-len').value);
  if (L == null) { const j = nextWall(r, i); if (j != null) { st.sel = { room: r.id, wall: j }; render(); focusLength(); } return; }
  snapshot();
  const res = setWallLength(r, i, Math.round(L * 10) / 10);
  if (!res.ok) { st.undo.pop(); syncUndo(); toast(res.msg); return; }
  if (res.warn) toast(res.warn);
  markDirty();
  const j = nextWall(r, i);
  if (j == null) { st.sel = { room: r.id }; render(); toast(`Alle maten gekend ✓ ${r.name}: ${fmtArea(areaM2(r))}`); return; }
  st.sel = { room: r.id, wall: j }; render(); focusLength();
});
$('pe-panel').addEventListener('change', (e) => {
  const s = st.sel; if (!s) return;
  const id = e.target.id, v = e.target.value;
  if (id === 'pe-len') return;
  snapshot();
  if (s.item) {
    const it = itemById(s.item);
    if (id === 'pe-it-w') it.w = Math.max(10, +v || it.w);
    if (id === 'pe-it-d') it.d = Math.max(10, +v || it.d);
  } else {
    const r = roomById(s.room);
    if (s.open) {
      const o = r.open.find((q) => q.id === s.open);
      if (id === 'pe-o-kind') { o.kind = v; if (v === 'window' && o.width < 60) o.width = 100; }
      if (id === 'pe-o-w') o.width = Math.min(Math.max(30, +v || o.width), edge(r, o.wall).len);
    } else if (s.wall != null) {
      if (id === 'pe-w-t') r.walls[s.wall].t = Math.max(2, +v || r.t);
    } else {
      if (id === 'pe-r-type') { const auto = /^Ruimte \d+$/.test(r.name) || ROOM_TYPES.includes(r.name); r.type = v; if (auto) r.name = v; }
      if (id === 'pe-r-name') r.name = v.trim().slice(0, 40) || r.type;
      if (id === 'pe-r-h') r.h = Math.max(100, +v || r.h);
      if (id === 'pe-r-t') { r.t = Math.max(2, +v || r.t); st.plan.wallT = r.t; }
    }
  }
  render(); markDirty();
});
$('pe-panel').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, s = st.sel; if (!s) return;
  if (a === 'close') { st.sel = null; render(); return; }
  if (s.item) {
    const f = floor(), it = itemById(s.item);
    snapshot();
    if (a === 'rot') it.rot = ((it.rot || 0) + 90) % 360;
    if (a === 'dup') { const c = { ...it, id: uid(), x: it.x + 30, y: it.y + 30 }; f.items.push(c); st.sel = { item: c.id }; }
    if (a === 'del') { f.items = f.items.filter((q) => q.id !== it.id); st.sel = null; }
    render(); markDirty(); return;
  }
  const r = roomById(s.room);
  if (s.open) {
    snapshot();
    const o = r.open.find((q) => q.id === s.open);
    if (a === 'flip') o.flip = ((o.flip || 0) + 1) % 4;
    if (a === 'del') { r.open = r.open.filter((q) => q.id !== o.id); st.sel = null; }
    render(); markDirty(); return;
  }
  if (s.wall != null) {
    if (a === 'next' || a === 'prev') { const n = r.pts.length; st.sel = { room: r.id, wall: (s.wall + (a === 'next' ? 1 : -1) + n) % n }; render(); focusLength(); }
    if (a === 'room') { st.sel = { room: r.id }; render(); }
    return;
  }
  if (a === 'walls') { const j = nextWall(r, -1); st.sel = { room: r.id, wall: j == null ? 0 : j }; render(); focusLength(); return; }
  if (a === 'dup') { snapshot(); const c = JSON.parse(JSON.stringify(r)); c.id = uid(); c.pts = c.pts.map((q) => [q[0] + 60, q[1] + 60]); c.open.forEach((o) => { o.id = uid(); }); floor().rooms.push(c); st.sel = { room: c.id }; render(); markDirty(); return; }
  if (a === 'del') {
    if (!(await confirmBox('Ruimte verwijderen?', `"${r.name}" wordt verwijderd.`))) return;
    snapshot(); floor().rooms = floor().rooms.filter((q) => q.id !== r.id); st.sel = null; render(); markDirty();
  }
});
document.addEventListener('keydown', (e) => {
  if ($('pe').hidden) return;
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(e.shiftKey ? st.redo : st.undo, e.shiftKey ? st.undo : st.redo); return; }
  if (typing) return;
  if (e.key === 'Escape') { st.sel = null; render(); }
  if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel) { const b = $('pe-panel').querySelector('[data-act=del]'); if (b) b.click(); }
});
window.addEventListener('resize', () => { if (!$('pe').hidden) applyView(); });

/* ======================== Exporteren ======================== */
function exportSVG(f, opts) {
  const tmp = document.createElementNS(NS, 'g');
  const prevSel = st.sel; st.sel = null;
  drawFloor(f, tmp, { export: true, dims: opts.dims, furniture: opts.furniture, heights: true });
  st.sel = prevSel;
  const bb = bounds(f) || [0, 0, 500, 300];
  const pad = 70, W = bb[2] - bb[0] + pad * 2, H = bb[3] - bb[1] + pad * 2 + 90;
  const x0 = bb[0] - pad, y0 = bb[1] - pad;
  const total = f.rooms.reduce((s, r) => s + areaM2(r), 0);
  const fy = bb[3] + pad + 30;
  const foot = `
    <line x1="${x0 + pad}" y1="${fy - 18}" x2="${x0 + W - pad}" y2="${fy - 18}" stroke="#D4D2CA" stroke-width="1"/>
    <text x="${x0 + pad}" y="${fy + 10}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#0E0F0D">${esc(st.plan.title)}</text>
    <text x="${x0 + pad}" y="${fy + 36}" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#6B6A63">${esc(f.name)} · ${f.rooms.length} ${f.rooms.length === 1 ? 'ruimte' : 'ruimtes'} · totaal ${fmtArea(total)} netto · maten binnenwerks in meter · indicatief</text>
    <g transform="translate(${x0 + W - pad - 100} ${fy - 4})"><rect x="0" y="0" width="100" height="6" fill="#0E0F0D"/><rect x="50" y="0" width="50" height="6" fill="#fff" stroke="#0E0F0D"/><text x="0" y="24" font-family="Arial" font-size="12" fill="#6B6A63">0</text><text x="100" y="24" text-anchor="end" font-family="Arial" font-size="12" fill="#6B6A63">1 m</text></g>
    <text x="${x0 + W - pad - 120}" y="${fy + 12}" text-anchor="end" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="20" fill="#0E0F0D">BURO SCOTT<tspan fill="#1D3FD6">.</tspan></text>`;
  return { svg: `<svg xmlns="${NS}" viewBox="${x0} ${y0} ${W} ${H}" width="${W}" height="${H}"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#fff"/>${tmp.innerHTML}${foot}</svg>`, W, H };
}
$('pe-export').addEventListener('click', () => $('pe-export-dlg').showModal());
$('pe-x-png').addEventListener('click', async () => {
  const f = floor();
  if (!f.rooms.length) { toast('Deze verdieping is nog leeg.'); return; }
  const { svg: s, W, H } = exportSVG(f, { dims: $('pe-x-dims').checked, furniture: $('pe-x-furn').checked });
  const k = Math.min(4, 3200 / Math.max(W, H));
  const img = new Image();
  const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const name = `${st.plan.title} - ${f.name}.png`.replace(/[\\/:*?"<>|]+/g, '-');
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file], title: name }); $('pe-export-dlg').close(); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  $('pe-export-dlg').close();
});
$('pe-x-pdf').addEventListener('click', () => {
  const opts = { dims: $('pe-x-dims').checked, furniture: $('pe-x-furn').checked };
  const pages = st.plan.floors.filter((f) => f.rooms.length);
  if (!pages.length) { toast('Er is nog niets getekend.'); return; }
  $('pe-print').innerHTML = pages.map((f) => `<div class="pe-print-page">${exportSVG(f, opts).svg}</div>`).join('');
  $('pe-export-dlg').close();
  const old = document.title; document.title = st.plan.title;
  setTimeout(() => { window.print(); document.title = old; }, 60);
});

/* ======================== Start ======================== */
async function start() {
  const id = new URLSearchParams(location.search).get('p');
  if (id) { try { await openPlan(id); return; } catch (e) {} }
  await openList();
}
(async function init() {
  if (!API) { show('pl-setup'); return; }
  const s = AdminSession.get();
  if (s) { st.token = s.token; show('pl-list-view'); try { await start(); return; } catch (e) {} }
  show('pl-login-view');
})();
