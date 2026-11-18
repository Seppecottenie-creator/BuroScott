/* ============================================================
   BURO SCOTT — KLANTENZONE (Cloudflare Worker)

   Bewaart galerijen in een afgeschermde R2-opslag en geeft enkel
   toegang met de juiste galerijcode + wachtwoord.

   Opslagindeling in R2 (bucket "GALLERIES"):
     g/<code>/meta.json        titel, wachtwoord-hash, vervaldatum, tourlink
     g/<code>/o/<bestand>      originele bestanden (wat de klant downloadt)
     g/<code>/p/<bestand>.jpg  kleinere voorbeeldversie (voor de galerij)

   Geheimen (instellen met `wrangler secret put`):
     ADMIN_PASSWORD   wachtwoord van de beheerpagina
     SIGNING_KEY      lange willekeurige sleutel om toegangsbewijzen te ondertekenen
   Variabele (wrangler.toml):
     ALLOWED_ORIGINS  komma-gescheiden lijst van sites die de API mogen gebruiken
============================================================ */

const CLIENT_TOKEN_HOURS = 12;
const ADMIN_TOKEN_HOURS = 8;
const CODE_RE = /^[a-z0-9-]{4,40}$/;
const CATEGORIES = ['fotos', 'drone', 'plannen', 'overig'];

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : 'Er ging iets mis aan onze kant.';
      if (!(err instanceof HttpError)) console.error(err);
      return json({ error: message }, status, cors);
    }
  },

  // Dagelijks: vervallen galerijen opruimen (zie [triggers] in wrangler.toml)
  async scheduled(_event, env) {
    const now = Date.now();
    for (const code of await listGalleryCodes(env)) {
      const meta = await readMeta(env, code);
      if (meta && meta.expires && meta.expires < now) await deletePrefix(env, `g/${code}/`);
    }
  },
};

/* ---------------- Routering ---------------- */

async function route(request, env) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/+$/, '');
  const m = request.method;

  if (p === '' || p === '/api') return json({ ok: true, service: 'Buro Scott klantenzone' });

  // --- Klant ---
  if (p === '/api/login' && m === 'POST') return clientLogin(request, env);
  if (p === '/api/gallery' && m === 'GET') {
    const code = await requireClient(request, env);
    return json(await galleryForClient(env, code, url));
  }
  if (p === '/api/file' && m === 'GET') return serveFile(request, env, url);

  // --- 360°-tours (openbaar te bekijken, vaste link) ---
  if (p === '/api/tour' && m === 'GET') return json(await publicTour(env, url.searchParams.get('id')), 200, { 'Cache-Control': 'public, max-age=60' });
  if (p === '/api/tourfile' && m === 'GET') return serveTourFile(env, url);

  // --- Beheer ---
  if (p === '/api/admin/login' && m === 'POST') return adminLogin(request, env);
  if (p.startsWith('/api/admin/')) {
    await requireAdmin(request, env);
    const parts = p.split('/').slice(3).map(decodeURIComponent); // na /api/admin/
    if (parts[0] === 'tours') {
      if (parts.length === 1 && m === 'GET') return json(await adminListTours(env));
      if (parts.length === 1 && m === 'POST') return json(await adminCreateTour(request, env), 201);
      const id = parts[1];
      if (!CODE_RE.test(id || '')) throw new HttpError(400, 'Ongeldige tour.');
      if (parts.length === 2 && m === 'GET') return json(await adminGetTour(env, id));
      if (parts.length === 2 && m === 'PUT') return json(await adminSaveTour(request, env, id));
      if (parts.length === 2 && m === 'DELETE') { await deletePrefix(env, `t/${id}/`); return json({ ok: true }); }
      if (parts[2] === 'scenes' && parts.length === 4 && m === 'PUT') return json(await adminUploadScene(request, env, id, parts[3], url), 201);
      if (parts[2] === 'scenes' && parts.length === 4 && m === 'DELETE') return json(await adminDeleteScene(env, id, parts[3]));
    }
    if (parts[0] === 'galleries') {
      if (parts.length === 1 && m === 'GET') return json(await adminListGalleries(env));
      if (parts.length === 1 && m === 'POST') return json(await adminCreateGallery(request, env), 201);
      const code = parts[1];
      if (!CODE_RE.test(code || '')) throw new HttpError(400, 'Ongeldige galerijcode.');
      if (parts.length === 2 && m === 'GET') return json(await adminGetGallery(env, code));
      if (parts.length === 2 && m === 'PATCH') return json(await adminUpdateGallery(request, env, code));
      if (parts.length === 2 && m === 'DELETE') { await deleteGallery(env, code); return json({ ok: true }); }
      if (parts[2] === 'files' && parts.length === 4 && m === 'PUT') return json(await adminUpload(request, env, code, parts[3], url), 201);
      if (parts[2] === 'files' && parts.length === 4 && m === 'DELETE') return json(await adminDeleteFile(env, code, parts[3]));
    }
  }
  throw new HttpError(404, 'Niet gevonden.');
}

