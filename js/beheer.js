/* ============================================================
   BURO SCOTT — BEHEER: OVERZICHT
   Eén plek met galerijen, tours, opslag en meldingen.
============================================================ */
const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const $ = (id) => document.getElementById(id);
const DAY = 86400e3;
let token = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (ms) => new Date(ms).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
function fmtBytes(b) {
  if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2).replace('.', ',') + ' GB';
  if (b >= 1024 ** 2) return Math.round(b / 1024 ** 2) + ' MB';
  return Math.max(0, Math.round(b / 1024)) + ' kB';
}
function show(v) {
  for (const x of ['hb-login-view', 'hb-view', 'hb-setup']) $(x).hidden = x !== v;
  $('hb-logout').hidden = v !== 'hb-view';
}
async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && path !== '/api/admin/login') { AdminSession.clear(); token = null; show('hb-login-view'); throw new Error('Log opnieuw in.'); }
  if (!res.ok) throw new Error(data.error || 'Er ging iets mis.');
  return data;
}

$('hb-logout').addEventListener('click', () => { AdminSession.clear(); token = null; show('hb-login-view'); });
$('hb-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('hb-login-error'); err.hidden = true;
  try {
    const remember = $('hb-remember').checked;
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('hb-password').value, remember }) });
    token = r.token; AdminSession.set(r, remember);
    $('hb-password').value = '';
    await load();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});

async function load() {
  show('hb-view');
  $('hb-date').textContent = new Date().toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  const [g, t] = await Promise.all([api('/api/admin/galleries'), api('/api/admin/tours')]);
  const now = Date.now();
  const liveG = g.galleries.filter((x) => x.expires > now);
  const liveT = t.tours.filter((x) => !x.activeUntil || x.activeUntil > now);
  $('hb-g-count').textContent = liveG.length;
  $('hb-t-count').textContent = liveT.length;
  $('hb-storage').textContent = fmtBytes(g.totalBytes);
  $('hb-storage-bar').style.width = Math.min(100, (g.totalBytes / g.limitBytes) * 100).toFixed(1) + '%';

  // Meldingen
  const alerts = [];
  t.tours.filter((x) => x.activeUntil && x.activeUntil > now && x.activeUntil - now < 14 * DAY)
    .forEach((x) => alerts.push({ cls: 'is-warn', html: `Tour <b>${esc(x.title)}</b> gaat offline op ${fmtDate(x.activeUntil)}. Tijd om te factureren of te verlengen.`, href: `tours-beheer.html?t=${encodeURIComponent(x.id)}` }));
  t.tours.filter((x) => x.activeUntil && x.activeUntil <= now)
    .forEach((x) => alerts.push({ cls: 'is-off', html: `Tour <b>${esc(x.title)}</b> is gepauzeerd sinds ${fmtDate(x.activeUntil)}.`, href: `tours-beheer.html?t=${encodeURIComponent(x.id)}` }));
  g.galleries.filter((x) => x.expires > now && x.expires - now < 7 * DAY)
    .forEach((x) => alerts.push({ cls: 'is-warn', html: `Galerij <b>${esc(x.title)}</b> verdwijnt op ${fmtDate(x.expires)}.`, href: `klantenzone-beheer.html?g=${encodeURIComponent(x.code)}` }));
  if (g.totalBytes / g.limitBytes > 0.8) alerts.push({ cls: 'is-warn', html: `Je gratis opslag is voor ${Math.round((g.totalBytes / g.limitBytes) * 100)}% vol. Verwijder oude galerijen.`, href: 'klantenzone-beheer.html' });
  $('hb-alerts').innerHTML = alerts.length
    ? alerts.map((a) => `<li class="${a.cls}"><a href="${a.href}">${a.html} <span aria-hidden="true">→</span></a></li>`).join('')
    : '<li class="is-ok">Alles in orde. Geen tours of galerijen die binnenkort vervallen.</li>';

  // Recente galerijen
  $('hb-galleries').innerHTML = g.galleries.slice(0, 5).map((x) => `
    <li class="ad-item"><a class="ad-item-main" href="klantenzone-beheer.html?g=${encodeURIComponent(x.code)}">
      <span class="ad-item-title">${esc(x.title)}</span><span class="ad-item-meta">${x.fileCount} bestanden · ${fmtBytes(x.bytes)}</span></a>
      <span class="ad-pill ${x.expires < now ? 'is-off' : ''}">${x.expires < now ? 'Verlopen' : 'Tot ' + fmtDate(x.expires)}</span></li>`).join('')
    || '<li class="ad-empty">Nog geen galerijen.</li>';

  // Tours
  $('hb-tours').innerHTML = t.tours.slice(0, 5).map((x) => {
    const off = x.activeUntil && x.activeUntil <= now;
    const warn = x.activeUntil && !off && x.activeUntil - now < 14 * DAY;
    return `<li class="ad-item"><a class="ad-item-main" href="tours-beheer.html?t=${encodeURIComponent(x.id)}">
      <span class="ad-item-title">${esc(x.title)}</span><span class="ad-item-meta">${x.scenes} ${x.scenes === 1 ? 'ruimte' : 'ruimtes'}</span></a>
      <span class="ad-pill ${off ? 'is-off' : warn ? 'is-warn' : ''}">${off ? 'Gepauzeerd' : x.activeUntil ? 'Tot ' + fmtDate(x.activeUntil) : 'Altijd online'}</span></li>`;
  }).join('') || '<li class="ad-empty">Nog geen tours.</li>';
}

(async function init() {
  if (!API) { show('hb-setup'); return; }
  const s = AdminSession.get();
  if (s) { token = s.token; try { await load(); return; } catch (e) {} }
  show('hb-login-view');
  $('hb-password').focus();
})();
