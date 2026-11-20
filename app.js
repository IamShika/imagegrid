// ============================================================
//  Drive Gallery - the main code.
//  How it works, in simple words:
//   1. A customer opens  ...?id=CODE   (a short code made by the gallery maker).
//      With no code, the page is the gallery maker (it asks for your PIN).
//   2. We ask your Cloudflare Worker: "what is gallery CODE, and what photos are in it?"
//   3. We draw the photos in the layout you chose. Click one to see it big.
//  All the texts are in lang.js (English + Thai).
// ============================================================
(() => {
  const cfg = window.SITE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const L = window.Lang;
  const t = (key, vars) => L.t(key, vars);

  // ---------- Default look (you can change these in config.js under DEFAULTS) ----------
  const LAYOUTS = ['grid', 'square', 'column', 'oneup'];
  const D = Object.assign(
    { layout: 'grid', cols: 4, colsPhone: 2, gap: 6, dim: 50, blur: 0 },
    cfg.DEFAULTS || {}
  );
  if (!LAYOUTS.includes(D.layout)) D.layout = 'grid';

  // ---------- Read the page address ----------
  const params   = new URLSearchParams(location.search);
  const rawId    = params.get('id');                                  // new short links: ?id=CODE
  const code     = /^[a-z0-9]{6,16}$/.test(rawId || '') ? rawId : null;
  const legacyFolder = params.get('f');                               // old long links: ?f=FOLDER_ID&...
  const isPreview = params.get('preview') === '1';                    // the live preview inside the gallery maker

  // ---------- Things we keep track of ----------
  let G = null;              // the gallery on screen: { code, folderId, title, by, P }
  let items = [];            // every photo/video in the folder
  let visible = [];          // what the grid is showing right now
  let favs = new Set();      // ids of favorite photos
  let favKey = '';
  let showFavsOnly = false;
  let current = -1;          // which photo is open in the big viewer
  let lbOpen = false;
  let msgPrefix = null;      // which error message is on screen
  let statusState = '';      // '' | 'loading' | 'nofavs'
  let previewDevice = null;  // in the maker's preview: 'desktop' or 'phone'
  let adminRefresh = () => {};

  // ============================================================
  //  Small helper functions
  // ============================================================
  const clamp = (v, def, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  const hasWorker = () => cfg.WORKER_URL && !cfg.WORKER_URL.startsWith('PASTE_');
  const base = () => cfg.WORKER_URL.replace(/\/+$/, '');
  const isVideo = (f) => f.mimeType.startsWith('video/');
  const photosText = (n) => t(n === 1 ? 'photo.one' : 'photo.many', { n });
  const videosText = (n) => t(n === 1 ? 'video.one' : 'video.many', { n });

  // Get the folder ID out of a pasted Google Drive link
  function extractFolderId(text) {
    text = (text || '').trim();
    let m = text.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    m = text.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    if (m) return m[1];
    if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) return text;   // user pasted only the ID
    return null;
  }

  // Thumbnail address at a chosen width (in pixels)
  function thumb(f, w) {
    if (f.thumbnailLink) return f.thumbnailLink.replace(/=s\d+$/, '=w' + w);
    return fallbackThumb(f, w);
  }
  function fallbackThumb(f, w) {
    return 'https://drive.google.com/thumbnail?id=' + f.id + '&sz=w' + w;
  }

  // Width / height of a photo, so the grid can leave the right amount of space
  function ratioOf(f) {
    const meta = f.imageMediaMetadata || f.videoMediaMetadata;
    if (meta && meta.width && meta.height) {
      let w = meta.width, h = meta.height;
      const rot = f.imageMediaMetadata && f.imageMediaMetadata.rotation;
      if (rot === 1 || rot === 3 || rot === 90 || rot === 270) { const x = w; w = h; h = x; }
      return w / h;
    }
    return 1.5; // unknown size: assume a normal 3:2 photo
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  // Show the top-bar buttons (favorites, download, send) only when a gallery is on screen
  function setActions(show) {
    $('actions').hidden = !show;
    $('topbar').classList.toggle('has-actions', show);
  }

  // A full-page message (errors). We keep the message KEY so it can switch language.
  function showMessage(prefix) {
    msgPrefix = prefix;
    $('setup').hidden = true;
    $('gallery').hidden = true;
    setActions(false);
    renderMessage();
  }
  function renderMessage() {
    if (!msgPrefix) return;
    const box = $('message');
    box.innerHTML = '';
    const h = document.createElement('h2'); h.textContent = t(msgPrefix + '.h');
    const p = document.createElement('p');  p.textContent = t(msgPrefix + '.t');
    box.append(h, p);
    box.hidden = false;
  }

  // ============================================================
  //  TALK TO YOUR CLOUDFLARE WORKER
  // ============================================================
  async function callWorker(url, opts) {
    const res = await fetch(url, opts);            // throws if the address is wrong or offline
    let body = {};
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) {
      const e = new Error('Worker error');
      e.status = (body.error && body.error.status) || res.status;
      e.reason = body.error && body.error.reason;
      throw e;
    }
    return body;
  }
  const notWorker = () => { const e = new Error('Not the gallery Worker'); e.reason = 'notWorker'; return e; };

  async function fetchGallery(id) {
    const body = await callWorker(base() + '/?id=' + encodeURIComponent(id));
    // The address answered, but not like our Worker: it isn't the gallery Worker.
    if (!Array.isArray(body.files) || !body.settings) throw notWorker();
    return body;
  }
  async function fetchLegacy(folder) {
    const body = await callWorker(base() + '/?folder=' + encodeURIComponent(folder));
    if (!Array.isArray(body.files)) throw notWorker();
    return body;
  }

  // Which message to show for an error
  function errPrefix(e) {
    if (e.reason === 'galleryNotFound') return 'err.gnf';
    if (e.reason === 'legacyOff') return 'err.legacy';
    if (e.status === 404) return 'err.notfound';
    if (e.reason === 'notWorker') return 'err.notworker';
    if (e.reason === 'originNotAllowed') return 'err.origin';
    if (e.reason === 'badFolderId') return 'err.badfolder';
    if (e.status === 403 && (e.reason === 'accessNotConfigured' || e.reason === 'SERVICE_DISABLED')) return 'err.apioff';
    if (e.status === 403 && (e.reason === 'forbidden' || e.reason === 'insufficientFilePermissions')) return 'err.private';
    if (e.status === 400 || e.status === 403 || e.status === 500) return 'err.server';
    return 'err.net';
  }

  // ============================================================
  //  GALLERY
  // ============================================================
  // Turn the stored settings into what the page needs.
  // `s` comes from the Worker (new links) or is built from the address (old links).
  function viewFrom(s, c) {
    return {
      code: c || null,
      folderId: s.f || null,
      title: s.t || '',
      by: s.by || '',
      P: {
        layout:    LAYOUTS.includes(s.l) ? s.l : D.layout,
        cols:      clamp(s.c, D.cols, 1, 8),             // photos per row on a computer
        colsPhone: clamp(s.m, D.colsPhone, 1, 4),        // photos per row on a phone
        gap:       clamp(s.g, D.gap, 0, 24),             // space between photos (px)
        dim:       clamp(s.dim, D.dim, 0, 90),           // how dark the background is (%)
        blur:      clamp(s.bl, D.blur, 0, 20),           // how blurry the background is (px)
        bg:        s.bg === 'none' || /^[A-Za-z0-9_-]{10,100}$/.test(s.bg || '') ? s.bg : 'auto',
        showTitle: s.st !== false,
        showBy:    s.sa !== false,
        allowDl:   s.dl !== false,
      },
    };
  }

  function legacySettings() {
    return {
      f: legacyFolder, t: params.get('t') || '', by: params.get('by') || cfg.DEFAULT_STUDIO_NAME || '',
      st: params.get('st') !== '0', sa: params.get('sa') !== '0', dl: params.get('dl') !== '0',
      l: params.get('l'), c: params.get('c'), m: params.get('m'), g: params.get('g'),
      dim: params.get('dim'), bl: params.get('bl'), bg: params.get('bg'),
    };
  }

  async function initGallery() {
    $('brand').textContent = cfg.DEFAULT_STUDIO_NAME || t('gallery');
    if (isPreview) { initPreview(); return; }

    if (!hasWorker()) { showMessage('err.setup'); return; }

    $('gallery').hidden = false;
    statusState = 'loading'; renderStatus();

    let data, view;
    try {
      if (code) {
        data = await fetchGallery(code);
        view = viewFrom(data.settings, code);
      } else if (legacyFolder) {
        data = await fetchLegacy(legacyFolder);
        view = viewFrom(legacySettings(), null);
      } else {
        const e = new Error('No gallery'); e.reason = 'galleryNotFound'; e.status = 404; throw e;
      }
    } catch (e) {
      showMessage(errPrefix(e));
      return;
    }

    L.hintCountry(data.country);                   // Thai visitors get Thai
    if (!data.files.length) { showMessage('err.empty'); return; }
    statusState = '';
    applyView(view, data.files);
  }

  // The live preview inside the gallery maker: the maker sends us the photos and settings.
  function initPreview() {
    document.body.classList.add('preview-mode');
    $('gallery').hidden = false;
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'gallery-preview' || !e.data.settings) return;
      previewDevice = e.data.device || null;
      statusState = '';
      applyView(viewFrom(e.data.settings, null), e.data.files);   // files are only sent when they change
    });
    parent.postMessage({ type: 'preview-ready' }, location.origin);
  }

  // Put a gallery on screen (or update it after a settings change)
  function applyView(v, files) {
    const prev = G;
    G = v;
    if (files) { items = files; items.forEach((f) => { f.ratio = ratioOf(f); }); }
    if (!items.length) return;

    const key = 'favs:' + (G.code || G.folderId || 'x');
    if (key !== favKey) {
      favKey = key;
      try { favs = new Set(JSON.parse(localStorage.getItem(favKey) || '[]')); } catch (_) { favs = new Set(); }
    }

    $('message').hidden = true; msgPrefix = null;
    $('gallery').hidden = false;
    renderHeader();
    renderStatus();
    setupBackground();
    $('btnDownloadAll').hidden = !(G.P.allowDl && cfg.SHOW_DOWNLOAD_ALL !== false && G.folderId);
    setActions(true);
    updateFavCount();
    if (files || !prev || prev.P.layout !== G.P.layout) renderGrid(); else applyLayout();
    renderContactFooter();
  }

  // Title, studio name and photo count
  function renderHeader() {
    const P = G.P;
    const title = G.title || t('gallery');
    const showBy = P.showBy && !!G.by;
    $('title').textContent = title;
    $('title').hidden = !P.showTitle;
    $('by').textContent = G.by ? t('by', { name: G.by }) : '';
    $('by').hidden = !showBy;
    $('hero').classList.toggle('compact', !P.showTitle && !showBy);
    $('brand').textContent = G.by || cfg.DEFAULT_STUDIO_NAME || t('gallery');
    if (!isPreview) document.title = title + (G.by ? ' – ' + G.by : '');

    const photos = items.filter((f) => !isVideo(f)).length;
    const videos = items.length - photos;
    $('count').textContent = photosText(photos) + (videos ? ' · ' + videosText(videos) : '');
  }

  function renderStatus() {
    if (statusState === 'loading') $('status').textContent = t('loading');
    else if (statusState === 'nofavs') $('status').textContent = t('noFavs');
    else $('status').textContent = '';
  }

  // The whole-page background picture, with its darkness and blur
  let bgToken = 0;
  function setupBackground() {
    const P = G.P, layer = $('bgLayer');
    layer.style.setProperty('--dim', String(P.dim / 100));
    layer.style.setProperty('--blur', P.blur + 'px');
    if (P.bg === 'none') { layer.hidden = true; return; }

    const photos = items.filter((f) => !isVideo(f));
    const pick = (P.bg !== 'auto' && photos.find((f) => f.id === P.bg)) || photos[0];   // chosen photo, or the first one
    if (!pick) { layer.hidden = true; return; }

    const src = thumb(pick, 1600);
    if (layer.dataset.src === src) { layer.hidden = false; return; }

    // Load the picture first, then show it (so it doesn't flash)
    const token = ++bgToken;
    const probe = new Image();
    probe.onload = () => {
      if (token !== bgToken) return;
      $('bgImg').style.backgroundImage = 'url("' + probe.src + '")';
      layer.dataset.src = src;
      layer.hidden = false;
    };
    probe.onerror = () => {
      if (!probe.dataset.retry) { probe.dataset.retry = '1'; probe.src = fallbackThumb(pick, 1600); }
    };
    probe.src = src;
  }

  // Tell the grid how many photos per row, and how big the gaps are
  function applyLayout() {
    const grid = $('grid');
    if (!grid || !G || !visible.length) return;
    const P = G.P;
    const desktop = previewDevice ? previewDevice === 'desktop' : window.innerWidth > 800;
    const cols = desktop ? P.cols : P.colsPhone;
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--gap', P.gap + 'px');

    if (P.layout === 'grid') {
      // Pick a row height so that about `cols` photos fit in each row
      const inner = grid.clientWidth - 2 * P.gap;
      if (inner > 0) {
        const avg = visible.reduce((s, f) => s + Math.min(2.5, Math.max(0.5, f.ratio)), 0) / visible.length;
        const rowH = (inner - P.gap * (cols - 1)) / (cols * avg);
        grid.style.setProperty('--row-h', Math.round(Math.min(700, Math.max(80, rowH))) + 'px');
      }
    }
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyLayout, 150);
  });

  function renderGrid() {
    visible = showFavsOnly ? items.filter((f) => favs.has(f.id)) : items;
    const grid = $('grid');
    grid.innerHTML = '';
    grid.className = 'grid layout-' + G.P.layout;
    const thumbW = G.P.layout === 'oneup' ? 1400 : 700;     // big single photos need a sharper thumbnail

    statusState = !visible.length && showFavsOnly ? 'nofavs' : '';
    renderStatus();

    const frag = document.createDocumentFragment();
    visible.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'tile';
      li.style.setProperty('--r', f.ratio.toFixed(4));

      const open = document.createElement('button');
      open.className = 'open'; open.type = 'button';
      open.setAttribute('aria-label', f.name);
      open.addEventListener('click', () => openLightbox(i));

      const img = document.createElement('img');
      img.alt = f.name; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('load', () => img.classList.add('loaded'));
      img.addEventListener('error', () => {
        if (!img.dataset.retry) { img.dataset.retry = '1'; img.src = fallbackThumb(f, thumbW); }
      });
      img.src = thumb(f, thumbW);
      open.appendChild(img);
      li.appendChild(open);

      if (isVideo(f)) {
        const b = document.createElement('div');
        b.className = 'badge';
        b.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M7 4l13 8-13 8z"/></svg>';
        li.appendChild(b);
      }

      const nm = document.createElement('div');
      nm.className = 'name'; nm.textContent = f.name;
      li.appendChild(nm);

      const fav = document.createElement('button');
      fav.className = 'fav' + (favs.has(f.id) ? ' on' : '');
      fav.type = 'button';
      fav.setAttribute('aria-label', t('lb.fav'));
      fav.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" class="heart-icon"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 5 6 5c2 0 3.4 1.1 4 2.2h4C14.6 6.1 16 5 18 5c3.4 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z"/></svg>';
      fav.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFav(f.id);
        if (showFavsOnly) renderGrid(); else fav.classList.toggle('on', favs.has(f.id));
      });
      li.appendChild(fav);

      frag.appendChild(li);
    });
    grid.appendChild(frag);
    applyLayout();
  }

  // ============================================================
  //  FAVORITES
  // ============================================================
  function toggleFav(id) {
    if (favs.has(id)) favs.delete(id); else favs.add(id);
    try { localStorage.setItem(favKey, JSON.stringify([...favs])); } catch (_) {}
    updateFavCount();
  }
  function updateFavCount() { $('favCount').textContent = favs.size; }

  $('btnFavFilter').addEventListener('click', () => {
    showFavsOnly = !showFavsOnly;
    $('btnFavFilter').classList.toggle('active', showFavsOnly);
    renderGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ---------- Contact links (Instagram, LINE, email) ----------
  // Turns what you typed in config.js into real links.
  function contactLinks() {
    const out = [];
    const isUrl = (s) => /^https?:\/\//i.test(s);

    const ig = (cfg.CONTACT_INSTAGRAM || '').trim();
    if (ig) {
      out.push({
        key: 'instagram', label: 'Instagram',
        href: isUrl(ig) ? ig : 'https://instagram.com/' + encodeURIComponent(ig.replace(/^@/, ''))
      });
    }

    const line = (cfg.CONTACT_LINE || '').trim();
    if (line) {
      let href;
      if (isUrl(line)) href = line;                                              // full link
      else if (line.startsWith('@')) href = 'https://line.me/R/ti/p/' + encodeURIComponent(line);  // Official Account
      else href = 'https://line.me/ti/p/~' + encodeURIComponent(line);          // personal LINE ID
      out.push({ key: 'line', label: 'LINE', href });
    }

    const mail = (cfg.CONTACT_EMAIL || '').trim();
    if (mail) out.push({ key: 'email', label: t('contact.email'), href: 'mailto:' + mail });

    return out;
  }

  // Buttons at the bottom of the gallery
  function renderContactFooter() {
    const links = contactLinks();
    if (!links.length || !G) return;
    $('contactText').textContent = G.by ? t('contact.by', { name: G.by }) : t('contact.generic');
    const box = $('contactLinks');
    box.innerHTML = '';
    links.forEach((c) => {
      const a = document.createElement('a');
      a.className = 'btn';
      a.textContent = c.label;
      a.href = c.href;
      if (c.key !== 'email') { a.target = '_blank'; a.rel = 'noopener'; }
      box.appendChild(a);
    });
    $('contact').hidden = false;
  }

  // Buttons inside the "Send my picks" popup
  function renderSendContacts(names) {
    const box = $('sendContacts');
    box.innerHTML = '';
    const links = contactLinks();
    $('sendContactHint').hidden = !(links.length && names.length);
    if (!names.length) return;

    const title = (G && G.title) || t('gallery');
    links.forEach((c) => {
      const a = document.createElement('a');
      a.className = 'btn';
      a.textContent = c.key === 'email' ? t('send.email') : t('send.open', { name: c.label });
      if (c.key === 'email') {
        a.href = c.href
          + '?subject=' + encodeURIComponent(t('send.mail.subject', { title }))
          + '&body=' + encodeURIComponent(t('send.mail.body') + '\n\n' + names.join('\n'));
      } else {
        a.href = c.href; a.target = '_blank'; a.rel = 'noopener';
        a.addEventListener('click', () => copyText(names.join('\n')));  // copy the list, then they paste it in the chat
      }
      box.appendChild(a);
    });
  }

  // ============================================================
  //  DOWNLOAD AS ZIP  ("Download all" and "Download my favorites")
  //
  //  How it works, in simple words:
  //   - For each photo we ask your Worker for the original file (one request per photo).
  //   - We pack the photos into a .zip right here on the customer's phone/computer (zip.js).
  //   - Big galleries are cut into several smaller zips ("parts") so a phone doesn't run out of memory.
  //   - The customer never has to touch Google Drive.
  // ============================================================
  const PART_BYTES = clamp(cfg.DOWNLOAD_PART_MB, 150, 20, 1000) * 1024 * 1024;  // size of one zip (config.js: DOWNLOAD_PART_MB)
  const MAX_FILE_BYTES = 1024 * 1024 * 1024;     // a single file over 1 GB is left out of the zip
  const PARALLEL = 4;                            // photos fetched at the same time
  const TRIES = 3;                               // attempts for each photo

  let dlMode = 'old';        // 'new' = zip in the browser, 'old' = open Google Drive
  let dlScope = 'all';       // 'all' | 'favs'
  let dlVideos = true;       // include videos?
  let dlParts = [];          // the planned zip files
  let dlSkipped = [];        // files too big for a zip
  let dlBusy = false;        // is a part being made right now?
  let dlCtrl = null;         // lets the Cancel button stop the downloads
  let dlCache = new Map();   // photos already fetched (so "Try again" only fetches what failed)

  const fileBytes = (f) => Number(f.size) || 0;
  function fmtSize(n) {
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
    return (n / 1073741824).toFixed(1) + ' GB';
  }
  function namesText(names) {
    const shown = names.slice(0, 5).join(', ');
    return names.length > 5 ? shown + ' +' + (names.length - 5) : shown;
  }
  // "12 photos, 2 videos"
  function whatText(files) {
    const v = files.filter(isVideo).length;
    const p = files.length - v;
    return [p ? photosText(p) : '', v ? videosText(v) : ''].filter(Boolean).join(', ');
  }

  // Can this gallery make zips? (not in old links or in the maker's preview)
  const zipAllowed = () => !!(G && G.code && G.folderId && G.P.allowDl);

  // Decide which photos go into which zip
  function planParts() {
    const pool = items.filter((f) => (dlScope === 'favs' ? favs.has(f.id) : true) && (dlVideos || !isVideo(f)));
    dlSkipped = pool.filter((f) => fileBytes(f) > MAX_FILE_BYTES);
    const files = pool.filter((f) => fileBytes(f) <= MAX_FILE_BYTES);
    dlParts = [];
    let cur = null;
    files.forEach((f) => {
      if (!cur || (cur.files.length && cur.bytes + fileBytes(f) > PART_BYTES)) {
        cur = { files: [], bytes: 0, state: 'idle', done: 0, doneBytes: 0, failed: [] };
        dlParts.push(cur);
      }
      cur.files.push(f);
      cur.bytes += fileBytes(f);
    });
  }

  function openDownload(scope) {
    if (!G) return;
    if (zipAllowed()) {
      dlMode = 'new';
      dlScope = scope === 'favs' ? 'favs' : 'all';
      dlVideos = true;
      $('dlVideos').checked = true;
      dlCache = new Map();
      $('btnOpenDrive').href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(G.folderId);
      planParts();
    } else {
      dlMode = 'old';
      $('btnOpenDrive2').href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(G.folderId || '');
    }
    renderDl();
    $('dlModal').hidden = false;
  }
  function closeDownload() {
    if (dlCtrl) dlCtrl.abort();                 // closing the window stops the downloading
    dlCache = new Map();
    $('dlModal').hidden = true;
  }

  // Draw the popup from the current plan
  function renderDl() {
    $('dlNew').hidden = dlMode !== 'new';
    $('dlOld').hidden = dlMode !== 'old';
    if (dlMode !== 'new') return;

    const favCount = items.filter((f) => favs.has(f.id)).length;
    $('dlScopeFavs').textContent = t('dl.scopeFavs') + ' (' + favCount + ')';
    document.querySelectorAll('#dlScope button').forEach((b) => {
      const on = b.dataset.scope === dlScope;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = dlBusy;
    });
    const scopeItems = items.filter((f) => dlScope === 'favs' ? favs.has(f.id) : true);
    $('dlVideosWrap').hidden = !scopeItems.some(isVideo);
    $('dlVideos').disabled = dlBusy;

    const all = dlParts.reduce((a, p) => a.concat(p.files), []);
    const total = dlParts.reduce((n, p) => n + p.bytes, 0);
    if (dlScope === 'favs' && !favCount) $('dlSummary').textContent = t('dl.noFavs');
    else $('dlSummary').textContent = all.length ? t('dl.summary', { what: whatText(all), size: fmtSize(total) }) : '';
    $('dlPartsNote').hidden = dlParts.length < 2;

    const list = $('dlParts');
    list.innerHTML = '';
    dlParts.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'dl-part';
      const top = document.createElement('div'); top.className = 'dl-part-top';
      const info = document.createElement('div');
      if (dlParts.length > 1) {
        const nm = document.createElement('div'); nm.className = 'dl-part-name';
        nm.textContent = t('dl.part', { i: i + 1, n: dlParts.length });
        const inf = document.createElement('div'); inf.className = 'dl-part-info';
        inf.textContent = t('dl.partInfo', { what: whatText(p.files), size: fmtSize(p.bytes) });
        info.append(nm, inf);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.addEventListener('click', () => (p.state === 'busy' || p.state === 'packing' ? dlCtrl && dlCtrl.abort() : startPart(p)));
      const btns = document.createElement('div'); btns.className = 'dl-part-btns'; btns.append(btn);
      top.append(info, btns);
      const bar = document.createElement('div'); bar.className = 'dl-bar'; bar.append(document.createElement('i'));
      const st = document.createElement('div'); st.className = 'dl-state'; st.setAttribute('role', 'status');
      li.append(top, bar, st);
      list.appendChild(li);
      p.el = { li, btn, bar, st };
      updatePart(p);
    });

    const left = dlParts.filter((p) => p.state !== 'done').length;
    $('dlAllRow').hidden = dlParts.length < 2;
    $('btnDlAllParts').textContent = t('dl.goAll', { n: left || dlParts.length });
    $('btnDlAllParts').disabled = dlBusy || !left;
    updateWarn();
  }

  // Refresh one part's button, progress bar and text (cheap, called often)
  function updatePart(p) {
    if (!p.el) return;
    const busy = p.state === 'busy' || p.state === 'packing';
    const single = dlParts.length === 1;
    const label = busy ? 'dl.cancel'
      : p.state === 'partial' || p.state === 'failed' ? 'dl.again'
      : single ? 'dl.go' : 'dl.goPart';
    p.el.btn.textContent = t(label);
    p.el.btn.className = 'btn small' + (!busy && p.state !== 'done' && p.state !== 'partial' && p.state !== 'failed' ? ' primary' : '');
    p.el.btn.disabled = dlBusy && !busy;
    const pct = p.state === 'done' || p.state === 'partial' || p.state === 'packing' ? 100
      : p.bytes ? Math.min(100, Math.round((p.doneBytes / p.bytes) * 100))
      : Math.round((p.done / Math.max(1, p.files.length)) * 100);
    p.el.bar.firstChild.style.width = pct + '%';
    p.el.bar.hidden = p.state === 'idle' || p.state === 'cancelled';
    let msg = '';
    if (p.state === 'busy') msg = t('dl.busy', { done: p.done, total: p.files.length });
    else if (p.state === 'packing') msg = t('dl.packing');
    else if (p.state === 'done' || p.state === 'partial') msg = t('dl.done');
    else if (p.state === 'cancelled') msg = t('dl.cancelled');
    else if (p.state === 'failed') msg = t('dl.error');
    p.el.st.textContent = msg;
    p.el.st.classList.toggle('ok', p.state === 'done');
    p.el.st.hidden = !msg;
  }

  // Messages about photos that could not be added
  function updateWarn() {
    const lines = [];
    const failed = dlParts.reduce((a, p) => a.concat(p.state === 'partial' ? p.failed : []), []);
    if (failed.length) lines.push(t('dl.failed', { n: failed.length, names: namesText(failed) }));
    if (dlSkipped.length) lines.push(t('dl.skipped', { n: dlSkipped.length, names: namesText(dlSkipped.map((f) => f.name)) }));
    $('dlWarn').textContent = lines.join('\n');
    $('dlWarn').hidden = !lines.length;
  }

  const wait = (ms, signal) => new Promise((resolve) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(id); resolve(); }, { once: true });
  });

  // Get ONE original photo from the Worker, check it arrived whole, and fingerprint it
  async function fetchFile(f, signal) {
    let lastErr;
    for (let attempt = 0; attempt < TRIES; attempt++) {
      if (signal.aborted) throw new Error('cancelled');
      try {
        const res = await fetch(base() + '/file/' + encodeURIComponent(G.code) + '/' + encodeURIComponent(f.id), { signal });
        if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
        const blob = await res.blob();
        const want = fileBytes(f);
        if (want && blob.size !== want) throw new Error('incomplete');      // cut off half-way: try again
        return { blob, crc: await window.ZipMaker.crc32Blob(blob) };
      } catch (e) {
        lastErr = e;
        if (signal.aborted || e.status === 404 || e.status === 403 && attempt > 0) break;
        await wait(700 * (attempt + 1), signal);
      }
    }
    throw lastErr;
  }

  function saveFile(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5 * 60 * 1000);
  }

  function zipName(i) {
    // Plain English letters only in the zip's own name: some browsers turn Thai/accented names into "download" with no .zip
    const title = ((G && G.title) || '').replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'gallery';
    return title + '-' + (dlScope === 'favs' ? 'favorites' : 'photos') + (dlParts.length > 1 ? '-part-' + (i + 1) + '-of-' + dlParts.length : '') + '.zip';
  }

  // Make ONE zip: fetch its photos (a few at a time), pack them, save the file
  async function makePart(p, i, signal) {
    const Z = window.ZipMaker;
    p.state = 'busy'; p.done = 0; p.doneBytes = 0; p.failed = [];
    updatePart(p);

    const got = new Array(p.files.length);
    let next = 0;
    const runner = async () => {
      while (!signal.aborted) {
        const k = next++;
        if (k >= p.files.length) return;
        const f = p.files[k];
        try {
          got[k] = dlCache.get(f.id) || (await fetchFile(f, signal));
          dlCache.set(f.id, got[k]);
        } catch (e) {
          if (signal.aborted) return;
          p.failed.push(f.name);
        }
        p.done++; p.doneBytes += fileBytes(f);
        updatePart(p);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, p.files.length) }, runner));

    if (signal.aborted) { p.state = 'cancelled'; return; }
    if (!got.some(Boolean)) { p.state = 'failed'; return; }

    p.state = 'packing'; updatePart(p);
    await new Promise((r) => setTimeout(r, 30));                  // let the screen update first
    const taken = new Set();
    const entries = [];
    p.files.forEach((f, k) => {
      if (got[k]) entries.push({ name: Z.uniqueName(Z.safeName(f.name, f.id), taken), blob: got[k].blob, crc: got[k].crc });
    });
    saveFile(Z.build(entries), zipName(i));
    p.state = p.failed.length ? 'partial' : 'done';
    if (!p.failed.length) p.files.forEach((f) => dlCache.delete(f.id));   // free the memory
  }

  // Run one or several parts, one after another
  async function runParts(list) {
    if (dlBusy) return;
    dlBusy = true;
    dlCtrl = new AbortController();
    const signal = dlCtrl.signal;
    renderDl();
    try {
      for (const p of list) {
        if (signal.aborted) break;
        await makePart(p, dlParts.indexOf(p), signal);
        updatePart(p);
      }
    } catch (e) {
      list.forEach((p) => { if (p.state === 'busy' || p.state === 'packing') p.state = 'failed'; });
    }
    dlBusy = false;
    dlCtrl = null;
    if (!$('dlModal').hidden) renderDl();
  }
  const startPart = (p) => runParts([p]);

  $('btnDownloadAll').addEventListener('click', () => openDownload('all'));
  $('btnSendZip').addEventListener('click', () => { $('sendModal').hidden = true; openDownload('favs'); });
  $('btnDlAllParts').addEventListener('click', () => runParts(dlParts.filter((p) => p.state !== 'done')));
  $('dlScope').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || dlBusy) return;
    dlScope = b.dataset.scope === 'favs' ? 'favs' : 'all';
    planParts(); renderDl();
  });
  $('dlVideos').addEventListener('change', (e) => {
    if (dlBusy) return;
    dlVideos = e.target.checked;
    planParts(); renderDl();
  });
  $('btnCloseDl').addEventListener('click', closeDownload);
  $('dlModal').addEventListener('click', (e) => { if (e.target.id === 'dlModal') closeDownload(); });

  // ---------- "Send my picks" popup ----------
  const pickedNames = () => items.filter((f) => favs.has(f.id)).map((f) => f.name);
  function fillSendModal() {
    const names = pickedNames();
    $('sendInfo').textContent = names.length ? t('send.some', { n: names.length }) : t('send.none');
    $('sendText').value = names.join('\n');
    renderSendContacts(names);
    $('btnSendZip').hidden = !(zipAllowed() && names.length);
  }
  $('btnSend').addEventListener('click', () => {
    fillSendModal();
    $('sendModal').hidden = false;
  });
  $('btnCloseSend').addEventListener('click', () => ($('sendModal').hidden = true));
  $('sendModal').addEventListener('click', (e) => { if (e.target.id === 'sendModal') $('sendModal').hidden = true; });
  $('btnCopyList').addEventListener('click', async (e) => {
    const b = e.currentTarget;
    const ok = await copyText($('sendText').value);
    b.textContent = t(ok ? 'send.copied' : 'send.ctrlc');
    setTimeout(() => (b.textContent = t('send.copy')), 2000);
  });
  $('btnDownloadList').addEventListener('click', () => {
    const blob = new Blob([$('sendText').value], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-picks.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ============================================================
  //  LIGHTBOX (the big viewer)
  // ============================================================
  const lb = $('lightbox');
  const stage = $('lbStage');

  function openLightbox(i) {
    if (!lbOpen) {
      lbOpen = true;
      history.pushState({ lb: 1 }, '');          // so the phone's Back button closes the viewer
      document.body.classList.add('noscroll');
      lb.hidden = false;
    }
    showAt(i);
  }

  function closeLightbox(fromPopState) {
    if (!lbOpen) return;
    lbOpen = false;
    lb.hidden = true;
    stage.innerHTML = '';
    document.body.classList.remove('noscroll');
    if (!fromPopState && history.state && history.state.lb) history.back();
    if (showFavsOnly) renderGrid(); else syncTileHearts();
  }

  function syncTileHearts() {
    document.querySelectorAll('.tile').forEach((li, i) => {
      const f = visible[i];
      const btn = li.querySelector('.fav');
      if (f && btn) btn.classList.toggle('on', favs.has(f.id));
    });
  }

  function showAt(i) {
    if (i < 0 || i >= visible.length) return;
    current = i;
    const f = visible[i];
    stage.innerHTML = '';

    if (isVideo(f)) {
      const frame = document.createElement('iframe');
      frame.src = 'https://drive.google.com/file/d/' + f.id + '/preview';
      frame.allow = 'autoplay; fullscreen';
      frame.allowFullscreen = true;
      stage.appendChild(frame);
    } else {
      const spin = document.createElement('div'); spin.className = 'spinner';
      const img = document.createElement('img');
      img.alt = f.name; img.draggable = false;
      img.style.opacity = '0';
      img.addEventListener('load', () => { img.style.opacity = '1'; spin.remove(); });
      img.addEventListener('error', () => {
        if (!img.dataset.retry) { img.dataset.retry = '1'; img.src = fallbackThumb(f, 2000); }
        else spin.remove();
      });
      img.src = thumb(f, 2000);
      stage.append(spin, img);
    }

    renderLbCounter();
    $('lbDownload').href = 'https://drive.google.com/uc?export=download&id=' + f.id;
    $('lbDownload').hidden = !G.P.allowDl;
    $('lbFav').classList.toggle('on', favs.has(f.id));
    $('lbPrev').hidden = i === 0;
    $('lbNext').hidden = i === visible.length - 1;

    // Load the next and previous photo quietly so flipping feels instant
    [i - 1, i + 1].forEach((n) => {
      const g = visible[n];
      if (g && !isVideo(g)) new Image().src = thumb(g, 2000);
    });
  }
  function renderLbCounter() {
    if (current >= 0) $('lbCounter').textContent = t('lb.counter', { i: current + 1, n: visible.length });
  }

  $('lbClose').addEventListener('click', () => closeLightbox(false));
  $('lbPrev').addEventListener('click', () => showAt(current - 1));
  $('lbNext').addEventListener('click', () => showAt(current + 1));
  $('lbFav').addEventListener('click', () => {
    const f = visible[current];
    if (!f) return;
    toggleFav(f.id);
    $('lbFav').classList.toggle('on', favs.has(f.id));
  });
  window.addEventListener('popstate', () => closeLightbox(true));

  // Keyboard: ← → to flip, Esc to close
  document.addEventListener('keydown', (e) => {
    if (!lbOpen) return;
    if (e.key === 'Escape') closeLightbox(false);
    else if (e.key === 'ArrowLeft') showAt(current - 1);
    else if (e.key === 'ArrowRight') showAt(current + 1);
  });

  // Phone: swipe left/right to flip
  let touchX = null;
  stage.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) showAt(current + (dx < 0 ? 1 : -1));
  });

  // When the language changes, redraw the texts the code made itself
  function galleryRefresh() {
    renderMessage();
    if (!G) return;
    renderHeader();
    renderStatus();
    renderContactFooter();
    renderLbCounter();
    if (!$('sendModal').hidden) fillSendModal();
    if (!$('dlModal').hidden) renderDl();
  }

  // ============================================================
  //  GALLERY MAKER (admin) - needs your PIN
  // ============================================================
  function initAdmin() {
    $('setup').hidden = false;
    $('brand').textContent = cfg.DEFAULT_STUDIO_NAME || t('gallery');
    document.title = t('mk.title');
    $('keyWarning').hidden = hasWorker();

    // S = everything the admin has chosen so far
    const S = {
      pin: null, folderId: null, files: [], photos: [], code: null, saved: '',
      title: '', by: '', showTitle: true, showBy: true,
      layout: D.layout, cols: D.cols, colsPhone: D.colsPhone, gap: D.gap,
      bg: 'auto', dim: D.dim, blur: D.blur, allowDl: true, desc: '',
    };
    let saving = false;
    let frameReady = false;
    let previewTimer = null;
    let mineItems = [];
    let info = null;                                   // function that gives the "found N photos" text
    const errs = { pin: null, form: null, save: null, mine: null };   // functions that give the error text

    // ---------- error texts (kept as functions so they follow the language) ----------
    function errText(e) {
      if (e.reason === 'badPin') return () => t('pin.bad');
      if (e.reason === 'tooManyAttempts') return () => t('pin.locked');
      if (e.reason === 'pinNotSet') return () => t('pin.notset');
      if (e.reason === 'kvMissing') return () => t('err.kv');
      const p = errPrefix(e);
      return () => t(p + '.h') + '. ' + t(p + '.t');
    }
    function renderErrs() {
      [['pin', 'pinError'], ['form', 'setupError'], ['save', 'saveMsg'], ['mine', 'mineError']].forEach(([k, id]) => {
        const el = $(id), f = errs[k];
        el.hidden = !f;
        if (f) el.textContent = f();
      });
    }
    function renderInfo() {
      $('loadInfo').hidden = !info;
      if (info) $('loadInfo').textContent = info();
    }

    // ---------- talk to the Worker's admin door ----------
    async function admin(action, data) {
      try {
        return await callWorker(base() + '/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ pin: S.pin, action }, data)),
        });
      } catch (e) {
        if (e.reason === 'badPin' && S.pin && action !== 'login') { logout(); errs.pin = errText(e); renderErrs(); }   // PIN was changed
        throw e;
      }
    }

    // ---------- sign in / out ----------
    function showPin() {
      $('pinBox').hidden = false; $('makerBox').hidden = true;
      $('inPin').value = '';
      renderErrs();
    }
    function showMaker() {
      $('pinBox').hidden = true; $('makerBox').hidden = false;
      errs.pin = null; renderErrs();
      update();
    }
    async function login(pin, quiet) {
      if (!hasWorker() || !pin) return false;
      S.pin = pin;
      $('btnLogin').disabled = true;
      try {
        await admin('login');
      } catch (e) {
        S.pin = null;
        if (!quiet) { errs.pin = errText(e); renderErrs(); }
        return false;
      } finally {
        $('btnLogin').disabled = false;
      }
      try { sessionStorage.setItem('pin', pin); } catch (_) {}   // remembered only until this tab is closed
      showMaker();
      return true;
    }
    function logout() {
      S.pin = null;
      try { sessionStorage.removeItem('pin'); } catch (_) {}
      resetForm();
      hideMine();
      showPin();
    }
    $('btnLogin').addEventListener('click', () => login($('inPin').value.trim(), false));
    $('inPin').addEventListener('keydown', (e) => { if (e.key === 'Enter') login($('inPin').value.trim(), false); });
    $('btnLogout').addEventListener('click', logout);

    // ---------- what the gallery will look like (the settings that get saved) ----------
    function settingsFromS() {
      return {
        f: S.folderId, t: S.title.trim(), by: S.by.trim(), d: S.desc.trim(),
        st: S.showTitle, sa: S.showBy, dl: S.allowDl,
        l: S.layout, c: S.cols, m: S.colsPhone, g: S.gap,
        bg: S.bg, dim: S.dim, bl: S.blur,
      };
    }

    function syncInputs() {
      $('inTitle').value = S.title; $('inBy').value = S.by; $('inDesc').value = S.desc;
      $('inShowTitle').checked = S.showTitle; $('inShowBy').checked = S.showBy; $('inDl').checked = S.allowDl;
      $('inC').value = S.cols; $('inM').value = S.colsPhone; $('inG').value = S.gap;
      $('inDim').value = S.dim; $('inBl').value = S.blur;
    }

    function resetForm() {
      Object.assign(S, {
        folderId: null, files: [], photos: [], code: null, saved: '',
        title: '', by: cfg.DEFAULT_STUDIO_NAME || '', showTitle: true, showBy: true,
        layout: D.layout, cols: D.cols, colsPhone: D.colsPhone, gap: D.gap,
        bg: 'auto', dim: D.dim, blur: D.blur, allowDl: true, desc: '',
      });
      $('inFolder').value = '';
      $('options').hidden = true; $('previewBox').hidden = true; $('linksBox').hidden = true;
      errs.form = null; errs.save = null; info = null;
      syncInputs(); renderErrs(); renderInfo();
    }

    // ---------- refresh labels, buttons and the preview after any change ----------
    function update() {
      $('vC').textContent = S.cols;
      $('vM').textContent = S.colsPhone;
      $('vG').textContent = S.gap + ' px';
      $('vDim').textContent = S.dim + '%';
      $('vBl').textContent = S.blur + ' px';
      $('inTitle').disabled = !S.showTitle;
      $('inBy').disabled = !S.showBy;
      $('layoutHint').textContent = t('hint.' + S.layout);
      $('bgHint').textContent = t('mk.bgHint', { n: S.photos.length });
      $('rowC').hidden = S.layout === 'oneup';
      $('rowM').hidden = S.layout === 'oneup';
      document.querySelectorAll('#segLayout button').forEach((b) => b.classList.toggle('on', b.dataset.l === S.layout));
      document.querySelectorAll('#bgPicker button').forEach((b) => b.classList.toggle('on', b.dataset.bg === S.bg));

      // The save button: "Save & get link" -> "Save changes" -> "Saved ✓"
      const dirty = !!S.folderId && JSON.stringify(settingsFromS()) !== S.saved;
      const btn = $('btnSave');
      if (saving) { btn.textContent = t('mk.saving'); btn.disabled = true; }
      else if (!S.code) { btn.textContent = t('mk.save'); btn.disabled = !S.folderId; }
      else if (dirty) { btn.textContent = t('mk.saveChanges'); btn.disabled = false; }
      else { btn.textContent = t('mk.saved'); btn.disabled = true; }
      $('unsavedMsg').hidden = !(S.code && dirty && !saving);

      // Send the new look to the preview a moment after the last change
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => sendPreview(false), 120);
    }

    // ---------- live preview (the gallery in a frame) ----------
    function sendPreview(withFiles) {
      const frame = $('previewFrame');
      if (!frameReady || !frame.contentWindow || !S.folderId) return;
      const msg = {
        type: 'gallery-preview', settings: settingsFromS(),
        device: $('frameWrap').classList.contains('phone') ? 'phone' : 'desktop',
      };
      if (withFiles) msg.files = S.files;
      frame.contentWindow.postMessage(msg, location.origin);
    }
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'preview-ready') return;
      frameReady = true;
      sendPreview(true);
    });

    document.querySelectorAll('#segDevice button').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#segDevice button').forEach((x) => x.classList.toggle('on', x === b));
        $('frameWrap').classList.toggle('phone', b.dataset.dev === 'phone');
        sendPreview(false);
      }));

    // ---------- connect each control to S ----------
    const bind = (id, key, kind) => {
      $(id).addEventListener(kind === 'check' ? 'change' : 'input', (e) => {
        S[key] = kind === 'num' ? parseInt(e.target.value, 10)
               : kind === 'check' ? e.target.checked
               : e.target.value;
        update();
      });
    };
    bind('inTitle', 'title');   bind('inBy', 'by');   bind('inDesc', 'desc');
    bind('inShowTitle', 'showTitle', 'check'); bind('inShowBy', 'showBy', 'check'); bind('inDl', 'allowDl', 'check');
    bind('inC', 'cols', 'num'); bind('inM', 'colsPhone', 'num'); bind('inG', 'gap', 'num');
    bind('inDim', 'dim', 'num'); bind('inBl', 'blur', 'num');

    document.querySelectorAll('#segLayout button').forEach((b) =>
      b.addEventListener('click', () => { S.layout = b.dataset.l; update(); }));

    // ---------- background picker: every photo in the folder ----------
    function renderBgPicker() {
      const box = $('bgPicker');
      box.innerHTML = '';
      const add = (value, label, src) => {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.bg = value; b.title = label;
        if (src) {
          const img = document.createElement('img');
          img.src = src; img.alt = label; img.loading = 'lazy'; img.decoding = 'async';
          b.appendChild(img);
        } else {
          b.dataset.i18n = value === 'auto' ? 'bg.auto' : 'bg.none';
          b.textContent = t(b.dataset.i18n);
        }
        b.addEventListener('click', () => { S.bg = value; update(); });
        box.appendChild(b);
      };
      add('auto', '');
      add('none', '');
      S.photos.forEach((f) => add(f.id, f.name, thumb(f, 160)));    // no limit: all photos
    }

    // ---------- load a Drive folder ----------
    async function loadFolder(keep) {
      const id = extractFolderId($('inFolder').value);
      errs.form = null;
      if (!id) { errs.form = () => t('mk.badLink'); renderErrs(); return false; }

      const btn = $('btnLoad');
      btn.disabled = true; btn.textContent = t('mk.loading');
      let files;
      try {
        const r = await admin('folder', { folder: id });
        if (!Array.isArray(r.files)) throw notWorker();
        files = r.files;
      } catch (e) {
        errs.form = errText(e); renderErrs();
        return false;
      } finally {
        btn.disabled = false; btn.textContent = t('mk.load');
      }
      if (!files.length) { errs.form = () => t('mk.empty'); renderErrs(); return false; }

      S.folderId = id; S.files = files; S.photos = files.filter((f) => !isVideo(f));
      if (!keep) { S.bg = 'auto'; S.code = null; S.saved = ''; $('linksBox').hidden = true; errs.save = null; }
      info = () => {
        const v = S.files.length - S.photos.length;
        const p = photosText(S.photos.length);
        return v ? t('mk.found.v', { p, v: videosText(v) }) : t('mk.found', { p });
      };
      renderErrs(); renderInfo();
      renderBgPicker();
      $('options').hidden = false;
      $('previewBox').hidden = false;
      const frame = $('previewFrame');
      if (!frame.getAttribute('src')) frame.src = location.pathname + '?preview=1';   // it says "ready" when loaded
      else sendPreview(true);
      update();
      return true;
    }
    $('btnLoad').addEventListener('click', () => loadFolder(false));
    $('inFolder').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadFolder(false); });
    $('inFolder').addEventListener('paste', () => setTimeout(() => loadFolder(false), 50));

    // ---------- save, and show the links ----------
    function showLinks() {
      const share = base() + '/g/' + S.code;
      $('outLink').value = share;
      $('btnOpenLink').href = share;
      $('outDirect').value = location.origin + location.pathname + '?id=' + S.code;
      $('linksBox').hidden = false;
    }
    async function save() {
      if (!S.folderId || saving) return;
      saving = true; errs.save = null; renderErrs(); update();
      const settings = settingsFromS();
      try {
        const r = await admin('save', { code: S.code || undefined, settings, siteUrl: location.origin + location.pathname });
        S.code = r.code; S.saved = JSON.stringify(settings);
        showLinks();
      } catch (e) {
        const f = errText(e);
        errs.save = () => t('mk.saveFail') + ' ' + f();
      } finally {
        saving = false; renderErrs(); update();
      }
    }
    $('btnSave').addEventListener('click', save);

    const wireCopy = (btnId, inputId, key) => {
      $(btnId).addEventListener('click', async (e) => {
        const b = e.currentTarget;
        const ok = await copyText($(inputId).value);
        b.textContent = t(ok ? 'res.copied' : 'res.ctrlc');
        setTimeout(() => (b.textContent = t(key)), 2000);
      });
    };
    wireCopy('btnCopyLink', 'outLink', 'res.copy');
    wireCopy('btnCopyDirect', 'outDirect', 'res.copy');
    $('outLink').addEventListener('focus', (e) => e.target.select());
    $('outDirect').addEventListener('focus', (e) => e.target.select());

    // ---------- My galleries ----------
    function hideMine() { $('mineBox').hidden = true; $('formBox').hidden = false; errs.mine = null; renderErrs(); }
    async function showMine() {
      $('mineBox').hidden = false; $('formBox').hidden = true;
      errs.mine = null; renderErrs();
      try {
        mineItems = (await admin('list')).items || [];
      } catch (e) {
        errs.mine = errText(e); renderErrs();
        return;
      }
      renderMine();
    }
    function renderMine() {
      const list = $('mineList');
      list.innerHTML = '';
      $('mineEmpty').hidden = mineItems.length > 0;
      const locale = L.get() === 'th' ? 'th-TH' : 'en-GB';
      mineItems.forEach((g) => {
        const li = document.createElement('li');
        const ti = document.createElement('div'); ti.className = 'm-title'; ti.textContent = g.t || t('mine.untitled');
        const su = document.createElement('div'); su.className = 'm-sub';
        su.textContent = [g.by, g.ts ? new Date(g.ts).toLocaleDateString(locale) : ''].filter(Boolean).join(' · ');
        const row = document.createElement('div'); row.className = 'row tight';
        const mk = (key, cls, fn) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'btn small ' + cls; b.textContent = t(key);
          b.addEventListener('click', () => fn(b));
          row.appendChild(b);
        };
        mk('mine.edit', 'primary', () => editGallery(g.code));
        mk('mine.copy', '', async (b) => {
          const ok = await copyText(base() + '/g/' + g.code);
          b.textContent = t(ok ? 'res.copied' : 'res.ctrlc');
          setTimeout(() => (b.textContent = t('mine.copy')), 2000);
        });
        mk('mine.del', 'ghost', () => deleteGallery(g.code));
        li.append(ti, su, row);
        list.appendChild(li);
      });
    }
    async function editGallery(c) {
      errs.mine = null;
      let s;
      try { s = (await admin('get', { code: c })).settings; }
      catch (e) { errs.mine = errText(e); renderErrs(); return; }
      resetForm();
      Object.assign(S, {
        title: s.t || '', by: s.by || '', desc: s.d || '', showTitle: s.st !== false, showBy: s.sa !== false, allowDl: s.dl !== false,
        layout: LAYOUTS.includes(s.l) ? s.l : D.layout, cols: clamp(s.c, D.cols, 1, 8), colsPhone: clamp(s.m, D.colsPhone, 1, 4), gap: clamp(s.g, D.gap, 0, 24),
        bg: s.bg || 'auto', dim: clamp(s.dim, D.dim, 0, 90), blur: clamp(s.bl, D.blur, 0, 20),
      });
      $('inFolder').value = 'https://drive.google.com/drive/folders/' + s.f;
      syncInputs();
      hideMine();
      if (!(await loadFolder(true))) return;
      S.code = c; S.saved = JSON.stringify(settingsFromS());
      showLinks(); update();
    }
    async function deleteGallery(c) {
      if (!window.confirm(t('mine.confirm'))) return;
      try { await admin('delete', { code: c }); }
      catch (e) { errs.mine = errText(e); renderErrs(); return; }
      if (S.code === c) resetForm();
      showMine();
    }
    $('btnMine').addEventListener('click', showMine);
    $('btnNew').addEventListener('click', () => { resetForm(); hideMine(); });

    // When the language changes, redraw the texts the code made itself
    adminRefresh = () => {
      document.title = t('mk.title');
      renderErrs(); renderInfo(); renderMine(); update();
      if (!$('options').hidden) {
        document.querySelectorAll('#bgPicker button[data-i18n]').forEach((b) => { b.textContent = t(b.dataset.i18n); });
      }
    };

    // ---------- start ----------
    resetForm();
    showPin();
    if (hasWorker()) {
      let saved = null;
      try { saved = sessionStorage.getItem('pin'); } catch (_) {}
      if (saved) login(saved, true);                 // still signed in from earlier in this tab
    }
  }

  // ============================================================
  //  START
  // ============================================================
  L.onChange(() => { galleryRefresh(); adminRefresh(); });
  if (code || rawId || legacyFolder || isPreview) initGallery(); else initAdmin();
})();
