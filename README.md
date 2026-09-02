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

### Step 5 — Set your own access codes

The app seeds itself with two codes the first time it runs:

- chef code **`2580`** — opens the whole studio
- manager code **`1379`** — opens the whole studio and can approve menus

Change both from inside the app: sign in with the manager code, then
**Approvals → 🔑 Access codes**. Do that before anyone else gets the link.

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

## If the page asks for a code and the button does nothing

That means one of the app's files didn't reach the host, so the page's
JavaScript stopped before it could wire the button up. Newer builds say so on
screen and name the file; older ones just sit there.

**Every one of these has to be uploaded, with the folders kept as folders:**

```
index.html
app.js
studio.js
prep.js
pages.js
approvals.js
firebase-config.js        <- easy to miss; the app cannot start without it
style.css
data/default-categories.js
assets/border-strip.jpg
assets/border-strip.png
assets/marble-bg.jpg
assets/marble-bg.png
assets/me-dubai-logo.png
```

Things worth checking, roughly in order of how often they're the culprit:

1. **`firebase-config.js` is missing.** Dragging files into GitHub's uploader
   skips it if it was ever git-ignored. Without it the app can't start at all.
2. **The `data/` or `assets/` folder didn't come along.** Drag the *folders*,
   not just the loose files, or use "Add file → Upload files" and drop the
   whole `menuette-web` folder in one go.
3. **Case.** GitHub Pages is case-sensitive; Windows isn't. `App.js` works on
   your laptop and 404s online.
4. **Wrong address.** The Pages address is
   `https://<your-username>.github.io/<repo-name>/`, not the `github.com/...`
   page where the code lives.
5. **Pages hasn't finished building.** Settings → Pages shows the status; the
   first build takes a couple of minutes.

