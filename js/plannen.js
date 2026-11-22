/* ============================================================
   BURO SCOTT — PLANNEN TEKENEN
   Fase 1 · Ruimtes: binnenmaten, ruimtes tegen elkaar klikken.
   Fase 2 · Muren & deuren: muurdiktes (binnen/buiten/per muur),
            deuren, ramen en meubels. Gedeelde muren = één muur.
   Alle maten in centimeter. Ruimtes liggen in "fase-1-ruimte"
   (zonder muren); in fase 2 worden ze uit elkaar geschoven met
   de dikte van de gedeelde muur.
============================================================ */
const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const R1 = (v) => Math.round(v); // snapraster: 1 cm
const fmtM = (cm) => (cm / 100).toFixed(2).replace('.', ',');
const fmtArea = (m2) => m2.toFixed(m2 < 10 ? 2 : 1).replace('.', ',') + ' m²';

const ROOM_TYPES = ['Woonkamer', 'Leefruimte', 'Keuken', 'Eetkamer', 'Slaapkamer', 'Badkamer', 'Douchekamer', 'Toilet', 'Inkomhal', 'Nachthal', 'Bureau', 'Berging', 'Wasplaats', 'Dressing', 'Garage', 'Zolder', 'Kelder', 'Veranda', 'Terras', 'Schacht', 'Ruimte'];
const FURN = {
  bed2: ['Bed 2 personen', 160, 200], bed1: ['Bed 1 persoon', 90, 200], sofa: ['Zetel', 220, 90], armchair: ['Fauteuil', 80, 80],
  table: ['Tafel', 160, 90], rtable: ['Ronde tafel', 110, 110], chair: ['Stoel', 45, 50], desk: ['Bureau', 140, 70],
  wardrobe: ['Kast', 120, 60], tv: ['Tv-meubel', 180, 45], kitchen: ['Keukenblok', 240, 60], hob: ['Kookplaat', 60, 60],
  fridge: ['Koelkast', 60, 65], ksink: ['Spoelbak', 80, 60], bath: ['Bad', 170, 75], shower: ['Douche', 90, 90],
  wc: ['Toilet', 40, 65], sink: ['Lavabo', 60, 45], washer: ['Wasmachine', 60, 60],
};
// Bouwkundige elementen: blijven ook zichtbaar als meubels bij export uit staan
const ELEM = { stairs: ['Trap', 90, 280], steps: ['Opstap (2 treden)', 90, 50], wallpiece: ['Muurstuk', 60, 14] };
const STRUCT = new Set(Object.keys(ELEM));
const KINDS = { ...ELEM, ...FURN };
const OPEN_KINDS = { door: 'Deur', double: 'Dubbele deur', slide: 'Schuifdeur', passage: 'Doorgang', window: 'Raam' };
const T_CHIPS = [7, 10, 14, 20, 30, 35, 40];

const st = {
  token: null, plan: null, fi: 0, tool: 'select', sel: null, phase: 1,
  view: { s: 1, tx: 0, ty: 0 }, undo: [], redo: [], dirty: false, saveTimer: null,
};
const floor = () => st.plan.floors[st.fi];
// Context voor tekenen/berekenen van één verdieping
let CTX = { adj: new Map(), off: {} };

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
  const migrated = migrate(st.plan);
  st.fi = 0; st.sel = null; st.undo = []; st.redo = [];
  st.phase = st.plan.floors.some((f) => f.items.length || f.rooms.some((r) => (r.open || []).length)) ? 2 : 1;
  $('pe').hidden = false;
  document.body.classList.add('is-editor');
  $('pe-title').value = st.plan.title;
  history.replaceState(null, '', '?p=' + id);
  setPhase(st.phase, true);
  renderFloors();
  render();
  fit();
  if (st.plan !== p || migrated) { setSave(migrated ? 'Plan omgezet naar fases' : 'Lokale wijzigingen hersteld'); markDirty(); }
  else setSave('Opgeslagen');
  syncUndo();
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
const snapState = () => JSON.stringify({ floors: st.plan.floors, tIn: st.plan.tIn, tOut: st.plan.tOut, keepAlign: st.plan.keepAlign });
function snapshot() { st.undo.push(snapState()); if (st.undo.length > 80) st.undo.shift(); st.redo = []; syncUndo(); }
function syncUndo() { $('pe-undo').disabled = !st.undo.length; $('pe-redo').disabled = !st.redo.length; }
function restore(from, to) {
  if (!from.length) return;
  to.push(snapState());
  const s = JSON.parse(from.pop());
  st.plan.floors = s.floors; st.plan.tIn = s.tIn; st.plan.tOut = s.tOut; st.plan.keepAlign = s.keepAlign;
  st.fi = Math.min(st.fi, st.plan.floors.length - 1);
  st.sel = null; renderFloors(); render(); markDirty(); syncUndo();
}
$('pe-undo').addEventListener('click', () => restore(st.undo, st.redo));
$('pe-redo').addEventListener('click', () => restore(st.redo, st.undo));

