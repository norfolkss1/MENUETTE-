/* global firebase, FIREBASE_CONFIG, DEFAULT_CATEGORIES, DEFAULT_BUFFET_STATIONS,
   DEFAULT_CANAPE_CATEGORIES, DEFAULT_PIN, DEFAULT_MANAGER_PIN */

/* ==========================================================================
   MENUETTE — core: config, state, boot, navigation, modal, shared helpers.
   The three menu studios (DDR / Buffet / Canapé) live in studio.js, the
   Prep Vault in prep.js, and Saved Menus + Import in pages.js. All four
   files share this file's top-level state via the global lexical scope,
   so app.js must load first (see index.html).
   ========================================================================== */

firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

const CURRENCY = "AED";

/* ============================== ME Dubai page measurements ==============================
   Keep these in sync with the .menu-page rules in style.css — the live preview,
   the .docx export and the PDF export are all built from these same numbers,
   so what you see on screen is exactly what lands in both exported files. */
const PAGE = {
  widthIn: 5.903,
  heightIn: 8.271,
  marginTopIn: 0.75,
  marginBottomIn: 1.05,
  marginLeftIn: 1.08,
  marginRightIn: 0.32,
  borderLeftIn: 0.375,
  borderTopIn: 0.593,
  borderWidthIn: 0.626,
  borderHeightIn: 7.086,
  logoLeftIn: 4.35,
  logoBottomIn: 0.32,
  logoWidthIn: 0.868,
  logoHeightIn: 0.670,
};

/* ============================== Menu studios ==============================
   DDR, Buffet and Canapé are the same builder — dish library on the left,
   canvas + live preview on the right, prep on demand — differing only in
   which collection they read, which section list they group by, and how a
   finished page looks. Everything downstream reads this table rather than
   branching on the studio name. */
const STUDIOS = {
  ddr: {
    key: "ddr",
    label: "DDR Menus",
    short: "DDR",
    icon: "🍽️",
    noun: "Dish",
    plural: "dishes",
    collection: "dishes",
    /* which config/menuSettings field holds this studio's section list */
    sectionsField: "categories",
    sectionsNoun: "Course",
    theme: "sand",          /* sand-swirl border strip + off-white page */
    layout: "text",
    photos: false,
    costing: true,
    defaultTitle: "MENU",
    blurb: "Coffee breaks, lunches and dinners — the day-delegate menus.",
  },
  buffet: {
    key: "buffet",
    label: "Buffet Menus",
    short: "Buffet",
    icon: "🍱",
    noun: "Buffet Dish",
    plural: "dishes",
    collection: "buffetDishes",
    sectionsField: "buffetStations",
    sectionsNoun: "Station",
    theme: "sand",
    layout: "text",
    photos: false,
    costing: true,
    /* Buffet is the one studio with ready-made station blocks — a whole
       station's worth of dishes you can drop onto the menu in one go. */
    stationBlocks: true,
    defaultTitle: "BUFFET MENU",
    blurb: "Drop in ready-made stations, or build one dish at a time.",
  },
  canape: {
    key: "canape",
    label: "Canapé Menus",
    short: "Canapé",
    icon: "🥂",
    noun: "Canapé",
    plural: "canapés",
    collection: "canapeDishes",
    sectionsField: "canapeCategories",
    sectionsNoun: "Group",
    theme: "marble",        /* full-bleed marble page, as in the printed book */
    layout: "photo",
    photos: true,
    costing: true,
    defaultTitle: "CANAPÉ MENU",
    blurb: "Photo-led canapé selections on the marble presentation page.",
  },
};
const STUDIO_KEYS = Object.keys(STUDIOS);

function freshBuilder(studioKey) {
  return {
    pane: "library",              /* "library" | "canvas" */
    source: "dishes",             /* "dishes" | "stations" — library sub-view */
    pickerSearch: "",
    pickerCatFilter: "all",
    chipsExpanded: false,
    canvas: [],
    titleText: STUDIOS[studioKey].defaultTitle,
    alignment: "center",
    uppercase: false,
    italics: true,
    photoLayout: STUDIOS[studioKey].layout === "photo",
    filename: "",
    wordStyle: "text",            /* "text" | "designed" — Word export flavour */
    activeMenuId: null,
    sectionLabels: {},
    sectionOrder: [],
  };
}