To see exactly what's wrong, open the page and press <kbd>F12</kbd> → Console.
A red `404` line names the file that's missing.

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
app.js                     core: config, state, boot, navigation, roles, shared helpers
studio.js                  the shared menu studio — DDR, Buffet and Canapé all run on it
prep.js                    Prep Vault (by-dish + library) and the prep sheet exports
pages.js                   Saved Menus and Import Menu
approvals.js               send for approval, approve / send back, the archive
firebase-config.js         your Firebase project config (fill this in)
data/default-categories.js seed sections + seed PIN (only used on the very first run)
assets/border-strip.jpg    the sand-swirl strip from the Word template (DDR + Buffet pages)
assets/marble-bg.jpg       the marble page background from the canapé book (Canapé pages)
assets/border-strip.png    the same two frames as PNG, used only by the Word export
assets/marble-bg.png       (see "A note on the Word export" below)
assets/me-dubai-logo.png   the "ME DUBAI" logo
```

`app.js` must load first — the others read the state and helpers it defines.
They are plain scripts sharing one global scope; there is no bundler and
nothing to build.

## Features

### The three menu studios

DDR, Buffet and Canapé are **the same builder**, driven by the `STUDIOS` table
at the top of `app.js`. Each has its own dish library and its own section list,
and each page looks the way that kind of menu should — but every control works
identically, so there is only one thing to learn.

- **Library tab** — search, filter by section, and `＋ Add` a dish onto the
  menu. `＋ New` creates a dish; `✎` edits one. Each row shows its section,
  allergens, food cost, and whether it has a prep list yet. Buffet has a second
  view here — **Ready-made stations** — see below.
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
| Dishes shown as | text list | text list | photo cards, three to a page |
| Pre-loaded | 81 dishes | 177 dishes + 72 station blocks | 15 canapés with photos |

**Ready-made stations (Buffet).** The station toggle above the library lists 72
stations exactly as they ran on real menus — "Grill Station" with its four
items, "Ramadan Desserts" with its five — pulled out of the Ramadan, Brunch,
Christmas and Omniyat menus. **＋ Add all** drops the whole station onto the
canvas in one go, matched against the dish library so each item brings its
allergens, cost and prep list with it. Items you already have are skipped, and
the button counts what's left to add. From there it's an ordinary canvas: drop
what you don't want, reorder, rename the station heading on the page.

**Canapé photos.** Three canapés fit on a page, one per row: a framed
photograph on the left, name and description beside it.

Worth knowing, because it explains why they look the way they do: **every
canapé bitmap in the source menus is cut off at one edge.** Those books place
the plates so they bleed past the page trim, and the missing pixels exist in no
file — not in `CANAPE MENU ALL.pdf`, not in the higher-resolution
`CANAPE MENU 2025.pdf`, not in any of the 150 menu PDFs, the PowerPoints, or
the photographer's original folder (that shoot is the à la carte set, on black).
Shown as a floating cutout, that cut reads as a slice through the plate. Shown
as a framed photograph, the same edge is simply where the picture ends — which
is what a photograph looks like. So each photo is a rectangle cropped to the
dish's own shape (portrait for a tall cone, landscape for a long board), filled
edge to edge, with a hairline shadow so it sits on the marble as a print.

The **Show photos** toggle switches to a plain text list when you want a
compact canapé menu instead. If you upload your own photo, a PNG stays a PNG
(transparency preserved); anything else becomes a smaller JPEG, and either way
its size is recorded so the page can lay out before the image decodes.

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
- **📄 Word** asks which of two files you want. **Both keep the design** — the
  difference is only whether the words can be edited:
  - **Editable menu** (the default) — real Word text anyone can retype, in the
    same fonts, sizes, colours, letter-spacing and spacing as the preview, with
    the section rules, the border, the logo and the allergen legend repeating
    on every page. Canapé cards come through as a photo beside its caption
    (a borderless table — the only way Word will sit text next to a picture and
    leave both editable). Word does its own line-breaking, so pages can fall
    slightly differently from the preview.
  - **Exact copy of the preview** — pixel-for-pixel what's on the canvas,
    placed as full-page artwork anchored to the sheet so nothing can shift.
    Nothing can be edited either.

  Your last choice is remembered per studio. An editable 2-page DDR menu is
  about 150KB; the exact-copy version of the same menu, about 750KB.

  The page's typography lives in the `TYPE` table at the top of `studio.js`,
  lifted from the `.menu-page` rules in `style.css`. Change one, change the
  other. It assumes **Playfair Display** and **DM Sans** are installed on the
  machine opening the file — they are on yours; on a machine without them Word
  substitutes something close.
- **🖨️ Print** is separate from both — the browser print dialog on the styled
  page, if you'd rather print physically or use the OS "Save as PDF".

### Approvals

A menu can be sent for approval instead of just saved. There are two access
codes, and they are the only difference between the two roles:

- The **chef code** opens the whole studio.
- The **manager code** opens the whole studio *and* can approve.

Everything else — every studio, the Prep Vault, exports, imports — is identical
for both. Whoever set the app up can change either code from **Approvals →
🔑 Access codes** (manager only). If both codes are set to the same value,
everyone gets the manager role rather than approvals being locked away.

**📩 Send for approval** sits next to *Save menu* in every studio. It saves the
menu, attaches an optional note, and moves it to **Waiting**. From there a
manager can:

- **✓ Approve** — the menu is signed off and a **frozen copy** is written to the
  archive. That copy is a snapshot, not a link: if the menu is edited afterwards
  the archive still holds exactly what was approved, which is the entire point
  of keeping one. Opening something from the archive gives you an unlinked
  copy, so signing-off history can't be rewritten by editing it.
- **Send back** — with a note saying what needs changing. It moves to
  **Sent back**, and the note shows on the card for whoever built it.

The sidebar's Approvals badge turns copper when something is waiting. Saved
Menus shows each menu's status alongside it.

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

## A note on the Word export

`docx.js` names every embedded image `<id>.png` no matter what type it is told
— the filename is hardcoded in its `ImageRun` — and the package's
`[Content_Types].xml` maps `.png` to `image/png`. Hand it JPEG bytes and you
get a file whose images are mislabelled. Two consequences:

- The two page frames ship twice: the `.jpg` versions are what the browser
  loads (smaller), and matching `.png` versions exist purely for the Word
  export. They're 256-colour palette PNGs, which for near-grey stone and sand
  textures is visually identical at a fraction of a truecolour PNG. **If you
  replace a frame image, replace both files.**
- Canapé photos are re-encoded to PNG at export time, at roughly 150 dpi for
  the size Word actually prints them — honest bytes without shipping a
  full-resolution lossless copy. A 15-canapé menu comes out around 1.4MB.

## Changing the design later

There are two palettes in `style.css`, and they are separate on purpose:

- The **app** tokens (`--bg`, `--accent`, `--ink`…) are the tool's own look.
  Change them freely.
- The **page** tokens (`--page-ink`, `--page-accent`, `--page-border`…) are the
  ME Dubai brand and are used *only* inside `.menu-page`. Restyling the app
  never changes what comes out of the printer.

The page's measurements live in two places kept in sync on purpose — the `PAGE`
object at the top of `app.js`, and the `.menu-page` rules in `style.css`. Both
the preview and the `.docx` export are built from those same numbers, so a
change has to be made in both to stay honest. The same goes for the marble
theme's footer mark: `MARBLE_LOGO` in `studio.js` and
`.theme-marble .brand-logo` in `style.css`.

There are two page themes, chosen per studio by the `theme` field in `STUDIOS`:
`sand` (the swirl strip down the left margin, from the Word template) and
`marble` (full-bleed stone, from the printed canapé book). To add a brand
template of your own, drop its images in `assets/` (both `.jpg` and `.png`),
add a `theme-yourname` block to `style.css` alongside the two existing ones,
and point a studio at it.

**Two invariants worth knowing before you touch `.menu-page` CSS:**

1. Pagination is measured twice — once on the editable preview, once on the
   plain exported page — and the two must break in identical places, or the
   preview will promise a page count the PDF doesn't deliver. So nothing in
   editable mode may change the page's geometry: every editing affordance is
   absolutely positioned or a colour change only.
2. Menu photos are real `<img>` elements at a size computed in inches, never a
   scaled CSS background. html2canvas leaves a faint seam down the edge of a
   scaled `background-size: contain` image, which showed up as a hairline
   beside every plate in the exported PDF; and sizing the element up front is
   what lets pagination measure the page correctly whether or not the photo has
   finished decoding.

## Firestore collections

```
dishes          DDR dish library
buffetDishes    Buffet dish library
canapeDishes    Canapé dish library (each doc also carries its photo, embedded)
menus           saved menus from all three studios (a `studio` field says which,
                and `status` says draft / pending / approved / changes)
menuArchive     frozen copies of approved menus, as signed off
prepVault       the reusable prep-list library
buffetStationBlocks  ready-made buffet stations, as they ran on real menus
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
