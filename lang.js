// ============================================================
//  Languages: English (en) and Thai (th).
//  Every text on the website lives in this file. To fix a translation,
//  just change the text inside the quotes. Keep things like {n} and {name} as they are.
//
//  Which language is shown first?
//   1. The one the visitor picked with the ENG | TH switch (remembered on their device)
//   2. Thai, if their phone/computer language is Thai, or they are in Thailand
//   3. English for everyone else
// ============================================================
(() => {
  const TEXT = {
    en: {
      'lang.aria': 'Language',
      'gallery': 'Gallery',
      'by': 'by {name}',
      'fav': 'Favorites',
      'dlAll': 'Download all',
      'send': 'Send my picks',
      'loading': 'Loading…',
      'photo.one': '{n} photo', 'photo.many': '{n} photos',
      'video.one': '{n} video', 'video.many': '{n} videos',
      'noFavs': 'No favorites yet. Tap the ♡ on a photo to add it.',
      'close': 'Close',

      'lb.back': 'Back', 'lb.fav': 'Favorite', 'lb.dl': 'Download', 'lb.prev': 'Previous', 'lb.next': 'Next',
      'lb.counter': '{i} of {n}',

      'send.title': 'Your favorite photos',
      'send.some': '{n} selected. Copy this list and send it to your photographer.',
      'send.none': "You haven't picked any photos yet. Tap the ♡ on the photos you like first.",
      'send.copy': 'Copy list', 'send.copied': 'Copied ✓', 'send.ctrlc': 'Press Ctrl+C',
      'send.txt': 'Download .txt',
      'send.hint': 'Now send the list to your photographer. For Instagram and LINE, your list is copied first, so just paste it into the chat.',
      'send.open': 'Open {name}',
      'send.email': 'Email my picks',
      'send.mail.subject': 'My picks – {title}',
      'send.mail.body': 'Hi! These are the photos I picked:',

      'dl.title': 'Download all photos',
      'dl.body': 'Google Drive opens in a new tab. There, click the folder name at the top and choose <b>Download</b>. Drive packs everything into a zip file for you. Big folders come as several zip files.',
      'dl.open': 'Open Google Drive',

      'contact.by': 'Questions? Contact {name}',
      'contact.generic': 'Questions? Get in touch',
      'contact.email': 'Email',

      'err.notfound.h': 'Folder not found',
      'err.notfound.t': 'Check the link, and make sure the folder is shared as “Anyone with the link → Viewer”.',
      'err.gnf.h': 'Gallery not found',
      'err.gnf.t': 'This link may be wrong, or the gallery was deleted. Please ask for a new link.',
      'err.legacy.h': 'This link is outdated',
      'err.legacy.t': 'Please ask the photographer for a new link.',
      'err.notworker.h': "That address isn't your Worker",
      'err.notworker.t': 'WORKER_URL in config.js points to something that is not the gallery Worker. It must be the address of the Worker that runs worker.js (README, Step 2).',
      'err.origin.h': "This website isn't allowed",
      'err.origin.t': 'The Worker only accepts your own website. The owner needs to check ALLOWED_ORIGINS in Cloudflare (README, Step 2).',
      'err.badfolder.h': "That folder link doesn't look right",
      'err.badfolder.t': 'Please make a new gallery link in the gallery maker.',
      'err.apioff.h': 'Drive API is not turned on',
      'err.apioff.t': 'In Google Cloud Console, enable “Google Drive API” for your project (README, Step 1).',
      'err.private.h': 'This folder is private',
      'err.private.t': 'The owner needs to share the folder as “Anyone with the link → Viewer”.',
      'err.server.h': "The gallery server isn't set up correctly",
      'err.server.t': 'The owner needs to check the secrets in Cloudflare and the Google API key (README, Steps 1 and 2).',
      'err.net.h': "Couldn't reach the gallery server",
      'err.net.t': "Check your internet connection. If you're the owner, check that WORKER_URL in config.js is the address of your deployed Worker (README, Step 2).",
      'err.setup.h': 'Not set up yet',
      'err.setup.t': 'Open config.js and paste your Cloudflare Worker address (see README.md, Step 2).',
      'err.empty.h': 'Nothing here yet',
      'err.empty.t': 'No photos or videos were found in this folder. (Photos inside sub-folders are not shown.)',

      // ---- gallery maker (admin) ----
      'mk.title': 'Gallery maker',
      'mk.intro': 'Paste a Google Drive folder, choose how the gallery looks, then save to get a link for your customer.',
      'warn.worker': "You haven't connected your Cloudflare Worker yet. Open config.js and paste your Worker address (see README.md, Step 2).",
      'pin.title': 'Sign in',
      'pin.intro': 'Enter your PIN to open the gallery maker.',
      'pin.ph': 'PIN',
      'pin.go': 'Sign in',
      'pin.out': 'Sign out',
      'pin.bad': 'Wrong PIN. Try again.',
      'pin.locked': 'Too many wrong tries. Please wait 15 minutes and try again.',
      'pin.notset': 'The PIN is not set in Cloudflare yet. Add a secret named PIN to your Worker (README, Step 2).',
      'err.kv': 'The gallery storage (KV) is not connected to your Worker. See README, Step 2.',
      'mk.folder': 'Google Drive folder link',
      'mk.hint': 'The folder must be shared as <b>Anyone with the link → Viewer</b>.',
      'mk.load': 'Load folder',
      'mk.badLink': "That doesn't look like a Google Drive folder link. Copy it from Drive → right-click the folder → Share → Copy link.",
      'mk.empty': 'No photos or videos were found directly inside that folder. (Sub-folders are not shown.)',
      'mk.found': 'Found {p}.',
      'mk.found.v': 'Found {p} and {v}.',
      'mk.showTitle': 'Show title',
      'mk.titlePh': 'e.g. Graduation Day',
      'mk.showBy': 'Show studio name',
      'mk.byPh': 'e.g. Miracle Studio',
      'mk.layout': 'Layout',
      'layout.grid': 'Photo Grid', 'layout.square': 'Square', 'layout.column': 'Column', 'layout.oneup': 'One-up',
      'hint.grid': 'Rows of equal height. Each photo keeps its own shape. This is the Lightroom look.',
      'hint.square': 'Every photo is cropped to the same neat square.',
      'hint.column': 'Columns side by side. Each photo keeps its own shape.',
      'hint.oneup': 'One big photo at a time, top to bottom.',
      'mk.colsC': 'Photos per row on a computer',
      'mk.colsM': 'Photos per row on a phone',
      'mk.gap': 'Space between photos',
      'mk.bg': 'Background picture',
      'mk.bgHint': 'Pick a photo from the folder to fill the whole page behind the gallery. It is also the banner when you share the link in LINE. All {n} photos are shown.',
      'bg.auto': 'First photo', 'bg.none': 'None',
      'mk.dim': 'Darkness',
      'mk.blur': 'Blur',
      'mk.dl': 'Show download buttons',
      'mk.dlHint': 'Unticking this only hides the buttons. Anyone who has the photos’ addresses can still download from Drive.',
      'mk.desc': 'Link preview text',
      'mk.descHint': 'The small text under the title when the link is shared in LINE and other chats.',
      'mk.descPh': 'e.g. Pick your favorite photos here',
      'mk.save': 'Save & get link',
      'mk.saveChanges': 'Save changes',
      'mk.saved': 'Saved ✓',
      'mk.saving': 'Saving…',
      'mk.loading': 'Loading…',
      'mk.unsaved': 'You changed something. Press “Save changes” so the link shows it.',
      'mk.saveFail': 'Could not save.',
      'res.share': 'Send this link to your customer. It shows a picture banner in LINE.',
      'res.copy': 'Copy link', 'res.copied': 'Copied ✓', 'res.ctrlc': 'Press Ctrl+C to copy',
      'res.open': 'Open gallery',
      'res.direct': 'Direct link (no picture banner)',
      'res.cache': 'LINE remembers link previews. After you change the picture, chats that already got the link may still show the old one.',
      'prev': 'Preview',
      'dev.desktop': 'Computer', 'dev.phone': 'Phone',
      'mine': 'My galleries',
      'mine.new': 'New gallery',
      'mine.empty': 'No galleries yet.',
      'mine.edit': 'Edit',
      'mine.copy': 'Copy link',
      'mine.del': 'Delete',
      'mine.confirm': 'Delete this gallery? Its link will stop working.',
      'mine.untitled': '(no title)',
    },

    th: {
      'lang.aria': 'ภาษา',
      'gallery': 'แกลเลอรี',
      'by': 'โดย {name}',
      'fav': 'รายการโปรด',
      'dlAll': 'ดาวน์โหลดทั้งหมด',
      'send': 'ส่งรูปที่เลือก',
      'loading': 'กำลังโหลด…',
      'photo.one': '{n} รูป', 'photo.many': '{n} รูป',
      'video.one': '{n} วิดีโอ', 'video.many': '{n} วิดีโอ',
      'noFavs': 'ยังไม่มีรายการโปรด แตะ ♡ ที่รูปเพื่อเพิ่ม',
      'close': 'ปิด',

      'lb.back': 'กลับ', 'lb.fav': 'รายการโปรด', 'lb.dl': 'ดาวน์โหลด', 'lb.prev': 'ก่อนหน้า', 'lb.next': 'ถัดไป',
      'lb.counter': '{i} จาก {n}',

      'send.title': 'รูปที่คุณเลือก',
      'send.some': 'เลือกแล้ว {n} รูป คัดลอกรายชื่อนี้แล้วส่งให้ช่างภาพได้เลย',
      'send.none': 'คุณยังไม่ได้เลือกรูป แตะ ♡ ที่รูปที่ชอบก่อนนะ',
      'send.copy': 'คัดลอกรายชื่อ', 'send.copied': 'คัดลอกแล้ว ✓', 'send.ctrlc': 'กด Ctrl+C',
      'send.txt': 'ดาวน์โหลด .txt',
      'send.hint': 'ส่งรายชื่อให้ช่างภาพได้เลย ถ้ากด Instagram หรือ LINE ระบบจะคัดลอกรายชื่อให้ก่อน แค่วางในแชทก็เสร็จ',
      'send.open': 'เปิด {name}',
      'send.email': 'ส่งรายชื่อทางอีเมล',
      'send.mail.subject': 'รูปที่ฉันเลือก – {title}',
      'send.mail.body': 'สวัสดี นี่คือรูปที่ฉันเลือก:',

      'dl.title': 'ดาวน์โหลดรูปทั้งหมด',
      'dl.body': 'Google Drive จะเปิดในแท็บใหม่ ให้คลิกชื่อโฟลเดอร์ด้านบน แล้วเลือก <b>ดาวน์โหลด</b> Drive จะรวมทุกอย่างเป็นไฟล์ zip ให้ ถ้าโฟลเดอร์ใหญ่จะแบ่งเป็นหลายไฟล์ zip',
      'dl.open': 'เปิด Google Drive',

      'contact.by': 'มีคำถาม? ติดต่อ {name}',
      'contact.generic': 'มีคำถาม? ติดต่อเราได้เลย',
      'contact.email': 'อีเมล',

      'err.notfound.h': 'ไม่พบโฟลเดอร์',
      'err.notfound.t': 'ตรวจสอบลิงก์ และตั้งค่าแชร์โฟลเดอร์เป็น “ทุกคนที่มีลิงก์ → ผู้ดู”',
      'err.gnf.h': 'ไม่พบแกลเลอรี',
      'err.gnf.t': 'ลิงก์อาจไม่ถูกต้อง หรือแกลเลอรีถูกลบไปแล้ว กรุณาขอลิงก์ใหม่',
      'err.legacy.h': 'ลิงก์นี้เก่าแล้ว',
      'err.legacy.t': 'กรุณาขอลิงก์ใหม่จากช่างภาพ',
      'err.notworker.h': 'ที่อยู่นี้ไม่ใช่ Worker ของคุณ',
      'err.notworker.t': 'WORKER_URL ใน config.js ชี้ไปที่ที่ไม่ใช่ Worker ของแกลเลอรี ต้องเป็นที่อยู่ของ Worker ที่รัน worker.js (README ขั้นตอนที่ 2)',
      'err.origin.h': 'เว็บไซต์นี้ไม่ได้รับอนุญาต',
      'err.origin.t': 'Worker รับเฉพาะเว็บไซต์ของคุณเอง เจ้าของต้องตรวจค่า ALLOWED_ORIGINS ใน Cloudflare (README ขั้นตอนที่ 2)',
      'err.badfolder.h': 'ลิงก์โฟลเดอร์ไม่ถูกต้อง',
      'err.badfolder.t': 'กรุณาสร้างลิงก์แกลเลอรีใหม่ในตัวสร้างแกลเลอรี',
      'err.apioff.h': 'ยังไม่ได้เปิด Drive API',
      'err.apioff.t': 'ใน Google Cloud Console ให้เปิดใช้ “Google Drive API” ของโปรเจกต์ (README ขั้นตอนที่ 1)',
      'err.private.h': 'โฟลเดอร์นี้เป็นส่วนตัว',
      'err.private.t': 'เจ้าของต้องแชร์โฟลเดอร์เป็น “ทุกคนที่มีลิงก์ → ผู้ดู”',
      'err.server.h': 'เซิร์ฟเวอร์แกลเลอรียังตั้งค่าไม่ถูกต้อง',
      'err.server.t': 'เจ้าของต้องตรวจค่า Secret ใน Cloudflare และ Google API key (README ขั้นตอนที่ 1 และ 2)',
      'err.net.h': 'เชื่อมต่อเซิร์ฟเวอร์แกลเลอรีไม่ได้',
      'err.net.t': 'ตรวจสอบอินเทอร์เน็ตของคุณ ถ้าคุณเป็นเจ้าของ ให้ตรวจว่า WORKER_URL ใน config.js เป็นที่อยู่ของ Worker ที่ติดตั้งแล้ว (README ขั้นตอนที่ 2)',
      'err.setup.h': 'ยังตั้งค่าไม่เสร็จ',
      'err.setup.t': 'เปิด config.js แล้ววางที่อยู่ Cloudflare Worker ของคุณ (ดู README.md ขั้นตอนที่ 2)',
      'err.empty.h': 'ยังไม่มีอะไรที่นี่',
      'err.empty.t': 'ไม่พบรูปหรือวิดีโอในโฟลเดอร์นี้ (รูปในโฟลเดอร์ย่อยจะไม่แสดง)',

      // ---- gallery maker (admin) ----
      'mk.title': 'ตัวสร้างแกลเลอรี',
      'mk.intro': 'วางลิงก์โฟลเดอร์ Google Drive เลือกหน้าตาของแกลเลอรี แล้วกดบันทึกเพื่อรับลิงก์ส่งให้ลูกค้า',
      'warn.worker': 'ยังไม่ได้เชื่อมต่อ Cloudflare Worker เปิด config.js แล้ววางที่อยู่ Worker ของคุณ (ดู README.md ขั้นตอนที่ 2)',
      'pin.title': 'เข้าสู่ระบบ',
      'pin.intro': 'ใส่รหัส PIN เพื่อเปิดตัวสร้างแกลเลอรี',
      'pin.ph': 'รหัส PIN',
      'pin.go': 'เข้าสู่ระบบ',
      'pin.out': 'ออกจากระบบ',
      'pin.bad': 'รหัส PIN ไม่ถูกต้อง ลองอีกครั้ง',
      'pin.locked': 'ใส่ผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่',
      'pin.notset': 'ยังไม่ได้ตั้งค่า PIN ใน Cloudflare เพิ่ม Secret ชื่อ PIN ให้ Worker ก่อน (README ขั้นตอนที่ 2)',
      'err.kv': 'ยังไม่ได้เชื่อมที่เก็บข้อมูลแกลเลอรี (KV) กับ Worker ดู README ขั้นตอนที่ 2',
      'mk.folder': 'ลิงก์โฟลเดอร์ Google Drive',
      'mk.hint': 'โฟลเดอร์ต้องแชร์เป็น <b>ทุกคนที่มีลิงก์ → ผู้ดู</b>',
      'mk.load': 'โหลดโฟลเดอร์',
      'mk.badLink': 'นี่ไม่ใช่ลิงก์โฟลเดอร์ Google Drive ให้คัดลอกจาก Drive → คลิกขวาที่โฟลเดอร์ → แชร์ → คัดลอกลิงก์',
      'mk.empty': 'ไม่พบรูปหรือวิดีโอในโฟลเดอร์นี้โดยตรง (โฟลเดอร์ย่อยจะไม่แสดง)',
      'mk.found': 'พบ {p}',
      'mk.found.v': 'พบ {p} และ {v}',
      'mk.showTitle': 'แสดงชื่อแกลเลอรี',
      'mk.titlePh': 'เช่น งานรับปริญญา',
      'mk.showBy': 'แสดงชื่อสตูดิโอ',
      'mk.byPh': 'เช่น Miracle Studio',
      'mk.layout': 'รูปแบบการแสดงผล',
      'layout.grid': 'กริดรูปภาพ', 'layout.square': 'สี่เหลี่ยมจัตุรัส', 'layout.column': 'คอลัมน์', 'layout.oneup': 'ทีละรูป',
      'hint.grid': 'แถวความสูงเท่ากัน รูปคงสัดส่วนเดิม เหมือน Lightroom',
      'hint.square': 'ทุกรูปถูกครอบเป็นสี่เหลี่ยมจัตุรัสขนาดเท่ากัน',
      'hint.column': 'คอลัมน์เรียงข้างกัน รูปคงสัดส่วนเดิม',
      'hint.oneup': 'รูปใหญ่ทีละรูป เรียงจากบนลงล่าง',
      'mk.colsC': 'จำนวนรูปต่อแถวบนคอมพิวเตอร์',
      'mk.colsM': 'จำนวนรูปต่อแถวบนมือถือ',
      'mk.gap': 'ระยะห่างระหว่างรูป',
      'mk.bg': 'รูปพื้นหลัง',
      'mk.bgHint': 'เลือกรูปจากโฟลเดอร์ให้เป็นพื้นหลังเต็มหน้า และใช้เป็นแบนเนอร์เมื่อส่งลิงก์ใน LINE แสดงครบทั้ง {n} รูป',
      'bg.auto': 'รูปแรก', 'bg.none': 'ไม่ใช้',
      'mk.dim': 'ความมืด',
      'mk.blur': 'ความเบลอ',
      'mk.dl': 'แสดงปุ่มดาวน์โหลด',
      'mk.dlHint': 'การเอาติ๊กออกเป็นแค่การซ่อนปุ่ม คนที่รู้ที่อยู่ของรูปยังดาวน์โหลดจาก Drive ได้อยู่',
      'mk.desc': 'ข้อความตัวอย่างลิงก์',
      'mk.descHint': 'ข้อความเล็กใต้ชื่อ เมื่อส่งลิงก์ใน LINE และแชทอื่น ๆ',
      'mk.descPh': 'เช่น เลือกรูปที่ชอบได้ที่นี่',
      'mk.save': 'บันทึกและรับลิงก์',
      'mk.saveChanges': 'บันทึกการเปลี่ยนแปลง',
      'mk.saved': 'บันทึกแล้ว ✓',
      'mk.saving': 'กำลังบันทึก…',
      'mk.loading': 'กำลังโหลด…',
      'mk.unsaved': 'คุณแก้ไขบางอย่าง กด “บันทึกการเปลี่ยนแปลง” เพื่อให้ลิงก์แสดงผลล่าสุด',
      'mk.saveFail': 'บันทึกไม่สำเร็จ',
      'res.share': 'ส่งลิงก์นี้ให้ลูกค้า จะแสดงแบนเนอร์รูปภาพใน LINE',
      'res.copy': 'คัดลอกลิงก์', 'res.copied': 'คัดลอกแล้ว ✓', 'res.ctrlc': 'กด Ctrl+C เพื่อคัดลอก',
      'res.open': 'เปิดแกลเลอรี',
      'res.direct': 'ลิงก์ตรง (ไม่มีแบนเนอร์รูปภาพ)',
      'res.cache': 'LINE จะจำตัวอย่างลิงก์ไว้ หลังเปลี่ยนรูป แชทที่เคยส่งลิงก์ไปแล้วอาจยังเห็นรูปเดิม',
      'prev': 'ตัวอย่าง',
      'dev.desktop': 'คอมพิวเตอร์', 'dev.phone': 'มือถือ',
      'mine': 'แกลเลอรีของฉัน',
      'mine.new': 'สร้างใหม่',
      'mine.empty': 'ยังไม่มีแกลเลอรี',
      'mine.edit': 'แก้ไข',
      'mine.copy': 'คัดลอกลิงก์',
      'mine.del': 'ลบ',
      'mine.confirm': 'ลบแกลเลอรีนี้? ลิงก์จะใช้ไม่ได้อีก',
      'mine.untitled': '(ไม่มีชื่อ)',
    },
  };

  const KEY = 'lang';
  let lang = 'en';
  const listeners = [];

  const stored = () => {
    try { const s = localStorage.getItem(KEY); return s === 'en' || s === 'th' ? s : null; } catch (_) { return null; }
  };
  const fromBrowser = () => {
    const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    return list.some((l) => /^th(?![a-z])/i.test(l)) ? 'th' : 'en';
  };

  // t('key', {n: 3}) gives the text in the current language
  function t(key, vars) {
    let s = (TEXT[lang] && TEXT[lang][key]) || TEXT.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return s;
  }

  // Fill every text on the page that has a data-i18n label
  function paint() {
    document.documentElement.lang = lang;
    const each = (sel, fn) => document.querySelectorAll(sel).forEach(fn);
    each('[data-i18n]', (el) => { el.textContent = t(el.dataset.i18n); });
    each('[data-i18n-html]', (el) => { el.innerHTML = t(el.dataset.i18nHtml); });   // our own texts only
    each('[data-i18n-ph]', (el) => { el.placeholder = t(el.dataset.i18nPh); });
    each('[data-i18n-aria]', (el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    each('[data-i18n-title]', (el) => { el.title = t(el.dataset.i18nTitle); });
    each('#langSwitch button', (b) => {
      const on = b.dataset.lang === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function set(l, save) {
    if (l !== 'en' && l !== 'th') return;
    lang = l;
    if (save) { try { localStorage.setItem(KEY, l); } catch (_) {} }
    paint();
    listeners.forEach((fn) => fn(lang));
  }

  // The Worker tells us the visitor's country. Thai visitors get Thai, unless they already chose.
  function hintCountry(cc) {
    if (!stored() && cc === 'TH' && lang !== 'th') set('th', false);
  }

  lang = stored() || fromBrowser();
  document.querySelectorAll('#langSwitch button').forEach((b) => b.addEventListener('click', () => set(b.dataset.lang, true)));
  // If the language is changed in another tab or in the preview, follow it
  window.addEventListener('storage', (e) => { if (e.key === KEY && (e.newValue === 'en' || e.newValue === 'th') && e.newValue !== lang) set(e.newValue, false); });
  paint();

  window.Lang = { t, set, hintCountry, get: () => lang, onChange: (fn) => listeners.push(fn) };
})();
