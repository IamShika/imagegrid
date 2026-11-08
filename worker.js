// ============================================================
//  Gallery Worker  (runs on Cloudflare, NOT on GitHub)
//
//  What it does, in simple words:
//   1. Keeps your Google API key secret and asks Google Drive for the photo list.
//   2. Keeps every gallery you make (settings + a short code) in Cloudflare KV.
//   3. Only someone who knows your PIN can make, change or delete galleries.
//   4. Makes the short share link  /g/CODE  that shows a picture banner when it is
//      pasted into LINE (the banner is your chosen background picture).
//
//  Settings (set in the Cloudflare dashboard, not in this file):
//    GOOGLE_API_KEY   (secret)   your Google API key                     - required
//    PIN              (secret)   your numbers, e.g. 482913               - required
//    GALLERIES        (KV)       a KV namespace bound with this name     - required
//    ALLOWED_ORIGINS  (text)     e.g. https://yourname.github.io         - recommended
//    LEGACY_OPEN      (text)     "1" = old-style links keep working      - optional, temporary
// ============================================================

const FIELDS =
  'nextPageToken,files(id,name,mimeType,thumbnailLink,' +
  'imageMediaMetadata(width,height,rotation),videoMediaMetadata(width,height))';

const CODE_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';     // no confusing letters (l, o, 0, 1)
const LAYOUTS = ['grid', 'square', 'column', 'oneup'];
const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;                    // Drive folder / file ids
const CODE_RE = /^[a-z0-9]{6,16}$/;
const MAX_FAILS = 5;                                        // wrong PINs allowed ...
const LOCK_SECONDS = 900;                                   // ... before a 15 minute pause
const DEFAULT_DESC = 'ดูและเลือกรูปที่ชอบได้เลย · View and pick your favorite photos';

class HttpError extends Error {
  constructor(status, reason) { super(reason); this.status = status; this.reason = reason; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // ---------- Which websites may talk to us? ----------
    const origin = request.headers.get('Origin') || '';
    const allowList = (env.ALLOWED_ORIGINS || '*')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    const openToAll = allowList.includes('*');
    const originOk = openToAll || !origin || allowList.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin': openToAll ? '*' : originOk && origin ? origin : allowList[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors, ...extra },
      });
    const fail = (status, reason, extra) => reply({ error: { status, reason } }, status, extra);

    // Browsers send a quick "OPTIONS" check first. Just say yes.
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // ---------- Pages that are opened directly (link previews) ----------
    // These are opened by people and by LINE's preview robot, not by the website's code,
    // so the "which website" check does not apply.
    if (request.method === 'GET') {
      let m = path.match(/^\/g\/([a-z0-9]{6,16})$/);
      if (m) return sharePage(m[1], env, url);
      m = path.match(/^\/img\/([a-z0-9]{6,16})$/);
      if (m) return shareImage(m[1], env, request, ctx);
    }

    if (!originOk) return fail(403, 'originNotAllowed', { 'Access-Control-Allow-Origin': origin });

    try {
      if (request.method === 'POST' && path === '/admin') return await admin(request, env, reply, allowList, openToAll);
      if (request.method === 'GET') return await listing(url, request, env, reply);
      return fail(405, 'methodNotAllowed');
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.reason);
      return fail(500, 'serverError');
    }
  },
};

// ============================================================
//  Public: the website asks "what is in gallery CODE?"
// ============================================================
async function listing(url, request, env, reply) {
  const country = (request.cf && request.cf.country) || null;   // used to pick Thai or English
  const code = url.searchParams.get('id');

  if (code) {
    if (!CODE_RE.test(code)) throw new HttpError(404, 'galleryNotFound');
    const rec = await getRecord(env, code, true);
    if (!rec) throw new HttpError(404, 'galleryNotFound');
    const files = await listFolder(env, rec.f);
    return reply({ files, settings: publicSettings(rec), country }, 200, { 'Cache-Control': 'private, max-age=60' });
  }

  // Old-style links (?folder=...). Closed unless you set LEGACY_OPEN to 1.
  const folder = url.searchParams.get('folder');
  if (folder) {
    if (env.LEGACY_OPEN !== '1') throw new HttpError(403, 'legacyOff');
    if (!ID_RE.test(folder)) throw new HttpError(400, 'badFolderId');
    const files = await listFolder(env, folder);
    return reply({ files, country }, 200, { 'Cache-Control': 'private, max-age=60' });
  }
  throw new HttpError(400, 'badFolderId');
}

