/* ============================================================
   BURO SCOTT — BEHEER: AANVRAGEN
   Offerte- en contactaanvragen die via de website binnenkwamen.
============================================================ */
const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
const $ = (id) => document.getElementById(id);
let token = null, items = [], filter = 'nieuw', current = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const when = (t) => new Date(t).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function show(v) { for (const x of ['aq-login-view', 'aq-view', 'aq-setup']) $(x).hidden = x !== v; $('aq-logout').hidden = v !== 'aq-view'; }
async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  let d = {}; try { d = await res.json(); } catch (e) {}
  if (res.status === 401 && path !== '/api/admin/login') { AdminSession.clear(); token = null; show('aq-login-view'); throw new Error('Log opnieuw in.'); }
  if (!res.ok) throw new Error(d.error || 'Er ging iets mis.');
  return d;
}

function renderList() {
  const list = filter ? items.filter((i) => i.status === filter) : items;
  const n = items.filter((i) => i.status === 'nieuw').length;
  $('aq-n-nieuw').textContent = n ? `(${n})` : '';
  const badge = document.getElementById('adm-aq-badge');
  if (badge) { badge.textContent = n; badge.hidden = !n; }
  $('aq-list').innerHTML = list.length ? list.map((i) => `
    <li><button type="button" class="aq-item${current && current.id === i.id ? ' is-on' : ''}${i.status === 'nieuw' ? ' is-new' : ''}" data-id="${esc(i.id)}">
      <span class="aq-item-top"><span class="aq-tag is-${i.form}">${i.form === 'contact' ? 'Bericht' : 'Offerte'}</span><time>${when(i.t)}</time></span>
      <b>${esc(i.naam)}</b>
      <span class="aq-item-meta">${[i.gemeente, i.keuze, i.totaal].filter(Boolean).map(esc).join(' · ') || esc(i.email)}</span>
    </button></li>`).join('')
    : `<li class="ad-empty">${filter === 'nieuw' ? 'Geen nieuwe aanvragen.' : 'Nog geen aanvragen.'}</li>`;
}
async function load() {
  show('aq-view');
  const r = await api('/api/admin/aanvragen');
  items = r.aanvragen;
  renderList();
  const id = new URLSearchParams(location.search).get('id');
  if (id && !current) openItem(id);
}
async function openItem(id) {
  const d = await api('/api/admin/aanvragen/' + encodeURIComponent(id));
  current = d;
  const name = (d.fields.find(([k]) => /^naam$/i.test(k)) || [])[1] || d.naam;
  const subject = d.form === 'contact' ? 'Je bericht aan Buro Scott' : 'Je offerteaanvraag bij Buro Scott';
  const adres = ['Adres van het pand', 'Postcode', 'Gemeente'].map((k) => (d.fields.find(([f]) => f === k) || [])[1]).filter(Boolean).join(', ');
  $('aq-detail').hidden = false;
  $('aq-detail').innerHTML = `
    <div class="aq-d-head">
      <div><p class="kz-eyebrow">${d.form === 'contact' ? 'Bericht' : 'Offerteaanvraag'} · ${when(d.t)}</p><h2>${esc(name)}</h2>
      <p class="aq-d-sub"><a href="mailto:${esc(d.email)}">${esc(d.email)}</a>${adres ? ' · ' + esc(adres) : ''}</p></div>
      <span class="ad-pill ${d.status === 'nieuw' ? 'is-warn' : ''}">${d.status === 'nieuw' ? 'Nieuw' : 'Behandeld'}</span>
    </div>
    <dl class="aq-fields">${d.fields.map(([k, v]) => `<div class="${/overzicht/i.test(k) ? 'is-wide' : ''}"><dt>${esc(k)}</dt><dd>${esc(v).replace(/\n/g, '<br>')}</dd></div>`).join('')}</dl>
    <p class="hint">${[d.loc, d.dev].filter(Boolean).map(esc).join(' · ')}</p>
    <div class="aq-actions">
      <a class="kz-btn kz-btn-primary" href="mailto:${esc(d.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent('Dag ' + String(name).split(' ')[0] + ',\n\n')}">Beantwoorden</a>
      <button type="button" class="kz-btn kz-btn-ghost" data-status="${d.status === 'nieuw' ? 'behandeld' : 'nieuw'}">${d.status === 'nieuw' ? 'Markeer als behandeld' : 'Terug naar nieuw'}</button>
      <button type="button" class="kz-btn kz-btn-ghost aq-del" data-del>Verwijderen</button>
    </div>`;
  renderList();
  if (window.innerWidth < 900) $('aq-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('aq-list').addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) openItem(b.dataset.id); });
$('aq-detail').addEventListener('click', async (e) => {
  const s = e.target.closest('[data-status]');
  if (s) {
    await api('/api/admin/aanvragen/' + current.id, { method: 'PATCH', body: JSON.stringify({ status: s.dataset.status }) });
    const it = items.find((i) => i.id === current.id); if (it) it.status = s.dataset.status;
    await openItem(current.id); return;
  }
  if (e.target.closest('[data-del]')) {
    const d = $('aq-confirm'); d.showModal();
    const ok = await new Promise((r) => d.addEventListener('close', () => r(d.returnValue === 'ok'), { once: true }));
    if (!ok) return;
    await api('/api/admin/aanvragen/' + current.id, { method: 'DELETE' });
    items = items.filter((i) => i.id !== current.id); current = null;
    $('aq-detail').hidden = true; renderList();
  }
});
document.querySelectorAll('.ac-chip').forEach((c) => c.addEventListener('click', () => {
  filter = c.dataset.f;
  document.querySelectorAll('.ac-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
  renderList();
}));
$('aq-refresh').addEventListener('click', () => load());
$('aq-logout').addEventListener('click', () => { AdminSession.clear(); token = null; show('aq-login-view'); });
$('aq-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('aq-login-error'); err.hidden = true;
  try {
    const remember = $('aq-remember').checked;
    const r = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password: $('aq-password').value, remember }) });
    token = r.token; AdminSession.set(r, remember); await load();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
setInterval(() => { if (token && !document.hidden && !$('aq-view').hidden) api('/api/admin/aanvragen').then((r) => { items = r.aanvragen; renderList(); }).catch(() => {}); }, 60000);

(async function init() {
  if (!API) { show('aq-setup'); return; }
  const s = AdminSession.get();
  if (s) { token = s.token; try { await load(); return; } catch (e) {} }
  show('aq-login-view');
})();