/* ============================== State ============================== */
const state = {
  /* section lists, one per studio, mirrored from config/menuSettings */
  sections: {
    ddr: DEFAULT_CATEGORIES.slice(),
    buffet: DEFAULT_BUFFET_STATIONS.slice(),
    canape: DEFAULT_CANAPE_CATEGORIES.slice(),
  },
  pin: DEFAULT_PIN,
  managerPin: DEFAULT_MANAGER_PIN,
  /* "staff" or "manager" — whichever access code was used to get in */
  role: null,
  /* dish libraries, keyed by studio */
  dishes: { ddr: [], buffet: [], canape: [] },
  menus: [],
  archive: [],
  prepVault: [],
  stationBlocks: [],
  priceBook: [],
  view: "ddr",
  builders: { ddr: freshBuilder("ddr"), buffet: freshBuilder("buffet"), canape: freshBuilder("canape") },
  prep: { tab: "by-dish", search: "", studioFilter: "all", missingOnly: false },
  approvals: { tab: "pending", search: "" },
  savedSearch: "",
  importReview: [],
  importStudio: "ddr",
};

/* A manager can approve or send back a menu that's waiting for review.
   Everything else in the app is identical for both roles. */
function isManager() { return state.role === "manager"; }
function roleLabel() { return isManager() ? "Manager" : "Chef"; }
function pendingMenus() { return state.menus.filter((m) => m.status === "pending"); }

function studioOf(key) { return STUDIOS[key]; }
function builderOf(key) { return state.builders[key]; }
function dishesOf(key) { return state.dishes[key]; }
function sectionsOf(key) { return state.sections[key]; }

/* ============================== Utilities ============================== */
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatCurrency(v) {
  return `${CURRENCY} ${(Math.round((Number(v) || 0) * 100) / 100).toFixed(2)}`;
}
function sanitizeFilename(s) {
  const base = String(s || "menu").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return base || "menu";
}
function plural(n, one, many) { return `${n} ${n === 1 ? one : (many || one + "s")}`; }

/* Loose name key used for prep↔dish matching and duplicate detection:
   case, punctuation, curly quotes and bracketed asides are all ignored. */
function nameKey(s) {
  return String(s || "").toUpperCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupByCategory(items, order) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.category || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  const groups = [];
  (order || []).forEach((cat) => {
    if (map.has(cat)) { groups.push({ category: cat, items: map.get(cat) }); map.delete(cat); }
  });
  map.forEach((items, cat) => groups.push({ category: cat, items }));
  return groups;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function resizeImageFile(file, maxWidth, quality) {
  // Firestore documents cap out at 1MB, and this app has no Storage bucket
  // configured — so images are embedded as data URIs directly on the document.
  // Resizing client-side keeps every photo well under that cap.
  //
  // A PNG is kept a PNG: the canapé photos are transparent cutouts meant to sit
  // straight on the marble page, and re-encoding one as JPEG would flatten its
  // background to a solid rectangle. Everything else becomes a smaller JPEG.
  const keepAlpha = /png/i.test(file.type);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        // The size comes back with the data URI: the menu page sizes each photo
        // from it up front, so the layout is right before the image decodes.
        resolve({ dataUri: keepAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality),
                  width: w, height: h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function ingredientsTotal(ingredients) {
  return (ingredients || []).reduce((sum, ing) => sum + (Number(ing.qty) || 0) * (Number(ing.unitPrice) || 0), 0);
}

/* ============================== Status banner + toast ============================== */
function showStatus(msg, type) {
  const el = document.getElementById("status-banner");
  el.innerHTML = msg;
  el.className = type === "info" ? "info" : "";
  el.classList.remove("hidden");
}
function hideStatus() { document.getElementById("status-banner").classList.add("hidden"); }
function connectionErrorMsg(err) {
  return `Couldn't reach the menu database (${escapeHtml(err && err.message ? err.message : String(err))}).
    This usually means Firestore Database hasn't been created yet for this Firebase project, or its
    rules don't allow access. See README.md.`;
}

let toastTimer = null;
function toast(msg, kind) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = kind === "error" ? "error" : "";
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), kind === "error" ? 5200 : 2600);
}

