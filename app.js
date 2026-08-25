/* global firebase, FIREBASE_CONFIG, DEFAULT_CATEGORIES, DEFAULT_PIN, mammoth, pdfjsLib, docx */

/* ============================== Firebase ============================== */
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

const CURRENCY = "AED";

/* ============================== ME Dubai page measurements ==============================
   Keep these in sync with the .menu-page rules in style.css — both the live
   preview and the .docx export are built from these same numbers so what you
   see on screen is exactly what you get in both exported files. */
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

/* ============================== State ============================== */
const state = {
  categories: DEFAULT_CATEGORIES.slice(),
  pin: DEFAULT_PIN,
  dishes: [],
  menus: [],
  priceBook: [],
  canapeDishes: [],
  buffetMenus: [],
  view: "vault",
  vaultSearch: "",
  vaultCatFilter: "all",
  prepSearch: "",
  buffetEditingId: null,
  buffetDraft: null,
  buffetActiveDay: 0,
  canapeSearch: "",
  builder: {
    pickerSearch: "",
    pickerCatFilter: "all",
    canvas: [],
    titleText: "MENU",
    alignment: "center",
    uppercase: false,
    italics: false,
    filename: "",
    activeMenuId: null,
    sectionLabels: {},
    sectionOrder: [],
  },
  importReview: [],
};

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
function toTitleCase(s) {
  return String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function groupByCategory(items, order) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.category || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  const groups = [];
  order.forEach((cat) => {
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
  // configured — so images are embedded as compressed data URIs directly on
  // the document. Resizing client-side keeps every photo well under that cap.
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
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ============================== Status banner ============================== */
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

/* ============================== Boot ============================== */
document.addEventListener("DOMContentLoaded", () => {
  showStatus("Connecting to the menu database…", "info");
  ensureConfigDoc().then(() => {
    hideStatus();
    listenConfig();
    listenDishes();
    listenMenus();
    listenCanapeDishes();
    listenBuffetMenus();
    loadPriceBook();
    if (localStorage.getItem("menuette-unlocked") === "1") enterApp(); else showGate();
  }).catch((err) => {
    showStatus(connectionErrorMsg(err));
    showGate();
  });

  document.getElementById("gate-unlock-btn").addEventListener("click", handleUnlock);
  document.getElementById("gate-pin").addEventListener("keydown", (e) => { if (e.key === "Enter") handleUnlock(); });
  document.getElementById("lock-btn").addEventListener("click", lockApp);
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
});

async function ensureConfigDoc() {
  const ref = db.collection("config").doc("menuSettings");
  const snap = await ref.get();
  if (!snap.exists) await ref.set({ categories: DEFAULT_CATEGORIES, pin: DEFAULT_PIN });
}
function listenConfig() {
  db.collection("config").doc("menuSettings").onSnapshot((snap) => {
    if (snap.exists) {
      const data = snap.data();
      state.categories = (data.categories && data.categories.length) ? data.categories : DEFAULT_CATEGORIES.slice();
      state.pin = data.pin || DEFAULT_PIN;
    }
    refreshCurrentView();
  }, (err) => showStatus(connectionErrorMsg(err)));
}
function listenDishes() {
  db.collection("dishes").onSnapshot((snap) => {
    state.dishes = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.name || "").localeCompare(b.name || ""));
    document.getElementById("dish-count-pill").textContent = `${state.dishes.length} dish${state.dishes.length === 1 ? "" : "es"}`;
    refreshCurrentView();
  }, (err) => showStatus(connectionErrorMsg(err)));
}
function listenMenus() {
  db.collection("menus").onSnapshot((snap) => {
    state.menus = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (state.view === "saved") renderSavedList();
  }, (err) => showStatus(connectionErrorMsg(err)));
}
function listenCanapeDishes() {
  db.collection("canapeDishes").onSnapshot((snap) => {
    state.canapeDishes = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (state.view === "canape") { renderCanapeGrid(); renderCanapePreview(); }
    if (state.view === "prep") renderPrepVaultList();
  }, (err) => showStatus(connectionErrorMsg(err)));
}
function listenBuffetMenus() {
  db.collection("buffetMenus").onSnapshot((snap) => {
    state.buffetMenus = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (state.view === "buffet") renderBuffetShell();
  }, (err) => showStatus(connectionErrorMsg(err)));
}
async function loadPriceBook() {
  try {
    const snap = await db.collection("priceBook").orderBy("name").get();
    state.priceBook = snap.docs.map((d) => d.data());
    const dl = document.getElementById("ingredient-namelist");
    if (dl) dl.innerHTML = state.priceBook.map((p) => `<option value="${escapeHtml(p.name)}">`).join("");
  } catch (err) {
    console.warn("Price book unavailable:", err.message);
  }
}
function ingredientsTotal(ingredients) {
  return (ingredients || []).reduce((sum, ing) => sum + (Number(ing.qty) || 0) * (Number(ing.unitPrice) || 0), 0);
}
function refreshCurrentView() {
  if (state.view === "vault") { renderVaultCatChips(); renderVaultList(); }
  else if (state.view === "builder") { renderPickerCatChips(); renderPickerList(); }
  else if (state.view === "saved") renderSavedList();
  else if (state.view === "prep") renderPrepVaultList();
}

/* ============================== Gate ============================== */
function showGate() {
  document.getElementById("gate-screen").classList.remove("hidden");
  document.getElementById("app-shell").classList.add("hidden");
}
function handleUnlock() {
  const val = document.getElementById("gate-pin").value.trim();
  if (val && val === state.pin) {
    localStorage.setItem("menuette-unlocked", "1");
    document.getElementById("gate-error").textContent = "";
    enterApp();
  } else {
    document.getElementById("gate-error").textContent = "Incorrect access code.";
  }
}
function enterApp() {
  document.getElementById("gate-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  switchView(state.view);
}
function lockApp() {
  localStorage.removeItem("menuette-unlocked");
  location.reload();
}

/* ============================== Navigation ============================== */
function switchView(view) {
  state.view = view;
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  ["vault", "builder", "saved", "import", "prep", "buffet", "canape"].forEach((v) => {
    document.getElementById("view-" + v).classList.toggle("hidden", v !== view);
  });
  if (view === "vault") renderVaultShell();
  if (view === "builder") renderBuilderShell();
  if (view === "saved") renderSavedShell();
  if (view === "import") renderImportShell();
  if (view === "prep") renderPrepVaultShell();
  if (view === "buffet") renderBuffetShell();
  if (view === "canape") renderCanapeShell();
}

/* ============================== Modal ============================== */
function openModal(html, opts) {
  const card = document.getElementById("modal-card");
  card.innerHTML = `<button class="modal-close" data-action="close-modal">✕</button>${html}`;
  card.classList.toggle("modal-wide", !!(opts && opts.wide));
  document.getElementById("modal-backdrop").classList.remove("hidden");
}
function closeModal() { document.getElementById("modal-backdrop").classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (e.target.closest('[data-action="close-modal"]')) closeModal();
});

/* ==========================================================================
   DISH VAULT
   ========================================================================== */
function renderVaultShell() {
  const el = document.getElementById("view-vault");
  el.innerHTML = `
    <div class="header-row">
      <h2>Dish Vault</h2>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" data-action="manage-categories">＋ Manage categories</button>
        <button class="btn btn-primary btn-sm" data-action="open-add-dish">＋ Add Dish</button>
      </div>
    </div>
    <input id="vault-search" class="field" placeholder="🔍 Search dishes, categories, allergens…" value="${escapeHtml(state.vaultSearch)}">
    <div id="vault-cats" class="cat-row"></div>
    <div id="vault-list"></div>
  `;
  document.getElementById("vault-search").addEventListener("input", (e) => {
    state.vaultSearch = e.target.value;
    renderVaultList();
  });
  el.querySelector('[data-action="manage-categories"]').addEventListener("click", openCategoryManager);
  el.querySelector('[data-action="open-add-dish"]').addEventListener("click", () => openDishModal(null));
  renderVaultCatChips();
  renderVaultList();
}
function renderVaultCatChips() {
  const wrap = document.getElementById("vault-cats");
  let html = `<button class="cat-chip ${state.vaultCatFilter === "all" ? "active" : ""}" data-cat="all">All</button>`;
  state.categories.forEach((c) => {
    html += `<button class="cat-chip ${state.vaultCatFilter === c ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll(".cat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.vaultCatFilter = btn.dataset.cat;
      renderVaultCatChips();
      renderVaultList();
    });
  });
}
function renderVaultList() {
  const listEl = document.getElementById("vault-list");
  if (!listEl) return;
  const q = state.vaultSearch.trim().toLowerCase();
  let rows = state.dishes;
  if (state.vaultCatFilter !== "all") rows = rows.filter((d) => d.category === state.vaultCatFilter);
  if (q) {
    rows = rows.filter((d) =>
      [d.name, d.category, d.description, d.allergens].some((f) => String(f || "").toLowerCase().includes(q))
    );
  }
  if (!rows.length) {
    listEl.innerHTML = `<div class="hint-text" style="text-align:center;padding:30px;">No dishes found. Add one above, or import an existing menu from the 📥 Import Menu tab.</div>`;
    return;
  }
  listEl.innerHTML = rows.map((d) => `
    <div class="card dish-card">
      <div>
        <div class="dish-name">${escapeHtml(d.name)} <span class="badge">${escapeHtml(d.category)}</span></div>
        ${d.description ? `<div class="dish-desc">${escapeHtml(d.description)}</div>` : ""}
        ${d.allergens ? `<div class="dish-meta">Allergens: ${escapeHtml(d.allergens)}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div class="dish-cost">${formatCurrency(d.cost)}</div>
        <div class="dish-meta">${(d.ingredients || []).length} ingredient${(d.ingredients || []).length === 1 ? "" : "s"}</div>
        ${(d.prepItems || []).length ? `<div class="dish-meta">🧾 ${d.prepItems.length} prep item${d.prepItems.length === 1 ? "" : "s"}</div>` : ""}
        <div style="margin-top:8px;display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" data-action="edit-dish" data-id="${d.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-action="delete-dish" data-id="${d.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join("");
  listEl.querySelectorAll('[data-action="edit-dish"]').forEach((btn) => {
    btn.addEventListener("click", () => openDishModal(state.dishes.find((d) => d.id === btn.dataset.id)));
  });
  listEl.querySelectorAll('[data-action="delete-dish"]').forEach((btn) => {
    btn.addEventListener("click", () => deleteDish(btn.dataset.id));
  });
}

function openDishModal(dish, opts) {
  const collection = (opts && opts.collection) || "dishes";
  const isCanape = collection === "canapeDishes";
  const isEdit = !!dish;
  const d = dish || { name: "", category: state.categories[0] || "", description: "", allergens: "", cost: 0, prepItems: [], imageBase64: "" };
  // Dishes migrated before the ingredient editor existed only have a flat
  // `cost` number — seed one row from it so nothing is lost, and the user
  // can break it down into real ingredients whenever they're ready.
  const pendingIngredients = (d.ingredients && d.ingredients.length)
    ? d.ingredients.map((i) => ({ ...i }))
    : (d.cost ? [{ name: "(previous flat estimate)", qty: 1, unit: "portion", unitPrice: d.cost }] : []);
  const pendingPrepItems = (d.prepItems || []).slice();
  let pendingImage = d.imageBase64 || "";

  openModal(`
    <h3>${isEdit ? "Edit" : "Add"} ${isCanape ? "Canapé" : "Dish"}</h3>
    ${isCanape ? `
      <div class="section-title" style="margin-top:0;">Photo</div>
      <div id="dm-image-preview"></div>
      <input type="file" id="dm-image-file" accept="image/*" class="field">
    ` : ""}
    <input id="dm-name" class="field" placeholder="${isCanape ? "Canapé" : "Dish"} name" value="${escapeHtml(d.name)}">
    ${isCanape ? "" : `
      <div class="section-title" style="margin-top:0;">Category</div>
      <div id="dm-cats" class="cat-row"></div>
    `}
    <textarea id="dm-desc" class="field" placeholder="Description" rows="3">${escapeHtml(d.description)}</textarea>
    <input id="dm-allergens" class="field" placeholder="Allergens (e.g. Dairy, Gluten, Nuts)" value="${escapeHtml(d.allergens)}">

    <div class="section-title">Ingredients &amp; Cost</div>
    <div id="dm-ingredients"></div>
    <button type="button" id="dm-add-ingredient" class="btn btn-outline btn-sm">＋ Add Ingredient</button>
    <div class="cost-bar" style="margin-top:10px;">
      <span>Total dish cost</span>
      <span class="total" id="dm-total-cost">${formatCurrency(ingredientsTotal(pendingIngredients))}</span>
    </div>

    <div class="section-title">Prep List <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);">(optional)</span></div>
    <div id="dm-prep-items"></div>
    <button type="button" id="dm-add-prep" class="btn btn-outline btn-sm">＋ Add Prep Item</button>

    <button id="dm-save" class="btn btn-primary btn-block" style="margin-top:14px;">💾 Save ${isCanape ? "Canapé" : "Dish"}</button>
  `, { wide: true });

  let chosenCat = d.category;
  if (!isCanape) {
    const catsWrap = document.getElementById("dm-cats");
    function renderCatChips() {
      catsWrap.innerHTML = state.categories.map((c) =>
        `<button type="button" class="cat-chip ${c === chosenCat ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
      ).join("");
      catsWrap.querySelectorAll(".cat-chip").forEach((btn) => {
        btn.addEventListener("click", () => { chosenCat = btn.dataset.cat; renderCatChips(); });
      });
    }
    renderCatChips();
  }

  if (isCanape) {
    const previewEl = document.getElementById("dm-image-preview");
    function renderImagePreview() {
      previewEl.innerHTML = pendingImage
        ? `<div style="position:relative;display:inline-block;">
             <img src="${pendingImage}" style="width:160px;height:120px;object-fit:cover;border-radius:10px;border:1px solid var(--border);">
             <button type="button" id="dm-image-remove" class="btn btn-danger btn-sm" style="position:absolute;top:4px;right:4px;">✕</button>
           </div>`
        : `<div class="hint-text" style="margin-top:0;">No photo yet — choose a file below.</div>`;
      const removeBtn = document.getElementById("dm-image-remove");
      if (removeBtn) removeBtn.addEventListener("click", () => { pendingImage = ""; renderImagePreview(); });
    }
    renderImagePreview();
    document.getElementById("dm-image-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        pendingImage = await resizeImageFile(file, 600, 0.72);
        renderImagePreview();
      } catch (err) {
        alert("Couldn't read that image: " + err.message);
      }
    });
  }

  const UNITS = ["kg", "g", "L", "ml", "unit", "portion"];
  function renderIngredientRows() {
    const wrap = document.getElementById("dm-ingredients");
    wrap.innerHTML = pendingIngredients.map((ing, i) => `
      <div class="ingredient-row" data-idx="${i}">
        <div class="ing-name-wrap">
          <input class="field ing-name" placeholder="Search your price list…" autocomplete="off" data-field="name" value="${escapeHtml(ing.name)}">
          <div class="ing-search-results hidden" data-idx="${i}"></div>
        </div>
        <div class="ing-controls-row">
          <input class="field ing-qty" type="number" step="0.001" min="0" placeholder="Qty" data-field="qty" value="${ing.qty}">
          <select class="field ing-unit" data-field="unit">
            ${UNITS.map((u) => `<option value="${u}" ${ing.unit === u ? "selected" : ""}>${u}</option>`).join("")}
          </select>
          <input class="field ing-price" type="number" step="0.01" min="0" placeholder="Price/unit" data-field="unitPrice" value="${ing.unitPrice}">
          <span class="ing-total">${formatCurrency((Number(ing.qty) || 0) * (Number(ing.unitPrice) || 0))}</span>
          <button type="button" class="btn btn-danger btn-sm ing-remove-btn" data-remove-ing="${i}">✕</button>
        </div>
      </div>
    `).join("");

    wrap.querySelectorAll(".ingredient-row").forEach((row) => {
      const idx = Number(row.dataset.idx);
      row.querySelectorAll("[data-field]").forEach((input) => {
        if (input.dataset.field === "name") return; // wired separately below
        input.addEventListener("input", () => {
          pendingIngredients[idx][input.dataset.field] = input.value;
          updateTotals();
        });
      });

      const nameInput = row.querySelector(".ing-name");
      const resultsEl = row.querySelector(".ing-search-results");
      nameInput.addEventListener("input", () => {
        pendingIngredients[idx].name = nameInput.value;
        showIngredientSearch(idx);
      });
      nameInput.addEventListener("focus", () => showIngredientSearch(idx));
      nameInput.addEventListener("blur", () => {
        setTimeout(() => resultsEl.classList.add("hidden"), 150);
      });
      resultsEl.addEventListener("mousedown", (e) => {
        const item = e.target.closest(".ing-result-item");
        if (!item) return;
        e.preventDefault();
        pendingIngredients[idx].name = item.dataset.name;
        pendingIngredients[idx].unit = item.dataset.unit;
        pendingIngredients[idx].unitPrice = Number(item.dataset.price);
        renderIngredientRows();
      });
    });
    wrap.querySelectorAll("[data-remove-ing]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pendingIngredients.splice(Number(btn.dataset.removeIng), 1);
        renderIngredientRows();
      });
    });
    updateTotals();
  }
  function showIngredientSearch(idx) {
    const resultsEl = document.querySelector(`.ing-search-results[data-idx="${idx}"]`);
    if (!resultsEl) return;
    const query = (pendingIngredients[idx].name || "").trim().toLowerCase();
    const matches = query ? state.priceBook.filter((p) => p.name.toLowerCase().includes(query)) : state.priceBook;
    const shown = matches.slice(0, 60);
    let html = shown.length
      ? shown.map((p) => `
          <div class="ing-result-item" data-name="${escapeHtml(p.name)}" data-unit="${escapeHtml(p.unit)}" data-price="${p.unitPrice}">
            <span class="ing-result-name">${escapeHtml(p.name)}</span>
            <span class="ing-result-meta">${escapeHtml(p.unit)} · ${formatCurrency(p.unitPrice)}</span>
          </div>
        `).join("")
      : `<div class="ing-search-empty">No match in your price list — you can still type a custom ingredient and price below.</div>`;
    if (matches.length > shown.length) {
      html += `<div class="ing-search-empty">+${matches.length - shown.length} more — keep typing to narrow it down</div>`;
    }
    resultsEl.innerHTML = html;
    resultsEl.classList.remove("hidden");
  }
  function updateTotals() {
    document.querySelectorAll("#dm-ingredients .ingredient-row").forEach((row, i) => {
      const ing = pendingIngredients[i];
      row.querySelector(".ing-total").textContent = formatCurrency((Number(ing.qty) || 0) * (Number(ing.unitPrice) || 0));
    });
    document.getElementById("dm-total-cost").textContent = formatCurrency(ingredientsTotal(pendingIngredients));
  }
  renderIngredientRows();

  document.getElementById("dm-add-ingredient").addEventListener("click", () => {
    pendingIngredients.push({ name: "", qty: 1, unit: "kg", unitPrice: 0 });
    renderIngredientRows();
    const rows = document.querySelectorAll("#dm-ingredients .ing-name");
    if (rows.length) rows[rows.length - 1].focus();
  });

  function renderPrepItemRows() {
    const wrap = document.getElementById("dm-prep-items");
    if (!pendingPrepItems.length) {
      wrap.innerHTML = `<div class="hint-text" style="margin:0 0 8px;">No prep items — this dish's prep list stays empty unless you add some.</div>`;
    } else {
      wrap.innerHTML = pendingPrepItems.map((item, i) => `
        <div class="modal-row" data-idx="${i}">
          <input class="field" style="margin:0;flex:1;" data-field="prep" value="${escapeHtml(item)}" placeholder="Prep item">
          <button type="button" class="btn btn-danger btn-sm" data-remove-prep="${i}">✕</button>
        </div>
      `).join("");
    }
    wrap.querySelectorAll("[data-field=\"prep\"]").forEach((input, i) => {
      input.addEventListener("input", () => { pendingPrepItems[i] = input.value; });
    });
    wrap.querySelectorAll("[data-remove-prep]").forEach((btn) => {
      btn.addEventListener("click", () => { pendingPrepItems.splice(Number(btn.dataset.removePrep), 1); renderPrepItemRows(); });
    });
  }
  renderPrepItemRows();
  document.getElementById("dm-add-prep").addEventListener("click", () => {
    pendingPrepItems.push("");
    renderPrepItemRows();
    const rows = document.querySelectorAll("#dm-prep-items [data-field=\"prep\"]");
    if (rows.length) rows[rows.length - 1].focus();
  });

  document.getElementById("dm-save").addEventListener("click", async () => {
    const name = document.getElementById("dm-name").value.trim();
    if (!name) { document.getElementById("dm-name").focus(); return; }
    const cleanIngredients = pendingIngredients
      .filter((ing) => ing.name && ing.name.trim())
      .map((ing) => ({ name: ing.name.trim(), qty: Number(ing.qty) || 0, unit: ing.unit || "unit", unitPrice: Number(ing.unitPrice) || 0 }));
    const cleanPrepItems = pendingPrepItems.map((p) => p.trim()).filter(Boolean);
    const payload = {
      name,
      description: document.getElementById("dm-desc").value.trim(),
      allergens: document.getElementById("dm-allergens").value.trim(),
      ingredients: cleanIngredients,
      cost: Math.round(ingredientsTotal(cleanIngredients) * 100) / 100,
      prepItems: cleanPrepItems,
    };
    if (isCanape) payload.imageBase64 = pendingImage;
    else payload.category = chosenCat || "Uncategorized";
    if (isEdit) await db.collection(collection).doc(dish.id).update(payload);
    else await db.collection(collection).add(payload);
    closeModal();
  });
}
async function deleteDish(id) {
  if (!confirm("Delete this dish? This cannot be undone.")) return;
  await db.collection("dishes").doc(id).delete();
}