// What customers are allowed to see about a gallery
function publicSettings(rec) {
  const s = { t: rec.t, by: rec.by, st: rec.st, sa: rec.sa, l: rec.l, c: rec.c, m: rec.m, g: rec.g, bg: rec.bg, dim: rec.dim, bl: rec.bl, dl: rec.dl };
  if (rec.dl) s.f = rec.f;                                       // the Drive folder is only needed for "Download all"
  return s;
}

async function getRecord(env, code, forPublic) {
  if (!env.GALLERIES) return null;
  // Public reads may be remembered for a minute (faster). The admin always sees the latest.
  return await env.GALLERIES.get('g:' + code, forPublic ? { type: 'json', cacheTtl: 60 } : { type: 'json' });
}

// ============================================================
//  Ask Google Drive for the files in a folder (page by page)
// ============================================================
async function listFolder(env, folder, opts = {}) {
  if (!env.GOOGLE_API_KEY) throw new HttpError(500, 'secretMissing');

  // Reuse a recent answer if we have one (saves time). Remembered for 5 minutes.
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request('https://gallery-cache.invalid/' + folder);
  if (cache && !opts.fresh) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return await hit.json();
    } catch (_) {}
  }

  const files = [];
  let pageToken = '';
  for (let page = 0; page < 20; page++) {
    const u = new URL('https://www.googleapis.com/drive/v3/files');
    u.searchParams.set('q', "'" + folder + "' in parents and trashed=false and (mimeType contains 'image/' or mimeType contains 'video/')");
    u.searchParams.set('fields', FIELDS);
    u.searchParams.set('orderBy', 'name');
    u.searchParams.set('pageSize', '1000');
    u.searchParams.set('key', env.GOOGLE_API_KEY);
    if (pageToken) u.searchParams.set('pageToken', pageToken);

    let res, body;
    try {
      res = await fetch(u.toString());
      body = await res.json();
    } catch (_) {
      throw new HttpError(502, 'driveUnreachable');
    }
    if (!res.ok) {
      const reason =
        (body && body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason) ||
        (body && body.error && body.error.status) ||
        'driveError';
      // We pass Google's status along (404 = not found, 403 = private, ...)
      // but never the key or Google's full message.
      throw new HttpError(res.status, reason);
    }
    files.push(...(body.files || []));
    pageToken = body.nextPageToken || '';
    if (!pageToken) break;
  }

  if (cache) {
    try {
      await cache.put(cacheKey, new Response(JSON.stringify(files), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      }));
    } catch (_) {}
  }
  return files;
}

