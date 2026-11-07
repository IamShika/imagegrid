// ============================================================
//  Drive Gallery - the main code.
//  How it works, in simple words:
//   1. The page address looks like  ...?f=FOLDER_ID
//   2. We ask Google Drive: "what pictures/videos are in this folder?"
//   3. We draw them as a grid. Click one to see it big.
// ============================================================
(() => {
  const cfg = window.SITE_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  // ---------- Read the page address ----------
  const params   = new URLSearchParams(location.search);
  const folderId = params.get('f');                       // which Drive folder
  const title    = params.get('t') || 'Gallery';          // gallery title
  const byName   = params.get('by') || cfg.DEFAULT_STUDIO_NAME || '';

  // ---------- Things we keep track of ----------
  let items = [];            // every photo/video in the folder
  let visible = [];          // what the grid is showing right now
  let favs = new Set();      // ids of favorite photos
  let showFavsOnly = false;
  let current = -1;          // which photo is open in the big viewer
  let lbOpen = false;
  const storeKey = 'favs:' + folderId;

  // ============================================================
  //  Small helper functions
  // ============================================================
  const hasWorker = () => cfg.WORKER_URL && !cfg.WORKER_URL.startsWith('PASTE_');
  const isVideo = (f) => f.mimeType.startsWith('video/');

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
      if (rot === 1 || rot === 3 || rot === 90 || rot === 270) { const t = w; w = h; h = t; }
      return w / h;
    }
    return 1.5; // unknown size: assume a normal 3:2 photo
  }

  function showMessage(heading, text) {
    $('setup').hidden = true;
    $('gallery').hidden = true;
    $('actions').hidden = true;
    const box = $('message');
    box.innerHTML = '';
    const h = document.createElement('h2'); h.textContent = heading;
    const p = document.createElement('p');  p.textContent = text;
    box.append(h, p);
    box.hidden = false;
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

  // ============================================================
  //  SETUP SCREEN (when no folder is in the address)
  // ============================================================
  function initSetup() {
    $('brand').textContent = cfg.DEFAULT_STUDIO_NAME || 'Gallery';
    $('setup').hidden = false;
    $('keyWarning').hidden = hasWorker();
    $('inBy').value = cfg.DEFAULT_STUDIO_NAME || '';

    $('btnCreate').addEventListener('click', () => {
      const err = $('setupError');
      const id = extractFolderId($('inFolder').value);
      if (!id) {
        err.textContent = "That doesn't look like a Google Drive folder link. Copy it from Drive → right-click the folder → Share → Copy link.";
        err.hidden = false; $('result').hidden = true; return;
      }
      err.hidden = true;

      const url = new URL(location.href);
      url.search = ''; url.hash = '';
      url.searchParams.set('f', id);
      const t  = $('inTitle').value.trim();
      const by = $('inBy').value.trim();
      if (t)  url.searchParams.set('t', t);
      if (by) url.searchParams.set('by', by);

      $('outLink').value = url.toString();
      $('btnOpenLink').href = url.toString();
      $('result').hidden = false;
    });

    $('btnCopyLink').addEventListener('click', async (e) => {
      const ok = await copyText($('outLink').value);
      e.target.textContent = ok ? 'Copied ✓' : 'Press Ctrl+C to copy';
      setTimeout(() => (e.target.textContent = 'Copy link'), 2000);
    });
    $('outLink').addEventListener('focus', (e) => e.target.select());
  }

  // ============================================================
  //  TALK TO GOOGLE DRIVE
  // ============================================================
  // We don't talk to Google directly any more. We ask YOUR Cloudflare Worker,
  // and the Worker (which holds the secret key) asks Google for us.
  async function fetchAll(id) {
    const url = cfg.WORKER_URL.replace(/\/+$/, '') + '/?folder=' + encodeURIComponent(id);

    const res = await fetch(url);                 // if this fails, the Worker address is wrong or offline
    let body = {};
    try { body = await res.json(); } catch (_) {}

    if (!res.ok) {
      const e = new Error('Gallery server error');
      e.status = (body.error && body.error.status) || res.status;
      e.reason = body.error && body.error.reason;
      throw e;
    }
    return body.files || [];
  }

  function explainError(e) {
    if (e.status === 404)
      return ["Folder not found", "Check the link, and make sure the folder is shared as “Anyone with the link → Viewer”."];
    if (e.reason === 'originNotAllowed')
      return ["This website isn't allowed", "The Worker only accepts your own website. The owner needs to check ALLOWED_ORIGINS in Cloudflare (README, Step 2)."];
    if (e.reason === 'badFolderId')
      return ["That folder link doesn't look right", "Please make a new gallery link from the setup page."];
    if (e.status === 403 && (e.reason === 'accessNotConfigured' || e.reason === 'SERVICE_DISABLED'))
      return ["Drive API is not turned on", "In Google Cloud Console, enable “Google Drive API” for your project (README, Step 1)."];
    if (e.status === 403 && (e.reason === 'forbidden' || e.reason === 'insufficientFilePermissions'))
      return ["This folder is private", "The owner needs to share the folder as “Anyone with the link → Viewer”."];
    if (e.status === 400 || e.status === 403 || e.status === 500)
      return ["The gallery server isn't set up correctly", "The owner needs to check the secret key in Cloudflare and the Google API key (README, Steps 1 and 2)."];
    return ["Couldn't reach the gallery server", "Check your internet connection. If you're the owner, check WORKER_URL in config.js (README, Step 2)."];
  }

  // ============================================================
  //  GALLERY
  // ============================================================
  async function initGallery() {
    $('brand').textContent = byName || 'Gallery';
    document.title = title + (byName ? ' – ' + byName : '');

    if (!hasWorker()) {
      showMessage('Not set up yet', 'Open config.js and paste your Cloudflare Worker address (see README.md, Step 2).');
      return;
    }

    try { favs = new Set(JSON.parse(localStorage.getItem(storeKey) || '[]')); } catch (_) { favs = new Set(); }

    $('gallery').hidden = false;
    $('title').textContent = title;
    $('by').textContent = byName ? 'by ' + byName : '';
    $('status').textContent = 'Loading…';

    try {
      items = await fetchAll(folderId);
    } catch (e) {
      const [h, t] = explainError(e);
      showMessage(h, t);
      return;
    }

    if (!items.length) {
      showMessage('Nothing here yet', 'No photos or videos were found in this folder. (Photos inside sub-folders are not shown.)');
      return;
    }

    items.forEach((f) => { f.ratio = ratioOf(f); });
    $('status').textContent = '';

    const photos = items.filter((f) => !isVideo(f)).length;
    const videos = items.length - photos;
    $('count').textContent = photos + ' photo' + (photos === 1 ? '' : 's') + (videos ? ' · ' + videos + ' video' + (videos === 1 ? '' : 's') : '');

    // Blurred cover behind the title (uses the first picture)
    const cover = items.find((f) => !isVideo(f)) || items[0];
    $('hero').style.setProperty('--hero-img', 'url("' + thumb(cover, 800) + '")');

    $('actions').hidden = false;
    updateFavCount();
    renderGrid();
    renderContactFooter();
    $('btnDownloadAll').hidden = cfg.SHOW_DOWNLOAD_ALL === false;
  }

  function renderGrid() {
    visible = showFavsOnly ? items.filter((f) => favs.has(f.id)) : items;
    const grid = $('grid');
    grid.innerHTML = '';

    if (!visible.length) {
      $('status').textContent = showFavsOnly ? 'No favorites yet. Tap the ♡ on a photo to add it.' : '';
    } else {
      $('status').textContent = '';
    }

    const frag = document.createDocumentFragment();
    visible.forEach((f, i) => {
      const li = document.createElement('li');
      li.className = 'tile';
      li.style.setProperty('--r', f.ratio.toFixed(4));

      const open = document.createElement('button');
      open.className = 'open'; open.type = 'button';
      open.setAttribute('aria-label', 'Open ' + f.name);
      open.addEventListener('click', () => openLightbox(i));

      const img = document.createElement('img');
      img.alt = f.name; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('load', () => img.classList.add('loaded'));
      img.addEventListener('error', () => {
        if (!img.dataset.retry) { img.dataset.retry = '1'; img.src = fallbackThumb(f, 700); }
      });
      img.src = thumb(f, 700);
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
      fav.setAttribute('aria-label', 'Favorite');
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
  }

  // ============================================================
  //  FAVORITES
  // ============================================================
  function toggleFav(id) {
    if (favs.has(id)) favs.delete(id); else favs.add(id);
    try { localStorage.setItem(storeKey, JSON.stringify([...favs])); } catch (_) {}
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
    if (mail) out.push({ key: 'email', label: 'Email', href: 'mailto:' + mail, value: mail });

    return out;
  }

  // Buttons at the bottom of the gallery
  function renderContactFooter() {
    const links = contactLinks();
    if (!links.length) return;
    $('contactText').textContent = byName ? 'Questions? Contact ' + byName : 'Questions? Get in touch';
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

    links.forEach((c) => {
      const a = document.createElement('a');
      a.className = 'btn';
      a.textContent = c.key === 'email' ? 'Email my picks' : 'Open ' + c.label;
      if (c.key === 'email') {
        a.href = c.href
          + '?subject=' + encodeURIComponent('My picks – ' + title)
          + '&body=' + encodeURIComponent('Hi! These are the photos I picked:\n\n' + names.join('\n'));
      } else {
        a.href = c.href; a.target = '_blank'; a.rel = 'noopener';
        a.addEventListener('click', () => copyText(names.join('\n')));  // copy the list, then they paste it in the chat
      }
      box.appendChild(a);
    });
  }

  // ---------- "Download all" popup ----------
  $('btnDownloadAll').addEventListener('click', () => {
    $('btnOpenDrive').href = 'https://drive.google.com/drive/folders/' + encodeURIComponent(folderId);
    $('dlModal').hidden = false;
  });
  $('btnCloseDl').addEventListener('click', () => ($('dlModal').hidden = true));
  $('dlModal').addEventListener('click', (e) => { if (e.target.id === 'dlModal') $('dlModal').hidden = true; });

  // ---------- "Send my picks" popup ----------
  function pickedNames() {
    return items.filter((f) => favs.has(f.id)).map((f) => f.name);
  }
  $('btnSend').addEventListener('click', () => {
    const names = pickedNames();
    $('sendInfo').textContent = names.length
      ? names.length + ' photo' + (names.length === 1 ? '' : 's') + ' selected. Copy this list and send it to your photographer.'
      : "You haven't picked any photos yet. Tap the ♡ on the photos you like first.";
    $('sendText').value = names.join('\n');

    renderSendContacts(names);
    $('sendModal').hidden = false;
  });
  $('btnCloseSend').addEventListener('click', () => ($('sendModal').hidden = true));
  $('sendModal').addEventListener('click', (e) => { if (e.target.id === 'sendModal') $('sendModal').hidden = true; });
  $('btnCopyList').addEventListener('click', async (e) => {
    const ok = await copyText($('sendText').value);
    e.target.textContent = ok ? 'Copied ✓' : 'Press Ctrl+C';
    setTimeout(() => (e.target.textContent = 'Copy list'), 2000);
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

    $('lbCounter').textContent = (i + 1) + ' of ' + visible.length;
    $('lbDownload').href = 'https://drive.google.com/uc?export=download&id=' + f.id;
    $('lbFav').classList.toggle('on', favs.has(f.id));
    $('lbPrev').hidden = i === 0;
    $('lbNext').hidden = i === visible.length - 1;

    // Load the next and previous photo quietly so flipping feels instant
    [i - 1, i + 1].forEach((n) => {
      const g = visible[n];
      if (g && !isVideo(g)) new Image().src = thumb(g, 2000);
    });
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

  // ============================================================
  //  START
  // ============================================================
  if (folderId) initGallery(); else initSetup();
})();