/* ---------------- Category manager ---------------- */
function openCategoryManager() {
  const pending = state.categories.slice();
  const renames = [];
  openModal(`<h3>Manage Categories</h3><div id="cat-mgr-list"></div>
    <div style="display:flex;gap:8px;margin-top:10px;">
      <input id="cat-mgr-new" class="field" placeholder="New category name" style="margin-bottom:0;">
      <button id="cat-mgr-add" class="btn btn-outline">＋ Add</button>
    </div>
    <button id="cat-mgr-save" class="btn btn-primary btn-block" style="margin-top:14px;">💾 Save Categories</button>`);

  function renderList() {
    document.getElementById("cat-mgr-list").innerHTML = pending.map((c, i) => `
      <div class="modal-row">
        <input class="field" style="margin:0;flex:1;" data-idx="${i}" value="${escapeHtml(c)}">
        <div style="display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm" data-move="up" data-idx="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="btn btn-ghost btn-sm" data-move="down" data-idx="${i}" ${i === pending.length - 1 ? "disabled" : ""}>↓</button>
          <button class="btn btn-danger btn-sm" data-remove="${i}">✕</button>
        </div>
      </div>
    `).join("");
    document.querySelectorAll("#cat-mgr-list input[data-idx]").forEach((inp) => {
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
    document.querySelectorAll("#cat-mgr-list [data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        const dir = btn.dataset.move === "up" ? -1 : 1;
        const swapIdx = idx + dir;
        [pending[idx], pending[swapIdx]] = [pending[swapIdx], pending[idx]];
        renderList();
      });
    });
    document.querySelectorAll("#cat-mgr-list [data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pending.splice(Number(btn.dataset.remove), 1);
        renderList();
      });
    });
  }
  renderList();

  document.getElementById("cat-mgr-add").addEventListener("click", () => {
    const val = document.getElementById("cat-mgr-new").value.trim();
    if (val && !pending.some((c) => c.toLowerCase() === val.toLowerCase())) {
      pending.push(val);
      document.getElementById("cat-mgr-new").value = "";
      renderList();
    }
  });

  document.getElementById("cat-mgr-save").addEventListener("click", async () => {
    await db.collection("config").doc("menuSettings").update({ categories: pending });
    for (const r of renames) {
      if (r.from === r.to) continue;
      const affected = state.dishes.filter((d) => d.category === r.from);
      if (!affected.length) continue;
      const batch = db.batch();
      affected.forEach((d) => batch.update(db.collection("dishes").doc(d.id), { category: r.to }));
      await batch.commit();
    }
    closeModal();
  });
}