/* ---------------- Klant ---------------- */

async function clientLogin(request, env) {
  const body = await readJson(request);
  const code = String(body.code || '').trim().toLowerCase();
  const password = String(body.password || '');
  // Altijd even wachten: maakt gokken met veel pogingen traag
  await sleep(400);
  if (!CODE_RE.test(code) || !password) throw new HttpError(401, 'Code of wachtwoord klopt niet.');
  const meta = await readMeta(env, code);
  if (!meta) throw new HttpError(401, 'Code of wachtwoord klopt niet.');
  if (meta.expires && meta.expires < Date.now()) throw new HttpError(410, 'Deze galerij is verlopen. Neem contact op als je de beelden nog nodig hebt.');
  const ok = await safeEqual(await hashPassword(env, meta.salt, password), meta.hash);
  if (!ok) throw new HttpError(401, 'Code of wachtwoord klopt niet.');
  const exp = Math.min(Date.now() + CLIENT_TOKEN_HOURS * 3600e3, meta.expires || Infinity);
  return json({ token: await sign(env, { c: code, e: exp }), expiresAt: exp });
}

async function galleryForClient(env, code, url) {
  const meta = await readMeta(env, code);
  if (!meta) throw new HttpError(404, 'Galerij niet gevonden.');
  const files = await listFiles(env, code);
  return {
    code,
    title: meta.title,
    subtitle: meta.subtitle || '',
    tourUrl: meta.tourUrl || '',
    cover: meta.cover || '',
    created: meta.created,
    expires: meta.expires,
    files,
  };
}

async function serveFile(request, env, url) {
  // Afbeeldingen en downloads kunnen geen headers meesturen: het bewijs zit in ?t=
  const token = url.searchParams.get('t') || bearer(request);
  const payload = await verify(env, token);
  if (!payload) throw new HttpError(401, 'Je sessie is verlopen. Log opnieuw in.');
  const code = url.searchParams.get('g');
  const name = url.searchParams.get('n');
  const kind = url.searchParams.get('k') === 'p' ? 'p' : 'o';
  if (payload.c !== 'admin' && payload.c !== code) throw new HttpError(403, 'Geen toegang tot deze galerij.');
  if (!CODE_RE.test(code || '') || !validName(name)) throw new HttpError(400, 'Ongeldig bestand.');

  const key = kind === 'p' ? `g/${code}/p/${name}.jpg` : `g/${code}/o/${name}`;
  const obj = await env.GALLERIES.get(key);
  if (!obj) throw new HttpError(404, 'Bestand niet gevonden.');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('Content-Length', String(obj.size));
  if (url.searchParams.get('download') === '1') {
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  return new Response(obj.body, { headers });
}

/* ---------------- Beheer ---------------- */

async function adminLogin(request, env) {
  const body = await readJson(request);
  await sleep(500);
  if (!env.ADMIN_PASSWORD) throw new HttpError(500, 'ADMIN_PASSWORD is nog niet ingesteld.');
  const ok = await safeEqual(await sha256(String(body.password || '')), await sha256(env.ADMIN_PASSWORD));
  if (!ok) throw new HttpError(401, 'Wachtwoord klopt niet.');
  const exp = Date.now() + ADMIN_TOKEN_HOURS * 3600e3;
  return json({ token: await sign(env, { c: 'admin', e: exp }), expiresAt: exp });
}

async function adminListGalleries(env) {
  const out = [];
  let totalBytes = 0;
  for (const code of await listGalleryCodes(env)) {
    const meta = await readMeta(env, code);
    if (!meta) continue;
    const files = await listFiles(env, code);
    const bytes = files.reduce((s, f) => s + f.size, 0) + files.reduce((s, f) => s + (f.previewSize || 0), 0);
    totalBytes += bytes;
    out.push({ code, title: meta.title, created: meta.created, expires: meta.expires, tourUrl: meta.tourUrl || '', fileCount: files.length, bytes });
  }
  out.sort((a, b) => b.created - a.created);
  return { galleries: out, totalBytes, limitBytes: 10 * 1024 ** 3 };
}

async function adminCreateGallery(request, env) {
  const body = await readJson(request);
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, 'Geef de galerij een titel, bv. het adres van het pand.');
  const code = String(body.code || '').trim().toLowerCase();
  if (!CODE_RE.test(code)) throw new HttpError(400, 'De code mag enkel kleine letters, cijfers en streepjes bevatten (4 tot 40 tekens).');
  if (await readMeta(env, code)) throw new HttpError(409, 'Deze code bestaat al. Kies een andere.');
  const password = String(body.password || '');
  if (password.length < 8) throw new HttpError(400, 'Het wachtwoord moet minstens 8 tekens hebben.');
  const days = clampInt(body.days, 1, 365, 30);
  const salt = randomHex(16);
  const meta = {
    code, title,
    subtitle: String(body.subtitle || '').trim().slice(0, 160),
    tourUrl: cleanUrl(body.tourUrl),
    salt, hash: await hashPassword(env, salt, password),
    created: Date.now(),
    expires: Date.now() + days * 86400e3,
  };
  await writeMeta(env, code, meta);
  return publicMeta(meta);
}

