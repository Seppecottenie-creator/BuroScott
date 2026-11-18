/* ============================================================
   BURO SCOTT — ACTIVITEIT
   Tijdlijn van bezoeken, downloads en logins per galerij en tour.
============================================================ */
const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const $ = (id) => document.getElementById(id);
let token = null;
let data = { events: [], stats: {} };
let typeFilter = '';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function show(v) { for (const x of ['ac-login-view', 'ac-view', 'ac-setup']) $(x).hidden = x !== v; $('ac-logout').hidden = v !== 'ac-view'; }
async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  let d = {}; try { d = await res.json(); } catch (e) {}
  if (res.status === 401 && path !== '/api/admin/login') { AdminSession.clear(); token = null; show('ac-login-view'); throw new Error('Log opnieuw in.'); }
  if (!res.ok) throw new Error(d.error || 'Er ging iets mis.');
  return d;
}

const ICON = {
  login: { cls: 'ok', icon: '<path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>' },
  'login-fail': { cls: 'bad', icon: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' },
  visit: { cls: 'blue', icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>' },
  download: { cls: 'dark', icon: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14"/>' },
  zip: { cls: 'dark', icon: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M5 19h14"/>' },
  tour: { cls: 'blue', icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/>' },
};
function sentence(e) {
  const t = `<b>${esc(e.title)}</b>`;
  switch (e.type) {
    case 'login': return `Klant logde in op ${t}`;
    case 'login-fail': return `Mislukte inlogpoging op ${t} (fout wachtwoord)`;
    case 'visit': return `${t} werd bekeken`;
    case 'download': return `<span class="ac-file">${esc(e.file)}</span> gedownload uit ${t}`;
    case 'zip': return `Alles gedownload als zip${e.n ? ` (${e.n} bestanden)` : ''} uit ${t}`;
    case 'tour': return `Virtuele tour ${t} werd bekeken`;
    default: return `${esc(e.type)} · ${t}`;
  }
}
function dayLabel(ms) {
  const d = new Date(ms); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Vandaag';
  if (same(d, y)) return 'Gisteren';
  return d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: today.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
}
function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'zonet';
  if (m < 60) return `${m} min geleden`;
  return new Date(ms).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
}

function render() {
  const sel = $('ac-filter').value;
  let ev = data.events;
  if (sel) ev = ev.filter((e) => (e.kind === 'tour' ? 'tour:' + e.ref : e.ref) === sel);
  const all = ev;
  if (typeFilter === 'download') ev = ev.filter((e) => e.type === 'download' || e.type === 'zip');
  else if (typeFilter) ev = ev.filter((e) => e.type === typeFilter);
  $('ac-visits').textContent = all.filter((e) => e.type === 'visit').length;
  $('ac-downloads').textContent = all.filter((e) => e.type === 'download' || e.type === 'zip').length;
  $('ac-tours').textContent = all.filter((e) => e.type === 'tour').length;
  const feed = $('ac-feed');
  if (!ev.length) { feed.innerHTML = '<li class="ad-empty">Nog geen activiteit. Zodra een klant inlogt of downloadt, verschijnt het hier.</li>'; return; }
  let html = '', lastDay = '';
  for (const e of ev) {
    const day = dayLabel(e.t);
    if (day !== lastDay) { html += `<li class="ac-day">${day}</li>`; lastDay = day; }
    const ic = ICON[e.type] || ICON.visit;
    const link = e.kind === 'tour' ? `tours-beheer.html?t=${encodeURIComponent(e.ref)}` : `klantenzone-beheer.html?g=${encodeURIComponent(e.ref)}`;
    html += `<li class="ac-item">
      <span class="ac-icon is-${ic.cls}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic.icon}</svg></span>
      <div class="ac-body"><a href="${link}" class="ac-text">${sentence(e)}</a>
        <span class="ac-meta">${[e.loc, e.dev].filter(Boolean).map(esc).join(' · ')}</span></div>
      <time class="ac-time" datetime="${new Date(e.t).toISOString()}" title="${new Date(e.t).toLocaleString('nl-BE')}">${ago(e.t)}</time>
    </li>`;
  }
  feed.innerHTML = html;
}

async function load() {
  show('ac-view');
  data = await api('/api/admin/activity?limit=500');
  const sel = $('ac-filter'); const keep = sel.value || new URLSearchParams(location.search).get('g') || '';
  sel.innerHTML = '<option value="">Alle galerijen en tours</option>' + Object.entries(data.stats)
    .sort((a, b) => b[1].last - a[1].last)
    .map(([k, v]) => `<option value="${esc(k)}">${v.kind === 'tour' ? '360° · ' : ''}${esc(v.title)}</option>`).join('');
  sel.value = keep;
  render();
}
$('ac-filter').addEventListener('change', render);
$('ac-refresh').addEventListener('click', () => load());
document.querySelectorAll('.ac-chip').forEach((c) => c.addEventListener('click', () => {
  typeFilter = c.dataset.type;
  document.querySelectorAll('.ac-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
  render();
}));
$('ac-clear').addEventListener('click', async () => {
  const sel = $('ac-filter').value;
  const label = sel ? $('ac-filter').selectedOptions[0].textContent : 'alle galerijen en tours';
  $('ac-confirm-text').textContent = `De activiteit van ${label} wordt gewist. Dit kan niet ongedaan gemaakt worden.`;
  const d = $('ac-confirm'); d.showModal();
  const ok = await new Promise((r) => d.addEventListener('close', () => r(d.returnValue === 'ok'), { once: true }));
  if (!ok) return;
  const q = sel ? (sel.startsWith('tour:') ? `?t=${encodeURIComponent(sel.slice(5))}` : `?g=${encodeURIComponent(sel)}`) : '';
  await api('/api/admin/activity' + q, { method: 'DELETE' });
  await load();
});
$('ac-logout').addEventListener('click', () => { AdminSession.clear(); token = null; show('ac-login-view'); });
$('ac-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('ac-login-error'); err.hidden = true;
  try {
    const remember = $('ac-remember').checked;
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('ac-password').value, remember }) });
    token = r.token; AdminSession.set(r, remember); await load();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
// Elke minuut vanzelf bijwerken zolang de pagina open staat
setInterval(() => { if (token && !document.hidden && !$('ac-view').hidden) load().catch(() => {}); }, 60000);

(async function init() {
  if (!API) { show('ac-setup'); return; }
  const s = AdminSession.get();
  if (s) { token = s.token; try { await load(); return; } catch (e) {} }
  show('ac-login-view');
})();