/* ============================== Boot ============================== */
document.addEventListener("DOMContentLoaded", () => {
  showStatus("Connecting to the menu database…", "info");
  ensureConfigDoc().then(() => {
    hideStatus();
    listenConfig();
    STUDIO_KEYS.forEach(listenDishes);
    listenMenus();
    listenArchive();
    listenPrepVault();
    listenStationBlocks();
    loadPriceBook();
    if (localStorage.getItem("menuette-unlocked") === "1") {
      state.role = localStorage.getItem("menuette-role") === "manager" ? "manager" : "staff";
      enterApp();
    } else showGate();
  }).catch((err) => {
    showStatus(connectionErrorMsg(err));
    showGate();
  });

  document.getElementById("gate-unlock-btn").addEventListener("click", handleUnlock);
  document.getElementById("gate-pin").addEventListener("keydown", (e) => { if (e.key === "Enter") handleUnlock(); });
  document.getElementById("lock-btn").addEventListener("click", lockApp);
  document.querySelectorAll(".sb-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("modal-backdrop").classList.contains("hidden")) closeModal();
  });
});

async function ensureConfigDoc() {
  const ref = db.collection("config").doc("menuSettings");
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      categories: DEFAULT_CATEGORIES,
      buffetStations: DEFAULT_BUFFET_STATIONS,
      canapeCategories: DEFAULT_CANAPE_CATEGORIES,
      pin: DEFAULT_PIN,
      managerPin: DEFAULT_MANAGER_PIN,
    });
    return;
  }
  // Projects seeded before the Buffet/Canapé studios existed only have
  // `categories` — backfill the two newer lists rather than leaving them empty.
  const data = snap.data();
  const patch = {};
  if (!Array.isArray(data.buffetStations) || !data.buffetStations.length) patch.buffetStations = DEFAULT_BUFFET_STATIONS;
  if (!Array.isArray(data.canapeCategories) || !data.canapeCategories.length) patch.canapeCategories = DEFAULT_CANAPE_CATEGORIES;
  if (!data.managerPin) patch.managerPin = DEFAULT_MANAGER_PIN;
  if (Object.keys(patch).length) await ref.update(patch);
}

function listenConfig() {
  db.collection("config").doc("menuSettings").onSnapshot((snap) => {
    if (snap.exists) {
      const data = snap.data();
      const pick = (arr, fallback) => (Array.isArray(arr) && arr.length ? arr : fallback.slice());
      state.sections.ddr = pick(data.categories, DEFAULT_CATEGORIES);
      state.sections.buffet = pick(data.buffetStations, DEFAULT_BUFFET_STATIONS);
      state.sections.canape = pick(data.canapeCategories, DEFAULT_CANAPE_CATEGORIES);
      state.pin = data.pin || DEFAULT_PIN;
      state.managerPin = data.managerPin || DEFAULT_MANAGER_PIN;
    }
    refreshCurrentView();
  }, (err) => showStatus(connectionErrorMsg(err)));
}

function listenDishes(studioKey) {
  db.collection(STUDIOS[studioKey].collection).onSnapshot((snap) => {
    state.dishes[studioKey] = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.name || "").localeCompare(b.name || ""));
    updateSidebarCounts();
    if (state.view === studioKey) { renderPickerCatChips(studioKey); renderPickerList(studioKey); }
    if (state.view === "prep") renderPrepBody();
  }, (err) => showStatus(connectionErrorMsg(err)));
}

function listenMenus() {
  db.collection("menus").onSnapshot((snap) => {
    state.menus = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    updateSidebarCounts();
    if (state.view === "saved") renderSavedList();
    if (state.view === "approvals") renderApprovalsBody();
  }, (err) => showStatus(connectionErrorMsg(err)));
}

