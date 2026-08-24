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
  view: "vault",
  vaultSearch: "",
  vaultCatFilter: "all",
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
  ["vault", "builder", "saved", "import"].forEach((v) => {
    document.getElementById("view-" + v).classList.toggle("hidden", v !== view);
  });
  if (view === "vault") renderVaultShell();
  if (view === "builder") renderBuilderShell();
  if (view === "saved") renderSavedShell();
  if (view === "import") renderImportShell();
}

/* ============================== Modal ============================== */
function openModal(html) {
  document.getElementById("modal-card").innerHTML = `<button class="modal-close" data-action="close-modal">✕</button>${html}`;
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

function openDishModal(dish) {
  const isEdit = !!dish;
  const d = dish || { name: "", category: state.categories[0] || "", description: "", allergens: "", cost: 0 };
  // Dishes migrated before the ingredient editor existed only have a flat
  // `cost` number — seed one row from it so nothing is lost, and the user
  // can break it down into real ingredients whenever they're ready.
  const pendingIngredients = (d.ingredients && d.ingredients.length)
    ? d.ingredients.map((i) => ({ ...i }))
    : (d.cost ? [{ name: "(previous flat estimate)", qty: 1, unit: "portion", unitPrice: d.cost }] : []);

  openModal(`
    <h3>${isEdit ? "Edit Dish" : "Add Dish"}</h3>
    <input id="dm-name" class="field" placeholder="Dish name" value="${escapeHtml(d.name)}">
    <div class="section-title" style="margin-top:0;">Category</div>
    <div id="dm-cats" class="cat-row"></div>
    <textarea id="dm-desc" class="field" placeholder="Description" rows="3">${escapeHtml(d.description)}</textarea>
    <input id="dm-allergens" class="field" placeholder="Allergens (e.g. Dairy, Gluten, Nuts)" value="${escapeHtml(d.allergens)}">

    <div class="section-title">Ingredients &amp; Cost</div>
    <div id="dm-ingredients"></div>
    <button type="button" id="dm-add-ingredient" class="btn btn-outline btn-sm">＋ Add Ingredient</button>
    <div class="cost-bar" style="margin-top:10px;">
      <span>Total dish cost</span>
      <span class="total" id="dm-total-cost">${formatCurrency(ingredientsTotal(pendingIngredients))}</span>
    </div>

    <button id="dm-save" class="btn btn-primary btn-block" style="margin-top:14px;">💾 Save Dish</button>
  `);

  let chosenCat = d.category;
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

  const UNITS = ["kg", "g", "L", "ml", "unit", "portion"];
  function renderIngredientRows() {
    const wrap = document.getElementById("dm-ingredients");
    wrap.innerHTML = pendingIngredients.map((ing, i) => `
      <div class="ingredient-row" data-idx="${i}">
        <div class="ing-name-wrap">
          <input class="field ing-name" placeholder="Search your price list…" autocomplete="off" data-field="name" value="${escapeHtml(ing.name)}">
          <div class="ing-search-results hidden" data-idx="${i}"></div>
        </div>
        <input class="field ing-qty" type="number" step="0.001" min="0" placeholder="Qty" data-field="qty" value="${ing.qty}">
        <select class="field ing-unit" data-field="unit">
          ${UNITS.map((u) => `<option value="${u}" ${ing.unit === u ? "selected" : ""}>${u}</option>`).join("")}
        </select>
        <input class="field ing-price" type="number" step="0.01" min="0" placeholder="Price/unit" data-field="unitPrice" value="${ing.unitPrice}">
        <span class="ing-total">${formatCurrency((Number(ing.qty) || 0) * (Number(ing.unitPrice) || 0))}</span>
        <button type="button" class="btn btn-danger btn-sm" data-remove-ing="${i}">✕</button>
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

  document.getElementById("dm-save").addEventListener("click", async () => {
    const name = document.getElementById("dm-name").value.trim();
    if (!name) { document.getElementById("dm-name").focus(); return; }
    const cleanIngredients = pendingIngredients
      .filter((ing) => ing.name && ing.name.trim())
      .map((ing) => ({ name: ing.name.trim(), qty: Number(ing.qty) || 0, unit: ing.unit || "unit", unitPrice: Number(ing.unitPrice) || 0 }));
    const payload = {
      name,
      category: chosenCat || "Uncategorized",
      description: document.getElementById("dm-desc").value.trim(),
      allergens: document.getElementById("dm-allergens").value.trim(),
      ingredients: cleanIngredients,
      cost: Math.round(ingredientsTotal(cleanIngredients) * 100) / 100,
    };
    if (isEdit) await db.collection("dishes").doc(dish.id).update(payload);
    else await db.collection("dishes").add(payload);
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
          <button id="b-export-pdf" class="btn btn-primary">🖨️ Export PDF</button>
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

  const previewEl = document.getElementById("preview-wrap");
  previewEl.addEventListener("input", handlePreviewInput);
  previewEl.addEventListener("focusout", handlePreviewFocusOut);
  previewEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches && e.target.matches('[contenteditable="true"]')) {
      e.preventDefault();
      e.target.blur();
    }
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
  state.builder.canvas.push({ dishId: d.id, name: d.name, category: d.category, description: d.description, allergens: d.allergens, cost: d.cost });
  renderPickerList();
  renderCanvasAndPreview();
}
function removeFromCanvas(index) {
  state.builder.canvas.splice(index, 1);
  renderPickerList();
  renderCanvasAndPreview();
}
function moveCanvasItem(idx, dir) {
  const arr = state.builder.canvas;
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= arr.length) return;
  [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
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
            <button class="btn btn-ghost btn-sm" data-move="up" data-idx="${i}" ${i === 0 ? "disabled" : ""} style="padding:2px 8px;min-height:0;" title="Move up">↑</button>
            <button class="btn btn-ghost btn-sm" data-move="down" data-idx="${i}" ${i === items.length - 1 ? "disabled" : ""} style="padding:2px 8px;min-height:0;" title="Move down">↓</button>
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
    const groups = groupByCategory(items, state.categories);
    const sectionLabels = opts.sectionLabels || {};
    body = groups.map((g) => {
      const label = Object.prototype.hasOwnProperty.call(sectionLabels, g.category) ? sectionLabels[g.category] : g.category.toUpperCase();
      const dishesHtml = g.items.map((item) => {
        const idx = items.indexOf(item);
        return `<div class="menu-dish ${alignClass}">
          <span class="dname ${ucClass}" ${ce} data-idx="${idx}" data-field="name" data-placeholder="Dish name">${escapeHtml(item.name)}</span>
          <span class="dallergens" ${ce} data-idx="${idx}" data-field="allergens" data-placeholder="allergens">${escapeHtml(item.allergens)}</span>
          <span class="ddesc" ${ce} data-idx="${idx}" data-field="description" data-placeholder="Add a description…" style="${opts.italics ? "" : "font-style:normal;"}">${escapeHtml(item.description)}</span>
        </div>`;
      }).join("");
      return `
      <div class="menu-section ${alignClass}" ${ce} data-field="section" data-category="${escapeHtml(g.category)}" data-placeholder="(section name — click to restore)">${escapeHtml(label)}</div>
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
        ${body}
      </div>
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
    totalCost: total, updatedAt: Date.now(),
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

    groupByCategory(b.canvas, state.categories).forEach((g) => {
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

/* ---------------- Export: PDF (browser print) ---------------- */
function exportPdf() {
  const b = state.builder;
  if (!b.canvas.length) { alert("Add at least one dish before exporting."); return; }
  const html = buildMenuPageHTML(b.canvas, { alignment: b.alignment, uppercase: b.uppercase, italics: b.italics, titleText: b.titleText, sectionLabels: b.sectionLabels, editable: false });
  document.getElementById("print-area").innerHTML = `<div class="menu-page-wrap">${html}</div>`;
  const prevTitle = document.title;
  document.title = sanitizeFilename(b.filename || b.titleText);
  window.print();
  setTimeout(() => { document.title = prevTitle; }, 500);
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
  };
  switchView("builder");
}
async function deleteMenu(id) {
  if (!confirm("Delete this saved menu?")) return;
  await db.collection("menus").doc(id).delete();
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