// ============================================================
//  Admin: everything that needs your PIN
// ============================================================
async function admin(request, env, reply, allowList, openToAll) {
  const fail = (status, reason) => reply({ error: { status, reason } }, status);

  if (!env.PIN) return fail(500, 'pinNotSet');
  if (!env.GALLERIES) return fail(500, 'kvMissing');

  let body;
  try { body = await request.json(); } catch (_) { return fail(400, 'badRequest'); }
  if (!body || typeof body !== 'object') return fail(400, 'badRequest');

  // ----- PIN check, with a pause after too many wrong tries -----
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const failKey = 'fail:' + ip;
  const fails = parseInt((await env.GALLERIES.get(failKey)) || '0', 10) || 0;
  if (fails >= MAX_FAILS) return fail(429, 'tooManyAttempts');

  if (!(await sameText(String(body.pin == null ? '' : body.pin).trim(), String(env.PIN).trim()))) {
    await env.GALLERIES.put(failKey, String(fails + 1), { expirationTtl: LOCK_SECONDS });
    return fail(401, 'badPin');
  }
  if (fails) await env.GALLERIES.delete(failKey);

  switch (body.action) {
    case 'login':
      return reply({ ok: true });

    case 'folder': {                                              // load a folder to start a new gallery
      if (!ID_RE.test(String(body.folder || ''))) return fail(400, 'badFolderId');
      return reply({ files: await listFolder(env, body.folder, { fresh: true }) });
    }

    case 'save': {                                                // create a gallery, or update one
      const s = cleanSettings(body.settings);
      const site = cleanSite(body.siteUrl, allowList, openToAll);
      let code = body.code;
      let old = null;
      if (code) {
        if (!CODE_RE.test(code)) return fail(404, 'galleryNotFound');
        old = await getRecord(env, code, false);
        if (!old) return fail(404, 'galleryNotFound');
      } else {
        for (let i = 0; i < 6 && !code; i++) {
          const c = newCode();
          if (!(await getRecord(env, c, false))) code = c;
        }
        if (!code) return fail(500, 'serverError');
      }
      const now = Date.now();
      const rec = { ...s, u: site, ts: old ? old.ts : now, up: now };
      await env.GALLERIES.put('g:' + code, JSON.stringify(rec), { metadata: { t: s.t, by: s.by, ts: rec.ts } });
      return reply({ code });
    }

    case 'list': {
      const out = [];
      let cursor;
      for (let i = 0; i < 5; i++) {
        const r = await env.GALLERIES.list({ prefix: 'g:', limit: 1000, cursor });
        for (const k of r.keys) out.push({ code: k.name.slice(2), t: (k.metadata && k.metadata.t) || '', by: (k.metadata && k.metadata.by) || '', ts: (k.metadata && k.metadata.ts) || 0 });
        if (r.list_complete) break;
        cursor = r.cursor;
      }
      out.sort((a, b) => b.ts - a.ts);
      return reply({ items: out });
    }

    case 'get': {
      if (!CODE_RE.test(String(body.code || ''))) return fail(404, 'galleryNotFound');
      const rec = await getRecord(env, body.code, false);
      if (!rec) return fail(404, 'galleryNotFound');
      return reply({ settings: rec });
    }

    case 'delete': {
      if (!CODE_RE.test(String(body.code || ''))) return fail(404, 'galleryNotFound');
      await env.GALLERIES.delete('g:' + body.code);
      return reply({ ok: true });
    }

    default:
      return fail(400, 'badRequest');
  }
}

// Compare two texts without leaking how many letters matched
async function sameText(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i];
  return diff === 0;
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