function listenStationBlocks() {
  db.collection("buffetStationBlocks").onSnapshot((snap) => {
    state.stationBlocks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.station || "").localeCompare(b.station || "") || (a.source || "").localeCompare(b.source || ""));
    if (state.view === "buffet") renderPickerList("buffet");
  }, (err) => showStatus(connectionErrorMsg(err)));
}

function listenArchive() {
  db.collection("menuArchive").onSnapshot((snap) => {
    state.archive = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.approvedAt || 0) - (a.approvedAt || 0));
    updateSidebarCounts();
    if (state.view === "approvals") renderApprovalsBody();
  }, (err) => showStatus(connectionErrorMsg(err)));
}

function listenPrepVault() {
  db.collection("prepVault").onSnapshot((snap) => {
    state.prepVault = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    updateSidebarCounts();
    if (state.view === "prep") renderPrepBody();
  }, (err) => showStatus(connectionErrorMsg(err)));
}

async function loadPriceBook() {
  try {
    const snap = await db.collection("priceBook").orderBy("name").get();
    state.priceBook = snap.docs.map((d) => d.data());
  } catch (err) {
    console.warn("Price book unavailable:", err.message);
  }
}

function updateSidebarCounts() {
  const total = STUDIO_KEYS.reduce((s, k) => s + state.dishes[k].length, 0);
  const el = document.getElementById("sb-dish-total");
  if (el) el.textContent = total;
  const prepEl = document.getElementById("sb-prep-count");
  if (prepEl) prepEl.textContent = state.prepVault.length || "";
  const savedEl = document.getElementById("sb-saved-count");
  if (savedEl) savedEl.textContent = state.menus.length || "";
  const apprEl = document.getElementById("sb-approvals-count");
  if (apprEl) {
    const n = pendingMenus().length;
    apprEl.textContent = n || "";
    apprEl.classList.toggle("sb-count-alert", n > 0);
  }
  const roleEl = document.getElementById("sb-role");
  if (roleEl) roleEl.textContent = state.role ? roleLabel() : "";
}

function refreshCurrentView() {
  if (STUDIOS[state.view]) {
    renderPickerCatChips(state.view);
    renderPickerList(state.view);
  } else if (state.view === "prep") renderPrepBody();
  else if (state.view === "saved") renderSavedList();
  else if (state.view === "approvals") renderApprovalsBody();
}

/* ============================== Gate ============================== */
function showGate() {
  document.getElementById("gate-screen").classList.remove("hidden");
  document.getElementById("app-shell").classList.add("hidden");
}
function handleUnlock() {
  const val = document.getElementById("gate-pin").value.trim();
  // The manager code is checked first, so setting both to the same value gives
  // everyone the higher role rather than silently locking approvals away.
  const role = val && val === state.managerPin ? "manager" : (val && val === state.pin ? "staff" : null);
  if (!role) {
    document.getElementById("gate-error").textContent = "That code isn't right.";
    return;
  }
  state.role = role;
  localStorage.setItem("menuette-unlocked", "1");
  localStorage.setItem("menuette-role", role);
  document.getElementById("gate-error").textContent = "";
  enterApp();
}
function enterApp() {
  document.getElementById("gate-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  document.getElementById("app-shell").classList.toggle("is-manager", isManager());
  updateSidebarCounts();
  switchView(state.view);
}
function lockApp() {
  localStorage.removeItem("menuette-unlocked");
  localStorage.removeItem("menuette-role");
  state.role = null;
  document.getElementById("gate-pin").value = "";
  showGate();
}

/* ============================== Navigation ============================== */
const ALL_VIEWS = [...STUDIO_KEYS, "prep", "approvals", "saved", "import"];

function switchView(view) {
  state.view = view;
  updateSidebarCounts();
  document.querySelectorAll(".sb-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  ALL_VIEWS.forEach((v) => {
    const el = document.getElementById("view-" + v);
    if (el) el.classList.toggle("hidden", v !== view);
  });
  if (STUDIOS[view]) renderStudioShell(view);
  else if (view === "prep") renderPrepShell();
  else if (view === "approvals") renderApprovalsShell();
  else if (view === "saved") renderSavedShell();
  else if (view === "import") renderImportShell();
}