/* ======================== Fases ======================== */
function setPhase(p, quiet) {
  st.phase = p; st.sel = null;
  $('pe-ph1').setAttribute('aria-pressed', String(p === 1));
  $('pe-ph2').setAttribute('aria-pressed', String(p === 2));
  document.querySelectorAll('.pe-tools [data-ph]').forEach((b) => { b.hidden = +b.dataset.ph !== p; });
  $('pe').dataset.phase = p;
  setTool('select');
  render();
  if (quiet) return;
  if (p === 2) {
    const open = floor().rooms.reduce((n, r) => n + r.pts.filter((_, i) => wallStatus(r, i) === 'open').length, 0);
    const mv = Object.keys(CTX.moved || {}).map((id) => roomById(id)).filter(Boolean);
    if (mv.length) { toast(`Gevels recht gehouden: ${mv.map((r) => r.name).join(', ')} ${mv.length > 1 ? 'zijn' : 'is'} iets smaller getekend door de binnenmuur. Tik op die muur voor details.`); return; }
    toast(open ? `Let op: ${open} muren hebben nog geen maat. Muren ingevoegd: binnen ${st.plan.tIn} cm, buiten ${st.plan.tOut} cm.` : `Muren ingevoegd: binnen ${st.plan.tIn} cm, buiten ${st.plan.tOut} cm. Tik op een muur om de dikte te wijzigen.`);
  } else toast('Fase 1: binnenmaten en ruimtes tegen elkaar schuiven.');
}
$('pe-ph1').addEventListener('click', () => setPhase(1));
$('pe-ph2').addEventListener('click', () => setPhase(2));

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
// Ligt ruimte b volledig binnen ruimte a (bv. toilet getekend in de gang)?
function inside(b, a) {
  const xs = (r, k) => r.pts.map((q) => q[k]);
  for (const k of [0, 1]) if (Math.min(...xs(b, k)) < Math.min(...xs(a, k)) - 0.6 || Math.max(...xs(b, k)) > Math.max(...xs(a, k)) + 0.6) return false;
  return areaM2(b) < areaM2(a) - 0.01 && inPoly(centroid(b.pts), a.pts);
}
// Oppervlakte zonder de ruimtes (incl. hun muren) die erin liggen
function netArea(r, rooms) {
  rooms = rooms || floor().rooms;
  let a = areaM2(r);
  for (const b of rooms) {
    if (b.id === r.id || !inside(b, r)) continue;
    const n = b.pts.length, E = [];
    for (let i = 0; i < n; i++) {
      const e = edge(b, i);
      // muur die samenvalt met de muur van de grote ruimte telt niet mee
      const onEdge = r.pts.some((_, j) => { const f = edge(r, j); return f.d[0] * e.d[0] + f.d[1] * e.d[1] > 0.99 && Math.abs((e.a[0] - f.a[0]) * f.n[0] + (e.a[1] - f.a[1]) * f.n[1]) < 0.6; });
      const t = onEdge ? 0 : (b.walls[i] && b.walls[i].t != null ? b.walls[i].t : st.plan.tIn);
      E.push({ p: [e.a[0] + e.n[0] * t, e.a[1] + e.n[1] * t], d: e.d });
    }
    const op = E.map((cur, i) => { const prev = E[(i - 1 + n) % n]; return lineX(prev.p, prev.d, cur.p, cur.d) || cur.p; });
    a -= Math.abs(signedArea(op)) / 10000;
  }
  return Math.max(0, a);
}
function edge(room, i) {
  const a = room.pts[i], b = room.pts[(i + 1) % room.pts.length];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const d = [dx / len, dy / len];
  const n = signedArea(room.pts) > 0 ? [d[1], -d[0]] : [-d[1], d[0]]; // naar buiten
  return { a, b, d, n, len };
}
function lineX(p1, d1, p2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
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
  const merged = [];
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
function sameShape(a, b) {
  for (let k = 0; k < a.pts.length; k++) {
    const e1 = edge(a, k), e2 = edge(b, k);
    if (e2.len < 1 || e1.d[0] * e2.d[0] + e1.d[1] * e2.d[1] < 0.99) return false;
  }
  return !selfCross(b.pts);
}

/* ---------- Aangrenzende muren en muurdiktes ---------- */
// Muren van verschillende ruimtes die tegen elkaar liggen (maxGap 0 = rakend)
function adjacency(rooms, maxGap = 0) {
  const map = new Map();
  const E = rooms.map((r) => r.pts.map((_, i) => edge(r, i)));
  rooms.forEach((A, ai) => rooms.forEach((B, bi) => {
    if (ai === bi) return;
    E[ai].forEach((ea, i) => E[bi].forEach((eb, j) => {
      if (ea.d[0] * eb.d[0] + ea.d[1] * eb.d[1] > -0.99) return;
      const g = (eb.a[0] - ea.a[0]) * ea.n[0] + (eb.a[1] - ea.a[1]) * ea.n[1];
      if (maxGap ? (g < 0.5 || g > maxGap) : Math.abs(g) > 0.6) return;
      const p1 = (eb.a[0] - ea.a[0]) * ea.d[0] + (eb.a[1] - ea.a[1]) * ea.d[1];
      const p2 = (eb.b[0] - ea.a[0]) * ea.d[0] + (eb.b[1] - ea.a[1]) * ea.d[1];
      const ov = Math.min(ea.len, Math.max(p1, p2)) - Math.max(0, Math.min(p1, p2));
      if (ov < 2) return;
      const k = A.id + ':' + i;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push({ room: B, i: j, gap: g, n: ea.n });
    }));
  }));
  return map;
}
// Verschuiving per ruimte zodat elke gedeelde muur zijn dikte krijgt
function solveOffsets(rooms, adj, valueFn) {
  const off = {}; rooms.forEach((r) => { off[r.id] = [0, 0]; });
  for (const ax of [0, 1]) {
    const nb = {}; rooms.forEach((r) => { nb[r.id] = []; });
    rooms.forEach((A) => A.pts.forEach((_, i) => {
      for (const p of adj.get(A.id + ':' + i) || []) {
        if (Math.abs(p.n[ax]) < 0.5) continue;
        nb[A.id].push([p.room.id, p.n[ax] * valueFn(A, i, p)]);
      }
    }));
    const minC = (r) => Math.min(...r.pts.map((q) => q[ax]));
    const order = rooms.slice().sort((a, b) => minC(a) - minC(b));
    const seen = new Set();
    for (const s of order) {
      if (seen.has(s.id)) continue;
      seen.add(s.id); const q = [s.id];
      while (q.length) {
        const u = q.shift();
        for (const [v, w] of nb[u]) if (!seen.has(v)) { seen.add(v); off[v][ax] = off[u][ax] + w; q.push(v); }
      }
    }
  }
  return off;
}
const isShared = (r, i) => CTX.adj.has(r.id + ':' + i);
// Ingestelde dikte (standaard of eigen waarde)
function wallT0(r, i) {
  const w = r.walls[i];
  if (w && w.t != null) return w.t;
  return isShared(r, i) ? st.plan.tIn : st.plan.tOut;
}
// Getekende dikte: kan bij een gedeelde muur afwijken om de gevels recht te houden
function wallT(r, i) {
  const g = CTX.gap && CTX.gap[r.id + ':' + i];
  return g != null ? g : wallT0(r, i);
}
/* Fase 2: ruimtes uit elkaar schuiven met de muurdiktes.
   Buitenmuren die in fase 1 op één lijn liggen, blijven op één lijn ("gevels recht houden").
   Liggen twee ruimtes aan weerszijden van een binnenmuur toch op dezelfde gevel (bv. een gang
   in een inham van de leefruimte), dan schuift niet de hele ruimte op maar enkel die ene muur:
   de ruimte waarvan de minst gemeten maten veranderen, wordt de muurdikte smaller. */
function solveLayout(rooms, adj) {
  const off = {}, dE = {};
  rooms.forEach((r) => { off[r.id] = [0, 0]; dE[r.id] = r.pts.map(() => [0, 0]); });
  const nominal = (A, i, p) => Math.max(wallT0(A, i), wallT0(p.room, p.i));
  const explicit = (A, i, p) => A.walls[i].t != null || p.room.walls[p.i].t != null;
  const gapOf = (A, i, p, ax) => (off[p.room.id][ax] + dE[p.room.id][p.i][ax] - off[A.id][ax] - dE[A.id][i][ax]) * p.n[ax];
  const solveAxis = (ax, align) => {
    rooms.forEach((r) => dE[r.id].forEach((d) => { d[ax] = 0; }));
    const par = {}; rooms.forEach((r) => { par[r.id] = r.id; });
    const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
    if (align) {
      const ext = [];
      rooms.forEach((r) => r.pts.forEach((_, i) => {
        if (adj.has(r.id + ':' + i)) return;
        const e = edge(r, i);
        if (Math.abs(e.n[ax]) > 0.5) ext.push({ id: r.id, c: e.a[ax], d: Math.sign(e.n[ax]) });
      }));
      for (let a = 0; a < ext.length; a++) for (let b = a + 1; b < ext.length; b++) {
        const A = ext[a], B = ext[b];
        if (A.id !== B.id && A.d === B.d && Math.abs(A.c - B.c) < 0.6) par[find(A.id)] = find(B.id);
      }
    }
    const nb = {}, conf = [];
    rooms.forEach((A) => A.pts.forEach((_, i) => {
      for (const p of adj.get(A.id + ':' + i) || []) {
        if (Math.abs(p.n[ax]) < 0.5) continue;
        const g1 = find(A.id), g2 = find(p.room.id);
        if (g1 === g2) { if (A.id < p.room.id) conf.push([A, i, p]); continue; }
        (nb[g1] = nb[g1] || []).push([g2, p.n[ax] * nominal(A, i, p), explicit(A, i, p)]);
      }
    }));
    Object.values(nb).forEach((l) => l.sort((x, y) => y[2] - x[2]));
    const gOff = {}, minC = {};
    rooms.forEach((r) => { const g = find(r.id), m = Math.min(...r.pts.map((q) => q[ax])); minC[g] = Math.min(minC[g] == null ? Infinity : minC[g], m); });
    const groups = Object.keys(minC).sort((a, b) => minC[a] - minC[b]);
    for (const s0 of groups) {
      if (gOff[s0] != null) continue;
      gOff[s0] = 0; const q = [s0];
      while (q.length) {
        const u = q.shift();
        for (const [v, w] of nb[u] || []) if (gOff[v] == null) { gOff[v] = gOff[u] + w; q.push(v); }
      }
    }
    rooms.forEach((r) => { off[r.id][ax] = gOff[find(r.id)] || 0; });
    // conflicten: één muur verplaatsen in plaats van een hele ruimte
    const cost = (r, i) => {
      const n = r.pts.length, e = edge(r, i), cs = r.pts.map((q) => q[ax]);
      const extreme = Math.abs(e.a[ax] - (e.n[ax] > 0 ? Math.max(...cs) : Math.min(...cs))) < 0.6;
      return (r.walls[(i - 1 + n) % n].ok ? 2 : 0) + (r.walls[(i + 1) % n].ok ? 2 : 0) + (r.walls[i].ok ? 0.5 : 0) + (extreme ? 0 : 1);
    };
    const span = (r) => { const cs = r.pts.map((q) => q[ax]); return Math.max(...cs) - Math.min(...cs); };
    for (const [A, i, p] of conf) {
      const need = nominal(A, i, p) - gapOf(A, i, p, ax);
      if (need < 0.5) continue;
      const B = p.room, cA = cost(A, i) + (span(A) < need + 20 ? 99 : 0), cB = cost(B, p.i) + (span(B) < need + 20 ? 99 : 0);
      if (cB <= cA) dE[B.id][p.i][ax] += p.n[ax] * need; else dE[A.id][i][ax] -= p.n[ax] * need;
    }
  };
  const gapsOk = (ax) => rooms.every((A) => A.pts.every((_, i) => (adj.get(A.id + ':' + i) || []).every((p) =>
    Math.abs(p.n[ax]) < 0.5 || gapOf(A, i, p, ax) >= 2)));
  const keep = st.plan.keepAlign !== false;
  for (const ax of [0, 1]) { solveAxis(ax, keep); if (keep && !gapsOk(ax)) solveAxis(ax, false); }
  // werkelijke dikte van gedeelde muren
  const gap = {};
  rooms.forEach((A) => A.pts.forEach((_, i) => {
    for (const p of adj.get(A.id + ':' + i) || []) {
      const ax = Math.abs(p.n[0]) > 0.5 ? 0 : 1;
      const g = Math.round(gapOf(A, i, p, ax) * 10) / 10;
      const k = A.id + ':' + i;
      gap[k] = Math.max(gap[k] || 0, g);
    }
  }));
  // per ruimte: welke muren zijn verschoven (voor melding)
  const moved = {};
  rooms.forEach((r) => r.pts.forEach((_, i) => { const d = dE[r.id][i], v = Math.abs(d[0]) + Math.abs(d[1]); if (v >= 0.5) (moved[r.id] = moved[r.id] || []).push([i, Math.round(v * 10) / 10]); }));
  return { off, gap, dE, moved };
}
function setCtx(f, solved) {
  CTX = { adj: adjacency(f.rooms), off: {}, gap: null, dE: {}, moved: {} };
  if (solved) { const L = solveLayout(f.rooms, CTX.adj); CTX.off = L.off; CTX.gap = L.gap; CTX.dE = L.dE; CTX.moved = L.moved; }
}
const offOf = (id) => (id && CTX.off[id]) || [0, 0];
function sh(r) {
  const o = offOf(r.id), d = CTX.dE && CTX.dE[r.id], n = r.pts.length;
  const moved = d && d.some((v) => v[0] || v[1]);
  if (!o[0] && !o[1] && !moved) return r;
  // punt i hoort bij muur i-1 en muur i; een verschoven muur verschuift beide hoekpunten
  return { ...r, pts: r.pts.map((q, i) => {
    const a = moved ? d[i] : [0, 0], b = moved ? d[(i - 1 + n) % n] : [0, 0];
    return [q[0] + o[0] + a[0] + b[0], q[1] + o[1] + a[1] + b[1]];
  }) };
}
function outerPts(room) { // room = verschoven ruimte; diktes via id/index
  const n = room.pts.length, E = [];
  for (let i = 0; i < n; i++) { const e = edge(room, i), t = wallT(room, i); E.push({ p: [e.a[0] + e.n[0] * t, e.a[1] + e.n[1] * t], d: e.d }); }
  return E.map((cur, i) => { const prev = E[(i - 1 + n) % n]; return lineX(prev.p, prev.d, cur.p, cur.d) || cur.p; });
}

/* Oude plannen (muren tussen ruimtes) omzetten naar fases */
function migrate(plan) {
  if (plan.v === 2) return false;
  const ts = [];
  plan.floors.forEach((f) => f.rooms.forEach((r) => ts.push(r.t || plan.wallT || 10)));
  plan.tIn = ts.length ? Math.min(...ts) : 10;
  plan.tOut = ts.length ? Math.max(...ts, 20) : 30;
  for (const f of plan.floors) {
    const adj = adjacency(f.rooms, 45);
    const off = solveOffsets(f.rooms, adj, (A, i, p) => p.gap);
    for (const it of f.items) {
      const r = f.rooms.find((q) => inPoly([it.x, it.y], q.pts));
      it.room = r ? r.id : null;
      if (r) { it.x -= off[r.id][0]; it.y -= off[r.id][1]; }
    }
    for (const r of f.rooms) {
      const old = r.pts.map((_, i) => (r.walls[i] && r.walls[i].t != null ? r.walls[i].t : (r.t || 10)));
      r.walls.forEach((w, i) => {
        const pair = adj.get(r.id + ':' + i);
        const t = pair ? Math.round(pair[0].gap) : old[i];
        w.t = t === (pair ? plan.tIn : plan.tOut) ? null : t;
      });
      r.pts = r.pts.map((q) => [Math.round((q[0] - off[r.id][0]) * 10) / 10, Math.round((q[1] - off[r.id][1]) * 10) / 10]);
      delete r.t;
    }
  }
  delete plan.wallT;
  plan.v = 2;
  return true;
}

/* ---------- Muurlengte (fase 1) ---------- */
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

/* ---------- Snappen (fase 1: ruimtes raken elkaar) ---------- */
function snapList(exceptId) {
  const xs = [], ys = [];
  for (const r of floor().rooms) { if (r.id === exceptId) continue; for (const q of r.pts) { xs.push(q[0]); ys.push(q[1]); } }
  return [xs, ys];
}
function snapCoords(pts, exceptId) {
  const thr = 18 / st.view.s, [xs, ys] = snapList(exceptId);
  const snap = (v, arr) => { let best = null, bd = thr; for (const c of arr) { const d = Math.abs(c - v); if (d < bd) { bd = d; best = c; } } return best == null ? R1(v) : best; };
  return pts.map((q) => [snap(q[0], xs), snap(q[1], ys)]);
}
function moveSnap(pts, exceptId) {
  const thr = 18 / st.view.s, [xs, ys] = snapList(exceptId);
  let bx = null, by = null, dx = thr, dy = thr;
  for (const m of pts) {
    for (const c of xs) { const e = c - m[0]; if (Math.abs(e) < dx) { dx = Math.abs(e); bx = e; } }
    for (const c of ys) { const e = c - m[1]; if (Math.abs(e) < dy) { dy = Math.abs(e); by = e; } }
  }
  return [bx, by];
}
function newRoom(pts) {
  let p = cleanPoly(snapCoords(pts, null));
  if (p.length < 3) return null;
  if (signedArea(p) < 0) p.reverse();
  let k0 = 0;
  p.forEach((q, k) => { if (q[1] < p[k0][1] - 0.5 || (Math.abs(q[1] - p[k0][1]) <= 0.5 && q[0] < p[k0][0])) k0 = k; });
  p = p.slice(k0).concat(p.slice(0, k0));
  if (selfCross(p)) return null;
  const n = floor().rooms.length + 1;
  return { id: uid(), name: 'Ruimte ' + n, type: 'Ruimte', h: 250, pts: p, walls: p.map(() => ({ ok: false, t: null })), open: [] };
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
    case 'rtable': return true;
    case 'chair': el('path', { d: `M${x} ${y + 8}H${x + w}`, ...L }, g); break;
    case 'wardrobe': el('path', { d: `M${x} ${y}L${x + w} ${y + d}M${x + w} ${y}L${x} ${y + d}`, ...L, 'stroke-width': 0.8 }, g); break;
    case 'hob': for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) el('circle', { cx: cx * w / 4, cy: cy * d / 4, r: Math.min(w, d) / 6, ...L }, g); break;
    case 'ksink': el('rect', { x: x + 8, y: y + 8, width: w - 16, height: d - 16, rx: 6, ...L }, g); break;
    case 'sink': el('ellipse', { cx: 0, cy: 3, rx: w / 2 - 8, ry: d / 2 - 8, ...L }, g); break;
    case 'bath': el('rect', { x: x + 6, y: y + 6, width: w - 12, height: d - 12, rx: 20, ...L }, g); break;
    case 'shower': el('path', { d: `M${x} ${y}L${x + w} ${y + d}M${x + w} ${y}L${x} ${y + d}`, ...L, 'stroke-width': 0.8 }, g); el('circle', { cx: 0, cy: 0, r: 5, ...L }, g); break;
    case 'wc': el('rect', { x: x + 2, y, width: w - 4, height: 16, rx: 3, ...L }, g); el('ellipse', { cx: 0, cy: y + 16 + (d - 18) / 2, rx: w / 2 - 3, ry: (d - 18) / 2, ...L }, g); break;
    case 'washer': el('circle', { cx: 0, cy: 3, r: Math.min(w, d) / 2 - 10, ...L }, g); break;
    case 'stairs': case 'steps': {
      const n = Math.max(1, it.steps || (it.kind === 'steps' ? 2 : Math.max(3, Math.round(d / 25))));
      let s = ''; for (let k = 1; k < n; k++) s += `M${x} ${y + k * d / n}H${x + w}`;
      if (s) el('path', { d: s, ...L, 'stroke-width': 1 }, g);
      // pijl wijst naar boven (oplopend); 'flip' keert de looprichting om
      const a0 = it.flip ? y + 8 : y + d - 8, a1 = it.flip ? y + d - 10 : y + 10, h = it.flip ? -9 : 9, hw = Math.min(9, w / 4);
      el('path', { d: `M0 ${a0}V${a1}M${-hw} ${a1 + h}L0 ${a1}L${hw} ${a1 + h}`, ...L, stroke: '#0E0F0D', 'stroke-width': 1.6 }, g);
      el('circle', { cx: 0, cy: a0, r: 3, fill: '#0E0F0D' }, g);
      break;
    }
    default: return false;
  }
  return true;
}