/* ==========================================================================
   MENU BUILDER
   ========================================================================== */
function renderBuilderShell() {
  const el = document.getElementById("view-builder");
  const b = state.builder;
  el.innerHTML = `
    <h2>Menu Builder</h2>
    <div class="two-col">
      <div>
        <div class="section-title">1. Pick Dishes</div>
        <input id="picker-search" class="field" placeholder="🔍 Filter dishes…" value="${escapeHtml(b.pickerSearch)}">
        <div id="picker-cats" class="cat-row"></div>
        <div id="picker-list"></div>
      </div>
      <div>
        <div class="section-title">2. Canvas</div>
        <div id="canvas-list"></div>
        <div id="cost-bar-wrap"></div>

        <div class="section-title">3. Export Settings</div>
        <input id="b-title" class="field" placeholder="Menu title" value="${escapeHtml(b.titleText)}">
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
          <label><input type="radio" name="b-align" value="center" ${b.alignment === "center" ? "checked" : ""}> Center</label>
          <label><input type="radio" name="b-align" value="left" ${b.alignment === "left" ? "checked" : ""}> Left</label>
          <label><input type="checkbox" id="b-upper" ${b.uppercase ? "checked" : ""}> UPPERCASE names</label>
          <label><input type="checkbox" id="b-italic" ${b.italics ? "checked" : ""}> Italicise descriptions</label>
        </div>
        <input id="b-filename" class="field" placeholder="File name (without extension)" value="${escapeHtml(b.filename)}">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          <button id="b-save" class="btn btn-outline">💾 Save Menu</button>
          <button id="b-export-docx" class="btn btn-primary">📄 Export Word (.docx)</button>
          <button id="b-export-pdf" class="btn btn-primary">📕 Export PDF</button>
          <button id="b-print" class="btn btn-ghost">🖨️ Print</button>
          <button id="b-prep-list" class="btn btn-ghost">🧾 Generate Prep List</button>
        </div>

        <div class="section-title">Live Preview</div>
        <div id="preview-wrap" class="menu-page-wrap"></div>
      </div>
    </div>
  `;

  document.getElementById("picker-search").addEventListener("input", (e) => { b.pickerSearch = e.target.value; renderPickerList(); });
  document.getElementById("b-title").addEventListener("input", (e) => { b.titleText = e.target.value; renderCanvasAndPreview(); });
  document.getElementById("b-filename").addEventListener("input", (e) => { b.filename = e.target.value; });
  document.querySelectorAll('input[name="b-align"]').forEach((r) => r.addEventListener("change", (e) => { b.alignment = e.target.value; renderCanvasAndPreview(); }));
  document.getElementById("b-upper").addEventListener("change", (e) => { b.uppercase = e.target.checked; renderCanvasAndPreview(); });
  document.getElementById("b-italic").addEventListener("change", (e) => { b.italics = e.target.checked; renderCanvasAndPreview(); });
  document.getElementById("b-save").addEventListener("click", saveCurrentMenu);
  document.getElementById("b-export-docx").addEventListener("click", exportDocx);
  document.getElementById("b-export-pdf").addEventListener("click", exportPdf);
  document.getElementById("b-print").addEventListener("click", printMenu);
  document.getElementById("b-prep-list").addEventListener("click", openPrepListModal);

  const previewEl = document.getElementById("preview-wrap");
  previewEl.addEventListener("input", handlePreviewInput);
  previewEl.addEventListener("focusout", handlePreviewFocusOut);
  previewEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches && e.target.matches('[contenteditable="true"]')) {
      e.preventDefault();
      e.target.blur();
    }
  });
  previewEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-move-section]");
    if (!btn) return;
    moveSection(btn.dataset.category, btn.dataset.moveSection === "up" ? -1 : 1);
  });

  renderPickerCatChips();
  renderPickerList();
  renderCanvasAndPreview();
}
function renderPickerCatChips() {
  const wrap = document.getElementById("picker-cats");
  let html = `<button class="cat-chip ${state.builder.pickerCatFilter === "all" ? "active" : ""}" data-cat="all">All</button>`;
  state.categories.forEach((c) => {
    html += `<button class="cat-chip ${state.builder.pickerCatFilter === c ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll(".cat-chip").forEach((btn) => {
    btn.addEventListener("click", () => { state.builder.pickerCatFilter = btn.dataset.cat; renderPickerCatChips(); renderPickerList(); });
  });
}
function renderPickerList() {
  const listEl = document.getElementById("picker-list");
  if (!listEl) return;
  const b = state.builder;
  const q = b.pickerSearch.trim().toLowerCase();
  let rows = state.dishes;
  if (b.pickerCatFilter !== "all") rows = rows.filter((d) => d.category === b.pickerCatFilter);
  if (q) rows = rows.filter((d) => [d.name, d.category, d.description, d.allergens].some((f) => String(f || "").toLowerCase().includes(q)));
  const inCanvas = new Set(b.canvas.map((i) => i.dishId));
  if (!rows.length) { listEl.innerHTML = `<div class="hint-text" style="text-align:center;padding:20px;">No dishes match. Add some in 🗄️ Dish Vault.</div>`; return; }
  listEl.innerHTML = rows.map((d) => `
    <div class="card dish-card">
      <div>
        <div class="dish-name">${escapeHtml(d.name)} <span class="badge">${escapeHtml(d.category)}</span></div>
        ${d.description ? `<div class="dish-desc">${escapeHtml(d.description)}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div class="dish-cost">${formatCurrency(d.cost)}</div>
        <button class="btn btn-sm ${inCanvas.has(d.id) ? "btn-ghost" : "btn-primary"}" data-action="add-canvas" data-id="${d.id}" ${inCanvas.has(d.id) ? "disabled" : ""}>
          ${inCanvas.has(d.id) ? "✓ Added" : "＋ Add"}
        </button>
      </div>
    </div>
  `).join("");
  listEl.querySelectorAll('[data-action="add-canvas"]').forEach((btn) => {
    btn.addEventListener("click", () => addToCanvas(btn.dataset.id));
  });
}
function addToCanvas(dishId) {
  const d = state.dishes.find((x) => x.id === dishId);
  if (!d) return;
  if (state.builder.canvas.some((i) => i.dishId === dishId)) return;
  state.builder.canvas.push({ dishId: d.id, name: d.name, category: d.category, description: d.description, allergens: d.allergens, cost: d.cost, prepItems: (d.prepItems || []).slice() });
  renderPickerList();
  renderCanvasAndPreview();
}
function removeFromCanvas(index) {
  state.builder.canvas.splice(index, 1);
  renderPickerList();
  renderCanvasAndPreview();
}
function findSameCategoryNeighbor(arr, idx, dir) {
  // The preview groups dishes by category, so a plain adjacent-index swap is
  // often invisible (no effect) when the immediate neighbor is in a
  // different section. Skip past other categories to the nearest dish in
  // the SAME category, so every up/down click visibly reorders the preview.
  const cat = arr[idx].category;
  let i = idx + dir;
  while (i >= 0 && i < arr.length) {
    if (arr[i].category === cat) return i;
    i += dir;
  }
  return -1;
}
function moveCanvasItem(idx, dir) {
  const arr = state.builder.canvas;
  const swapIdx = findSameCategoryNeighbor(arr, idx, dir);
  if (swapIdx === -1) return;
  [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
  renderCanvasAndPreview();
}
function getSectionOrder() {
  const b = state.builder;
  if (b.sectionOrder && b.sectionOrder.length) return b.sectionOrder;
  // lazily derive the natural order (global category order, plus any
  // custom/leftover categories present on the canvas) the first time it's needed
  return groupByCategory(b.canvas, state.categories).map((g) => g.category);
}
function moveSection(category, dir) {
  const order = getSectionOrder().slice();
  const idx = order.indexOf(category);
  const swapIdx = idx + dir;
  if (idx === -1 || swapIdx < 0 || swapIdx >= order.length) return;
  [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
  state.builder.sectionOrder = order;
  renderCanvasAndPreview();
}
function syncCanvasSummary() {
  const canvasEl = document.getElementById("canvas-list");
  const costEl = document.getElementById("cost-bar-wrap");
  if (!canvasEl) return;
  const items = state.builder.canvas;

  if (!items.length) {
    canvasEl.innerHTML = `<div class="hint-text" style="text-align:center;padding:20px;">Click ＋ Add on any dish to build your menu.</div>`;
  } else {
    canvasEl.innerHTML = items.map((item, i) => `
      <div class="card dish-card">
        <div>
          <div class="dish-name">${escapeHtml(item.name)} <span class="badge">${escapeHtml(item.category)}</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <button class="btn btn-ghost btn-sm" data-move="up" data-idx="${i}" ${findSameCategoryNeighbor(items, i, -1) === -1 ? "disabled" : ""} style="padding:2px 8px;min-height:0;" title="Move up within its section">↑</button>
            <button class="btn btn-ghost btn-sm" data-move="down" data-idx="${i}" ${findSameCategoryNeighbor(items, i, 1) === -1 ? "disabled" : ""} style="padding:2px 8px;min-height:0;" title="Move down within its section">↓</button>
          </div>
          <div style="text-align:right;">
            <div class="dish-cost">${formatCurrency(item.cost)}</div>
            <button class="btn btn-danger btn-sm" data-remove="${i}">✕ Remove</button>
          </div>
        </div>
      </div>
    `).join("");
    canvasEl.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => removeFromCanvas(Number(btn.dataset.remove))));
    canvasEl.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => moveCanvasItem(Number(btn.dataset.idx), btn.dataset.move === "up" ? -1 : 1));
    });
  }

  const total = items.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  const byCat = {};
  items.forEach((i) => { byCat[i.category] = (byCat[i.category] || 0) + (Number(i.cost) || 0); });
  costEl.innerHTML = `
    <div class="cost-bar"><span>Total menu cost</span><span class="total">${formatCurrency(total)}</span></div>
    ${items.length ? `<div class="cost-breakdown">${Object.entries(byCat).map(([c, v]) => `${escapeHtml(c)}: ${formatCurrency(v)}`).join(" · ")}</div>` : ""}
  `;
}

function renderCanvasAndPreview() {
  syncCanvasSummary();
  const previewEl = document.getElementById("preview-wrap");
  if (!previewEl) return;
  previewEl.innerHTML = buildMenuPageHTML(state.builder.canvas, {
    alignment: state.builder.alignment,
    uppercase: state.builder.uppercase,
    italics: state.builder.italics,
    titleText: state.builder.titleText,
    sectionLabels: state.builder.sectionLabels,
    sectionOrder: getSectionOrder(),
  });
}

