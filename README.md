# [Drive Gallery](https://iamshika.github.io/imagegrid/)

A simple website that shows the photos and videos from a Google Drive folder in a dark grid (like Adobe Lightroom's share pages). Your files stay in Google Drive, so there is nothing else to pay for.

**Where each piece lives**

| Piece | Where | Secret? |
|---|---|---|
| The website (`index.html`, `style.css`, `app.js`, `config.js`) | GitHub Pages (public) | No secrets in these files |
| `worker.js` + your Google API key | Cloudflare Workers | The key is stored as a **secret** inside Cloudflare. It is never in any file and never on GitHub |

**What your customer can do**
- See all photos in a grid and click one to view it big (arrow keys or swipe to flip through)
- Tap the ♡ on the photos they like
- Press **Send my picks** to copy the list of file names (or email it to you)
- Download any photo, play videos, or tap **Download all** (opens the Drive folder, where Drive makes one zip of everything)
- Contact you on Instagram, LINE or email (you choose which ones in `config.js`)

Everything is free: Google Drive API, Cloudflare Workers (free plan: 100,000 requests a day) and GitHub Pages.

---

## Step 1 — Get a free Google API key (one time, ~5 minutes)

1. Go to https://console.cloud.google.com and sign in with your Google account.
2. Click the project picker at the top → **New Project** → give it any name (e.g. `gallery`) → **Create**.
3. In the search bar at the top, type **Google Drive API** → open it → click **Enable**.
4. Go to **APIs & Services → Credentials → Create credentials → API key**.
5. Copy the key and keep it somewhere private for the next step. Then click **Edit API key** and set:
   - **API restrictions → Restrict key → Google Drive API** (so the key can do nothing else)
   - **Application restrictions → None**. Do **not** pick "Websites (HTTP referrers)" this time. Google would block your Worker, because the Worker is not a website.

> Never paste this key into any file or into GitHub. It only goes into Cloudflare in Step 2.
> If you ever put a real key in a GitHub file by mistake, go back to Credentials, delete that key, and create a new one.

## Step 2 — Set up the Cloudflare Worker (one time, ~10 minutes)

1. Make a free account at https://dash.cloudflare.com (no credit card needed).
2. In the left menu open **Workers & Pages** → **Create** → **Create Worker**. Name it `gallery-api` and click **Deploy**.
3. Click **Edit code**. Delete everything in the editor, open `worker.js` from this project, copy **all** of it and paste it in. Click **Deploy**.
4. Go back to the Worker's page → **Settings** → **Variables and Secrets** → **Add**:
   - Type: **Secret**, Name: `GOOGLE_API_KEY`, Value: *your Google API key from Step 1* → **Deploy**
   - Type: **Text**, Name: `ALLOWED_ORIGINS`, Value: `https://YOURNAME.github.io` → **Deploy**
     (your GitHub username, with no `/` at the end and no repo name. This makes the Worker accept only your website. If you use your own domain, put both separated by a comma.)
5. Copy your Worker address. It looks like `https://gallery-api.YOURNAME.workers.dev`.
6. Quick test: open this in your browser (put a real folder ID from a shared Drive folder):
   `https://gallery-api.YOURNAME.workers.dev/?folder=PASTE_FOLDER_ID`
   You should see text starting with `{"files":[`. An empty `{"files":[]}` means the folder has no photos or videos directly inside it.

The menu names in Cloudflare change from time to time, so they may look a little different, but the steps are the same.

## Step 3 — Put the website on GitHub

1. Open `config.js` and paste your Worker address between the quotes:
   ```js
   WORKER_URL: "https://gallery-api.YOURNAME.workers.dev",
   ```
   In the same file, fill in `CONTACT_INSTAGRAM`, `CONTACT_LINE` and `CONTACT_EMAIL` (leave any you don't use as `""`). Set `SHOW_DOWNLOAD_ALL: false` if you don't want the **Download all** button.
2. Create a GitHub account if you don't have one, then **New repository**. Name it e.g. `gallery`, set it to **Public**, click **Create**.
3. Click **uploading an existing file**, drag in `index.html`, `style.css`, `app.js`, `config.js` and `README.md`, then **Commit changes**. You don't need to upload `worker.js`, because it lives in Cloudflare now.
4. Go to **Settings → Pages**. Under **Branch**, choose `main` and `/ (root)`, then **Save**.
5. After about a minute your site is live at `https://YOURNAME.github.io/gallery/`.

## Step 4 — Share the Drive folder

1. In Google Drive, right-click the customer's photo folder → **Share**.
2. Under **General access**, choose **Anyone with the link** → **Viewer**.
3. Click **Copy link**.

Share each customer's folder on its own, not the big folder that holds all of them. Sharing the big one shares everything inside it.

## Step 5 — Make a gallery for each customer

1. Open your website (`https://YOURNAME.github.io/gallery/`).
2. Type a title (e.g. *Graduation Day*), your studio name, and paste the Drive folder link.
3. Click **Create gallery link**, copy the link, and send it to your customer. Each folder gets its own link.

---

## How safe is this?

- Your Google API key is only inside Cloudflare. Nobody can read it from GitHub or from your website.
- The Worker address is public (your website has to know it). Someone who finds it could ask it to list a Drive folder, but only a folder that is already shared as "Anyone with the link" and only if they know its long folder ID. They can never get your key.
- `ALLOWED_ORIGINS` stops other *websites* from using your Worker in a browser. It is not a lock against someone using a script, so don't rely on it for secrets. That's fine here, because nothing secret goes through the Worker.
- Anyone who has a customer's gallery link can see those photos. Don't post the link publicly if the photos are private.

## Good to know

- **Sub-folders** are not shown. Put all photos and videos directly in the customer's folder.
- **Videos** play in Google's own video player. Newly uploaded videos may take a few minutes to be ready in Drive.
- **Favorites** are saved on the customer's own device and browser, so they won't be there on another device.
- **New photos** you add to the folder can take up to about 5 minutes to appear, because the Worker remembers the list for a short time.
- **Very popular files:** Google can temporarily limit downloads of a file if many people download it in a short time. Viewing is not affected.
- **Make the photos bigger or smaller:** in `style.css`, change `--row-h` at the top.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Not set up yet" | Paste your Worker address into `config.js` (Step 3) and upload the file again |
| "Couldn't reach the gallery server" | The `WORKER_URL` in `config.js` is wrong, or the Worker isn't deployed. Do the quick test in Step 2 |
| "This website isn't allowed" | `ALLOWED_ORIGINS` in Cloudflare doesn't match your site address exactly (check for a typo, a trailing `/`, or `http` instead of `https`) |
| "The gallery server isn't set up correctly" | The secret `GOOGLE_API_KEY` is missing or wrong in Cloudflare (Step 2, part 4), or the key still has an "HTTP referrers" restriction (Step 1, part 5) |
| "Drive API is not turned on" | Enable **Google Drive API** in your Google Cloud project (Step 1, part 3) |
| "Folder not found" / "This folder is private" | Share the folder as **Anyone with the link → Viewer** (Step 4) |
| Photos don't appear but no error | Press Ctrl+F5 to refresh; check the folder directly contains images |
