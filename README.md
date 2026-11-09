# [Drive Gallery](https://iamshika.github.io/imagegrid/)
# [Collage Maker](https://iamshika.github.io/imagegrid/scatter-collage.html)

A website that shows the photos and videos from a Google Drive folder in a dark grid (like Adobe Lightroom's share pages). Your files stay in Google Drive, so there is nothing else to pay for.

**Where each piece lives**

| Piece | Where | Secret? |
|---|---|---|
| The website: `index.html`, `style.css`, `lang.js`, `app.js`, `config.js` | GitHub Pages (public) | No secrets in these files |
| `worker.js`, your Google API key, your PIN, your saved galleries | Cloudflare (Worker + KV) | Key and PIN are stored as **secrets** inside Cloudflare, never in a file |

**What your customer can do**
- See all photos in a grid (or Square / Column / One-up), click one to view it big, flip with arrow keys or swipe
- Tap the ♡ on the photos they like, then press **Send my picks** to copy the list or open your Instagram, LINE or email
- Download photos, or tap **Download all**
- Switch between **ENG | TH** (Thai is shown first for Thai visitors)

**What you can do** (in the gallery maker, protected by your PIN)
- Choose the layout, photos per row (computer and phone separately), spacing, background picture (any photo in the folder), darkness and blur
- Get a short link that shows a picture banner when pasted into LINE
- See all your galleries, edit them (the link stays the same), or delete them

Everything is free: Google Drive API, Cloudflare Workers (100,000 requests a day), Cloudflare KV, and GitHub Pages.

---

## Step 1 — Get a free Google API key (one time)

1. Go to https://console.cloud.google.com and sign in.
2. Project picker at the top → **New Project** → any name → **Create**.
3. Search **Google Drive API** → open it → **Enable**.
4. **APIs & Services → Credentials → Create credentials → API key**.
5. Copy the key (keep it private). Click **Edit API key** and set:
   - **API restrictions → Restrict key → Google Drive API**
   - **Application restrictions → None** (a "Websites" restriction would block your Worker)

> Never paste this key into any file or into GitHub. It only goes into Cloudflare (Step 2).
> If a real key ever ends up in a GitHub file, delete it in Google Cloud and make a new one.

## Step 2 — Set up Cloudflare (one time)

1. Free account at https://dash.cloudflare.com.
2. **Workers & Pages → Create → Create Worker** → choose the **Hello World** starter → name it (e.g. `gallery-proxy`) → **Deploy**.
   Only `worker.js` goes here. Do **not** upload your website files to Cloudflare.
   *(If you already have the Worker from before, just open it and replace its code with the new `worker.js`.)*
3. **Edit code** → delete everything → paste all of `worker.js` → **Deploy**.
4. **Make the storage for your galleries (KV):**
   - Left menu → **Storage & Databases → KV → Create a namespace** → name it `gallery-data`.
   - Go back to your Worker → **Settings → Bindings → Add → KV namespace** → Variable name: `GALLERIES` → pick `gallery-data` → **Deploy**.
5. **Settings → Variables and Secrets → Add** (click **Deploy** after):
   - **Secret** named `GOOGLE_API_KEY` = your key from Step 1
   - **Secret** named `PIN` = your numbers, e.g. `482913` (**6 or more digits** is safer)
   - **Text** named `ALLOWED_ORIGINS` = `https://YOURNAME.github.io` (no `/` at the end, no repo name)
6. Copy your Worker address (`https://gallery-proxy.YOURNAME.workers.dev`).
7. Quick test: open `https://gallery-proxy.YOURNAME.workers.dev/?id=test1234`. You should see `{"error":{"status":404,"reason":"galleryNotFound"}}`. That means the Worker is alive and the storage is connected.

The names in Cloudflare's menus change from time to time, so they may look a little different. The steps are the same.

## Step 3 — Put the website on GitHub

1. Open `config.js` and check `WORKER_URL` is your Worker address. Fill in your studio name, Instagram, LINE and email.
2. Create a **Public** repository (e.g. `gallery`).
3. Upload `index.html`, `style.css`, `lang.js`, `app.js`, `config.js`, `README.md`, then **Commit changes**. Do not upload `worker.js`.
4. **Settings → Pages → Branch: `main` / `(root)` → Save.**
5. After a minute your site is live at `https://YOURNAME.github.io/gallery/`.

## Step 4 — Share the Drive folder

Right-click the customer's folder → **Share** → **General access: Anyone with the link → Viewer**. Share each customer's folder on its own, not the big folder that holds all of them.

## Step 5 — Make a gallery

1. Open your website. Enter your **PIN**.
2. Paste the Drive folder link. The folder loads and a live preview appears (switch **Computer / Phone**).
3. Choose the look, then press **Save & get link**.
4. Send the **share link** (`…workers.dev/g/xxxxxxxx`) to your customer. In LINE it shows a banner with your chosen background picture, the title and your preview text.
5. Later: **My galleries** lets you **Edit** (same link, new look), **Copy link** or **Delete** (the link stops working).

---

## Languages

- Visitors see **Thai** if their phone or computer language is Thai, or if they are in Thailand. Everyone else sees **English**.
- The **ENG | TH** switch in the top bar changes it, and the choice is remembered on that device.
- Every text is in `lang.js`. To fix a translation, change the text inside the quotes and upload the file again.

## About the LINE banner

- LINE reads the share link (`/g/…`) and draws a card: your background picture as the banner, the title as "title by studio", and your preview text.
- The banner is the background picture you chose ("First photo" if you chose none).
- LINE **remembers** previews. If you change the picture later, chats that already received the link may still show the old banner.
- The link's domain is your `workers.dev` address.

## How safe is this?

- Your Google API key and PIN are only inside Cloudflare.
- Only someone with your PIN can make, change or delete galleries. After 5 wrong PINs from one place, sign-in pauses for 15 minutes. A longer PIN is safer.
- Changing the PIN later does **not** break your customers' links.
- A customer's link only opens that one gallery. The codes are random, so they can't be guessed.
- Anyone who has a gallery link can see its photos. Don't post private links publicly.
- If you tick off download buttons, the buttons are hidden and the Drive folder address is not sent to the page, but the photos' own addresses still work.
- If you ever make a new Google key, just update the `GOOGLE_API_KEY` secret. Your links keep working.

## Good to know

- **Old links** (the long ones with `?f=…`) stop working once your Worker has a PIN. Make new links in the gallery maker. To keep old links alive for a while, add a **Text** variable `LEGACY_OPEN` = `1` in Cloudflare, then delete it when you're done.
- **Sub-folders** are not shown. Use one folder per gallery.
- **Videos** play in Google's own player.
- **Favorites** are saved on the customer's own device.
- **New photos** you add to the folder can take up to about 5 minutes to appear. In the gallery maker, **Load folder** always gets the latest list.
- **Starting look:** the `DEFAULTS` block in `config.js` sets what the gallery maker starts with.
- **Your config:** `config.js` is the only file with your own details. When you get updated files, keep your `config.js`.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Not set up yet" | Paste your Worker address into `config.js` (Step 3) and upload it again |
| "Couldn't reach the gallery server" | `WORKER_URL` is wrong, or the Worker isn't deployed. Do the quick test in Step 2 |
| "That address isn't your Worker" | `WORKER_URL` points to something that isn't running `worker.js` |
| "This website isn't allowed" | `ALLOWED_ORIGINS` doesn't match your site address exactly (typo, trailing `/`, or `http` instead of `https`) |
| "The PIN is not set in Cloudflare yet" | Add the secret `PIN` (Step 2, part 5) and Deploy |
| "The gallery storage (KV) is not connected" | Bind the KV namespace as `GALLERIES` (Step 2, part 4) and Deploy |
| "Too many wrong tries" | Wait 15 minutes, then sign in again |
| "The gallery server isn't set up correctly" | The `GOOGLE_API_KEY` secret is missing or wrong, or the key still has a "Websites" restriction |
| "Drive API is not turned on" | Enable **Google Drive API** in your Google Cloud project |
| "Folder not found" / "This folder is private" | Share the folder as **Anyone with the link → Viewer** |
| "This link is outdated" | It's an old long link. Make a new one in the gallery maker |
| "Gallery not found" | The code is wrong, or the gallery was deleted |
| LINE shows no banner picture | Open `https://YOUR-WORKER/img/CODE` in a browser. If it shows the picture, LINE may have cached an old preview. If not, tell me what you see |