/* ---------------- Inline editing directly on the live preview ----------------
   Typing updates state.builder.canvas / titleText immediately (so Save/Export
   always see the latest text) but does NOT re-render the preview itself on
   every keystroke — that would destroy cursor position mid-type. The canvas
   card list and the external title field are resynced on focusout instead. */
function handlePreviewInput(e) {
  const el = e.target;
  if (!el.matches || !el.matches('[contenteditable="true"]')) return;
  const field = el.dataset.field;
  const text = el.textContent;
  if (field === "title") {
    state.builder.titleText = text;
  } else if (field === "section") {
    state.builder.sectionLabels[el.dataset.category] = text;
  } else if (el.dataset.idx !== undefined) {
    const idx = Number(el.dataset.idx);
    if (state.builder.canvas[idx]) state.builder.canvas[idx][field] = text;
  }
}
function handlePreviewFocusOut(e) {
  const el = e.target;
  if (!el.matches || !el.matches('[contenteditable="true"]')) return;
  const titleInput = document.getElementById("b-title");
  if (titleInput) titleInput.value = state.builder.titleText;
  syncCanvasSummary();
}

function buildMenuPageHTML(items, opts) {
  const alignClass = opts.alignment === "left" ? "align-left" : "align-center";
  const ucClass = opts.uppercase ? "uc" : "";
  const editable = opts.editable !== false;
  const ce = editable ? `contenteditable="true"` : "";
  let body;
  if (!items.length) {
    body = `<div class="menu-empty">Add dishes to see the menu preview.</div>`;
  } else {
    const groups = groupByCategory(items, opts.sectionOrder && opts.sectionOrder.length ? opts.sectionOrder : state.categories);
    const sectionLabels = opts.sectionLabels || {};
    body = groups.map((g, gi) => {
      const label = Object.prototype.hasOwnProperty.call(sectionLabels, g.category) ? sectionLabels[g.category] : g.category.toUpperCase();
      const dishesHtml = g.items.map((item) => {
        const idx = items.indexOf(item);
        return `<div class="menu-dish ${alignClass}">
          <span class="dname ${ucClass}" ${ce} data-idx="${idx}" data-field="name" data-placeholder="Dish name">${escapeHtml(item.name)}</span>
          <span class="dallergens" ${ce} data-idx="${idx}" data-field="allergens" data-placeholder="allergens">${escapeHtml(item.allergens)}</span>
          <span class="ddesc" ${ce} data-idx="${idx}" data-field="description" data-placeholder="Add a description…" style="${opts.italics ? "" : "font-style:normal;"}">${escapeHtml(item.description)}</span>
        </div>`;
      }).join("");
      const moveCol = editable ? `
        <div class="section-move-col">
          <button type="button" class="section-move-btn" data-move-section="up" data-category="${escapeHtml(g.category)}" ${gi === 0 ? "disabled" : ""} title="Move section up">▲</button>
          <button type="button" class="section-move-btn" data-move-section="down" data-category="${escapeHtml(g.category)}" ${gi === groups.length - 1 ? "disabled" : ""} title="Move section down">▼</button>
        </div>` : "";
      return `
      <div class="menu-section-row ${alignClass}">
        <div class="menu-section" ${ce} data-field="section" data-category="${escapeHtml(g.category)}" data-placeholder="(section name — click to restore)">${escapeHtml(label)}</div>
        ${moveCol}
      </div>
      ${dishesHtml}
    `;
    }).join("");
  }
  return `
    <div class="menu-page">
      <div class="border-strip"></div>
      <div class="brand-logo"></div>
      <div class="menu-content">
        <div class="menu-title ${alignClass} ${ucClass}" ${ce} data-field="title" data-placeholder="Menu title">${escapeHtml(opts.titleText || "")}</div>
        <div class="menu-title-rule ${alignClass}"></div>
        ${body}
      </div>
      <div class="allergen-legend">Allergens: D — Dairy &nbsp;·&nbsp; G — Gluten &nbsp;·&nbsp; S — Seafood</div>
    </div>
  `;
}

/* ---------------- Save menu ---------------- */
async function saveCurrentMenu() {
  const b = state.builder;
  if (!b.canvas.length) { alert("Add at least one dish before saving."); return; }
  const suggested = b.filename || b.titleText || "Untitled menu";
  const name = prompt("Name this menu:", suggested);
  if (!name) return;
  const total = b.canvas.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  const payload = {
    name, items: b.canvas, titleText: b.titleText, alignment: b.alignment,
    uppercase: b.uppercase, italics: b.italics, sectionLabels: b.sectionLabels || {},
    sectionOrder: getSectionOrder(), totalCost: total, updatedAt: Date.now(),
  };
  if (b.activeMenuId) await db.collection("menus").doc(b.activeMenuId).set(payload);
  else {
    const ref = await db.collection("menus").add(payload);
    b.activeMenuId = ref.id;
  }
  alert(`Saved "${name}".`);
}

/* ---------------- Export: Word (.docx) ---------------- */
async function exportDocx() {
  const b = state.builder;
  if (!b.canvas.length) { alert("Add at least one dish before exporting."); return; }
  const btn = document.getElementById("b-export-docx");
  btn.disabled = true; btn.textContent = "Building…";
  try {
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer, AlignmentType,
      HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide,
    } = docx;

    const [borderBuf, logoBuf] = await Promise.all([
      fetch("assets/border-strip.jpg").then((r) => r.arrayBuffer()),
      fetch("assets/me-dubai-logo.png").then((r) => r.arrayBuffer()),
    ]);
    const inchesToTwip = (n) => Math.round(n * 1440);
    const inchesToEmu = (n) => Math.round(n * 914400);
    const inchesToPx = (n) => Math.round(n * 96);
    const align = b.alignment === "left" ? AlignmentType.LEFT : AlignmentType.CENTER;

    const children = [];
    const titleText = b.uppercase ? b.titleText.toUpperCase() : b.titleText;
    children.push(new Paragraph({ alignment: align, spacing: { after: 200 }, children: [new TextRun({ text: titleText || "MENU", bold: true, size: 44 })] }));

    groupByCategory(b.canvas, getSectionOrder()).forEach((g) => {
      const label = Object.prototype.hasOwnProperty.call(b.sectionLabels || {}, g.category) ? b.sectionLabels[g.category] : g.category.toUpperCase();
      if (label) {
        children.push(new Paragraph({ alignment: align, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: label, bold: true, size: 26 })] }));
      }
      g.items.forEach((item) => {
        const name = b.uppercase ? item.name.toUpperCase() : item.name;
        const nameRuns = [new TextRun({ text: name, bold: true, size: 22 })];
        if (item.allergens) nameRuns.push(new TextRun({ text: `  [${item.allergens}]`, italics: true, size: 18 }));
        children.push(new Paragraph({ alignment: align, children: nameRuns }));
        if (item.description) {
          children.push(new Paragraph({ alignment: align, spacing: { after: 120 }, children: [new TextRun({ text: item.description, italics: b.italics, size: 20 })] }));
        }
      });
    });

    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      border: { top: { color: "E8D9C5", space: 4, style: "single", size: 4 } },
      children: [new TextRun({ text: "Allergens: D — Dairy   ·   G — Gluten   ·   S — Seafood", size: 14, color: "8B6A4A" })],
    }));

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: inchesToTwip(PAGE.widthIn), height: inchesToTwip(PAGE.heightIn) },
            margin: { top: inchesToTwip(PAGE.marginTopIn), bottom: inchesToTwip(PAGE.marginBottomIn), left: inchesToTwip(PAGE.marginLeftIn), right: inchesToTwip(PAGE.marginRightIn) },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({ children: [new ImageRun({
              type: "jpg", data: borderBuf,
              transformation: { width: inchesToPx(PAGE.borderWidthIn), height: inchesToPx(PAGE.borderHeightIn) },
              floating: {
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.borderLeftIn) },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.borderTopIn) },
                wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
                behindDocument: false, allowOverlap: true,
              },
            })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ children: [new ImageRun({
              type: "png", data: logoBuf,
              transformation: { width: inchesToPx(PAGE.logoWidthIn), height: inchesToPx(PAGE.logoHeightIn) },
              floating: {
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.logoLeftIn) },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.heightIn - PAGE.logoBottomIn - PAGE.logoHeightIn) },
                wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
                behindDocument: true, allowOverlap: true,
              },
            })] })],
          }),
        },
        children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${sanitizeFilename(b.filename || b.titleText)}.docx`);
  } catch (err) {
    console.error(err);
    alert("Couldn't build the Word document: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "📄 Export Word (.docx)";
  }
}

/* ---------------- Export: PDF (real downloadable file, no print dialog) ---------------- */
async function exportPdf() {
  const b = state.builder;
  if (!b.canvas.length) { alert("Add at least one dish before exporting."); return; }
  const btn = document.getElementById("b-export-pdf");
  btn.disabled = true; btn.textContent = "Building…";
  let holder;
  try {
    const html = buildMenuPageHTML(b.canvas, {
      alignment: b.alignment, uppercase: b.uppercase, italics: b.italics,
      titleText: b.titleText, sectionLabels: b.sectionLabels, sectionOrder: getSectionOrder(),
      editable: false,
    });
    // Render a clean off-screen copy (no editing outlines/buttons) at high
    // resolution, then rasterize it into a PDF sized to the real page —
    // this guarantees the PDF looks exactly like the preview, since it's
    // literally a snapshot of the same DOM/CSS, not a separate layout engine.
    holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-10000px";
    holder.style.top = "0";
    holder.innerHTML = `<div class="menu-page-wrap" style="padding:0;">${html}</div>`;
    document.body.appendChild(holder);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const pageEl = holder.querySelector(".menu-page");
    const canvas = await html2canvas(pageEl, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "in", format: [PAGE.widthIn, PAGE.heightIn] });
    pdf.addImage(imgData, "JPEG", 0, 0, PAGE.widthIn, PAGE.heightIn);
    pdf.save(`${sanitizeFilename(b.filename || b.titleText)}.pdf`);
  } catch (err) {
    console.error(err);
    alert("Couldn't build the PDF: " + err.message);
  } finally {
    if (holder) document.body.removeChild(holder);
    btn.disabled = false; btn.textContent = "📕 Export PDF";
  }
}

/* ---------------- Print (browser print dialog — separate from PDF export) ---------------- */
function printMenu() {
  const b = state.builder;
  if (!b.canvas.length) { alert("Add at least one dish before printing."); return; }
  const html = buildMenuPageHTML(b.canvas, {
    alignment: b.alignment, uppercase: b.uppercase, italics: b.italics,
    titleText: b.titleText, sectionLabels: b.sectionLabels, sectionOrder: getSectionOrder(),
    editable: false,
  });
  document.getElementById("print-area").innerHTML = `<div class="menu-page-wrap">${html}</div>`;
  const prevTitle = document.title;
  document.title = sanitizeFilename(b.filename || b.titleText);
  window.print();
  setTimeout(() => { document.title = prevTitle; }, 500);
}

/* ---------------- Prep List (optional, generated from the canvas) ----------------
   Deliberately plain — a kitchen work document, not the guest-facing branded
   menu — so no border/logo, just a clean checklist grouped by dish. */
function buildPrepListHTML(items, titleText) {
  return `
    <div style="font-family:var(--font-body);color:#2C1A12;">
      <div style="font-family:var(--font-display);font-size:20px;font-weight:700;margin-bottom:4px;">Prep List</div>
      <div style="font-size:13px;color:#8B6A4A;margin-bottom:18px;">${escapeHtml(titleText || "Menu")}</div>
      ${items.map((item) => `
        <div style="margin-bottom:16px;break-inside:avoid;">
          <div style="font-weight:700;font-size:14px;margin-bottom:5px;border-bottom:1px solid #E8D9C5;padding-bottom:3px;">${escapeHtml(item.name)}</div>
          <ul style="margin:0;padding-left:20px;">
            ${item.prepItems.map((p) => `<li style="font-size:13px;color:#3D2B1F;margin-bottom:4px;">${escapeHtml(p)}</li>`).join("")}
          </ul>
        </div>
      `).join("")}
    </div>
  `;
}
function openPrepListModal() {
  const b = state.builder;
  const items = b.canvas.filter((i) => (i.prepItems || []).length);
  if (!items.length) {
    alert("None of the dishes on this menu have a prep list yet. Add prep items to a dish from Dish Vault or Prep Vault, then try again.");
    return;
  }
  openModal(`
    <h3>Prep List — ${escapeHtml(b.titleText || "Menu")}</h3>
    <div style="max-height:50vh;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:18px;background:#fff;">
      ${buildPrepListHTML(items, b.titleText)}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
      <button id="prep-export-docx" class="btn btn-primary">📄 Export Word</button>
      <button id="prep-export-pdf" class="btn btn-primary">📕 Export PDF</button>
    </div>
  `, { wide: true });
  document.getElementById("prep-export-docx").addEventListener("click", () => exportPrepListDocx(items, b.titleText, b.filename));
  document.getElementById("prep-export-pdf").addEventListener("click", () => exportPrepListPdf(items, b.titleText, b.filename));
}
async function exportPrepListDocx(items, titleText, filename) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = docx;
  const children = [
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "PREP LIST", bold: true, size: 32 })] }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: titleText || "Menu", size: 22, color: "8B6A4A" })] }),
  ];
  items.forEach((item) => {
    children.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: item.name, bold: true, size: 24 })] }));
    item.prepItems.forEach((p) => {
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: p, size: 21 })] }));
    });
  });
  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${sanitizeFilename((filename || titleText || "menu") + "-prep-list")}.docx`);
}
async function exportPrepListPdf(items, titleText, filename) {
  const holder = document.createElement("div");
  holder.style.position = "fixed"; holder.style.left = "-10000px"; holder.style.top = "0";
  holder.style.width = "8.27in"; holder.style.padding = "0.6in"; holder.style.background = "#fff";
  holder.innerHTML = buildPrepListHTML(items, titleText);
  document.body.appendChild(holder);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const widthIn = 8.27;
    const heightIn = (canvas.height / canvas.width) * widthIn;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "in", format: [widthIn, heightIn] });
    pdf.addImage(imgData, "JPEG", 0, 0, widthIn, heightIn);
    pdf.save(`${sanitizeFilename((filename || titleText || "menu") + "-prep-list")}.pdf`);
  } finally {
    document.body.removeChild(holder);
  }
}