// Labels plaatsen zonder overlap
const textW = (s, fs) => s.length * fs * 0.56 + 4;
function overlaps(b, boxes) { return boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0); }
function boxAt(x, y, w, h) { return { x0: x - w / 2, x1: x + w / 2, y0: y - h / 2, y1: y + h / 2 }; }

function openingGeom(r, o) { // r = verschoven ruimte
  const e = edge(r, o.wall), t = st.phase === 2 || CTX.export ? wallT(r, o.wall) : 0;
  const width = Math.min(o.width, e.len);
  const pos = Math.min(Math.max(o.pos, width / 2), e.len - width / 2);
  const A = [e.a[0] + e.d[0] * (pos - width / 2), e.a[1] + e.d[1] * (pos - width / 2)];
  const B = [e.a[0] + e.d[0] * (pos + width / 2), e.a[1] + e.d[1] * (pos + width / 2)];
  const off = (p, k) => [p[0] + e.n[0] * k, p[1] + e.n[1] * k];
  return { e, t, A, B, off, width, pos };
}
function drawOpening(g, r, o, sel) {
  const { e, t, A, B, off, width } = openingGeom(r, o);
  const ext = [A, B, off(A, t), off(B, t)];
  const tt = Math.max(t, 6);
  el('polygon', { points: P([off(A, -1), off(B, -1), off(B, t + 1), off(A, t + 1)]), fill: '#FFFFFF' }, g);
  const S = { fill: 'none', stroke: '#1E1F1C' };
  // snijlijnen: de muur loopt door op de vloer
  if (t > 0) for (const k of [0, t]) el('line', { x1: off(A, k)[0], y1: off(A, k)[1], x2: off(B, k)[0], y2: off(B, k)[1], ...S, 'stroke-width': 0.9 }, g);
  if (o.kind === 'window') {
    for (const k of [tt * 0.42, tt * 0.58]) el('line', { x1: off(A, k)[0], y1: off(A, k)[1], x2: off(B, k)[0], y2: off(B, k)[1], ...S, 'stroke-width': 1.2 }, g);
    for (const p of [A, B]) el('line', { x1: p[0], y1: p[1], x2: off(p, t)[0], y2: off(p, t)[1], ...S, 'stroke-width': 1.2 }, g);
  } else if (o.kind === 'slide') {
    const a1 = off(A, tt * 0.38), b1 = off(B, tt * 0.38), a2 = off(A, tt * 0.62), b2 = off(B, tt * 0.62);
    el('line', { x1: a1[0], y1: a1[1], x2: b1[0] - e.d[0] * width * 0.42, y2: b1[1] - e.d[1] * width * 0.42, ...S, 'stroke-width': 3 }, g);
    el('line', { x1: a2[0] + e.d[0] * width * 0.42, y1: a2[1] + e.d[1] * width * 0.42, x2: b2[0], y2: b2[1], ...S, 'stroke-width': 3 }, g);
  } else if (o.kind !== 'passage') {
    const out = !!(o.flip & 2);
    const sn = out ? e.n : [-e.n[0], -e.n[1]];
    const face = out ? t : 0;
    const leaves = o.kind === 'double' ? [[A, B, width / 2], [B, A, width / 2]] : [[(o.flip & 1) ? B : A, (o.flip & 1) ? A : B, width]];
    for (const [h, other, w] of leaves) {
      const base = off(h, face);
      const ud = [(other[0] - h[0]) / width, (other[1] - h[1]) / width];
      const tip = [base[0] + sn[0] * w, base[1] + sn[1] * w];
      ext.push(tip, [tip[0] + (other[0] - h[0]) / width * w, tip[1] + (other[1] - h[1]) / width * w]);
      const to = [base[0] + ud[0] * w, base[1] + ud[1] * w];
      const lt = 4; // deurblad als dun rechthoekje
      el('polygon', { points: P([base, tip, [tip[0] + ud[0] * lt, tip[1] + ud[1] * lt], [base[0] + ud[0] * lt, base[1] + ud[1] * lt]]), fill: '#FFFFFF', stroke: '#1E1F1C', 'stroke-width': 1.3 }, g);
      const v1 = [tip[0] - base[0], tip[1] - base[1]], v2 = [to[0] - base[0], to[1] - base[1]];
      const sweep = v1[0] * v2[1] - v1[1] * v2[0] > 0 ? 1 : 0;
      el('path', { d: `M${tip[0].toFixed(1)} ${tip[1].toFixed(1)}A${w} ${w} 0 0 ${sweep} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`, ...S, 'stroke-width': 0.8 }, g);
    }
  }
  if (o.entry && o.kind !== 'window') { // dikke pijl buiten de deur, wijst naar binnen
    const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], q = (u, v) => { const b = off(M, t + u); return [b[0] + e.d[0] * v, b[1] + e.d[1] * v]; };
    const L0 = 16, L1 = 110, hl = 38, sw = 9, hw = 24;
    const pts = [q(L0, 0), q(L0 + hl, hw), q(L0 + hl, sw), q(L1, sw), q(L1, -sw), q(L0 + hl, -sw), q(L0 + hl, -hw)];
    el('polygon', { points: P(pts), fill: '#1E1F1C' }, g);
    ext.push(q(L1, sw), q(L1, -sw), q(L0, hw), q(L0, -hw));
  }
  // grotere, onzichtbare aanraakzone
  el('polygon', { points: P([off(A, -24), off(B, -24), off(B, t + 24), off(A, t + 24)]), fill: 'transparent' }, g);
  if (sel) el('polygon', { points: P([off(A, -3), off(B, -3), off(B, t + 3), off(A, t + 3)]), fill: 'rgba(29,63,214,.12)', stroke: '#1D3FD6', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke' }, g);
  const xs = ext.map((q) => q[0]), ys = ext.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function drawFloor(f, root, opts) {
  const ex = !!opts.export;
  const ph = ex ? 2 : st.phase;
  setCtx(f, ph === 2); CTX.export = ex;
  const fontF = ex ? 'Arial, Helvetica, sans-serif' : 'Archivo, Arial, sans-serif';
  const gFill = el('g', {}, root), gWall = el('g', {}, root), gHit = el('g', {}, root);
  const gOpen = el('g', ph === 1 ? { opacity: 0.35, 'pointer-events': 'none' } : {}, root);
  const gItem = el('g', ph === 1 ? { opacity: 0.3, 'pointer-events': 'none' } : {}, root);
  const gText = el('g', { 'font-family': fontF, 'pointer-events': 'none' }, root);
  const rooms = f.rooms.map((r) => sh(r));
  const boxes = [];

  rooms.forEach((r) => {
    const selR = !ex && st.sel && st.sel.room === r.id && st.sel.wall == null && !st.sel.open;
    if (ph === 1) el('polygon', { points: P(r.pts), fill: selR ? '#EEF1FF' : '#FFFFFF', stroke: '#1E1F1C', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'data-k': 'room', 'data-room': r.id }, gFill);
    else {
      el('polygon', { points: P(r.pts), fill: selR ? '#EEF1FF' : '#FFFFFF', 'data-k': 'room', 'data-room': r.id }, gFill);
      el('path', { d: pathD(outerPts(r)) + pathD(r.pts.slice().reverse()), fill: '#1E1F1C', 'fill-rule': 'evenodd' }, gWall);
    }
    if (!ex) r.pts.forEach((_, i) => {
      const e = edge(r, i), k = ph === 2 ? wallT(r, i) / 2 : 0;
      el('line', { x1: e.a[0] + e.n[0] * k, y1: e.a[1] + e.n[1] * k, x2: e.b[0] + e.n[0] * k, y2: e.b[1] + e.n[1] * k, class: 'pe-hit', 'data-k': 'wall', 'data-room': r.id, 'data-i': i }, gHit);
    });
  });
  rooms.forEach((r) => {
    for (const o of r.open || []) {
      if (o.wall >= r.pts.length) continue;
      const g = el('g', ex ? {} : { 'data-k': 'open', 'data-room': r.id, 'data-open': o.id }, gOpen);
      const bx = drawOpening(g, r, o, !ex && st.sel && st.sel.open === o.id);
      if (ph === 2) boxes.push(bx);
    }
  });
  for (const it of f.items) {
    if (opts.furniture === false && !STRUCT.has(it.kind)) continue;
    const o = offOf(it.room);
    const g = el('g', { transform: `translate(${it.x + o[0]} ${it.y + o[1]}) rotate(${it.rot || 0})`, ...(ex ? {} : { 'data-k': 'item', 'data-item': it.id }) }, gItem);
    const sel = !ex && st.sel && st.sel.item === it.id;
    const base = { fill: '#F7F6F2', stroke: sel ? '#1D3FD6' : '#6B6A63', 'stroke-width': sel ? 3 : 1.4 };
    if (it.kind === 'wallpiece') {
      el('rect', { x: -it.w / 2, y: -it.d / 2, width: it.w, height: it.d, fill: '#1E1F1C', ...(sel ? { stroke: '#1D3FD6', 'stroke-width': 3 } : {}) }, g);
      el('rect', { x: -it.w / 2 - 12, y: -it.d / 2 - 12, width: it.w + 24, height: it.d + 24, fill: 'transparent' }, g);
      continue;
    }
    if (it.kind === 'rtable') el('ellipse', { cx: 0, cy: 0, rx: it.w / 2, ry: it.d / 2, ...base }, g);
    else el('rect', { x: -it.w / 2, y: -it.d / 2, width: it.w, height: it.d, rx: 2, ...base }, g);
    if (!furnSymbol(g, it) || ['table', 'desk', 'kitchen', 'fridge', 'tv'].includes(it.kind)) {
      const lt = el('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': Math.min(13, it.w / 5, it.d / 2.2), fill: '#6B6A63', 'font-family': fontF, 'pointer-events': 'none', transform: `rotate(${-(it.rot || 0)})` }, g);
      lt.textContent = (KINDS[it.kind] || [it.kind])[0];
    }
    const hw = (it.rot === 90 || it.rot === 270) ? [it.d, it.w] : [it.w, it.d];
    if (ph === 2) boxes.push(boxAt(it.x + o[0], it.y + o[1], hw[0] * 0.6, hw[1] * 0.6));
  }
  // Naam + oppervlakte (passend in de ruimte)
  rooms.forEach((r) => {
    const xs = r.pts.map((q) => q[0]), ys = r.pts.map((q) => q[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    let c = centroid(r.pts);
    if (!inPoly(c, r.pts)) c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const parts = [];
    if (opts.area !== false && !r.hideArea) parts.push(fmtArea(netArea(r, f.rooms)));
    if (opts.heights) parts.push(`h ${fmtM(r.h)} m`);
    if (r.lvl) parts.push((r.lvl > 0 ? '+' : '−') + fmtM(Math.abs(r.lvl)));
    const area = parts.join(' · ');
    let fs = Math.min(20, (bw * 0.8) / (r.name.length * 0.58), bh * 0.3);
    const showArea = !!area && fs >= 11 && bh > 60;
    fs = Math.max(fs, 7);
    const af = Math.min(14, fs * 0.72, (bw * 0.85) / (area.length * 0.56));
    const ny = showArea ? c[1] - fs * 0.35 : c[1] + fs * 0.35;
    const tn = el('text', { x: c[0], y: ny, 'text-anchor': 'middle', 'font-size': fs.toFixed(1), 'font-weight': 800, fill: '#0E0F0D' }, gText); tn.textContent = r.name;
    boxes.push(boxAt(c[0], ny - fs * 0.35, textW(r.name, fs), fs * 1.1));
    if (showArea) {
      const ay = c[1] + af * 1.1;
      const ta = el('text', { x: c[0], y: ay, 'text-anchor': 'middle', 'font-size': af.toFixed(1), fill: '#6B6A63' }, gText); ta.textContent = area;
      boxes.push(boxAt(c[0], ay - af * 0.35, textW(area, af), af * 1.1));
    }
  });
  // Maten (binnenmaat), zonder overlap
  if (opts.dims !== false) rooms.filter((r) => !r.hideDims).forEach((r) => r.pts.forEach((_, i) => {
    const e = edge(r, i), s = ex ? 'ok' : wallStatus(r, i);
    const txt = (s === 'open' ? '≈ ' : '') + fmtM(e.len);
    const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    const vert = Math.abs(e.d[1]) > 0.7;
    const t = ph === 2 ? wallT(r, i) : 0;
    let pick = null;
    for (const fs of [14, 11, 9]) {
      for (const k of [-(fs * 0.9 + 3), -(fs * 2.1 + 6), t + fs * 0.9 + 3]) {
        const p = [mid[0] + e.n[0] * k, mid[1] + e.n[1] * k];
        const w = textW(txt, fs), h = fs * 1.05;
        if (w > e.len + 10 && fs > 9) continue;
        const b = vert ? boxAt(p[0], p[1], h, w) : boxAt(p[0], p[1], w, h);
        if (!overlaps(b, boxes)) { pick = { fs, p, b }; break; }
      }
      if (pick) break;
    }
    if (!pick) { const fs = 9, k = -(fs + 2), p = [mid[0] + e.n[0] * k, mid[1] + e.n[1] * k]; pick = { fs, p, b: boxAt(p[0], p[1], 1, 1) }; }
    boxes.push(pick.b);
    let ang = Math.atan2(e.d[1], e.d[0]) * 180 / Math.PI;
    if (ang > 90) ang -= 180; if (ang <= -90) ang += 180;
    const te = el('text', { x: pick.p[0].toFixed(1), y: pick.p[1].toFixed(1), transform: `rotate(${ang.toFixed(1)} ${pick.p[0].toFixed(1)} ${pick.p[1].toFixed(1)})`, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': pick.fs, 'font-weight': s === 'ok' ? 700 : 500, fill: s === 'open' ? '#A3A197' : '#1E1F1C' }, gText);
    te.textContent = txt;
  }));
}

function render() {
  if (!st.plan) return;
  world.textContent = ''; overlay.textContent = '';
  drawFloor(floor(), world, { dims: true, furniture: true });
  const s = st.sel;
  if (s && s.wall != null) {
    const r0 = roomById(s.room);
    if (r0 && s.wall < r0.pts.length) {
      const r = sh(r0), e = edge(r, s.wall);
      if (st.phase === 2) {
        const t = wallT(r, s.wall), o = (p, k) => [p[0] + e.n[0] * k, p[1] + e.n[1] * k];
        el('polygon', { points: P([e.a, e.b, o(e.b, t), o(e.a, t)]), fill: 'rgba(29,63,214,.55)', stroke: '#1D3FD6', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }, overlay);
      } else el('line', { x1: e.a[0], y1: e.a[1], x2: e.b[0], y2: e.b[1], stroke: '#1D3FD6', 'stroke-width': 6, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }, overlay);
    }
  }
  if (s && s.room && s.wall == null && !s.open) {
    const r = roomById(s.room);
    if (r) el('polygon', { points: P(sh(r).pts), fill: 'none', stroke: '#1D3FD6', 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': '6 5', 'pointer-events': 'none' }, overlay);
  }
  applyView();
  renderPanel();
}
const roomById = (id) => floor().rooms.find((r) => r.id === id);
const itemById = (id) => floor().items.find((r) => r.id === id);

/* ======================== Beeld ======================== */
function applyView() {
  const v = st.view;
  $('pe-view').setAttribute('transform', `translate(${v.tx} ${v.ty}) scale(${v.s})`);
  $('pe-grid-major').setAttribute('stroke-width', 1 / v.s);
  $('pe-grid-minor').setAttribute('stroke-width', 0.7 / v.s);
}
function toWorld(cx, cy) { const b = svg.getBoundingClientRect(); return [(cx - b.left - st.view.tx) / st.view.s, (cy - b.top - st.view.ty) / st.view.s]; }
function bounds(f, solved) {
  setCtx(f, solved);
  const xs = [], ys = [];
  for (const r0 of f.rooms) { const r = sh(r0); for (const q of solved ? outerPts(r) : r.pts) { xs.push(q[0]); ys.push(q[1]); } }
  for (const it of f.items) { const o = offOf(it.room); xs.push(it.x + o[0] - it.w / 2, it.x + o[0] + it.w / 2); ys.push(it.y + o[1] - it.d / 2, it.y + o[1] + it.d / 2); }
  if (!xs.length) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function fit() {
  const b = svg.getBoundingClientRect(), bb = bounds(floor(), st.phase === 2);
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
  select1: 'Tik op een muur om de binnenmaat in te vullen. Sleep een ruimte tegen een andere: ze klikken vast.',
  select2: 'Tik op een muur om de dikte te wijzigen. Sleep deuren, ramen en meubels.',
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
  $('pe-hint').textContent = HINTS[t === 'select' ? 'select' + st.phase : t] || '';
  $('pe-hint').classList.remove('is-gone');
  clearTimeout(setTool.h); setTool.h = setTimeout(() => $('pe-hint').classList.add('is-gone'), 5000);
}
document.querySelectorAll('.pe-tools [data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
function toast(msg) { const t = $('pe-toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('is-on'), 4200); }

function openLib() {
  const card = ([k, [name, w, d]]) => {
    const sc = 56 / Math.max(w, d);
    return `<button type="button" data-furn="${k}"><svg viewBox="${-w / 2 - 4} ${-d / 2 - 4} ${w + 8} ${d + 8}" width="${(w + 8) * sc}" height="${(d + 8) * sc}" aria-hidden="true">${furnPreview(k, w, d)}</svg><b>${name}</b><span>${w} × ${d}</span></button>`;
  };
  $('pe-lib-grid').innerHTML = '<p class="pe-lib-h">Bouwkundig</p>' + Object.entries(ELEM).map(card).join('') + '<p class="pe-lib-h">Meubels</p>' + Object.entries(FURN).map(card).join('');
  $('pe-lib').showModal();
}
function furnPreview(kind, w, d) {
  const g = document.createElementNS(NS, 'g');
  if (kind === 'wallpiece') { el('rect', { x: -w / 2, y: -d / 2, width: w, height: d, fill: '#1E1F1C' }, g); return g.innerHTML; }
  if (kind === 'rtable') el('ellipse', { cx: 0, cy: 0, rx: w / 2, ry: d / 2, fill: '#F7F6F2', stroke: '#6B6A63', 'stroke-width': 1.4 }, g);
  else el('rect', { x: -w / 2, y: -d / 2, width: w, height: d, rx: 2, fill: '#F7F6F2', stroke: '#6B6A63', 'stroke-width': 1.4 }, g);
  furnSymbol(g, { kind, w, d });
  return g.innerHTML;
}
function roomAt(pt) { // in getoonde coördinaten
  for (const r of floor().rooms) if (inPoly(pt, sh(r).pts)) return r;
  return null;
}
$('pe-lib-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-furn]'); if (!b) return;
  const [, w0, d0] = KINDS[b.dataset.furn];
  const w = w0, d = b.dataset.furn === 'wallpiece' ? st.plan.tIn : d0;
  const rect = svg.getBoundingClientRect();
  const c = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  snapshot();
  const r = roomAt(c), o = offOf(r && r.id);
  const it = { id: uid(), kind: b.dataset.furn, x: R1(c[0] - o[0]), y: R1(c[1] - o[1]), w, d, rot: 0, room: r ? r.id : null };
  floor().items.push(it);
  st.sel = { item: it.id };
  $('pe-lib').close(); setTool('select'); render(); markDirty();
  toast('Sleep het meubel naar de juiste plek.');
});

/* ======================== Aanraken ======================== */
const ptrs = new Map();
let G = null, pinch = null;

function targetOf(e) {
  const t = e.target.closest && e.target.closest('[data-k]');
  if (!t) return { k: 'none' };
  return { k: t.dataset.k, room: t.dataset.room, i: t.dataset.i != null ? +t.dataset.i : null, open: t.dataset.open, item: t.dataset.item };
}
function nearestWall(pt, maxPx) {
  let best = null, bd = maxPx / st.view.s;
  for (const r0 of floor().rooms) {
    const r = sh(r0);
    r.pts.forEach((_, i) => {
      const e = edge(r, i);
      const v = [pt[0] - e.a[0], pt[1] - e.a[1]];
      const along = v[0] * e.d[0] + v[1] * e.d[1];
      if (along < 0 || along > e.len) return;
      const dist = Math.abs(v[0] * e.n[0] + v[1] * e.n[1] - wallT(r, i) / 2);
      if (dist < bd) { bd = dist; best = { room: r0, i, along }; }
    });
  }
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
  G = { type: 'pan', start: [e.clientX, e.clientY], w0: w, tg, moved: false, view0: { ...st.view } };
  const ph = st.phase;
  if (ph === 1 && st.tool === 'sketch') { G.type = 'sketch'; G.pts = [w]; }
  else if (ph === 1 && st.tool === 'rect') G.type = 'rect';
  else if (tg.k === 'open' && ph === 2) G.type = 'open';
  else if (tg.k === 'item' && ph === 2 && st.tool === 'select') { const it = itemById(tg.item); const o = offOf(it.room); G.type = 'item'; G.orig = [it.x + o[0], it.y + o[1]]; }
  else if (st.tool === 'select' && ph === 1 && tg.k === 'wall') { G.type = 'wall'; G.orig = roomById(tg.room).pts.map((q) => q.slice()); }
  else if (st.tool === 'select' && ph === 1 && tg.k === 'room') {
    const r = roomById(tg.room);
    G.type = 'room'; G.orig = r.pts.map((q) => q.slice());
    G.items = floor().items.filter((it) => it.room === r.id).map((it) => [it, it.x, it.y]);
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
  if (!G.moved && ['item', 'open', 'wall', 'room'].includes(G.type)) snapshot();
  G.moved = true;
  const w = toWorld(e.clientX, e.clientY);
  const W = [w[0] - G.w0[0], w[1] - G.w0[1]];
  if (G.type === 'pan') { st.view.tx = G.view0.tx + dx; st.view.ty = G.view0.ty + dy; applyView(); }
  else if (G.type === 'sketch') {
    G.pts.push(w);
    overlay.textContent = '';
    el('polyline', { points: P(G.pts), fill: 'none', stroke: '#1D3FD6', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, overlay);
  } else if (G.type === 'rect') {
    const sn = snapCoords([G.w0, w], null);
    const a = sn[0], b = sn[1];
    G.pts = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
    overlay.textContent = '';
    el('polygon', { points: P(G.pts), fill: 'rgba(29,63,214,.08)', stroke: '#1D3FD6', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, overlay);
    const lab = el('text', { x: Math.max(a[0], b[0]) + 8 / st.view.s, y: Math.max(a[1], b[1]) + 18 / st.view.s, 'font-size': 14 / st.view.s, fill: '#1D3FD6', 'font-weight': 700 }, overlay);
    lab.textContent = `${fmtM(Math.abs(b[0] - a[0]))} × ${fmtM(Math.abs(b[1] - a[1]))} m`;
  } else if (G.type === 'item') {
    const it = itemById(G.tg.item), o = offOf(it.room);
    const [cx, cy] = snapItem(it, G.orig[0] + W[0], G.orig[1] + W[1]);
    it.x = R1(cx - o[0]); it.y = R1(cy - o[1]);
    st.sel = { item: it.id }; render();
  } else if (G.type === 'open') {
    const r0 = roomById(G.tg.room), o = r0.open.find((q) => q.id === G.tg.open), ed = edge(sh(r0), o.wall);
    const along = (w[0] - ed.a[0]) * ed.d[0] + (w[1] - ed.a[1]) * ed.d[1];
    o.pos = R1(Math.min(Math.max(along, o.width / 2), ed.len - o.width / 2));
    st.sel = { room: r0.id, open: o.id }; render();
  } else if (G.type === 'wall') {
    const r = roomById(G.tg.room), i = G.tg.i, ed = edge({ ...r, pts: G.orig }, i);
    let k = W[0] * ed.n[0] + W[1] * ed.n[1];
    const axis = Math.abs(ed.n[0]) > 0.5 ? 0 : 1, cur = G.orig[i][axis] + ed.n[axis] * k;
    const [xs, ys] = snapList(r.id), list = axis ? ys : xs;
    let best = null, bd = 18 / st.view.s;
    for (const c of list) if (Math.abs(c - cur) < bd) { bd = Math.abs(c - cur); best = c; }
    k = best != null ? (best - G.orig[i][axis]) * ed.n[axis] : R1(k);
    const n = r.pts.length, test = G.orig.map((q) => q.slice());
    for (const j of [i, (i + 1) % n]) { test[j][0] += ed.n[0] * k; test[j][1] += ed.n[1] * k; }
    if (sameShape({ ...r, pts: G.orig }, { ...r, pts: test })) {
      r.pts = test;
      r.walls[(i - 1 + n) % n].ok = false; r.walls[(i + 1) % n].ok = false;
    }
    st.sel = { room: r.id, wall: i }; render();
  } else if (G.type === 'room') {
    const r = roomById(G.tg.room);
    const moved = G.orig.map((q) => [q[0] + W[0], q[1] + W[1]]);
    const [cx, cy] = moveSnap(moved, r.id);
    const fx = cx == null ? R1(W[0]) : W[0] + cx, fy = cy == null ? R1(W[1]) : W[1] + cy;
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
    const p = g.pts;
    if (Math.abs(p[1][0] - p[0][0]) < 40 || Math.abs(p[2][1] - p[1][1]) < 40) { toast('Te klein.'); return; }
    addRoom(p);
    return;
  }
  if (g.moved) {
    if (g.type === 'item') {
      const it = itemById(g.tg.item), o = offOf(it.room), pos = [it.x + o[0], it.y + o[1]];
      const r = roomAt(pos), o2 = offOf(r && r.id);
      it.room = r ? r.id : null; it.x = R1(pos[0] - o2[0]); it.y = R1(pos[1] - o2[1]);
    }
    if (g.type !== 'pan') { markDirty(); render(); }
    return;
  }
  tapSelect(g);
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

// Meubel tegen een muur (binnenkant) of naast/uitgelijnd met een ander meubel klikken
function halfSize(it) { return (it.rot === 90 || it.rot === 270) ? [it.d / 2, it.w / 2] : [it.w / 2, it.d / 2]; }
function snapItem(it, cx, cy) {
  const [hw, hd] = halfSize(it), thr = 14 / st.view.s;
  let bx = null, dx = thr, by = null, dy = thr;
  const tryX = (t) => { const d = Math.abs(t - cx); if (d < dx) { dx = d; bx = t; } };
  const tryY = (t) => { const d = Math.abs(t - cy); if (d < dy) { dy = d; by = t; } };
  const wp = it.kind === 'wallpiece', ph2 = st.phase === 2;
  for (const r0 of floor().rooms) {
    const r = sh(r0);
    r.pts.forEach((_, i) => {
      const e = edge(r, i);
      if (wp) { // muurstuk: zijkanten in het verlengde van de muurvlakken, kop tegen het einde van de muur
        const t = ph2 ? wallT(r, i) : 0, near = 40;
        if (Math.abs(e.d[1]) > 0.7) {
          const y0 = Math.min(e.a[1], e.b[1]) - t, y1 = Math.max(e.a[1], e.b[1]) + t;
          if (cy + hd > y0 - near && cy - hd < y1 + near) for (const k of [0, t]) { const fx = e.a[0] + e.n[0] * k; tryX(fx - hw); tryX(fx + hw); }
        } else if (Math.abs(e.d[0]) > 0.7) {
          const x0 = Math.min(e.a[0], e.b[0]) - t, x1 = Math.max(e.a[0], e.b[0]) + t;
          if (cx + hw > x0 - near && cx - hw < x1 + near) for (const k of [0, t]) { const fy = e.a[1] + e.n[1] * k; tryY(fy - hd); tryY(fy + hd); }
        }
      }
      if (Math.abs(e.d[1]) > 0.7) { // verticale muur
        const y0 = Math.min(e.a[1], e.b[1]), y1 = Math.max(e.a[1], e.b[1]);
        if (cy + hd > y0 && cy - hd < y1) tryX(e.a[0] - e.n[0] * hw);
      } else if (Math.abs(e.d[0]) > 0.7) { // horizontale muur
        const x0 = Math.min(e.a[0], e.b[0]), x1 = Math.max(e.a[0], e.b[0]);
        if (cx + hw > x0 && cx - hw < x1) tryY(e.a[1] - e.n[1] * hd);
      }
    });
  }
  for (const o of floor().items) {
    if (o.id === it.id) continue;
    const off = offOf(o.room), ox = o.x + off[0], oy = o.y + off[1], [ow, od] = halfSize(o);
    if (cy + hd > oy - od - thr && cy - hd < oy + od + thr) [ox - ow - hw, ox + ow + hw, ox - ow + hw, ox + ow - hw].forEach(tryX);
    if (cx + hw > ox - ow - thr && cx - hw < ox + ow + thr) [oy - od - hd, oy + od + hd, oy - od + hd, oy + od - hd].forEach(tryY);
  }
  return [bx == null ? cx : bx, by == null ? cy : by];
}
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
  if (st.phase === 2 && (st.tool === 'door' || st.tool === 'window')) {
    if (tg.k === 'open') { st.sel = { room: tg.room, open: tg.open }; setTool('select'); render(); return; }
    const hit = nearestWall(g.w0, 34);
    if (!hit) { toast('Tik op een muur.'); return; }
    const kind = st.tool === 'door' ? 'door' : 'window';
    const ed = edge(hit.room, hit.i);
    const width = kind === 'door' ? 83 : Math.min(120, Math.max(40, ed.len - 20));
    if (ed.len < width + 4) { toast('Deze muur is te kort.'); return; }
    snapshot();
    const o = { id: uid(), wall: hit.i, pos: R1(Math.min(Math.max(hit.along, width / 2), ed.len - width / 2)), width, kind, flip: 0 };
    hit.room.open = hit.room.open || [];
    hit.room.open.push(o);
    st.sel = { room: hit.room.id, open: o.id };
    setTool('select');
    render(); markDirty();
    toast(kind === 'door' ? 'Deur geplaatst. Sleep om te verschuiven.' : 'Raam geplaatst. Sleep om te verschuiven.');
    return;
  }
  if (tg.k === 'wall') st.sel = { room: tg.room, wall: tg.i };
  else if (tg.k === 'open') st.sel = { room: tg.room, open: tg.open };
  else if (tg.k === 'item') st.sel = { item: tg.item };
  else if (tg.k === 'room') st.sel = { room: tg.room };
  else st.sel = null;
  render();
  if (st.sel && st.sel.wall != null && st.phase === 1) focusLength();
}

/* ======================== Eigenschappen (paneel) ======================== */
function focusLength() {
  const i = $('pe-len') || $('pe-w-t');
  if (i) { i.focus({ preventScroll: true }); i.select(); }
}
function parseLen(v) {
  const s = String(v).trim().replace(',', '.');
  if (!s) return null;
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0) return null;
  if (!/[.]/.test(s) && n >= 30) return n;
  return n * 100;
}
const partners = (r, i) => CTX.adj.get(r.id + ':' + i) || [];
function renderPanel() {
  const p = $('pe-panel');
  const s = st.sel;
  if (!s) {
    if (st.phase === 2) {
      p.hidden = false;
      p.innerHTML = `
        <div class="pe-p-head"><b>Muurdiktes</b></div>
        <div class="pe-p-row"><label>Binnenmuren (cm)<input type="number" inputmode="numeric" id="pe-d-in" value="${st.plan.tIn}" min="2" max="80"></label>
        <label>Buitenmuren (cm)<input type="number" inputmode="numeric" id="pe-d-out" value="${st.plan.tOut}" min="2" max="80"></label></div>
        <p class="pe-p-tip">Standaard voor alle muren. Tik op een muur om er één apart aan te passen.</p>
        <label class="pe-tog"><input type="checkbox" id="pe-d-align"${st.plan.keepAlign === false ? '' : ' checked'}><span>Gevels recht houden</span></label>
        <p class="pe-p-tip">Buitenmuren die in fase 1 op één lijn liggen, blijven op één lijn. Een binnenmuur vangt het verschil op.</p>`;
    } else { p.hidden = true; p.innerHTML = ''; }
    return;
  }
  p.hidden = false;
  if (s.item) {
    const it = itemById(s.item); if (!it) { p.hidden = true; return; }
    p.innerHTML = `
      <div class="pe-p-head"><b>${esc((KINDS[it.kind] || [it.kind])[0])}</b><button type="button" class="pe-p-x" data-act="close" aria-label="Sluiten">✕</button></div>
      <div class="pe-p-row"><label>${it.kind === 'wallpiece' ? 'Lengte' : 'Breedte'} (cm)<input type="number" inputmode="numeric" id="pe-it-w" value="${it.w}" min="2" max="2000"></label>
      <label>${it.kind === 'wallpiece' ? 'Dikte' : 'Diepte'} (cm)<input type="number" inputmode="numeric" id="pe-it-d" value="${it.d}" min="2" max="2000"></label></div>
      ${it.kind === 'stairs' || it.kind === 'steps' ? `<div class="pe-p-row"><label>Treden<input type="number" inputmode="numeric" id="pe-it-n" value="${it.steps || (it.kind === 'steps' ? 2 : Math.max(3, Math.round(it.d / 25)))}" min="1" max="40"></label></div>
      <p class="pe-p-tip">De pijl wijst naar boven (oplopend). Het bolletje is het vertrek.</p>` : ''}
      ${it.kind === 'wallpiece' ? '<p class="pe-p-tip">Een los stuk muur, bv. een muur die uitsteekt. Klikt vast tegen muren en hoeken.</p>' : ''}
      <div class="pe-p-btns"><button type="button" data-act="rot">↻ Draai 90°</button>${it.kind === 'stairs' || it.kind === 'steps' ? '<button type="button" data-act="sflip">⇅ Richting</button>' : ''}<button type="button" data-act="dup">Dupliceer</button><button type="button" class="is-del" data-act="del">Verwijder</button></div>`;
    return;
  }
  const r = roomById(s.room); if (!r) { p.hidden = true; return; }
  if (s.open) {
    const o = (r.open || []).find((q) => q.id === s.open); if (!o) { p.hidden = true; return; }
    p.innerHTML = `
      <div class="pe-p-head"><b>${OPEN_KINDS[o.kind]}</b><button type="button" class="pe-p-x" data-act="close" aria-label="Sluiten">✕</button></div>
      <label class="pe-p-full">Soort<select id="pe-o-kind">${Object.entries(OPEN_KINDS).map(([k, v]) => `<option value="${k}"${k === o.kind ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="pe-p-full">Breedte (cm)<input type="number" inputmode="numeric" id="pe-o-w" value="${o.width}" min="30" max="600"></label>
      ${o.kind !== 'window' ? `<label class="pe-tog"><input type="checkbox" id="pe-o-entry"${o.entry ? ' checked' : ''}><span>Inkomdeur (pijl)</span></label>` : ''}
      <div class="pe-p-btns">${['door', 'double'].includes(o.kind) ? '<button type="button" data-act="flip">⇄ Draairichting</button>' : ''}<button type="button" class="is-del" data-act="del">Verwijder</button></div>
      <p class="pe-p-tip">Sleep om te verschuiven langs de muur.</p>`;
    return;
  }
  if (s.wall != null) {
    const i = s.wall, n = r.pts.length;
    if (st.phase === 2) {
      const prt = partners(r, i), t = wallT0(r, i), tDraw = wallT(sh(r), i);
      const kind = prt.length ? `Binnenmuur · ${esc(r.name)} | ${prt.map((q) => esc(q.room.name)).join(', ')}` : `Buitenmuur · ${esc(r.name)}`;
      const custom = r.walls[i].t != null;
      p.innerHTML = `
        <div class="pe-p-head"><b>Muur ${i + 1}/${n}</b><button type="button" class="pe-p-x" data-act="close" aria-label="Sluiten">✕</button></div>
        <p class="pe-p-tip">${kind}</p>
        <form class="pe-len-form" id="pe-t-form">
          <label for="pe-w-t">Dikte (cm)</label>
          <div class="pe-len-row"><input type="text" inputmode="decimal" id="pe-w-t" autocomplete="off" value="${t}"><button type="submit" class="pe-len-ok">OK →</button></div>
        </form>
        <div class="pe-chips">${T_CHIPS.map((c) => `<button type="button" data-t="${c}"${c === t ? ' aria-pressed="true"' : ''}>${c}</button>`).join('')}</div>
        <p class="pe-p-tip">${custom ? 'Eigen dikte voor deze muur.' : `Standaard ${prt.length ? 'binnenmuur' : 'buitenmuur'}.`}</p>
        ${(() => { const mv = [r, ...prt.map((q) => q.room)].map((x) => [x, (CTX.moved[x.id] || []).find((m) => x === r ? m[0] === i : prt.some((q) => q.room === x && q.i === m[0]))]).find((z) => z[1]); return mv ? `<p class="pe-p-warn">${esc(mv[0].name)} is hier ${String(mv[1][1]).replace('.', ',')} cm smaller getekend, zodat de gevels recht blijven. Klopt dat niet, zet dan "Gevels recht houden" uit (tik naast het plan).</p>` : ''; })()}
        ${Math.abs(tDraw - t) >= 0.5 ? `<p class="pe-p-warn">Getekend als ${String(tDraw).replace('.', ',')} cm om de gevels recht te houden. Klopt de dikte, controleer dan de binnenmaten van de ruimtes ernaast.</p>` : ''}
        <div class="pe-p-btns">${custom ? '<button type="button" data-act="tdef">Terug naar standaard</button>' : ''}<button type="button" data-act="prev">← Vorige</button><button type="button" data-act="next">Volgende →</button></div>`;
      return;
    }
    const e = edge(r, i), stt = wallStatus(r, i);
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
      <div class="pe-p-btns"><button type="button" data-act="prev">← Vorige</button><button type="button" data-act="next">Volgende →</button><button type="button" data-act="room">Ruimte</button></div>`;
    return;
  }
  p.innerHTML = `
    <div class="pe-p-head"><b>Ruimte</b><button type="button" class="pe-p-x" data-act="close" aria-label="Sluiten">✕</button></div>
    <label class="pe-p-full">Functie<select id="pe-r-type">${ROOM_TYPES.map((t) => `<option${t === r.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="pe-p-full">Naam op het plan<input type="text" id="pe-r-name" value="${esc(r.name)}" maxlength="40"></label>
    <div class="pe-p-row"><label>Hoogte (cm)<input type="number" inputmode="numeric" id="pe-r-h" value="${r.h}" min="100" max="1000"></label>
    <label>Niveau (cm)<input type="number" inputmode="numeric" id="pe-r-lvl" value="${r.lvl || 0}" min="-500" max="500" step="1"></label></div>
    <p class="pe-p-tip">Niveau: hoeveel hoger (of lager, met −) deze vloer ligt dan de rest, bv. 40. Komt als +0,40 op het plan.</p>
    <div class="pe-p-toggles">
      <label class="pe-tog"><input type="checkbox" id="pe-r-dims"${r.hideDims ? '' : ' checked'}><span>Maten tonen</span></label>
      <label class="pe-tog"><input type="checkbox" id="pe-r-area"${r.hideArea ? '' : ' checked'}><span>Oppervlakte tonen</span></label>
    </div>
    <p class="pe-p-area">${fmtArea(netArea(r))} · volume ${(netArea(r) * r.h / 100).toFixed(1).replace('.', ',')} m³${netArea(r) < areaM2(r) - 0.005 ? '<br><small>Ruimtes die hierin getekend zijn (bv. een toilet in de gang) zijn afgetrokken.</small>' : ''}</p>
    <div class="pe-p-btns">${st.phase === 1 ? '<button type="button" data-act="walls">Maten invullen</button><button type="button" data-act="dup">Dupliceer</button>' : ''}<button type="button" class="is-del" data-act="del">Verwijder</button></div>`;
}
function nextWall(r, from, dir = 1) {
  const n = r.pts.length;
  for (let k = 1; k <= n; k++) { const j = (from + dir * k + n * 2) % n; if (wallStatus(r, j) === 'open') return j; }
  return null;
}
function setThickness(r, i, t) {
  snapshot();
  const prt = partners(r, i);
  const v = t == null ? null : Math.min(80, Math.max(2, Math.round(t * 10) / 10));
  r.walls[i].t = v;
  for (const q of prt) q.room.walls[q.i].t = v;
  render(); markDirty();
}
$('pe-panel').addEventListener('submit', (e) => {
  e.preventDefault();
  const s = st.sel;
  if (e.target.id === 'pe-t-form') {
    const r = roomById(s.room), v = parseFloat(String($('pe-w-t').value).replace(',', '.'));
    if (!(v > 0)) return;
    setThickness(r, s.wall, v);
    st.sel = { room: r.id, wall: (s.wall + 1) % r.pts.length }; render(); focusLength();
    return;
  }
  if (e.target.id !== 'pe-len-form') return;
  const r = roomById(s.room), i = s.wall;
  const L = parseLen($('pe-len').value);
  if (L == null) { const j = nextWall(r, i); if (j != null) { st.sel = { room: r.id, wall: j }; render(); focusLength(); } return; }
  snapshot();
  const res = setWallLength(r, i, Math.round(L * 10) / 10);
  if (!res.ok) { st.undo.pop(); syncUndo(); toast(res.msg); return; }
  if (res.warn) toast(res.warn);
  markDirty();
  const j = nextWall(r, i);
  if (j == null) { st.sel = { room: r.id }; render(); toast(`Alle maten gekend ✓ ${r.name}: ${fmtArea(netArea(r))}`); return; }
  st.sel = { room: r.id, wall: j }; render(); focusLength();
});
$('pe-panel').addEventListener('change', (e) => {
  const s = st.sel, id = e.target.id, v = e.target.value;
  if (id === 'pe-len' || id === 'pe-w-t') return;
  if (id === 'pe-d-align') { snapshot(); st.plan.keepAlign = e.target.checked; render(); markDirty(); return; }
  if (id === 'pe-d-in' || id === 'pe-d-out') {
    snapshot();
    const n = Math.min(80, Math.max(2, +v || 10));
    if (id === 'pe-d-in') st.plan.tIn = n; else st.plan.tOut = n;
    render(); markDirty(); return;
  }
  if (!s) return;
  snapshot();
  if (s.item) {
    const it = itemById(s.item);
    if (id === 'pe-it-w') it.w = Math.max(2, +v || it.w);
    if (id === 'pe-it-d') it.d = Math.max(2, +v || it.d);
    if (id === 'pe-it-n') it.steps = Math.min(40, Math.max(1, Math.round(+v) || 1));
  } else {
    const r = roomById(s.room);
    if (s.open) {
      const o = r.open.find((q) => q.id === s.open);
      if (id === 'pe-o-kind') { o.kind = v; if (v === 'window' && o.width < 60) o.width = 100; }
      if (id === 'pe-o-entry') { if (e.target.checked) r.open.forEach((q) => { delete q.entry; }); floor().rooms.forEach((rr) => (rr.open || []).forEach((q) => { if (e.target.checked) delete q.entry; })); o.entry = e.target.checked || undefined; }
      if (id === 'pe-o-w') o.width = Math.min(Math.max(30, +v || o.width), edge(r, o.wall).len);
    } else {
      if (id === 'pe-r-type') { const auto = /^Ruimte \d+$/.test(r.name) || ROOM_TYPES.includes(r.name); r.type = v; if (auto) r.name = v; }
      if (id === 'pe-r-name') r.name = v.trim().slice(0, 40) || r.type;
      if (id === 'pe-r-h') r.h = Math.max(100, +v || r.h);
      if (id === 'pe-r-lvl') { const n = Math.round(+String(v).replace(',', '.')) || 0; if (n) r.lvl = Math.max(-500, Math.min(500, n)); else delete r.lvl; }
      if (id === 'pe-r-dims') r.hideDims = !e.target.checked;
      if (id === 'pe-r-area') r.hideArea = !e.target.checked;
    }
  }
  render(); markDirty();
});
$('pe-panel').addEventListener('click', async (e) => {
  const chip = e.target.closest('[data-t]');
  if (chip && st.sel && st.sel.wall != null) { setThickness(roomById(st.sel.room), st.sel.wall, +chip.dataset.t); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, s = st.sel; if (!s) return;
  if (a === 'close') { st.sel = null; render(); return; }
  if (s.item) {
    const f = floor(), it = itemById(s.item);
    snapshot();
    if (a === 'rot') it.rot = ((it.rot || 0) + 90) % 360;
    if (a === 'sflip') it.flip = it.flip ? 0 : 1;
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
    if (a === 'tdef') { setThickness(r, s.wall, null); return; }
    if (a === 'next' || a === 'prev') { const n = r.pts.length; st.sel = { room: r.id, wall: (s.wall + (a === 'next' ? 1 : -1) + n) % n }; render(); focusLength(); }
    if (a === 'room') { st.sel = { room: r.id }; render(); }
    return;
  }
  if (a === 'walls') { const j = nextWall(r, -1); st.sel = { room: r.id, wall: j == null ? 0 : j }; render(); focusLength(); return; }
  if (a === 'dup') { snapshot(); const c = JSON.parse(JSON.stringify(r)); c.id = uid(); c.pts = c.pts.map((q) => [q[0] + 60, q[1] + 60]); c.open.forEach((o) => { o.id = uid(); }); floor().rooms.push(c); st.sel = { room: c.id }; render(); markDirty(); return; }
  if (a === 'del') {
    if (!(await confirmBox('Ruimte verwijderen?', `"${r.name}" wordt verwijderd.`))) return;
    snapshot();
    floor().items.forEach((it) => { if (it.room === r.id) it.room = null; });
    floor().rooms = floor().rooms.filter((q) => q.id !== r.id); st.sel = null; render(); markDirty();
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
  drawFloor(f, tmp, { export: true, dims: opts.dims, area: opts.area, furniture: opts.furniture, heights: opts.heights });
  st.sel = prevSel;
  const bb = bounds(f, true) || [0, 0, 500, 300];
  const pad = 70, W = bb[2] - bb[0] + pad * 2, H = bb[3] - bb[1] + pad * 2 + 90;
  const x0 = bb[0] - pad, y0 = bb[1] - pad;
  const total = f.rooms.reduce((s, r) => s + netArea(r, f.rooms), 0);
  const fy = bb[3] + pad + 30;
  const foot = `
    <line x1="${x0 + pad}" y1="${fy - 18}" x2="${x0 + W - pad}" y2="${fy - 18}" stroke="#D4D2CA" stroke-width="1"/>
    <text x="${x0 + pad}" y="${fy + 10}" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#0E0F0D">${esc(st.plan.title)}</text>
    <text x="${x0 + pad}" y="${fy + 36}" font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#6B6A63">${esc(f.name)} · ${f.rooms.length} ${f.rooms.length === 1 ? 'ruimte' : 'ruimtes'} · totaal ${fmtArea(total)} netto · maten binnenwerks in meter · indicatief</text>
    <g transform="translate(${x0 + W - pad - 100} ${fy - 4})"><rect x="0" y="0" width="100" height="6" fill="#0E0F0D"/><rect x="50" y="0" width="50" height="6" fill="#fff" stroke="#0E0F0D"/><text x="0" y="24" font-family="Arial" font-size="12" fill="#6B6A63">0</text><text x="100" y="24" text-anchor="end" font-family="Arial" font-size="12" fill="#6B6A63">1 m</text></g>
    <text x="${x0 + W - pad - 120}" y="${fy + 12}" text-anchor="end" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="20" fill="#0E0F0D">BURO SCOTT<tspan fill="#1D3FD6">.</tspan></text>`;
  return { svg: `<svg xmlns="${NS}" viewBox="${x0} ${y0} ${W} ${H}" width="${W}" height="${H}"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#fff"/>${tmp.innerHTML}${foot}</svg>`, W, H };
}
function exportOpts() {
  const m = $('pe-x-mode').value;
  return { dims: m === 'all' || m === 'dims', area: m === 'all' || m === 'area', heights: $('pe-x-h').checked, furniture: $('pe-x-furn').checked };
}
$('pe-export').addEventListener('click', () => $('pe-export-dlg').showModal());
$('pe-x-png').addEventListener('click', async () => {
  const f = floor();
  if (!f.rooms.length) { toast('Deze verdieping is nog leeg.'); return; }
  const { svg: s, W, H } = exportSVG(f, exportOpts());
  render();
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
  const opts = exportOpts();
  const pages = st.plan.floors.filter((f) => f.rooms.length);
  if (!pages.length) { toast('Er is nog niets getekend.'); return; }
  $('pe-print').innerHTML = pages.map((f) => `<div class="pe-print-page">${exportSVG(f, opts).svg}</div>`).join('');
  render();
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
