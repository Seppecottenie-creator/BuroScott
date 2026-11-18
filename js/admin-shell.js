/* ============================================================
   BURO SCOTT — BEHEER: ZIJBALK
   Eén zijbalk voor alle beheerpagina's: navigatie, mappen
   (aanmaken, hernoemen, verwijderen, galerijen erin slepen)
   en opslag. Wordt meteen na <aside id="adm-side"> geladen.
============================================================ */
(function () {
  const side = document.getElementById('adm-side');
  if (!side) return;
  const API = (window.KLANTENZONE_API || '').replace(/\/+$/, '');
  const page = side.dataset.page || '';
  const DRAG = 'application/x-bs-gallery';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    overzicht: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    galerijen: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    tours: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/>',
    activiteit: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    plannen: '<path d="M3 3h18v18H3zM3 12h7v9M14 3v6h7"/>',
    aanvragen: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    map: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    alle: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    geen: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke-dasharray="3 3"/>',
    verlopen: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const NAV = [
    ['overzicht', 'beheer.html', 'Overzicht'],
    ['aanvragen', 'aanvragen.html', 'Aanvragen'],
    ['galerijen', 'klantenzone-beheer.html', 'Galerijen'],
    ['tours', 'tours-beheer.html', '360° tours'],
    ['plannen', 'plannen.html', 'Plannen'],
    ['activiteit', 'activiteit.html', 'Activiteit'],
  ];

  side.className = 'lib-side' + (page === 'galerijen' ? ' is-gal' : '');
  side.setAttribute('aria-label', 'Beheer');
  side.innerHTML = `
    <div class="lib-side-top">
      <a href="beheer.html" class="lib-brand">BURO SCOTT<span>.</span><small>Beheer</small></a>
    </div>
    <nav class="lib-nav">${NAV.map(([k, href, label]) => `<a href="${href}"${k === page ? ' aria-current="page"' : ''}>${svg(k)}${label}${k === 'aanvragen' ? '<em class="lib-badge" id="adm-aq-badge" hidden></em>' : ''}</a>`).join('')}</nav>
    <div class="lib-fold-head">
      <p class="lib-label">Mappen</p>
      <button type="button" class="lib-fold-add" id="adm-folder-add" aria-label="Nieuwe map" title="Nieuwe map">+</button>
    </div>
    <ul class="lib-folders" id="lib-folders"><li class="lib-folders-wait">Laden…</li></ul>
    <div class="lib-storage" id="ad-storage" aria-label="Opslag"></div>
    <button type="button" class="kz-logout lib-logout" id="${esc(side.dataset.logout || 'adm-logout')}" hidden>Afmelden</button>`;

  const dlg = document.createElement('dialog');
  dlg.className = 'lib-dialog lib-fdialog';
  dlg.innerHTML = `
    <form method="dialog" class="lib-fform" novalidate>
      <div class="lib-dialog-head"><h2 id="adm-f-title">Nieuwe map</h2>
        <button type="button" class="lib-dialog-close" data-close aria-label="Sluiten">✕</button></div>
      <div class="lib-fbody">
        <div class="field"><label for="adm-f-name">Naam van de map</label>
          <input type="text" id="adm-f-name" maxlength="40" placeholder="bv. Immo Vandenberghe" autocomplete="off"></div>
        <p class="form-alert" id="adm-f-error" role="alert" hidden></p>
        <p class="lib-fwarn" id="adm-f-warn" hidden></p>
        <div class="lib-factions">
          <button type="button" class="kz-btn kz-btn-ghost lib-fdel" id="adm-f-del" hidden>Map verwijderen</button>
          <button type="submit" class="kz-btn kz-btn-primary" id="adm-f-save">Map aanmaken</button>
        </div>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const $ = (id) => document.getElementById(id);

  const S = { folders: [], galleries: [], totalBytes: 0, limitBytes: 10 * 1024 ** 3, active: '', loaded: false };
  const token = () => (window.AdminSession && AdminSession.get() || {}).token;

  async function api(path, opts = {}) {
    const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token(), ...(opts.headers || {}) } });
    let d = {}; try { d = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(d.error || 'Er ging iets mis.');
    return d;
  }
  function fmtBytes(b) {
    if (b >= 1024 ** 3) return (b / 1024 ** 3).toFixed(2).replace('.', ',') + ' GB';
    if (b >= 1024 ** 2) return (b / 1024 ** 2).toFixed(1).replace('.', ',') + ' MB';
    return Math.max(0, Math.round(b / 1024)) + ' kB';
  }

  function render() {
    const now = Date.now();
    const g = S.galleries;
    const ids = new Set(S.folders.map((f) => f.id));
    const items = [{ key: 'alle', label: 'Alle galerijen', icon: 'alle', n: g.length }];
    for (const f of S.folders) items.push({ key: f.id, label: f.name, icon: 'map', n: g.filter((x) => x.folder === f.id).length, custom: true });
    const loose = g.filter((x) => !ids.has(x.folder)).length;
    if (S.folders.length) items.push({ key: 'geen', label: 'Zonder map', icon: 'geen', n: loose, drop: true });
    const expired = g.filter((x) => x.expires < now).length;
    if (expired) items.push({ key: 'verlopen', label: 'Verlopen', icon: 'verlopen', n: expired });
    $('lib-folders').innerHTML = items.map((it) => `
      <li class="${it.custom ? 'is-custom' : ''}" data-key="${esc(it.key)}"${it.custom || it.drop ? ' data-drop="1"' : ''}>
        <button type="button" class="lib-fbtn" data-folder="${esc(it.key)}"${S.active === it.key ? ' aria-current="true"' : ''}>${svg(it.icon)}<span>${esc(it.label)}</span><em>${it.n}</em></button>
        ${it.custom ? `<button type="button" class="lib-fedit" data-edit="${esc(it.key)}" aria-label="Map ${esc(it.label)} aanpassen" title="Aanpassen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>` : ''}
      </li>`).join('')
      + (S.folders.length ? '' : '<li class="lib-folders-tip">Maak mappen aan met +, bv. per makelaar. Sleep galerijen erin.</li>');
    const pct = Math.min(100, (S.totalBytes / S.limitBytes) * 100);
    $('ad-storage').innerHTML = S.loaded ? `<span class="lib-storage-label"><b>${fmtBytes(S.totalBytes)}</b> van 10 GB gratis</span><span class="ad-bar"><span style="width:${Math.max(1, pct).toFixed(1)}%"></span></span>` : '';
  }

  $('lib-folders').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { openDialog(S.folders.find((f) => f.id === ed.dataset.edit)); return; }
    const b = e.target.closest('[data-folder]');
    if (!b) return;
    S.active = b.dataset.folder;
    render();
    Shell.onSelect(S.active);
  });

  /* Slepen: galerijkaart op een map loslaten */
  const lst = $('lib-folders');
  lst.addEventListener('dragover', (e) => {
    const li = e.target.closest('[data-drop]');
    if (!li || !e.dataTransfer.types.includes(DRAG)) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    lst.querySelectorAll('.is-over').forEach((x) => x !== li && x.classList.remove('is-over'));
    li.classList.add('is-over');
  });
  lst.addEventListener('dragleave', (e) => { const li = e.target.closest('[data-drop]'); if (li && !li.contains(e.relatedTarget)) li.classList.remove('is-over'); });
  lst.addEventListener('drop', async (e) => {
    const li = e.target.closest('[data-drop]');
    if (!li) return;
    e.preventDefault(); li.classList.remove('is-over');
    const code = e.dataTransfer.getData(DRAG);
    if (!code) return;
    await Shell.moveGallery(code, li.dataset.key === 'geen' ? '' : li.dataset.key);
  });

  /* Map aanmaken / hernoemen / verwijderen */
  let editing = null, confirmDel = false;
  function openDialog(folder) {
    editing = folder || null; confirmDel = false;
    $('adm-f-title').textContent = editing ? 'Map aanpassen' : 'Nieuwe map';
    $('adm-f-save').textContent = editing ? 'Opslaan' : 'Map aanmaken';
    $('adm-f-name').value = editing ? editing.name : '';
    $('adm-f-del').hidden = !editing;
    $('adm-f-del').textContent = 'Map verwijderen';
    $('adm-f-warn').hidden = true;
    $('adm-f-error').hidden = true;
    dlg.showModal();
    $('adm-f-name').focus();
    $('adm-f-name').select();
  }
  const err = (m) => { $('adm-f-error').textContent = m; $('adm-f-error').hidden = false; };
  $('adm-folder-add').addEventListener('click', () => openDialog(null));
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('adm-f-name').value.trim();
    if (!name) { err('Geef de map een naam.'); return; }
    try {
      if (editing) await api('/api/admin/folders/' + encodeURIComponent(editing.id), { method: 'PATCH', body: JSON.stringify({ name }) });
      else { const f = await api('/api/admin/folders', { method: 'POST', body: JSON.stringify({ name }) }); S.active = f.id; if (page === 'galerijen') Shell.onSelect(f.id); }
      dlg.close();
      await Shell.onChange();
    } catch (ex) { err(ex.message); }
  });
  $('adm-f-del').addEventListener('click', async () => {
    if (!editing) return;
    if (!confirmDel) {
      const n = S.galleries.filter((x) => x.folder === editing.id).length;
      $('adm-f-warn').textContent = n === 1 ? 'De galerij in deze map blijft bewaard en komt bij "Zonder map".' : n ? `De ${n} galerijen in deze map blijven bewaard en komen bij "Zonder map".` : 'Deze map is leeg.';
      $('adm-f-warn').hidden = false;
      $('adm-f-del').textContent = 'Ja, verwijder de map';
      $('adm-f-del').classList.add('is-sure');
      confirmDel = true;
      return;
    }
    $('adm-f-del').classList.remove('is-sure');
    try {
      await api('/api/admin/folders/' + encodeURIComponent(editing.id), { method: 'DELETE' });
      if (S.active === editing.id) { S.active = 'alle'; if (page === 'galerijen') Shell.onSelect('alle'); }
      dlg.close();
      await Shell.onChange();
    } catch (ex) { err(ex.message); }
  });

  const Shell = {
    DRAG,
    get folders() { return S.folders; },
    setData(d) {
      S.folders = d.folders || [];
      S.galleries = d.galleries || [];
      S.totalBytes = d.totalBytes || 0;
      S.limitBytes = d.limitBytes || S.limitBytes;
      S.loaded = true;
      if (S.active && !['alle', 'geen', 'verlopen'].includes(S.active) && !S.folders.some((f) => f.id === S.active)) S.active = 'alle';
      render();
    },
    setActive(key) { S.active = key; render(); },
    async load() {
      if (!API || !token()) return;
      try { Shell.setData(await api('/api/admin/galleries')); } catch (e) {}
    },
    async moveGallery(code, folder) {
      await api('/api/admin/galleries/' + encodeURIComponent(code), { method: 'PATCH', body: JSON.stringify({ folder }) });
      await Shell.onChange();
    },
    // Standaard: op andere pagina's naar de galerijen in die map gaan
    onSelect(key) { location.href = 'klantenzone-beheer.html' + (key && key !== 'alle' ? '?map=' + encodeURIComponent(key) : ''); },
    onChange() { return Shell.load(); },
    async badge() {
      if (!API || !token()) return;
      try {
        const r = await api('/api/admin/aanvragen');
        const b = $('adm-aq-badge'); b.textContent = r.nieuw; b.hidden = !r.nieuw;
      } catch (e) {}
    },
  };
  window.AdminShell = Shell;
  render();

  /* Zijbalk tonen zodra je ingelogd bent (afmeldknop zichtbaar) */
  const out = side.querySelector('.lib-logout');
  const sync = () => {
    const on = !out.hidden;
    document.body.classList.toggle('adm-in', on);
    if (on && !S.loaded && page !== 'galerijen') Shell.load();
    if (on) Shell.badge();
  };
  new MutationObserver(sync).observe(out, { attributes: true, attributeFilter: ['hidden'] });
  sync();
})();
