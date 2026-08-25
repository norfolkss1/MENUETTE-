# MENUETTE — Chef's Studio

A menu-building studio for the kitchen. Three menu types — **DDR**, **Buffet**
and **Canapé** — each with its own dish library, a canvas you arrange, a live
styled preview on the branded ME Dubai page, one-click Word/PDF export, and a
prep sheet on demand. Behind them sits a **Prep Vault** holding every dish's
prep list plus a reusable library of prep lists you can tie onto any dish.

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
index.html                 the app shell (gate, sidebar nav, one div per view)
style.css                  all styling + the ME Dubai print/preview page layout
app.js                     core: config, state, boot, navigation, shared helpers
studio.js                  the shared menu studio — DDR, Buffet and Canapé all run on it
prep.js                    Prep Vault (by-dish + library) and the prep sheet exports
pages.js                   Saved Menus and Import Menu
firebase-config.js         your Firebase project config (fill this in)
data/default-categories.js seed sections + seed PIN (only used on the very first run)
assets/border-strip.jpg    the sand-swirl strip from the Word template (DDR + Buffet pages)
assets/marble-bg.jpg       the marble page background from the canapé book (Canapé pages)
assets/me-dubai-logo.png   the "ME DUBAI" logo
```

`app.js` must load first — the other three read the state and helpers it
defines. All four are plain scripts sharing one global scope; there is no
bundler and nothing to build.

## Features

### The three menu studios

DDR, Buffet and Canapé are **the same builder**, driven by the `STUDIOS` table
at the top of `app.js`. Each has its own dish library and its own section list,
and each page looks the way that kind of menu should — but every control works
identically, so there is only one thing to learn.

- **Library tab** — search, filter by section, and `＋ Add` a dish onto the
  menu. `＋ New` creates a dish; `✎` edits one. Each row shows its section,
  allergens, food cost, and whether it has a prep list yet.
- **Canvas tab** — what's on the menu, grouped by section, with ↑/↓ to reorder
  within a section and ✕ to drop a dish. Below it: the menu title, alignment,
  UPPERCASE / italic toggles, the export file name, and the food cost per cover
  with a count of how many dishes still have no prep.
- **Live preview** — the branded page itself, and **it is directly editable**.
  Click any dish name, description, allergen tag, section heading or the title
  and type. Edits apply to *this menu only* — the library's master record is
  untouched — so rewording a dish for one event doesn't change it everywhere.
  UPPERCASE is a display style, never baked into the stored text. Clearing a
  section heading hides it (in preview, PDF, print and Word) while keeping its
  dishes grouped; type into the blank to bring it back. ▲/▼ on a heading move
  a whole section; ✕ on a dish drops it.
- **Multi-page, measured for real** — long menus flow across as many branded
  pages as they need. Pagination measures the actual rendered height of every
  row off-screen rather than guessing a line budget, keeps a heading with at
  least its first row, and repeats the heading at the top of a page that
  continues a section. The editable preview and the plain exported page are
  built to have *identical* geometry, so the page count you see is the page
  count you get.

| | DDR | Buffet | Canapé |
|---|---|---|---|
| Sections are | courses | stations | savoury / sweet |
| Page | sand-swirl strip, off-white | sand-swirl strip, off-white | full-bleed marble |
| Dishes shown as | text list | text list | photo cards, two across |
| Pre-loaded | 81 dishes | 177 dishes across 23 stations | 15 canapés with photos |

Canapé has one extra toggle — **Show photos** — which switches its page between
the photo-card grid and a plain text list, for when you want a compact
canapé menu.

### Prep Vault

- **By dish** — *every* dish in all three libraries, with its prep list shown
  inline. Filter to one studio, or hit **⚠ Missing prep** to see only the food
  that still has nothing written down. Editing prep here is prep-only: no
  costing, no descriptions, just the list.
- **Prep library** — 172 named prep lists, read out of your master prep
  workbook (`ALL PREP HYPERLINKED - UPDATED.xlsx`). **🔗 Tie to dish** copies
  one onto any dish in any studio, either replacing that dish's prep or adding
  to it, and remembers the link. Where a library entry's name exactly matches a
  dish that has no prep yet, the card offers to tie it in one click. **＋ New
  prep list** adds your own. Entries that appeared on several past event sheets
  with slightly different breakdowns keep the extra items as one-click
  suggestions in the editor rather than silently merging them.
- Prep can also be pulled the other way — from inside any dish editor,
  **🧾 Use a Prep Vault list**.

### Prep on demand

**🧾 Prep list** in any studio compiles the prep for everything currently on
that menu into a plain kitchen checklist (tick boxes, no branding, no costs)
and exports it as its own Word or PDF. Dishes with nothing written down are
named at the top so you know what's missing rather than it silently vanishing.

### Export

- **📕 PDF** downloads a real `.pdf` — no print dialog. It's a high-resolution
  snapshot of the exact live preview, one PDF page per preview page.
- **📄 Word** builds a real, editable `.docx` client-side, at the template's
  page size, with the frame and logo embedded and page breaks in the same
  places as the preview.
- **🖨️ Print** is separate from both — the browser print dialog on the styled
  page, if you'd rather print physically or use the OS "Save as PDF".

### Saved Menus and Import

- **Saved Menus** — every saved menu from all three studios in one list, with
  its studio, dish count and cost per cover. **Open** reloads it into its own
  studio, ready to keep editing.
- **Import Menu** — pick which library it should feed, upload an old `.docx` or
  `.pdf` menu, and review what was found before anything is saved. In a Word
  file a paragraph whose text is *entirely* bold is read as a dish name and the
  plain line under it as its description; in a PDF, short ALL-CAPS or
  Title-Case lines are read as dish names. A line matching one of the target
  library's section names switches the section for everything after it.
  Allergen codes written into a name (`BASQUE CHEESE CAKE (G, D)`) are split
  out automatically, and dishes already in that library are flagged.

### Costing

Every dish's cost is built from an **itemized ingredient list**, never a single
typed-in number — add or remove rows, set each one's quantity/unit/price, and
the total adds up live. Typing in an ingredient's name box opens a searchable
dropdown of your full `priceBook` (188 items from the supplier price list),
each showing its unit and price; picking one fills the row. Custom
ingredients not in the book are fine too. Dishes migrated before this existed
show a single "(previous flat estimate)" row — replace it when you're ready.
The Prep Vault deliberately shows no costing at all.

### Allergen legend

Every branded page — DDR, Buffet and Canapé — ends with a fixed
"Allergens: D — Dairy · G — Gluten · S — Seafood · N — Nuts" line, in the live
preview, PDF, print and Word export alike.

## Changing the design later

The page look lives in two places kept in sync on purpose — the `PAGE`
measurements object at the top of `app.js`, and the `.menu-page` rules in
`style.css`. Both the preview and the `.docx` export are built from those same
numbers, so a change has to be made in both to stay honest.

There are two page themes, chosen per studio by the `theme` field in `STUDIOS`:
`sand` (the swirl strip down the left margin, from the Word template) and
`marble` (full-bleed stone, from the printed canapé book). To add a brand
template of your own, drop its images in `assets/`, add a `theme-yourname`
block to `style.css` alongside the two existing ones, and point a studio at it.

## Firestore collections

```
dishes          DDR dish library
buffetDishes    Buffet dish library
canapeDishes    Canapé dish library (each doc also carries its photo, embedded)
menus           saved menus from all three studios (a `studio` field says which)
prepVault       the reusable prep-list library
priceBook       supplier price list, backing the ingredient search
config          menuSettings: the three section lists + the access PIN
```

Dish documents share one shape across all three libraries — `name`, `category`,
`description`, `allergens`, `ingredients[]`, `cost`, `prepItems[]` — which is
what lets a single studio engine and a single Prep Vault serve all three.

Canapé photos are stored as compressed images embedded directly in the document
(resized to ~700px, JPEG) rather than in a separate file-hosting service, since
Firebase Storage isn't set up on this project. That's fine at this scale
(~15–30 photos); if you outgrow it, Firebase Storage is the natural next step.