/* ============================== Modal ============================== */
function openModal(html, opts) {
  const card = document.getElementById("modal-card");
  card.innerHTML = `<button class="modal-close" data-action="close-modal" aria-label="Close">✕</button>${html}`;
  card.classList.toggle("modal-wide", !!(opts && opts.wide));
  card.scrollTop = 0;
  document.getElementById("modal-backdrop").classList.remove("hidden");
}
function closeModal() { document.getElementById("modal-backdrop").classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="close-modal"]')) closeModal();
});

/* ============================== Shared: section (category) manager ==============================
   One manager for all three studios — DDR calls them courses, Buffet calls
   them stations, Canapé calls them groups, but the mechanics are identical:
   reorder, rename (cascading the rename onto that studio's dishes), remove. */
function openSectionManager(studioKey) {
  const st = studioOf(studioKey);
  const pending = sectionsOf(studioKey).slice();
  const renames = [];

  openModal(`
    <h3>Manage ${escapeHtml(st.sectionsNoun)}s</h3>
    <p class="hint-text" style="margin-top:0;">Sections group ${escapeHtml(st.plural)} on the page, in this order. Renaming one also renames it on every ${escapeHtml(st.short)} dish that uses it.</p>
    <div id="sec-mgr-list"></div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <input id="sec-mgr-new" class="field" placeholder="New ${escapeHtml(st.sectionsNoun.toLowerCase())} name" style="margin-bottom:0;">
      <button id="sec-mgr-add" class="btn btn-outline">＋ Add</button>
    </div>
    <button id="sec-mgr-save" class="btn btn-primary btn-block" style="margin-top:16px;">Save ${escapeHtml(st.sectionsNoun.toLowerCase())}s</button>
  `);

  function renderList() {
    document.getElementById("sec-mgr-list").innerHTML = pending.map((c, i) => `
      <div class="modal-row">
        <input class="field" style="margin:0;flex:1;" data-idx="${i}" value="${escapeHtml(c)}">
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm" data-move="up" data-idx="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn btn-ghost btn-sm" data-move="down" data-idx="${i}" ${i === pending.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn btn-danger btn-sm" data-remove="${i}">✕</button>
        </div>
      </div>
    `).join("");
    document.querySelectorAll("#sec-mgr-list input[data-idx]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const idx = Number(inp.dataset.idx);
        const oldName = pending[idx];
        const newName = inp.value.trim();
        if (newName && newName !== oldName) {
          renames.push({ from: oldName, to: newName });
          pending[idx] = newName;
        }
      });
    });
    document.querySelectorAll("#sec-mgr-list [data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const swapIdx = idx + (btn.dataset.move === "up" ? -1 : 1);
        [pending[idx], pending[swapIdx]] = [pending[swapIdx], pending[idx]];
        renderList();
      });
    });
    document.querySelectorAll("#sec-mgr-list [data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => { pending.splice(Number(btn.dataset.remove), 1); renderList(); });
    });
  }
  renderList();

  document.getElementById("sec-mgr-add").addEventListener("click", () => {
    const input = document.getElementById("sec-mgr-new");
    const val = input.value.trim();
    if (val && !pending.some((c) => c.toLowerCase() === val.toLowerCase())) {
      pending.push(val);
      input.value = "";
      renderList();
    }
  });

  document.getElementById("sec-mgr-save").addEventListener("click", async () => {
    const btn = document.getElementById("sec-mgr-save");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await db.collection("config").doc("menuSettings").update({ [st.sectionsField]: pending });
      for (const r of renames) {
        if (r.from === r.to) continue;
        const affected = dishesOf(studioKey).filter((d) => d.category === r.from);
        if (!affected.length) continue;
        const batch = db.batch();
        affected.forEach((d) => batch.update(db.collection(st.collection).doc(d.id), { category: r.to }));
        await batch.commit();
      }
      closeModal();
      toast(`${st.sectionsNoun}s saved.`);
    } catch (err) {
      btn.disabled = false; btn.textContent = `Save ${st.sectionsNoun.toLowerCase()}s`;
      toast("Couldn't save: " + err.message, "error");
    }
  });
}