/* ==========================================================================
   SAVED MENUS
   ========================================================================== */
function renderSavedShell() {
  const el = document.getElementById("view-saved");
  el.innerHTML = `<h2>Saved Menus</h2><div id="saved-list"></div>`;
  renderSavedList();
}
function renderSavedList() {
  const listEl = document.getElementById("saved-list");
  if (!listEl) return;
  if (!state.menus.length) { listEl.innerHTML = `<div class="hint-text" style="text-align:center;padding:30px;">No saved menus yet. Build one in 📝 Menu Builder and click "Save Menu".</div>`; return; }
  listEl.innerHTML = state.menus.map((m) => `
    <div class="card dish-card">
      <div>
        <div class="dish-name">${escapeHtml(m.name)}</div>
        <div class="dish-meta">${(m.items || []).length} dishes · updated ${new Date(m.updatedAt).toLocaleString()}</div>
      </div>
      <div style="text-align:right;">
        <div class="dish-cost">${formatCurrency(m.totalCost)}</div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          <button class="btn btn-outline btn-sm" data-action="load-menu" data-id="${m.id}">Load</button>
          <button class="btn btn-danger btn-sm" data-action="delete-menu" data-id="${m.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join("");
  listEl.querySelectorAll('[data-action="load-menu"]').forEach((btn) => btn.addEventListener("click", () => loadMenu(btn.dataset.id)));
  listEl.querySelectorAll('[data-action="delete-menu"]').forEach((btn) => btn.addEventListener("click", () => deleteMenu(btn.dataset.id)));
}
function loadMenu(id) {
  const m = state.menus.find((x) => x.id === id);
  if (!m) return;
  state.builder = {
    pickerSearch: "", pickerCatFilter: "all",
    canvas: (m.items || []).map((i) => ({ ...i })),
    titleText: m.titleText || "MENU", alignment: m.alignment || "center",
    uppercase: !!m.uppercase, italics: !!m.italics,
    filename: sanitizeFilename(m.name), activeMenuId: m.id,
    sectionLabels: { ...(m.sectionLabels || {}) },
    sectionOrder: (m.sectionOrder || []).slice(),
  };
  switchView("builder");
}
async function deleteMenu(id) {
  if (!confirm("Delete this saved menu?")) return;
  await db.collection("menus").doc(id).delete();
}

/* ==========================================================================
   PREP VAULT — every dish (à la carte + canapé) that has a prep list
   ========================================================================== */
function renderPrepVaultShell() {
  const el = document.getElementById("view-prep");
  el.innerHTML = `
    <h2>Prep Vault</h2>
    <p class="hint-text" style="margin-top:0;">Every dish with a prep list, from Dish Vault and Canapé Menu. Prep lists are optional — add one from a dish's Edit screen.</p>
    <input id="prep-search" class="field" placeholder="🔍 Search prep lists…" value="${escapeHtml(state.prepSearch)}">
    <div id="prep-list"></div>
  `;
  document.getElementById("prep-search").addEventListener("input", (e) => {
    state.prepSearch = e.target.value;
    renderPrepVaultList();
  });
  renderPrepVaultList();
}
function renderPrepVaultList() {
  const listEl = document.getElementById("prep-list");
  if (!listEl) return;
  const q = state.prepSearch.trim().toLowerCase();
  const withPrep = [
    ...state.dishes.map((d) => ({ ...d, _source: "dishes", _label: "À la carte" })),
    ...state.canapeDishes.map((d) => ({ ...d, _source: "canapeDishes", _label: "Canapé" })),
  ].filter((d) => (d.prepItems || []).length > 0);
  const rows = q
    ? withPrep.filter((d) => d.name.toLowerCase().includes(q) || d.prepItems.some((p) => p.toLowerCase().includes(q)))
    : withPrep;

  if (!rows.length) {
    listEl.innerHTML = `<div class="hint-text" style="text-align:center;padding:30px;">${withPrep.length ? "No matches." : "No prep lists yet. Open any dish's Edit screen and add prep items."}</div>`;
    return;
  }
  listEl.innerHTML = rows.map((d) => `
    <div class="card">
      <div class="header-row">
        <div>
          <div class="dish-name">${escapeHtml(d.name)} <span class="badge">${d._label}</span></div>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="edit-prep" data-source="${d._source}" data-id="${d.id}">Edit</button>
      </div>
      <ul style="margin:8px 0 0; padding-left:18px;">
        ${d.prepItems.map((p) => `<li style="font-size:13px;color:var(--muted);margin-bottom:2px;">${escapeHtml(p)}</li>`).join("")}
      </ul>
    </div>
  `).join("");
  listEl.querySelectorAll('[data-action="edit-prep"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const source = btn.dataset.source;
      const list = source === "canapeDishes" ? state.canapeDishes : state.dishes;
      const dish = list.find((x) => x.id === btn.dataset.id);
      if (dish) openDishModal(dish, { collection: source });
    });
  });
}

/* ==========================================================================
   IMPORT & EXTRACT
   ========================================================================== */
function renderImportShell() {
  const el = document.getElementById("view-import");
  el.innerHTML = `
    <h2>Import Menu</h2>
    <p class="hint-text" style="margin-top:0;">Upload an existing Word (.docx) or PDF menu. Whole-line <b>bold</b> text (docx) or ALL-CAPS/Title-Case short lines (PDF) are read as dish names; a line matching one of your current category names switches the category for everything after it. Review and fix anything below before adding to the vault.</p>
    <input type="file" id="import-file" class="field" accept=".docx,.pdf">
    <div id="import-review"></div>
  `;
  document.getElementById("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) handleImportFile(e.target.files[0]);
  });
  renderImportReview();
}
async function handleImportFile(file) {
  showStatus("Reading " + file.name + "…", "info");
  try {
    let rows = [];
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".docx")) {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      rows = parseHtmlToDishes(result.value);
    } else if (lower.endsWith(".pdf")) {
      rows = await parsePdfToDishes(file);
    } else {
      alert("Please upload a .docx or .pdf file.");
    }
    state.importReview = rows.map((r) => ({ ...r, include: true }));
    hideStatus();
    renderImportReview();
    if (!rows.length) alert("No dishes detected automatically. You can still add dishes manually in the Dish Vault.");
  } catch (err) {
    console.error(err);
    hideStatus();
    alert("Couldn't read that file: " + err.message);
  }
}
function parseHtmlToDishes(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const catSet = new Set(state.categories.map((c) => c.toUpperCase()));
  const rows = [];
  let currentCategory = "Uncategorized";
  let current = null;
  Array.from(parsed.body.children).forEach((el) => {
    const text = (el.textContent || "").trim();
    if (!text) return;
    if (catSet.has(text.toUpperCase())) {
      if (current) { rows.push(current); current = null; }
      currentCategory = text.toUpperCase();
      return;
    }
    const boldEl = el.querySelector("strong, b");
    const boldText = boldEl ? (boldEl.textContent || "").trim() : "";
    const isWholeBold = boldText.length > 0 && boldText === text;
    if (isWholeBold) {
      if (current) rows.push(current);
      current = { name: text, category: currentCategory, description: "", allergens: "" };
    } else if (current) {
      current.description = current.description ? current.description + " " + text : text;
    }
  });
  if (current) rows.push(current);
  return rows;
}
async function parsePdfToDishes(file) {
  const arrayBuffer = await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const catSet = new Set(state.categories.map((c) => c.toUpperCase()));
  const rows = [];
  let currentCategory = "Uncategorized";
  let current = null;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lineMap = new Map();
    content.items.forEach((it) => {
      const y = Math.round(it.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(it);
    });
    const lines = Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => ({
        text: items.sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim(),
        bold: items.some((i) => /bold/i.test(i.fontName || "")),
      }));

    lines.forEach((line) => {
      const text = line.text;
      if (!text) return;
      if (catSet.has(text.toUpperCase())) {
        if (current) { rows.push(current); current = null; }
        currentCategory = text.toUpperCase();
        return;
      }
      const isAllCaps = text === text.toUpperCase() && /[A-Z]/.test(text) && text.length > 3 && text.length < 80;
      const isTitleCaseShort = text === toTitleCase(text) && text.split(" ").length <= 6 && text.length < 60;
      const isNameLine = line.bold || isAllCaps || isTitleCaseShort;
      if (isNameLine) {
        if (current) rows.push(current);
        current = { name: isAllCaps ? toTitleCase(text) : text, category: currentCategory, description: "", allergens: "" };
      } else if (current) {
        current.description = current.description ? current.description + " " + text : text;
      }
    });
  }
  if (current) rows.push(current);
  return rows;
}
function renderImportReview() {
  const el = document.getElementById("import-review");
  if (!el) return;
  if (!state.importReview.length) { el.innerHTML = ""; return; }
  el.innerHTML = `
    <div class="section-title">Review ${state.importReview.length} detected dishes before adding</div>
    <div id="import-rows"></div>
    <button id="import-commit" class="btn btn-primary" style="margin-top:10px;">＋ Add checked dishes to Vault</button>
  `;
  const rowsEl = document.getElementById("import-rows");
  rowsEl.innerHTML = state.importReview.map((r, i) => `
    <div class="card">
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <input type="checkbox" data-idx="${i}" data-field="include" ${r.include ? "checked" : ""} style="margin-top:12px;">
        <div style="flex:1;">
          <input class="field" data-idx="${i}" data-field="name" value="${escapeHtml(r.name)}" placeholder="Dish name">
          <select class="field" data-idx="${i}" data-field="category">
            ${state.categories.map((c) => `<option value="${escapeHtml(c)}" ${r.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
            <option value="${escapeHtml(r.category)}" ${!state.categories.includes(r.category) ? "selected" : ""}>${escapeHtml(r.category)} (detected)</option>
          </select>
          <textarea class="field" data-idx="${i}" data-field="description" rows="2" placeholder="Description">${escapeHtml(r.description)}</textarea>
        </div>
      </div>
    </div>
  `).join("");
  rowsEl.querySelectorAll("[data-idx]").forEach((input) => {
    input.addEventListener("change", () => {
      const idx = Number(input.dataset.idx);
      const field = input.dataset.field;
      state.importReview[idx][field] = field === "include" ? input.checked : input.value;
    });
  });
  document.getElementById("import-commit").addEventListener("click", commitImport);
}
async function commitImport() {
  const toAdd = state.importReview.filter((r) => r.include && r.name.trim());
  if (!toAdd.length) { alert("Nothing checked to add."); return; }
  const batch = db.batch();
  toAdd.forEach((r) => {
    const ref = db.collection("dishes").doc();
    batch.set(ref, { name: r.name.trim(), category: r.category || "Uncategorized", description: (r.description || "").trim(), allergens: "", cost: 0 });
  });
  await batch.commit();
  state.importReview = [];
  renderImportReview();
  document.getElementById("import-file").value = "";
  alert(`Added ${toAdd.length} dish(es) to the vault. Set their cost and allergens in 🗄️ Dish Vault.`);
}

/* ==========================================================================
   BUFFET MENUS — station/item lists, flowing across as many branded pages
   as the content needs. Reuses the .menu-page / .menu-section / .menu-dish
   CSS from the à la carte template so the two stay visually consistent.
   ========================================================================== */
function buildBrandedPageWrapper(bodyHtml, titleText, emptyMessage) {
  return `
    <div class="menu-page">
      <div class="border-strip"></div>
      <div class="brand-logo"></div>
      <div class="menu-content">
        <div class="menu-title align-center">${escapeHtml(titleText || "")}</div>
        <div class="menu-title-rule align-center"></div>
        ${bodyHtml || `<div class="menu-empty">${escapeHtml(emptyMessage || "Nothing here yet.")}</div>`}
      </div>
      <div class="allergen-legend">Allergens: D — Dairy &nbsp;·&nbsp; G — Gluten &nbsp;·&nbsp; S — Seafood</div>
    </div>
  `;
}
function buildStationBlockHTML(st) {
  return `
    <div class="page-block">
      <div class="menu-section-row align-center">
        <div class="menu-section">${escapeHtml((st.name || "").toUpperCase())}</div>
      </div>
      ${(st.items || []).map((it) => `
        <div class="menu-dish align-center">
          <span class="dname">${escapeHtml(it.name)}</span>
          ${it.description ? `<span class="ddesc" style="display:block;">${escapeHtml(it.description)}</span>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}
function buildBuffetPageHTML(pageStations, titleText) {
  return buildBrandedPageWrapper(pageStations.map((st) => buildStationBlockHTML(st)).join(""), titleText || "Buffet Menu", "No stations yet.");
}
function paginateItemsByHeight(items, buildBlockHtml, buildPageHtml) {
  // Real DOM measurement, not a guessed line-budget — renders every block
  // once off-screen and packs pages using the actual rendered top/bottom
  // positions (not summed isolated heights, which silently drops the
  // margin gaps *between* blocks), so pagination stays correct regardless
  // of font/CSS changes and never overlaps the legend/logo.
  if (!items || !items.length) return [[]];
  const probe = document.createElement("div");
  probe.style.position = "fixed"; probe.style.left = "-10000px"; probe.style.top = "0";
  probe.innerHTML = buildPageHtml(items.map(buildBlockHtml).join(""));
  document.body.appendChild(probe);

  const pageEl = probe.querySelector(".menu-page");
  // All items are rendered on one over-tall page here (so every block can be
  // measured in one pass) — .menu-page only has a min-height, so left alone
  // it grows to fit everything. Pin it to the true fixed page height so the
  // legend's absolute position measures against the real page boundary;
  // overflow:hidden on .menu-page means off-page blocks are only clipped
  // from view, not from layout — getBoundingClientRect() still reports
  // their real positions.
  pageEl.style.height = PAGE.heightIn + "in";
  const legendEl = probe.querySelector(".allergen-legend");
  const ruleEl = probe.querySelector(".menu-title-rule");
  const blocks = Array.from(probe.querySelectorAll(".page-block"));
  const pageTop = pageEl.getBoundingClientRect().top;
  const usableBottom = legendEl.getBoundingClientRect().top - pageTop - 10;
  const contentStartTop = ruleEl.getBoundingClientRect().bottom - pageTop + 10;
  const tops = blocks.map((b) => b.getBoundingClientRect().top - pageTop);
  const bottoms = blocks.map((b) => b.getBoundingClientRect().bottom - pageTop);
  document.body.removeChild(probe);

  const usableHeight = usableBottom - contentStartTop;
  const pages = [];
  let current = [];
  let pageStartTop = 0;
  items.forEach((it, i) => {
    if (!current.length) pageStartTop = tops[i];
    const consumed = bottoms[i] - pageStartTop;
    if (current.length && consumed > usableHeight) {
      pages.push(current);
      current = [it];
      pageStartTop = tops[i];
    } else {
      current.push(it);
    }
  });
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}
function paginateStations(stations, titleText) {
  return paginateItemsByHeight(stations || [], buildStationBlockHTML, (body) => buildBrandedPageWrapper(body, titleText, "No stations yet."));
}
function buildBuffetMenuPagesHTML(stations, titleText) {
  return paginateStations(stations, titleText).map((p) => buildBuffetPageHTML(p, titleText));
}
function buffetTitleText(draft, day) {
  return draft.days.length > 1 && day.label ? `${draft.name} — ${day.label}` : draft.name;
}

function renderBuffetShell() {
  const el = document.getElementById("view-buffet");
  if (state.buffetEditingId) { renderBuffetEditor(); return; }
  el.innerHTML = `
    <div class="header-row">
      <h2>Buffet Menus</h2>
      <button class="btn btn-primary btn-sm" data-action="new-buffet">＋ New Buffet Menu</button>
    </div>
    <div id="buffet-list"></div>
  `;
  el.querySelector('[data-action="new-buffet"]').addEventListener("click", () => openBuffetEditor(null));
  renderBuffetList();
}
function renderBuffetList() {
  const listEl = document.getElementById("buffet-list");
  if (!listEl) return;
  if (!state.buffetMenus.length) {
    listEl.innerHTML = `<div class="hint-text" style="text-align:center;padding:30px;">No buffet menus yet. Click "New Buffet Menu" above.</div>`;
    return;
  }
  listEl.innerHTML = state.buffetMenus.map((m) => {
    const stationCount = (m.days || []).reduce((s, d) => s + (d.stations || []).length, 0);
    const dayNote = (m.days || []).length > 1 ? `${m.days.length} days · ` : "";
    return `
    <div class="card dish-card">
      <div>
        <div class="dish-name">${escapeHtml(m.name)}</div>
        <div class="dish-meta">${dayNote}${stationCount} station${stationCount === 1 ? "" : "s"}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-outline btn-sm" data-action="edit-buffet" data-id="${m.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-action="delete-buffet" data-id="${m.id}">Delete</button>
      </div>
    </div>
  `;
  }).join("");
  listEl.querySelectorAll('[data-action="edit-buffet"]').forEach((btn) => btn.addEventListener("click", () => openBuffetEditor(state.buffetMenus.find((m) => m.id === btn.dataset.id))));
  listEl.querySelectorAll('[data-action="delete-buffet"]').forEach((btn) => btn.addEventListener("click", () => deleteBuffetMenu(btn.dataset.id)));
}
function openBuffetEditor(menu) {
  state.buffetEditingId = menu ? menu.id : "new";
  state.buffetDraft = menu
    ? JSON.parse(JSON.stringify({ name: menu.name, days: menu.days && menu.days.length ? menu.days : [{ label: "", stations: [] }] }))
    : { name: "New Buffet Menu", days: [{ label: "", stations: [] }] };
  state.buffetActiveDay = 0;
  renderBuffetShell();
}
async function deleteBuffetMenu(id) {
  if (!confirm("Delete this buffet menu?")) return;
  if (state.buffetEditingId === id) { state.buffetEditingId = null; state.buffetDraft = null; }
  await db.collection("buffetMenus").doc(id).delete();
  renderBuffetShell();
}

function currentBuffetDay() {
  const draft = state.buffetDraft;
  return draft.days[state.buffetActiveDay] || draft.days[0];
}
function renderBuffetEditor() {
  const el = document.getElementById("view-buffet");
  const draft = state.buffetDraft;
  el.innerHTML = `
    <div class="header-row">
      <button class="btn btn-ghost btn-sm" id="buffet-back">← Back to list</button>
      <button class="btn btn-primary btn-sm" id="buffet-save">💾 Save</button>
    </div>
    <input id="buffet-name" class="field" placeholder="Buffet menu name" value="${escapeHtml(draft.name)}">
    <div class="two-col">
      <div>
        <div class="section-title" style="margin-top:0;">Days</div>
        <div id="buffet-day-tabs" class="cat-row"></div>
        <button class="btn btn-outline btn-sm" id="buffet-add-day" style="margin-bottom:14px;">＋ Add Day</button>
        <div class="section-title" style="margin-top:0;">Stations</div>
        <div id="buffet-stations"></div>
        <button class="btn btn-outline btn-sm" id="buffet-add-station">＋ Add Station</button>
      </div>
      <div>
        <div class="section-title" style="margin-top:0;">Export</div>
        <input id="buffet-filename" class="field" placeholder="File name (without extension)">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          <button id="buffet-export-docx" class="btn btn-primary">📄 Export Word</button>
          <button id="buffet-export-pdf" class="btn btn-primary">📕 Export PDF</button>
          <button id="buffet-print" class="btn btn-ghost">🖨️ Print</button>
        </div>
        <div class="section-title">Live Preview</div>
        <div id="buffet-preview-wrap"></div>
      </div>
    </div>
  `;
  document.getElementById("buffet-back").addEventListener("click", () => { state.buffetEditingId = null; state.buffetDraft = null; renderBuffetShell(); });
  document.getElementById("buffet-name").addEventListener("input", (e) => { draft.name = e.target.value; renderBuffetPreview(); });
  document.getElementById("buffet-save").addEventListener("click", saveBuffetMenu);
  document.getElementById("buffet-add-day").addEventListener("click", () => {
    draft.days.push({ label: `Day ${draft.days.length + 1}`, stations: [] });
    state.buffetActiveDay = draft.days.length - 1;
    renderBuffetDayTabs();
    renderBuffetStations();
    renderBuffetPreview();
  });
  document.getElementById("buffet-add-station").addEventListener("click", () => {
    currentBuffetDay().stations.push({ name: "", items: [] });
    renderBuffetStations();
    renderBuffetPreview();
  });
  document.getElementById("buffet-export-docx").addEventListener("click", exportBuffetDocx);
  document.getElementById("buffet-export-pdf").addEventListener("click", exportBuffetPdf);
  document.getElementById("buffet-print").addEventListener("click", printBuffet);

  renderBuffetDayTabs();
  renderBuffetStations();
  renderBuffetPreview();
}
function renderBuffetDayTabs() {
  const wrap = document.getElementById("buffet-day-tabs");
  const draft = state.buffetDraft;
  wrap.innerHTML = draft.days.map((d, i) => `
    <button type="button" class="cat-chip ${i === state.buffetActiveDay ? "active" : ""}" data-day="${i}">${escapeHtml(d.label || "Day " + (i + 1))}</button>
  `).join("") + (draft.days.length > 1 ? `<button type="button" class="cat-chip manage" data-remove-day="1">✕ Remove day</button>` : "");
  wrap.querySelectorAll("[data-day]").forEach((btn) => btn.addEventListener("click", () => {
    state.buffetActiveDay = Number(btn.dataset.day);
    renderBuffetDayTabs();
    renderBuffetStations();
    renderBuffetPreview();
  }));
  const removeBtn = wrap.querySelector("[data-remove-day]");
  if (removeBtn) removeBtn.addEventListener("click", () => {
    if (draft.days.length <= 1) return;
    if (!confirm("Remove this day and its stations?")) return;
    draft.days.splice(state.buffetActiveDay, 1);
    state.buffetActiveDay = Math.max(0, state.buffetActiveDay - 1);
    renderBuffetDayTabs();
    renderBuffetStations();
    renderBuffetPreview();
  });
}
function renderBuffetStations() {
  const wrap = document.getElementById("buffet-stations");
  const day = currentBuffetDay();
  if (!day.stations.length) {
    wrap.innerHTML = `<div class="hint-text" style="margin:0 0 8px;">No stations yet — add one below.</div>`;
    return;
  }
  wrap.innerHTML = day.stations.map((st, si) => `
    <div class="card" data-station-idx="${si}">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
        <input class="field" style="margin:0;flex:1;" data-station-name value="${escapeHtml(st.name)}" placeholder="Station name">
        <button type="button" class="btn btn-ghost btn-sm" data-move-station="up" ${si === 0 ? "disabled" : ""} title="Move up">↑</button>
        <button type="button" class="btn btn-ghost btn-sm" data-move-station="down" ${si === day.stations.length - 1 ? "disabled" : ""} title="Move down">↓</button>
        <button type="button" class="btn btn-danger btn-sm" data-remove-station>✕</button>
      </div>
      <div data-items-wrap>
        ${st.items.map((it, ii) => `
          <div class="modal-row" data-item-idx="${ii}">
            <input class="field" style="margin:0;flex:1;" data-item-name value="${escapeHtml(it.name)}" placeholder="Item name">
            <input class="field" style="margin:0;flex:1;" data-item-desc value="${escapeHtml(it.description || "")}" placeholder="Description (optional)">
            <button type="button" class="btn btn-danger btn-sm" data-remove-item>✕</button>
          </div>
        `).join("")}
      </div>
      <button type="button" class="btn btn-outline btn-sm" data-add-item style="margin-top:6px;">＋ Add Item</button>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-station-idx]").forEach((card) => {
    const si = Number(card.dataset.stationIdx);
    const station = day.stations[si];
    card.querySelector("[data-station-name]").addEventListener("input", (e) => { station.name = e.target.value; renderBuffetPreview(); });
    card.querySelector("[data-remove-station]").addEventListener("click", () => { day.stations.splice(si, 1); renderBuffetStations(); renderBuffetPreview(); });
    card.querySelectorAll("[data-move-station]").forEach((btn) => btn.addEventListener("click", () => {
      const dir = btn.dataset.moveStation === "up" ? -1 : 1;
      const swap = si + dir;
      if (swap < 0 || swap >= day.stations.length) return;
      [day.stations[si], day.stations[swap]] = [day.stations[swap], day.stations[si]];
      renderBuffetStations(); renderBuffetPreview();
    }));
    card.querySelectorAll("[data-item-idx]").forEach((row) => {
      const ii = Number(row.dataset.itemIdx);
      row.querySelector("[data-item-name]").addEventListener("input", (e) => { station.items[ii].name = e.target.value; renderBuffetPreview(); });
      row.querySelector("[data-item-desc]").addEventListener("input", (e) => { station.items[ii].description = e.target.value; renderBuffetPreview(); });
      row.querySelector("[data-remove-item]").addEventListener("click", () => { station.items.splice(ii, 1); renderBuffetStations(); renderBuffetPreview(); });
    });
    card.querySelector("[data-add-item]").addEventListener("click", () => {
      station.items.push({ name: "", description: "" });
      renderBuffetStations();
      const rows = card.querySelectorAll("[data-item-name]");
      if (rows.length) rows[rows.length - 1].focus();
    });
  });
}
function renderBuffetPreview() {
  const wrap = document.getElementById("buffet-preview-wrap");
  if (!wrap) return;
  const draft = state.buffetDraft;
  const day = currentBuffetDay();
  const pages = buildBuffetMenuPagesHTML(day.stations, buffetTitleText(draft, day));
  wrap.innerHTML = pages.map((p) => `<div class="menu-page-wrap">${p}</div>`).join("");
}
async function saveBuffetMenu() {
  const draft = state.buffetDraft;
  const name = document.getElementById("buffet-name").value.trim();
  if (!name) { alert("Give this buffet menu a name."); return; }
  draft.name = name;
  const payload = { name: draft.name, days: draft.days, updatedAt: Date.now() };
  if (state.buffetEditingId && state.buffetEditingId !== "new") {
    await db.collection("buffetMenus").doc(state.buffetEditingId).update(payload);
  } else {
    const ref = await db.collection("buffetMenus").add(payload);
    state.buffetEditingId = ref.id;
  }
  alert(`Saved "${name}".`);
}

/* ---------------- Buffet export: Word (multi-page) ---------------- */
async function exportBuffetDocx() {
  const draft = state.buffetDraft;
  const day = currentBuffetDay();
  const filename = document.getElementById("buffet-filename").value.trim() || draft.name;
  const btn = document.getElementById("buffet-export-docx");
  btn.disabled = true; btn.textContent = "Building…";
  try {
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer, AlignmentType, PageBreak,
      HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide,
    } = docx;
    const [borderBuf, logoBuf] = await Promise.all([
      fetch("assets/border-strip.jpg").then((r) => r.arrayBuffer()),
      fetch("assets/me-dubai-logo.png").then((r) => r.arrayBuffer()),
    ]);
    const inchesToTwip = (n) => Math.round(n * 1440);
    const inchesToEmu = (n) => Math.round(n * 914400);
    const inchesToPx = (n) => Math.round(n * 96);
    const titleText = buffetTitleText(draft, day);
    const pages = paginateStations(day.stations, titleText);

    const children = [];
    pages.forEach((pageStations, pi) => {
      if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: titleText || "Buffet Menu", bold: true, size: 40 })] }));
      pageStations.forEach((st) => {
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 180, after: 70 }, children: [new TextRun({ text: (st.name || "").toUpperCase(), bold: true, size: 24 })] }));
        st.items.forEach((it) => {
          if (!it.name) return;
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: it.name, bold: true, size: 20 })] }));
          if (it.description) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: it.description, italics: true, size: 18 })] }));
        });
      });
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 260 },
        border: { top: { color: "E8D9C5", space: 4, style: "single", size: 4 } },
        children: [new TextRun({ text: "Allergens: D — Dairy   ·   G — Gluten   ·   S — Seafood", size: 14, color: "8B6A4A" })],
      }));
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: inchesToTwip(PAGE.widthIn), height: inchesToTwip(PAGE.heightIn) },
            margin: { top: inchesToTwip(PAGE.marginTopIn), bottom: inchesToTwip(PAGE.marginBottomIn), left: inchesToTwip(PAGE.marginLeftIn), right: inchesToTwip(PAGE.marginRightIn) },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({ children: [new ImageRun({
              type: "jpg", data: borderBuf,
              transformation: { width: inchesToPx(PAGE.borderWidthIn), height: inchesToPx(PAGE.borderHeightIn) },
              floating: {
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.borderLeftIn) },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.borderTopIn) },
                wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
                behindDocument: false, allowOverlap: true,
              },
            })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ children: [new ImageRun({
              type: "png", data: logoBuf,
              transformation: { width: inchesToPx(PAGE.logoWidthIn), height: inchesToPx(PAGE.logoHeightIn) },
              floating: {
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.logoLeftIn) },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.heightIn - PAGE.logoBottomIn - PAGE.logoHeightIn) },
                wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
                behindDocument: true, allowOverlap: true,
              },
            })] })],
          }),
        },
        children,
      }],
    });
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${sanitizeFilename(filename)}.docx`);
  } catch (err) {
    console.error(err);
    alert("Couldn't build the Word document: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "📄 Export Word";
  }
}

/* ---------------- Buffet export: PDF (multi-page, real file) ---------------- */
async function exportBuffetPdf() {
  const draft = state.buffetDraft;
  const day = currentBuffetDay();
  const filename = document.getElementById("buffet-filename").value.trim() || draft.name;
  const btn = document.getElementById("buffet-export-pdf");
  btn.disabled = true; btn.textContent = "Building…";
  const holder = document.createElement("div");
  holder.style.position = "fixed"; holder.style.left = "-10000px"; holder.style.top = "0";
  document.body.appendChild(holder);
  try {
    const pages = buildBuffetMenuPagesHTML(day.stations, buffetTitleText(draft, day));
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const { jsPDF } = window.jspdf;
    let pdf = null;
    for (let i = 0; i < pages.length; i++) {
      holder.innerHTML = `<div class="menu-page-wrap" style="padding:0;">${pages[i]}</div>`;
      const pageEl = holder.querySelector(".menu-page");
      const canvas = await html2canvas(pageEl, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      if (!pdf) pdf = new jsPDF({ unit: "in", format: [PAGE.widthIn, PAGE.heightIn] });
      else pdf.addPage([PAGE.widthIn, PAGE.heightIn]);
      pdf.addImage(imgData, "JPEG", 0, 0, PAGE.widthIn, PAGE.heightIn);
    }
    pdf.save(`${sanitizeFilename(filename)}.pdf`);
  } catch (err) {
    console.error(err);
    alert("Couldn't build the PDF: " + err.message);
  } finally {
    document.body.removeChild(holder);
    btn.disabled = false; btn.textContent = "📕 Export PDF";
  }
}
function printBuffet() {
  const draft = state.buffetDraft;
  const day = currentBuffetDay();
  const pages = buildBuffetMenuPagesHTML(day.stations, buffetTitleText(draft, day));
  document.getElementById("print-area").innerHTML = pages.map((p) => `<div class="menu-page-wrap">${p}</div>`).join("");
  const prevTitle = document.title;
  document.title = sanitizeFilename(document.getElementById("buffet-filename").value.trim() || draft.name);
  window.print();
  setTimeout(() => { document.title = prevTitle; }, 500);
}

/* ==========================================================================
   CANAPÉ MENU — a photo-card grid, exported across as many branded pages
   as the photos need. Reuses the same pagination engine as Buffet Menus.
   ========================================================================== */
function buildCanapeBlockHTML(dish) {
  return `
    <div class="page-block canape-block">
      ${dish.imageBase64 ? `<div class="canape-photo" style="background-image:url('${dish.imageBase64}');"></div>` : ""}
      <div class="menu-dish align-center" style="margin-top:10px;">
        <span class="dname">${escapeHtml(dish.name)}</span>
        <span class="dallergens">${escapeHtml(dish.allergens || "")}</span>
        ${dish.description ? `<span class="ddesc" style="display:block;">${escapeHtml(dish.description)}</span>` : ""}
      </div>
    </div>
  `;
}
function paginateCanapeItems(dishes, titleText) {
  return paginateItemsByHeight(dishes || [], buildCanapeBlockHTML, (body) => buildBrandedPageWrapper(body, titleText, "No canapés yet."));
}
function buildCanapeMenuPagesHTML(dishes, titleText) {
  return paginateCanapeItems(dishes, titleText).map((p) => buildBrandedPageWrapper(p.map(buildCanapeBlockHTML).join(""), titleText, "No canapés yet."));
}

function renderCanapeShell() {
  const el = document.getElementById("view-canape");
  el.innerHTML = `
    <div class="header-row">
      <h2>Canapé Menu</h2>
      <button class="btn btn-primary btn-sm" data-action="add-canape">＋ Add Canapé</button>
    </div>
    <input id="canape-search" class="field" placeholder="🔍 Search canapés…" value="${escapeHtml(state.canapeSearch)}">
    <div id="canape-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin:14px 0 24px;"></div>
    <div class="section-title" style="margin-top:0;">Export</div>
    <input id="canape-filename" class="field" placeholder="File name (without extension)" value="canape-menu">
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
      <button id="canape-export-docx" class="btn btn-primary">📄 Export Word</button>
      <button id="canape-export-pdf" class="btn btn-primary">📕 Export PDF</button>
      <button id="canape-print" class="btn btn-ghost">🖨️ Print</button>
      <button id="canape-prep-list" class="btn btn-ghost">🧾 Generate Prep List</button>
    </div>
    <div class="section-title">Live Preview</div>
    <div id="canape-preview-wrap"></div>
  `;
  el.querySelector('[data-action="add-canape"]').addEventListener("click", () => openDishModal(null, { collection: "canapeDishes" }));
  document.getElementById("canape-search").addEventListener("input", (e) => { state.canapeSearch = e.target.value; renderCanapeGrid(); });
  document.getElementById("canape-export-docx").addEventListener("click", exportCanapeDocx);
  document.getElementById("canape-export-pdf").addEventListener("click", exportCanapePdf);
  document.getElementById("canape-print").addEventListener("click", printCanape);
  document.getElementById("canape-prep-list").addEventListener("click", openCanapePrepListModal);
  renderCanapeGrid();
  renderCanapePreview();
}
function renderCanapeGrid() {
  const gridEl = document.getElementById("canape-grid");
  if (!gridEl) return;
  const q = state.canapeSearch.trim().toLowerCase();
  const rows = q
    ? state.canapeDishes.filter((d) => d.name.toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q))
    : state.canapeDishes;
  if (!rows.length) {
    gridEl.innerHTML = `<div class="hint-text" style="grid-column:1/-1;text-align:center;padding:30px;">No canapés yet. Click "Add Canapé" above.</div>`;
    return;
  }
  gridEl.innerHTML = rows.map((d) => `
    <div class="card" style="padding:0;overflow:hidden;">
      ${d.imageBase64
        ? `<img src="${d.imageBase64}" style="width:100%;height:140px;object-fit:cover;display:block;">`
        : `<div style="width:100%;height:140px;background:var(--panel-2);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px;">No photo</div>`}
      <div style="padding:12px;">
        <div class="dish-name">${escapeHtml(d.name)}</div>
        ${d.allergens ? `<div class="dish-meta">Allergens: ${escapeHtml(d.allergens)}</div>` : ""}
        ${d.description ? `<div class="dish-desc">${escapeHtml(d.description)}</div>` : ""}
        <div class="dish-cost" style="margin-top:6px;">${formatCurrency(d.cost)}</div>
        ${(d.prepItems || []).length ? `<div class="dish-meta">🧾 ${d.prepItems.length} prep item${d.prepItems.length === 1 ? "" : "s"}</div>` : ""}
        <div style="margin-top:8px;display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" data-action="edit-canape" data-id="${d.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-action="delete-canape" data-id="${d.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join("");
  gridEl.querySelectorAll('[data-action="edit-canape"]').forEach((btn) => {
    btn.addEventListener("click", () => openDishModal(state.canapeDishes.find((d) => d.id === btn.dataset.id), { collection: "canapeDishes" }));
  });
  gridEl.querySelectorAll('[data-action="delete-canape"]').forEach((btn) => btn.addEventListener("click", () => deleteCanapeDish(btn.dataset.id)));
}
async function deleteCanapeDish(id) {
  if (!confirm("Delete this canapé?")) return;
  await db.collection("canapeDishes").doc(id).delete();
}
function renderCanapePreview() {
  const wrap = document.getElementById("canape-preview-wrap");
  if (!wrap) return;
  const pages = buildCanapeMenuPagesHTML(state.canapeDishes, "Canapé Menu");
  wrap.innerHTML = pages.map((p) => `<div class="menu-page-wrap">${p}</div>`).join("");
}