// Never trust what the browser sends: keep only known fields, in safe ranges
function cleanSettings(s) {
  if (!s || typeof s !== 'object') throw new HttpError(400, 'badSettings');
  const str = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const int = (v, def, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  const bool = (v, def) => (typeof v === 'boolean' ? v : def);
  if (!ID_RE.test(String(s.f || ''))) throw new HttpError(400, 'badFolderId');
  const bg = s.bg === 'none' || s.bg === 'auto' || ID_RE.test(String(s.bg || '')) ? s.bg : 'auto';
  return {
    f: s.f,
    t: str(s.t, 80), by: str(s.by, 60), d: str(s.d, 140),
    st: bool(s.st, true), sa: bool(s.sa, true), dl: bool(s.dl, true),
    l: LAYOUTS.includes(s.l) ? s.l : 'grid',
    c: int(s.c, 4, 1, 8), m: int(s.m, 2, 1, 4), g: int(s.g, 6, 0, 24),
    bg, dim: int(s.dim, 50, 0, 90), bl: int(s.bl, 0, 0, 20),
  };
}

// The address of your website. Must be one of your allowed websites.
function cleanSite(raw, allowList, openToAll) {
  let u;
  try { u = new URL(String(raw)); } catch (_) { throw new HttpError(400, 'badSite'); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new HttpError(400, 'badSite');
  if (!openToAll && !allowList.includes(u.origin)) throw new HttpError(400, 'badSite');
  u.search = ''; u.hash = '';
  return u.toString();
}

// ============================================================
//  The share link  /g/CODE
//  LINE (and Facebook, Instagram, ...) read the tags below to draw the preview card:
//  banner picture + title + small text. People are sent on to the real gallery at once.
// ============================================================
async function sharePage(code, env, url) {
  const rec = await getRecord(env, code, true);
  if (!rec) {
    return new Response('Gallery not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const title = rec.t && rec.by ? rec.t + ' by ' + rec.by : rec.t || rec.by || 'Gallery';
  const desc = rec.d || DEFAULT_DESC;
  const target = rec.u + '?id=' + code;
  const image = url.origin + '/img/' + code;
  const e = escapeHtml;

  const html = '<!doctype html>\n<html><head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + e(title) + '</title>\n' +
    '<meta name="description" content="' + e(desc) + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:title" content="' + e(title) + '">\n' +
    '<meta property="og:description" content="' + e(desc) + '">\n' +
    '<meta property="og:image" content="' + e(image) + '">\n' +
    '<meta property="og:url" content="' + e(url.origin + '/g/' + code) + '">\n' +
    '<meta name="twitter:card" content="summary_large_image">\n' +
    '<meta name="twitter:title" content="' + e(title) + '">\n' +
    '<meta name="twitter:image" content="' + e(image) + '">\n' +
    '<meta name="robots" content="noindex">\n' +
    '<script>location.replace(' + JSON.stringify(target).replace(/</g, '\\u003c') + ');</script>\n' +
    '<noscript><meta http-equiv="refresh" content="0;url=' + e(target) + '"></noscript>\n' +
    '</head><body style="font-family:sans-serif;background:#161616;color:#eee;text-align:center;padding:48px 16px">\n' +
    '<p><a style="color:#6aa6ff" href="' + e(target) + '">' + e(title) + '</a></p>\n</body></html>';

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' },
  });
}

// The banner picture for the preview card: your chosen background photo, cropped wide.
// We fetch it from Google and serve it from here, so the address never expires.
async function shareImage(code, env, request, ctx) {
  const notFound = () => new Response('Not found', { status: 404 });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(request.url);
  if (cache) {
    try { const hit = await cache.match(cacheKey); if (hit) return hit; } catch (_) {}
  }

  const rec = await getRecord(env, code, true);
  if (!rec) return notFound();
  let files;
  try { files = await listFolder(env, rec.f); } catch (_) { return notFound(); }

  const photos = files.filter((f) => f.mimeType && f.mimeType.startsWith('image/'));
  const pick = (rec.bg && rec.bg !== 'auto' && rec.bg !== 'none' && photos.find((f) => f.id === rec.bg)) || photos[0];
  if (!pick) return notFound();

  // Try a wide crop first, then plain, then Drive's own thumbnail address
  const tries = [];
  if (pick.thumbnailLink && /=s\d+$/.test(pick.thumbnailLink)) {
    const b = pick.thumbnailLink.replace(/=s\d+$/, '');
    tries.push(b + '=w1200-h630-c', b + '=w1200');
  }
  tries.push('https://drive.google.com/thumbnail?id=' + pick.id + '&sz=w1200');

  for (const u of tries) {
    try {
      const r = await fetch(u, { headers: { Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5' }, redirect: 'follow' });
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !/^image\//i.test(type)) continue;
      const buf = await r.arrayBuffer();
      if (!buf.byteLength) continue;
      const res = new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' } });
      if (cache) {
        const p = cache.put(cacheKey, res.clone());
        if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p;
      }
      return res;
    } catch (_) {}
  }
  return notFound();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
