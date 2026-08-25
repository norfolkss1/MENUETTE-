# MENUETTE — Chef's Studio

A deployable menu-building tool: a dish vault with per-dish cost, a menu builder
with a live styled preview (matching the "ME Dubai" branded template), export to
Word and PDF, saved menus with total-cost comparison, and an import tool that
extracts dishes from an existing Word/PDF menu.

It's plain HTML/CSS/JS (no build step) + Firebase Firestore for live, shared
data — the same pattern as your recipe book and ordering board, so you host it
the same way. Being a static site (not a Python server) is also what fixes the
old "waking up" delay: there's no server to fall asleep.

---

## Step-by-step: get it running (about 10 minutes, free)

### Step 1 — Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com) → **Add project**
   → give it a name (e.g. `menuette-studio`) → follow the prompts (you can
   disable Google Analytics, it's not needed). Use a **new** project, not the
   recipe book or ordering board one — Menuette gets its own database.

### Step 2 — Create the Firestore database

1. Left sidebar: **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** (we'll set custom rules in Step 4) and
   pick a region close to you.

### Step 3 — Register a Web App to get your config

1. Project settings (gear icon) → scroll to "Your apps" → click the **</>** (Web) icon.
2. Give it a nickname, click **Register app**. Firebase shows a `firebaseConfig` object.
3. Copy that object into `firebase-config.js` in this folder, replacing the placeholder values.

### Step 4 — Set Firestore security rules

In Firebase console: **Firestore Database → Rules**, replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Click **Publish**. This is UI-level access control (the PIN gate), not real
per-user security — fine for an internal tool on an unlisted URL, don't post
the link publicly.

### Step 5 — Set your own PIN

The app seeds itself with PIN `2580` the first time it runs. Once you're in,
there's no PIN-change screen yet — to change it, open Firebase console →
**Firestore Database → config → menuSettings** and edit the `pin` field
directly. (Ask me to add an in-app "change PIN" control if you'd like one.)

### Step 6 — Deploy for free — GitHub Pages (simplest, no CLI needed)

1. Create a new **public** GitHub repo (e.g. `menuette`).
2. Upload everything in this `menuette-web/` folder to the repo root — `index.html`,
   `style.css`, `app.js`, `firebase-config.js`, the `data/` folder, and the
   `assets/` folder (the two ME Dubai template images). Drag-and-drop on
   GitHub's web UI works fine, no git install needed.
3. Repo → **Settings → Pages** → under "Build and deployment", set Source to
   **Deploy from a branch**, branch **main**, folder **/ (root)** → Save.
4. After a minute, GitHub shows your live URL:
   `https://<your-username>.github.io/menuette/`

That URL never sleeps — it's a static file, served instantly every time.

---

## If dishes/menus don't show up

A banner appears at the top of the page explaining the problem.

| Symptom | Cause | Fix |
|---|---|---|
| Red banner: "Couldn't reach the menu database" | Firestore Database not created yet, or `firebase-config.js` still has placeholder values | Do Steps 2–3 above |
| Red banner mentions "permission" | Firestore rules are blocking access | Do Step 4 above |
| Blank/white page | A script failed to load (check browser console, F12) | Make sure the folder structure stayed intact — `index.html` must sit next to `app.js`, `style.css`, `firebase-config.js`, `data/`, and `assets/` |

## What's in this folder

```
index.html                 the app shell (gate, nav, all four views)
style.css                  all styling + the ME Dubai print/preview page layout
app.js                     all app logic (Firestore reads/writes, rendering, export)
firebase-config.js         your Firebase project config (fill this in)
data/default-categories.js seed categories + seed PIN (only used the very first run)
assets/border-strip.jpg    the sand-swirl border image from Sample.docx
assets/me-dubai-logo.png   the "ME DUBAI" logo from Sample.docx
```

## Features

- **Dish Vault** — add/edit/delete dishes: name, category (button picker),
  description, allergens. "+ Manage categories" adds/renames/reorders/
  deletes categories (renaming a category updates every dish tagged with it).
  Cost is built from an **itemized ingredient list** per dish, not a single
  typed-in number — add or remove ingredient rows, set each one's quantity/
  unit/price, and the dish's total cost adds up live. Click or type in an
  ingredient's name box to open a searchable dropdown of your full
  `priceBook` (188 items from the supplier price list) — matches update live
  as you type, each showing its unit and price, and clicking one visibly
  fills the row so you can see exactly what you picked. You can still type
  any custom ingredient/price that isn't in the book. Dishes migrated before
  this existed show a single "(previous flat estimate)" row — replace it
  with real ingredients whenever you're ready.
- **Menu Builder** — pick dishes into a canvas grouped by category, see a
  running **total cost** and per-category subtotal live, and a **live styled
  preview** in the exact ME Dubai page layout (sand border, logo, fonts) that
  updates as you edit — this is the same page that gets exported to PDF/Word.
  **The preview itself is directly editable** — click any dish name,
  description, allergen tag, section heading, or the menu title right on the
  page and type; changes apply to this menu only (the Dish Vault's master
  record is untouched), so tweaking a dish's wording for one event doesn't
  change it everywhere else. UPPERCASE mode is a pure display style — the
  real text underneath stays exactly as typed. Clearing a section heading
  (e.g. deleting "SWEET COFFEE BREAK") hides it from the preview, PDF, print,
  and Word export while keeping its dishes grouped together — click the
  blank space where it was to type a new label back in. Each section heading
  also has ▲/▼ buttons to reorder entire sections (e.g. put Dessert before
  Main for one specific menu); canvas cards have their own ↑/↓ to reorder
  dishes within a section.
- **Export** — name the file, then:
  - **📕 Export PDF** downloads a real `.pdf` file directly — no print dialog
    involved. It's a high-resolution snapshot of the exact live preview, so
    it always matches what's on screen pixel-for-pixel.
  - **📄 Export Word (.docx)** builds a real, editable Word document
    client-side, with the border/logo embedded at the same position as the
    original template.
  - **🖨️ Print** is separate from both — it opens the browser's print dialog
    on the styled page, for physically printing or manually choosing
    "Save as PDF" from the OS print dialog if you'd rather do it that way.
- **Saved Menus** — save a menu by name; the list shows every saved menu with
  its total cost side by side, so you can see which menu costs what. Click
  "Load" to reopen one in the builder.
- **Import Menu** — upload an old .docx or .pdf menu; dishes and categories are
  auto-detected (whole-line bold = dish name in Word docs; ALL-CAPS/Title-Case
  short lines in PDFs), with a review screen to fix anything before it's added
  to the vault.
- **Prep List** (optional, per dish) — any dish (à la carte or Canapé) can
  have a simple ordered checklist of prep/mise-en-place items, added from its
  Edit screen — genuinely optional, most dishes have none. **Prep Vault** is a
  dedicated tab listing every dish that has one, searchable. In Menu Builder
  (and Canapé Menu), **"🧾 Generate Prep List"** compiles the prep lists of
  every dish currently on the menu that has one — skipping the rest — into
  its own plain, functional checklist document (not the decorative branded
  menu look, since this is a kitchen work document), exportable as its own
  Word/PDF.
- **Buffet Menus** — a separate tab for station-based buffet menus (Ramadan,
  Brunch, Christmas, Omniyat pre-loaded from your real menus). Each menu is
  a list of stations (e.g. "Charcuterie & Cheese Station"), each with a list
  of items; the Ramadan menu additionally has day-tabs (7 days), since it's a
  weekly rotation. Add/remove/reorder stations and items freely. Because
  these run much longer than an à la carte menu, the live preview and every
  export **automatically flow across as many branded pages as the content
  needs** — a pagination engine measures the real rendered height of every
  station and packs pages accordingly (never splitting a station's items
  across two pages unless the station alone is longer than one page), so it
  stays correct even if you edit the page design later.
- **Canapé Menu** — a photo-card grid for canapé-style items (15 real dishes
  pre-loaded, extracted with their actual photos from the source PDF). Each
  card is a dish with a photo, name, allergens, description, the same
  itemized cost/ingredients as the Dish Vault, and its own optional prep
  list. Photos are stored as compressed images embedded directly in the
  database (resized to ~600px, JPEG ~70% quality) rather than a separate
  file-hosting service, since Firebase Storage isn't set up on this project —
  fine at this scale (~15–30 photos), but if you outgrow it later, moving to
  Firebase Storage is the natural next step (see README history / ask for
  help). Live preview and export reuse the same multi-page pagination engine
  as Buffet Menus, with the photo embedded in both the PDF snapshot and the
  real `.docx` export.
- **Allergen legend** — every branded page (à la carte, Buffet, Canapé) ends
  with a fixed "Allergens: D — Dairy · G — Gluten · S — Seafood" line, in
  the live preview, PDF, print, and Word export alike.

## Changing the design later

The sand-border-and-logo look lives in two places that are kept in sync
on purpose — the `PAGE` measurements object at the top of `app.js`, and the
`.menu-page` rules in `style.css`. To swap in a different brand template,
replace the two files in `assets/`, and adjust both of those in tandem.
