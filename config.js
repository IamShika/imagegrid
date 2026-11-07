// ============================================================
//  SETTINGS - this is the ONLY file you need to edit.
//  (There are NO secrets in this file, so it is safe on GitHub.)
// ============================================================
window.SITE_CONFIG = {
  // The address of your Cloudflare Worker (see README.md, Step 2).
  // It looks like: https://gallery-proxy.YOURNAME.workers.dev
  WORKER_URL: "https://gallery-proxy.doramongameing.workers.dev",

  // Name shown under the gallery title, e.g. "by My Studio".
  // (You can also change it per gallery in the gallery maker.)
  DEFAULT_STUDIO_NAME: "CreativeMiracles Co.",

  // ---------- How customers can contact you (all optional) ----------
  // Fill in what you use. Leave "" to hide one.
  // They show at the bottom of the gallery and in the "Send my picks" popup.

  // Your Instagram username (or a full link), e.g. "miracle.studio"
  CONTACT_INSTAGRAM: "Iam._Shika",

  // Your LINE ID, e.g. "miraclestudio"
  // or a LINE Official Account, e.g. "@miraclestudio"
  // (a full LINE link works too)
  CONTACT_LINE: "dear120120",

  // Your email, e.g. "hello@mystudio.com"
  CONTACT_EMAIL: "creeperlold@gmail.com",

  // Show the "Download all" button? true = yes, false = hide it everywhere.
  // (It opens the Drive folder, where Drive makes one zip of everything.)
  SHOW_DOWNLOAD_ALL: true,

  // ---------- Starting look in the gallery maker (optional) ----------
  // You can change all of these per gallery in the gallery maker.
  // layout: "grid" (Photo Grid), "square", "column" or "oneup"
  DEFAULTS: {
    layout: "grid",
    cols: 4,        // photos per row on a computer (2 to 8)
    colsPhone: 2,   // photos per row on a phone (1 to 4)
    gap: 6,         // space between photos in pixels (0 to 24)
    dim: 50,        // how dark the background picture is (0 to 90)
    blur: 3        // how blurry the background picture is (0 to 20)
  }
};