async function adminGetGallery(env, code) {
  const meta = await readMeta(env, code);
  if (!meta) throw new HttpError(404, 'Galerij niet gevonden.');
  return { ...publicMeta(meta), files: await listFiles(env, code) };
}

async function adminUpdateGallery(request, env, code) {
  const meta = await readMeta(env, code);
  if (!meta) throw new HttpError(404, 'Galerij niet gevonden.');
  const body = await readJson(request);
  if (body.title !== undefined) meta.title = String(body.title).trim().slice(0, 120) || meta.title;
  if (body.subtitle !== undefined) meta.subtitle = String(body.subtitle).trim().slice(0, 160);
  if (body.tourUrl !== undefined) meta.tourUrl = cleanUrl(body.tourUrl);
  if (body.cover !== undefined) meta.cover = validName(String(body.cover)) ? String(body.cover) : '';
  if (body.days !== undefined) meta.expires = Date.now() + clampInt(body.days, 1, 365, 30) * 86400e3;
  if (body.password) {
    if (String(body.password).length < 8) throw new HttpError(400, 'Het wachtwoord moet minstens 8 tekens hebben.');
    meta.salt = randomHex(16);
    meta.hash = await hashPassword(env, meta.salt, String(body.password));
  }
  await writeMeta(env, code, meta);
  return publicMeta(meta);
}

async function adminUpload(request, env, code, name, url) {
  if (!(await readMeta(env, code))) throw new HttpError(404, 'Galerij niet gevonden.');
  if (!validName(name)) throw new HttpError(400, 'Ongeldige bestandsnaam.');
  const kind = url.searchParams.get('k') === 'p' ? 'p' : 'o';
  const type = request.headers.get('content-type') || 'application/octet-stream';
  if (kind === 'p') {
    await env.GALLERIES.put(`g/${code}/p/${name}.jpg`, request.body, { httpMetadata: { contentType: 'image/jpeg' } });
    return { ok: true };
  }
  const cat = CATEGORIES.includes(url.searchParams.get('cat')) ? url.searchParams.get('cat') : 'fotos';
  const w = clampInt(url.searchParams.get('w'), 0, 100000, 0);
  const h = clampInt(url.searchParams.get('h'), 0, 100000, 0);
  const obj = await env.GALLERIES.put(`g/${code}/o/${name}`, request.body, {
    httpMetadata: { contentType: type },
    customMetadata: { cat, w: String(w), h: String(h), uploaded: String(Date.now()) },
  });
  return { ok: true, name, size: obj.size };
}

async function adminDeleteFile(env, code, name) {
  if (!validName(name)) throw new HttpError(400, 'Ongeldige bestandsnaam.');
  await env.GALLERIES.delete([`g/${code}/o/${name}`, `g/${code}/p/${name}.jpg`]);
  return { ok: true };
}

/* ---------------- 360°-tours ----------------
   t/<id>/tour.json        titel, scènes, navigatiepunten
   t/<id>/s/<scene>.jpg    panorama (equirectangulair, 2:1)
   t/<id>/p/<scene>.jpg    kleine voorvertoning (snel laden + miniatuur)
   Tours vervallen niet: de link blijft werken tot jij ze verwijdert. */
