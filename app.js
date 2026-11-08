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

  // ---------- "Download all" popup ----------
  $('btnDownloadAll').addEventListener('click', () => {
    if (!G || !G.folderId) return;
    $('btnOpenDrive').href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(G.folderId);
    $('dlModal').hidden = false;
  });
  $('btnCloseDl').addEventListener('click', () => ($('dlModal').hidden = true));
  $('dlModal').addEventListener('click', (e) => { if (e.target.id === 'dlModal') $('dlModal').hidden = true; });

  // ---------- "Send my picks" popup ----------
  const pickedNames = () => items.filter((f) => favs.has(f.id)).map((f) => f.name);
  function fillSendModal() {
    const names = pickedNames();
    $('sendInfo').textContent = names.length ? t('send.some', { n: names.length }) : t('send.none');
    $('sendText').value = names.join('\n');
    renderSendContacts(names);
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
