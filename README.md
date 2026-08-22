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
  description, allergens, cost. "+ Manage categories" adds/renames/reorders/
  deletes categories (renaming a category updates every dish tagged with it).
- **Menu Builder** — pick dishes into a canvas grouped by category, see a
  running **total cost** and per-category subtotal live, and a **live styled
  preview** in the exact ME Dubai page layout (sand border, logo, fonts) that
  updates as you edit — this is also exactly what gets printed to PDF.
- **Export** — name the file, then export as a real **.docx** (built client-side,
  with the border/logo embedded at the same position as the original template)
  or as **PDF** (opens the browser print dialog on the styled preview — choose
  "Save as PDF"; the suggested file name is already filled in).
- **Saved Menus** — save a menu by name; the list shows every saved menu with
  its total cost side by side, so you can see which menu costs what. Click
  "Load" to reopen one in the builder.
- **Import Menu** — upload an old .docx or .pdf menu; dishes and categories are
  auto-detected (whole-line bold = dish name in Word docs; ALL-CAPS/Title-Case
  short lines in PDFs), with a review screen to fix anything before it's added
  to the vault.

## Changing the design later

The sand-border-and-logo look lives in two places that are kept in sync
on purpose — the `PAGE` measurements object at the top of `app.js`, and the
`.menu-page` rules in `style.css`. To swap in a different brand template,
replace the two files in `assets/`, and adjust both of those in tandem.
