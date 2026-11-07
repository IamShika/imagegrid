// ============================================================
//  Gallery Worker  (runs on Cloudflare, NOT on GitHub)
//
//  What it does, in simple words:
//   1. Your website asks:  "what's in Drive folder XYZ?"
//   2. This Worker asks Google Drive, using your SECRET key.
//   3. It sends the list of photos back to your website.
//
//  The secret key is stored inside Cloudflare (as a "secret"),
//  so it is never written in any file and never on GitHub.
//
//  Settings (set in the Cloudflare dashboard, not in this file):
//    GOOGLE_API_KEY   (secret)  your Google API key       - required
//    ALLOWED_ORIGINS  (text)    e.g. https://yourname.github.io
//                               only these websites may use this Worker.
//                               Leave empty to allow any website.
// ============================================================

const FIELDS =
  'nextPageToken,files(id,name,mimeType,thumbnailLink,' +
  'imageMediaMetadata(width,height,rotation),videoMediaMetadata(width,height))';

export default {
  async fetch(request, env) {
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    const reply = (data, status = 200, extra = {}) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
      });

    // Browsers send a quick "OPTIONS" check first. Just say yes.
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return reply({ error: { status: 405, reason: 'methodNotAllowed' } }, 405);

    if (!originOk) return reply({ error: { status: 403, reason: 'originNotAllowed' } }, 403);

    // ---------- Check the folder ID ----------
    const url = new URL(request.url);
    const folder = url.searchParams.get('folder') || '';
    // Only letters, numbers, - and _ are allowed. This also blocks tricks.
    if (!/^[A-Za-z0-9_-]{10,100}$/.test(folder)) {
      return reply({ error: { status: 400, reason: 'badFolderId' } }, 400);
    }

    if (!env.GOOGLE_API_KEY) {
      return reply({ error: { status: 500, reason: 'secretMissing' } }, 500);
    }

    // ---------- Reuse a recent answer if we have one (saves time) ----------
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheKey = new Request('https://gallery-cache.invalid/' + folder);
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit) return reply(await hit.json(), 200, { 'X-Cache': 'HIT', 'Cache-Control': 'public, max-age=60' });
      } catch (_) {}
    }

    // ---------- Ask Google Drive (page by page) ----------
    const files = [];
    let pageToken = '';
    for (let page = 0; page < 20; page++) {
      const u = new URL('https://www.googleapis.com/drive/v3/files');
      u.searchParams.set(
        'q',
        "'" + folder + "' in parents and trashed=false and (mimeType contains 'image/' or mimeType contains 'video/')"
      );
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
        return reply({ error: { status: 502, reason: 'driveUnreachable' } }, 502);
      }

      if (!res.ok) {
        const reason =
          (body && body.error && body.error.errors && body.error.errors[0] && body.error.errors[0].reason) ||
          (body && body.error && body.error.status) ||
          'driveError';
        // We pass Google's status along (404 = not found, 403 = private, ...)
        // but we never include the key or the full Google message.
        return reply({ error: { status: res.status, reason } }, res.status);
      }

      files.push(...(body.files || []));
      pageToken = body.nextPageToken || '';
      if (!pageToken) break;
    }

    const result = { files };

    // Remember this answer for 5 minutes
    if (cache) {
      try {
        await cache.put(
          cacheKey,
          new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
          })
        );
      } catch (_) {}
    }

    return reply(result, 200, { 'Cache-Control': 'public, max-age=60' });
  },
};