const SCENE_RE = /^[a-z0-9-]{1,40}$/;

async function readTour(env, id) {
  const obj = await env.GALLERIES.get(`t/${id}/tour.json`);
  return obj ? obj.json() : null;
}
async function publicTour(env, id) {
  if (!CODE_RE.test(id || '')) throw new HttpError(400, 'Ongeldige tour.');
  const t = await readTour(env, id);
  if (!t) throw new HttpError(404, 'Deze tour bestaat niet (meer).');
  return t;
}
async function serveTourFile(env, url) {
  const id = url.searchParams.get('id');
  const scene = url.searchParams.get('s');
  const kind = url.searchParams.get('k') === 'p' ? 'p' : 's';
  if (!CODE_RE.test(id || '') || !SCENE_RE.test(scene || '')) throw new HttpError(400, 'Ongeldig bestand.');
  const obj = await env.GALLERIES.get(`t/${id}/${kind}/${scene}.jpg`);
  if (!obj) throw new HttpError(404, 'Bestand niet gevonden.');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { headers });
}
async function adminListTours(env) {
  const pages = await listAll(env, 't/', { delimiter: '/' });
  const ids = pages.flatMap(p => p.delimitedPrefixes).map(s => s.slice(2, -1));
  const out = [];
  for (const id of ids) {
    const t = await readTour(env, id);
    if (t) out.push({ id, title: t.title, created: t.created, scenes: (t.scenes || []).length });
  }
  out.sort((a, b) => b.created - a.created);
  return { tours: out };
}
async function adminCreateTour(request, env) {
  const body = await readJson(request);
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, 'Geef de tour een titel, bv. het adres van het pand.');
  const id = String(body.id || '').trim().toLowerCase();
  if (!CODE_RE.test(id)) throw new HttpError(400, 'Ongeldige tourcode.');
  if (await readTour(env, id)) throw new HttpError(409, 'Deze tourcode bestaat al.');
  const t = { id, title, created: Date.now(), updated: Date.now(), firstScene: '', scenes: [] };
  await writeTour(env, id, t);
  return t;
}
async function adminGetTour(env, id) {
  const t = await readTour(env, id);
  if (!t) throw new HttpError(404, 'Tour niet gevonden.');
  return t;
}
function cleanTour(body, existing) {
  const scenes = Array.isArray(body.scenes) ? body.scenes.slice(0, 60) : [];
  const ids = new Set(scenes.map(s => String(s.id || '')));
  const num = (v, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : 0; };
  const clean = scenes.filter(s => SCENE_RE.test(String(s.id || ''))).map(s => ({
    id: s.id,
    title: String(s.title || '').trim().slice(0, 60) || 'Ruimte',
    yaw: num(s.yaw, -180, 180),
    pitch: num(s.pitch, -90, 90),
    hotSpots: (Array.isArray(s.hotSpots) ? s.hotSpots.slice(0, 30) : [])
      .filter(h => ids.has(String(h.scene || '')))
      .map(h => ({ pitch: num(h.pitch, -90, 90), yaw: num(h.yaw, -180, 180), scene: String(h.scene) })),
  }));
  return {
    ...existing,
    title: String(body.title || existing.title).trim().slice(0, 120) || existing.title,
    firstScene: ids.has(String(body.firstScene || '')) ? body.firstScene : (clean[0] ? clean[0].id : ''),
    scenes: clean,
    updated: Date.now(),
  };
}
async function adminSaveTour(request, env, id) {
  const existing = await readTour(env, id);
  if (!existing) throw new HttpError(404, 'Tour niet gevonden.');
  const t = cleanTour(await readJson(request), existing);
  await writeTour(env, id, t);
  return t;
}
async function adminUploadScene(request, env, id, scene, url) {
  if (!(await readTour(env, id))) throw new HttpError(404, 'Tour niet gevonden.');
  if (!SCENE_RE.test(scene)) throw new HttpError(400, 'Ongeldige ruimte.');
  const kind = url.searchParams.get('k') === 'p' ? 'p' : 's';
  await env.GALLERIES.put(`t/${id}/${kind}/${scene}.jpg`, request.body, { httpMetadata: { contentType: 'image/jpeg' } });
  return { ok: true };
}
async function adminDeleteScene(env, id, scene) {
  if (!SCENE_RE.test(scene)) throw new HttpError(400, 'Ongeldige ruimte.');
  await env.GALLERIES.delete([`t/${id}/s/${scene}.jpg`, `t/${id}/p/${scene}.jpg`]);
  return { ok: true };
}
async function writeTour(env, id, t) {
  await env.GALLERIES.put(`t/${id}/tour.json`, JSON.stringify(t), { httpMetadata: { contentType: 'application/json' } });
}
async function deletePrefix(env, prefix) {
  const pages = await listAll(env, prefix);
  const keys = pages.flatMap(p => p.objects).map(o => o.key);
  for (let i = 0; i < keys.length; i += 1000) await env.GALLERIES.delete(keys.slice(i, i + 1000));
}