/* ---------------- Canapé export: Word (multi-page, with photos) ---------------- */
async function exportCanapeDocx() {
  const filename = document.getElementById("canape-filename").value.trim() || "canape-menu";
  const btn = document.getElementById("canape-export-docx");
  if (!state.canapeDishes.length) { alert("Add at least one canapé before exporting."); return; }
  btn.disabled = true; btn.textContent = "Building…";
  try {
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer, AlignmentType, PageBreak,
      HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide,
    } = docx;
    const [borderBuf, logoBuf] = await Promise.all([
      fetch("assets/border-strip.jpg").then((r) => r.arrayBuffer()),
      fetch("assets/me-dubai-logo.png").then((r) => r.arrayBuffer()),
    ]);
    const inchesToTwip = (n) => Math.round(n * 1440);
    const inchesToEmu = (n) => Math.round(n * 914400);
    const inchesToPx = (n) => Math.round(n * 96);
    const titleText = "Canapé Menu";
    const pages = paginateCanapeItems(state.canapeDishes, titleText);

    const children = [];
    pages.forEach((pageDishes, pi) => {
      if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: titleText, bold: true, size: 40 })] }));
      pageDishes.forEach((d) => {
        if (d.imageBase64 && d.imageBase64.includes(",")) {
          const base64 = d.imageBase64.split(",")[1];
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER, spacing: { before: 160 },
            children: [new ImageRun({ type: "jpg", data: bytes, transformation: { width: 220, height: 165 } })],
          }));
        }
        const nameRuns = [new TextRun({ text: d.name, bold: true, size: 22 })];
        if (d.allergens) nameRuns.push(new TextRun({ text: `  [${d.allergens}]`, italics: true, size: 18 }));
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: nameRuns }));
        if (d.description) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: d.description, italics: true, size: 20 })] }));
      });
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 200 },
        border: { top: { color: "E8D9C5", space: 4, style: "single", size: 4 } },
        children: [new TextRun({ text: "Allergens: D — Dairy   ·   G — Gluten   ·   S — Seafood", size: 14, color: "8B6A4A" })],
      }));
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: inchesToTwip(PAGE.widthIn), height: inchesToTwip(PAGE.heightIn) },
            margin: { top: inchesToTwip(PAGE.marginTopIn), bottom: inchesToTwip(PAGE.marginBottomIn), left: inchesToTwip(PAGE.marginLeftIn), right: inchesToTwip(PAGE.marginRightIn) },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({ children: [new ImageRun({
              type: "jpg", data: borderBuf,
              transformation: { width: inchesToPx(PAGE.borderWidthIn), height: inchesToPx(PAGE.borderHeightIn) },
              floating: {
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.borderLeftIn) },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.borderTopIn) },
                wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
                behindDocument: false, allowOverlap: true,
              },
            })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ children: [new ImageRun({
              type: "png", data: logoBuf,
              transformation: { width: inchesToPx(PAGE.logoWidthIn), height: inchesToPx(PAGE.logoHeightIn) },
              floating: {
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.logoLeftIn) },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.heightIn - PAGE.logoBottomIn - PAGE.logoHeightIn) },
                wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
                behindDocument: true, allowOverlap: true,
              },
            })] })],
          }),
        },
        children,
      }],
    });
    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${sanitizeFilename(filename)}.docx`);
  } catch (err) {
    console.error(err);
    alert("Couldn't build the Word document: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "📄 Export Word";
  }
}

/* ---------------- Canapé export: PDF (multi-page, real file) ---------------- */
async function exportCanapePdf() {
  const filename = document.getElementById("canape-filename").value.trim() || "canape-menu";
  if (!state.canapeDishes.length) { alert("Add at least one canapé before exporting."); return; }
  const btn = document.getElementById("canape-export-pdf");
  btn.disabled = true; btn.textContent = "Building…";
  const holder = document.createElement("div");
  holder.style.position = "fixed"; holder.style.left = "-10000px"; holder.style.top = "0";
  document.body.appendChild(holder);
  try {
    const pages = buildCanapeMenuPagesHTML(state.canapeDishes, "Canapé Menu");
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const { jsPDF } = window.jspdf;
    let pdf = null;
    for (let i = 0; i < pages.length; i++) {
      holder.innerHTML = `<div class="menu-page-wrap" style="padding:0;">${pages[i]}</div>`;
      const pageEl = holder.querySelector(".menu-page");
      const canvas = await html2canvas(pageEl, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      if (!pdf) pdf = new jsPDF({ unit: "in", format: [PAGE.widthIn, PAGE.heightIn] });
      else pdf.addPage([PAGE.widthIn, PAGE.heightIn]);
      pdf.addImage(imgData, "JPEG", 0, 0, PAGE.widthIn, PAGE.heightIn);
    }
    pdf.save(`${sanitizeFilename(filename)}.pdf`);
  } catch (err) {
    console.error(err);
    alert("Couldn't build the PDF: " + err.message);
  } finally {
    document.body.removeChild(holder);
    btn.disabled = false; btn.textContent = "📕 Export PDF";
  }
}
function printCanape() {
  if (!state.canapeDishes.length) { alert("Add at least one canapé before printing."); return; }
  const pages = buildCanapeMenuPagesHTML(state.canapeDishes, "Canapé Menu");
  document.getElementById("print-area").innerHTML = pages.map((p) => `<div class="menu-page-wrap">${p}</div>`).join("");
  const prevTitle = document.title;
  document.title = sanitizeFilename(document.getElementById("canape-filename").value.trim() || "canape-menu");
  window.print();
  setTimeout(() => { document.title = prevTitle; }, 500);
}

/* ---------------- Canapé prep list (same idea as the Menu Builder's) ---------------- */
function openCanapePrepListModal() {
  const items = state.canapeDishes.filter((d) => (d.prepItems || []).length);
  if (!items.length) {
    alert("None of your canapés have a prep list yet. Add prep items from a canapé's Edit screen, then try again.");
    return;
  }
  openModal(`
    <h3>Prep List — Canapé Menu</h3>
    <div style="max-height:50vh;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:18px;background:#fff;">
      ${buildPrepListHTML(items, "Canapé Menu")}
    </div>
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
      <button id="canape-prep-export-docx" class="btn btn-primary">📄 Export Word</button>
      <button id="canape-prep-export-pdf" class="btn btn-primary">📕 Export PDF</button>
    </div>
  `, { wide: true });
  document.getElementById("canape-prep-export-docx").addEventListener("click", () => exportPrepListDocx(items, "Canapé Menu", "canape-prep-list"));
  document.getElementById("canape-prep-export-pdf").addEventListener("click", () => exportPrepListPdf(items, "Canapé Menu", "canape-prep-list"));
}