/* ---------------- Opslag ---------------- */

async function readMeta(env, code) {
  const obj = await env.GALLERIES.get(`g/${code}/meta.json`);
  return obj ? obj.json() : null;
}
async function writeMeta(env, code, meta) {
  await env.GALLERIES.put(`g/${code}/meta.json`, JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
}
function publicMeta(meta) {
  const { salt, hash, ...rest } = meta;
  return rest;
}
async function listAll(env, prefix, opts = {}) {
  const out = [];
  let cursor;
  do {
    const r = await env.GALLERIES.list({ prefix, cursor, ...opts });
    out.push(r);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
async function listGalleryCodes(env) {
  const pages = await listAll(env, 'g/', { delimiter: '/' });
  return pages.flatMap(p => p.delimitedPrefixes).map(s => s.slice(2, -1));
}
async function listFiles(env, code) {
  const [origPages, prevPages] = await Promise.all([
    listAll(env, `g/${code}/o/`, { include: ['customMetadata', 'httpMetadata'] }),
    listAll(env, `g/${code}/p/`),
  ]);
  const previews = new Map(prevPages.flatMap(p => p.objects).map(o => [o.key.slice(`g/${code}/p/`.length, -4), o.size]));
  return origPages.flatMap(p => p.objects).map(o => {
    const name = o.key.slice(`g/${code}/o/`.length);
    const cm = o.customMetadata || {};
    return {
      name,
      size: o.size,
      type: (o.httpMetadata && o.httpMetadata.contentType) || '',
      cat: cm.cat || 'fotos',
      w: Number(cm.w) || 0,
      h: Number(cm.h) || 0,
      uploaded: Number(cm.uploaded) || o.uploaded.getTime(),
      preview: previews.has(name),
      previewSize: previews.get(name) || 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'nl', { numeric: true }));
}
async function deleteGallery(env, code) {
  const pages = await listAll(env, `g/${code}/`);
  const keys = pages.flatMap(p => p.objects).map(o => o.key);
  for (let i = 0; i < keys.length; i += 1000) await env.GALLERIES.delete(keys.slice(i, i + 1000));
}

/* ---------------- Beveiliging ---------------- */

async function requireClient(request, env) {
  const payload = await verify(env, bearer(request));
  if (!payload || payload.c === 'admin') throw new HttpError(401, 'Je sessie is verlopen. Log opnieuw in.');
  return payload.c;
}
async function requireAdmin(request, env) {
  const payload = await verify(env, bearer(request));
  if (!payload || payload.c !== 'admin') throw new HttpError(401, 'Log opnieuw in op de beheerpagina.');
}
function bearer(request) {
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}
async function hmacKey(env) {
  if (!env.SIGNING_KEY || env.SIGNING_KEY.length < 32) throw new HttpError(500, 'SIGNING_KEY is nog niet (goed) ingesteld.');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function hmac(env, text) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(text));
  return b64url(new Uint8Array(sig));
}
// Galerijwachtwoorden worden nooit leesbaar bewaard: enkel een hash met
// een willekeurige salt per galerij én de geheime SIGNING_KEY erbij.
async function hashPassword(env, salt, password) {
  return hmac(env, `pw:${salt}:${password}`);
}
async function sign(env, payload) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(env, body)}`;
}
async function verify(env, token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!(await safeEqual(await hmac(env, body), sig))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return payload.e > Date.now() ? payload : null;
  } catch { return null; }
}
async function safeEqual(a, b) {
  // Vergelijk via hashes zodat de duur niets verraadt over de inhoud
  const [x, y] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64url(new Uint8Array(d));
}

/* ---------------- Hulpjes ---------------- */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
}
async function readJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'Ongeldige aanvraag.'); }
}
function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function validName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 160 && !/[\/\\]|\.\./.test(name) && !/^\./.test(name);
}
function cleanUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.toString() : ''; } catch { return ''; }
}
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : dflt;
}
function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
