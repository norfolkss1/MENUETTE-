/* global db, STUDIOS, STUDIO_KEYS, PAGE, state, studioOf, builderOf, dishesOf, sectionsOf,
   freshBuilder, escapeHtml, formatCurrency, sanitizeFilename, plural, nameKey, groupByCategory,
   downloadBlob, resizeImageFile, ingredientsTotal, openModal, closeModal, openSectionManager,
   toast, docx, html2canvas */

/* ==========================================================================
   MENU STUDIO — the shared builder behind the DDR, Buffet and Canapé pages.
   Every function here takes a studio key and reads its behaviour from the
   STUDIOS table in app.js, so the three pages stay identical in mechanics
   (library → canvas → live preview → export → prep) and differ only in data
   and page styling.
   ========================================================================== */

function renderStudioShell(studioKey) {
  const st = studioOf(studioKey);
  const b = builderOf(studioKey);
  const el = document.getElementById("view-" + studioKey);

  el.innerHTML = `
    <div class="studio">
      <header class="studio-top">
        <div class="studio-heading">
          <h1>${st.icon} ${escapeHtml(st.label)}</h1>
          <p>${escapeHtml(st.blurb)}</p>
        </div>
        <div class="studio-actions">
          <button class="btn btn-ghost btn-sm" data-act="prep">🧾 Prep list</button>
          <button class="btn btn-ghost btn-sm" data-act="print">🖨️ Print</button>
          <button class="btn btn-outline btn-sm" data-act="docx">📄 Word</button>
          <button class="btn btn-outline btn-sm" data-act="pdf">📕 PDF</button>
          <button class="btn btn-primary btn-sm" data-act="save">💾 Save menu</button>
        </div>
      </header>

      <div class="studio-body">
        <section class="rail">
          <div class="rail-tabs">
            <button class="rail-tab ${b.pane === "library" ? "active" : ""}" data-pane="library">
              ${escapeHtml(st.short)} Library <span class="rail-tab-count" id="rail-lib-count-${studioKey}"></span>
            </button>
            <button class="rail-tab ${b.pane === "canvas" ? "active" : ""}" data-pane="canvas">
              Canvas <span class="rail-tab-count" id="rail-canvas-count-${studioKey}"></span>
            </button>
          </div>
          <div class="rail-body">
            <div id="pane-library-${studioKey}" class="${b.pane === "library" ? "" : "hidden"}">
              ${st.stationBlocks ? `
              <div class="seg-tabs seg-tabs-sm">
                <button class="seg ${b.source === "dishes" ? "active" : ""}" data-source="dishes">Dishes</button>
                <button class="seg ${b.source === "stations" ? "active" : ""}" data-source="stations">Ready-made stations</button>
              </div>` : ""}
              <div class="rail-toolbar">
                <input id="picker-search-${studioKey}" class="field field-sm" placeholder="🔍 Search ${escapeHtml(st.plural)}…" value="${escapeHtml(b.pickerSearch)}">
                <button class="btn btn-primary btn-sm" data-act="add-dish" title="Add a new ${escapeHtml(st.noun.toLowerCase())}">＋ New</button>
              </div>
              <div id="picker-cats-${studioKey}" class="cat-row"></div>
              <div id="picker-list-${studioKey}" class="rail-list"></div>
            </div>

            <div id="pane-canvas-${studioKey}" class="${b.pane === "canvas" ? "" : "hidden"}">
              <div id="canvas-list-${studioKey}" class="rail-list"></div>
              <div id="canvas-cost-${studioKey}"></div>

              <div class="rail-section">Page settings</div>
              <input id="b-title-${studioKey}" class="field field-sm" placeholder="Menu title" value="${escapeHtml(b.titleText)}">
              <div class="opt-row">
                <label class="opt"><input type="radio" name="b-align-${studioKey}" value="center" ${b.alignment === "center" ? "checked" : ""}> Centred</label>
                <label class="opt"><input type="radio" name="b-align-${studioKey}" value="left" ${b.alignment === "left" ? "checked" : ""}> Left</label>
              </div>
              <div class="opt-row">
                <label class="opt"><input type="checkbox" id="b-upper-${studioKey}" ${b.uppercase ? "checked" : ""}> UPPERCASE names</label>
                <label class="opt"><input type="checkbox" id="b-italic-${studioKey}" ${b.italics ? "checked" : ""}> Italic descriptions</label>
              </div>
              ${st.photos ? `
              <div class="opt-row">
                <label class="opt"><input type="checkbox" id="b-photos-${studioKey}" ${b.photoLayout ? "checked" : ""}> Show photos</label>
              </div>` : ""}
              <input id="b-filename-${studioKey}" class="field field-sm" placeholder="File name (no extension)" value="${escapeHtml(b.filename)}">
              <button class="btn btn-ghost btn-sm btn-block" data-act="clear">Start a new blank menu</button>
            </div>
          </div>
        </section>

        <section class="stage">
          <div class="stage-bar">
            <span class="stage-label">Live preview</span>
            <span class="stage-hint">Click any text on the page to edit it</span>
            <span class="stage-pages" id="stage-pages-${studioKey}"></span>
          </div>
          <div id="preview-wrap-${studioKey}" class="stage-scroll"></div>
        </section>
      </div>
    </div>
  `;

  /* --- rail tabs --- */
  el.querySelectorAll(".rail-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      b.pane = tab.dataset.pane;
      el.querySelectorAll(".rail-tab").forEach((t) => t.classList.toggle("active", t.dataset.pane === b.pane));
      document.getElementById(`pane-library-${studioKey}`).classList.toggle("hidden", b.pane !== "library");
      document.getElementById(`pane-canvas-${studioKey}`).classList.toggle("hidden", b.pane !== "canvas");
    });
  });

  /* --- library controls --- */
  document.getElementById(`picker-search-${studioKey}`).addEventListener("input", (e) => {
    b.pickerSearch = e.target.value;
    renderPickerList(studioKey);
  });
  el.querySelector('[data-act="add-dish"]').addEventListener("click", () => openDishModal(studioKey, null));
  el.querySelectorAll("[data-source]").forEach((tab) => tab.addEventListener("click", () => {
    b.source = tab.dataset.source;
    el.querySelectorAll("[data-source]").forEach((t) => t.classList.toggle("active", t.dataset.source === b.source));
    renderPickerCatChips(studioKey);
    renderPickerList(studioKey);
  }));

  /* --- page settings --- */
  document.getElementById(`b-title-${studioKey}`).addEventListener("input", (e) => {
    b.titleText = e.target.value; renderPreview(studioKey);
  });
  document.getElementById(`b-filename-${studioKey}`).addEventListener("input", (e) => { b.filename = e.target.value; });
  el.querySelectorAll(`input[name="b-align-${studioKey}"]`).forEach((r) =>
    r.addEventListener("change", (e) => { b.alignment = e.target.value; renderPreview(studioKey); }));
  document.getElementById(`b-upper-${studioKey}`).addEventListener("change", (e) => { b.uppercase = e.target.checked; renderPreview(studioKey); });
  document.getElementById(`b-italic-${studioKey}`).addEventListener("change", (e) => { b.italics = e.target.checked; renderPreview(studioKey); });
  if (st.photos) {
    document.getElementById(`b-photos-${studioKey}`).addEventListener("change", (e) => { b.photoLayout = e.target.checked; renderPreview(studioKey); });
  }
  el.querySelector('[data-act="clear"]').addEventListener("click", () => {
    if (b.canvas.length && !confirm("Clear this menu and start a blank one?")) return;
    state.builders[studioKey] = freshBuilder(studioKey);
    renderStudioShell(studioKey);
  });

  /* --- top actions --- */
  el.querySelector('[data-act="save"]').addEventListener("click", () => saveCurrentMenu(studioKey));
  el.querySelector('[data-act="docx"]').addEventListener("click", (e) => exportMenuDocx(studioKey, e.currentTarget));
  el.querySelector('[data-act="pdf"]').addEventListener("click", (e) => exportMenuPdf(studioKey, e.currentTarget));
  el.querySelector('[data-act="print"]').addEventListener("click", () => printMenu(studioKey));
  el.querySelector('[data-act="prep"]').addEventListener("click", () => openPrepListModal(studioKey));

  /* --- live preview editing --- */
  const previewEl = document.getElementById(`preview-wrap-${studioKey}`);
  previewEl.addEventListener("input", (e) => handlePreviewInput(studioKey, e));
  previewEl.addEventListener("focusout", (e) => handlePreviewFocusOut(studioKey, e));
  previewEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches && e.target.matches('[contenteditable="true"]')) {
      e.preventDefault();
      e.target.blur();
    }
  });
  previewEl.addEventListener("click", (e) => {
    const moveBtn = e.target.closest("[data-move-section]");
    if (moveBtn) { moveSection(studioKey, moveBtn.dataset.category, moveBtn.dataset.moveSection === "up" ? -1 : 1); return; }
    const dropBtn = e.target.closest("[data-drop-dish]");
    if (dropBtn) removeFromCanvas(studioKey, Number(dropBtn.dataset.dropDish));
  });

  renderPickerCatChips(studioKey);
  renderPickerList(studioKey);
  renderCanvasAndPreview(studioKey);
}

/* ============================== Library pane ============================== */
/* Buffet has 23 stations — left unrolled that fills the whole rail and pushes
   the dishes off screen, so long section lists collapse to the first couple of
   rows behind a "＋ N more" chip. The selected section is always kept visible. */
const CHIP_COLLAPSE_AFTER = 9;

function renderPickerCatChips(studioKey) {
  const wrap = document.getElementById(`picker-cats-${studioKey}`);
  if (!wrap) return;
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  // In station mode the chips count ready-made blocks, not individual dishes.
  const stationMode = st.stationBlocks && b.source === "stations";
  const pool = stationMode ? state.stationBlocks.map((s) => ({ category: s.station })) : dishesOf(studioKey);
  const counts = {};
  pool.forEach((d) => { counts[d.category] = (counts[d.category] || 0) + 1; });

  const sections = sectionsOf(studioKey);
  const collapsible = sections.length > CHIP_COLLAPSE_AFTER;
  const expanded = !collapsible || b.chipsExpanded;
  let shown = sections;
  if (!expanded) {
    shown = sections.slice(0, CHIP_COLLAPSE_AFTER);
    if (b.pickerCatFilter !== "all" && !shown.includes(b.pickerCatFilter)) shown = shown.concat(b.pickerCatFilter);
  }

  const chip = (c) => `<button class="cat-chip ${b.pickerCatFilter === c ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}${counts[c] ? ` <span class="chip-n">${counts[c]}</span>` : ""}</button>`;

  wrap.innerHTML =
    `<button class="cat-chip ${b.pickerCatFilter === "all" ? "active" : ""}" data-cat="all">All <span class="chip-n">${pool.length}</span></button>` +
    shown.map(chip).join("") +
    (collapsible
      ? `<button class="cat-chip chip-more" data-toggle-chips="1">${expanded ? "− Show fewer" : `＋ ${sections.length - shown.length} more`}</button>`
      : "") +
    `<button class="cat-chip manage" data-manage="1">⚙ ${escapeHtml(st.sectionsNoun)}s</button>`;

  wrap.querySelectorAll(".cat-chip[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      b.pickerCatFilter = btn.dataset.cat;
      renderPickerCatChips(studioKey);
      renderPickerList(studioKey);
    });
  });
  const moreBtn = wrap.querySelector("[data-toggle-chips]");
  if (moreBtn) moreBtn.addEventListener("click", () => { b.chipsExpanded = !b.chipsExpanded; renderPickerCatChips(studioKey); });
  wrap.querySelector("[data-manage]").addEventListener("click", () => openSectionManager(studioKey));
}

function renderPickerList(studioKey) {
  const listEl = document.getElementById(`picker-list-${studioKey}`);
  if (!listEl) return;
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  const q = b.pickerSearch.trim().toLowerCase();

  if (st.stationBlocks && b.source === "stations") { renderStationBlockList(studioKey); return; }

  let rows = dishesOf(studioKey);
  if (b.pickerCatFilter !== "all") rows = rows.filter((d) => d.category === b.pickerCatFilter);
  if (q) rows = rows.filter((d) => [d.name, d.category, d.description, d.allergens].some((f) => String(f || "").toLowerCase().includes(q)));

  const countEl = document.getElementById(`rail-lib-count-${studioKey}`);
  if (countEl) countEl.textContent = dishesOf(studioKey).length;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-note">${dishesOf(studioKey).length
      ? "Nothing matches that search."
      : `No ${escapeHtml(st.plural)} yet — click <b>＋ New</b> to add the first one.`}</div>`;
    return;
  }

  const inCanvas = new Set(b.canvas.map((i) => i.dishId));
  listEl.innerHTML = rows.map((d) => {
    const added = inCanvas.has(d.id);
    const prepN = (d.prepItems || []).length;
    return `
    <div class="dish-row ${added ? "is-added" : ""}">
      ${st.photos ? `<div class="dish-thumb" style="${d.imageBase64 ? `background-image:url('${d.imageBase64}')` : ""}">${d.imageBase64 ? "" : "🥂"}</div>` : ""}
      <div class="dish-row-main">
        <div class="dish-row-name">${escapeHtml(d.name)}</div>
        <div class="dish-row-meta">
          <span class="badge">${escapeHtml(d.category || "—")}</span>
          ${d.allergens ? `<span class="badge badge-quiet">${escapeHtml(d.allergens)}</span>` : ""}
          ${prepN ? `<span class="badge badge-prep" title="${prepN} prep items">🧾 ${prepN}</span>` : `<span class="badge badge-warn" title="No prep list yet">no prep</span>`}
        </div>
        ${d.description ? `<div class="dish-row-desc">${escapeHtml(d.description)}</div>` : ""}
      </div>
      <div class="dish-row-side">
        ${st.costing && d.cost ? `<div class="dish-row-cost">${formatCurrency(d.cost)}</div>` : ""}
        <div class="dish-row-btns">
          <button class="icon-btn" data-edit="${d.id}" title="Edit">✎</button>
          <button class="btn btn-sm ${added ? "btn-ghost" : "btn-primary"}" data-add="${d.id}" ${added ? "disabled" : ""}>${added ? "✓ On menu" : "＋ Add"}</button>
        </div>
      </div>
    </div>`;
  }).join("");

  listEl.querySelectorAll("[data-add]").forEach((btn) =>
    btn.addEventListener("click", () => addToCanvas(studioKey, btn.dataset.add)));
  listEl.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openDishModal(studioKey, dishesOf(studioKey).find((d) => d.id === btn.dataset.edit))));
}

/* ---------------- Ready-made station blocks (Buffet) ----------------
   A block is a whole station as it ran on a real menu — "Grill Station" with
   its four items — so a new buffet can be assembled from stations rather than
   one dish at a time. Adding a block puts every one of its items on the canvas
   under that station. */
function renderStationBlockList(studioKey) {
  const listEl = document.getElementById(`picker-list-${studioKey}`);
  const b = builderOf(studioKey);
  const q = b.pickerSearch.trim().toLowerCase();

  let rows = state.stationBlocks;
  if (b.pickerCatFilter !== "all") rows = rows.filter((s) => s.station === b.pickerCatFilter);
  if (q) {
    rows = rows.filter((s) => String(s.station || "").toLowerCase().includes(q) ||
      String(s.source || "").toLowerCase().includes(q) ||
      (s.items || []).some((i) => String(i.name || "").toLowerCase().includes(q)));
  }

  const countEl = document.getElementById(`rail-lib-count-${studioKey}`);
  if (countEl) countEl.textContent = state.stationBlocks.length;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-note">${state.stationBlocks.length
      ? "No stations match that search."
      : "No ready-made stations yet."}</div>`;
    return;
  }

  const onCanvas = new Set(builderOf(studioKey).canvas.map((i) => nameKey(i.name) + "|" + i.category));
  listEl.innerHTML = rows.map((s) => {
    const items = s.items || [];
    const already = items.filter((i) => onCanvas.has(nameKey(i.name) + "|" + s.station)).length;
    return `
    <div class="station-card ${already === items.length ? "is-added" : ""}">
      <header>
        <div>
          <div class="station-name">${escapeHtml(s.station)}</div>
          <div class="station-meta">
            <span class="badge badge-quiet">${plural(items.length, "item")}</span>
            <span class="station-source">from ${escapeHtml(s.source || "—")}</span>
          </div>
        </div>
        <button class="btn btn-sm ${already === items.length ? "btn-ghost" : "btn-primary"}" data-add-station="${s.id}" ${already === items.length ? "disabled" : ""}>
          ${already === items.length ? "✓ On menu" : already ? `＋ Add ${items.length - already}` : "＋ Add all"}
        </button>
      </header>
      <ul class="station-items">${items.map((i) => `<li>${escapeHtml(i.name)}</li>`).join("")}</ul>
    </div>`;
  }).join("");

  listEl.querySelectorAll("[data-add-station]").forEach((btn) =>
    btn.addEventListener("click", () => addStationBlock(studioKey, btn.dataset.addStation)));
}

function addStationBlock(studioKey, blockId) {
  const block = state.stationBlocks.find((s) => s.id === blockId);
  if (!block) return;
  const b = builderOf(studioKey);
  const library = dishesOf(studioKey);
  let added = 0;

  (block.items || []).forEach((item) => {
    const key = nameKey(item.name);
    if (b.canvas.some((c) => nameKey(c.name) === key && c.category === block.station)) return;
    // Prefer the library's own record for the dish so its allergens, cost and
    // prep list come along; fall back to the bare block entry if it isn't one.
    const dish = library.find((d) => nameKey(d.name) === key && d.category === block.station)
              || library.find((d) => nameKey(d.name) === key);
    b.canvas.push(dish
      ? { dishId: dish.id, name: dish.name, category: block.station, description: dish.description || item.description || "",
          allergens: dish.allergens || "", cost: dish.cost || 0, imageBase64: "", prepItems: (dish.prepItems || []).slice() }
      : { dishId: "block:" + blockId + ":" + key, name: item.name, category: block.station,
          description: item.description || "", allergens: "", cost: 0, imageBase64: "", prepItems: [] });
    added++;
  });

  if (!added) { toast("Every item from that station is already on the menu."); return; }
  renderPickerList(studioKey);
  renderCanvasAndPreview(studioKey);
  toast(`Added ${plural(added, "item")} to ${block.station}.`);
}

/* ============================== Canvas ============================== */
function addToCanvas(studioKey, dishId) {
  const b = builderOf(studioKey);
  const d = dishesOf(studioKey).find((x) => x.id === dishId);
  if (!d || b.canvas.some((i) => i.dishId === dishId)) return;
  b.canvas.push({
    dishId: d.id,
    name: d.name,
    category: d.category || "Uncategorized",
    description: d.description || "",
    allergens: d.allergens || "",
    cost: d.cost || 0,
    imageBase64: d.imageBase64 || "",
    prepItems: (d.prepItems || []).slice(),
  });
  renderPickerList(studioKey);
  renderCanvasAndPreview(studioKey);
}

function removeFromCanvas(studioKey, index) {
  builderOf(studioKey).canvas.splice(index, 1);
  renderPickerList(studioKey);
  renderCanvasAndPreview(studioKey);
}

function findSameCategoryNeighbor(arr, idx, dir) {
  // The preview groups dishes by section, so a plain adjacent-index swap is
  // often invisible when the immediate neighbour sits in a different section.
  // Skip past other sections to the nearest dish in the SAME one, so every
  // up/down click visibly reorders the page.
  const cat = arr[idx].category;
  let i = idx + dir;
  while (i >= 0 && i < arr.length) {
    if (arr[i].category === cat) return i;
    i += dir;
  }
  return -1;
}

function moveCanvasItem(studioKey, idx, dir) {
  const arr = builderOf(studioKey).canvas;
  const swapIdx = findSameCategoryNeighbor(arr, idx, dir);
  if (swapIdx === -1) return;
  [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
  renderCanvasAndPreview(studioKey);
}

function getSectionOrder(studioKey) {
  const b = builderOf(studioKey);
  if (b.sectionOrder && b.sectionOrder.length) return b.sectionOrder;
  // Lazily derive the natural order (the studio's own section list, plus any
  // leftover categories present on the canvas) the first time it's needed.
  return groupByCategory(b.canvas, sectionsOf(studioKey)).map((g) => g.category);
}

function moveSection(studioKey, category, dir) {
  const order = getSectionOrder(studioKey).slice();
  const idx = order.indexOf(category);
  const swapIdx = idx + dir;
  if (idx === -1 || swapIdx < 0 || swapIdx >= order.length) return;
  [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
  builderOf(studioKey).sectionOrder = order;
  renderCanvasAndPreview(studioKey);
}

function syncCanvasPane(studioKey) {
  const canvasEl = document.getElementById(`canvas-list-${studioKey}`);
  const costEl = document.getElementById(`canvas-cost-${studioKey}`);
  if (!canvasEl) return;
  const st = studioOf(studioKey);
  const items = builderOf(studioKey).canvas;

  const countEl = document.getElementById(`rail-canvas-count-${studioKey}`);
  if (countEl) countEl.textContent = items.length;

  if (!items.length) {
    canvasEl.innerHTML = `<div class="empty-note">Nothing on the menu yet. Open the <b>${escapeHtml(st.short)} Library</b> tab and hit ＋ Add on any ${escapeHtml(st.noun.toLowerCase())}.</div>`;
  } else {
    canvasEl.innerHTML = groupByCategory(items, getSectionOrder(studioKey)).map((g) => `
      <div class="canvas-group">
        <div class="canvas-group-head">${escapeHtml(g.category)} <span class="chip-n">${g.items.length}</span></div>
        ${g.items.map((item) => {
          const i = items.indexOf(item);
          return `
          <div class="canvas-row">
            <div class="canvas-row-name">${escapeHtml(item.name)}</div>
            <div class="canvas-row-btns">
              <button class="icon-btn" data-move="up" data-idx="${i}" ${findSameCategoryNeighbor(items, i, -1) === -1 ? "disabled" : ""} title="Move up">↑</button>
              <button class="icon-btn" data-move="down" data-idx="${i}" ${findSameCategoryNeighbor(items, i, 1) === -1 ? "disabled" : ""} title="Move down">↓</button>
              <button class="icon-btn icon-btn-danger" data-remove="${i}" title="Remove from menu">✕</button>
            </div>
          </div>`;
        }).join("")}
      </div>
    `).join("");
    canvasEl.querySelectorAll("[data-remove]").forEach((btn) =>
      btn.addEventListener("click", () => removeFromCanvas(studioKey, Number(btn.dataset.remove))));
    canvasEl.querySelectorAll("[data-move]").forEach((btn) =>
      btn.addEventListener("click", () => moveCanvasItem(studioKey, Number(btn.dataset.idx), btn.dataset.move === "up" ? -1 : 1)));
  }

  if (st.costing) {
    const total = items.reduce((s, i) => s + (Number(i.cost) || 0), 0);
    const withPrep = items.filter((i) => (i.prepItems || []).length).length;
    costEl.innerHTML = `
      <div class="cost-bar"><span>Food cost, per cover</span><span class="total">${formatCurrency(total)}</span></div>
      ${items.length ? `<div class="cost-note">${withPrep} of ${items.length} ${items.length === 1 ? "dish has" : "dishes have"} a prep list</div>` : ""}
    `;
  } else costEl.innerHTML = "";
}

function renderCanvasAndPreview(studioKey) {
  syncCanvasPane(studioKey);
  renderPreview(studioKey);
}

/* ============================== Live preview ==============================
   Typing updates the canvas/title in state immediately (so Save and every
   export always see the latest text) but does NOT re-render the preview on
   each keystroke — that would destroy the cursor position mid-word. The rail
   is resynced on focusout instead. */
function handlePreviewInput(studioKey, e) {
  const el = e.target;
  if (!el.matches || !el.matches('[contenteditable="true"]')) return;
  const b = builderOf(studioKey);
  const field = el.dataset.field;
  const text = el.textContent;
  if (field === "title") b.titleText = text;
  else if (field === "section") b.sectionLabels[el.dataset.category] = text;
  else if (el.dataset.idx !== undefined) {
    const idx = Number(el.dataset.idx);
    if (b.canvas[idx]) b.canvas[idx][field] = text;
  }
}

function handlePreviewFocusOut(studioKey, e) {
  const el = e.target;
  if (!el.matches || !el.matches('[contenteditable="true"]')) return;
  const titleInput = document.getElementById(`b-title-${studioKey}`);
  if (titleInput) titleInput.value = builderOf(studioKey).titleText;
  syncCanvasPane(studioKey);
}

function previewOptions(studioKey, overrides) {
  const b = builderOf(studioKey);
  return Object.assign({
    studioKey,
    alignment: b.alignment,
    uppercase: b.uppercase,
    italics: b.italics,
    photoLayout: b.photoLayout,
    titleText: b.titleText,
    sectionLabels: b.sectionLabels,
    sectionOrder: getSectionOrder(studioKey),
    editable: true,
  }, overrides || {});
}

function sectionLabelFor(category, opts) {
  const labels = opts.sectionLabels || {};
  return Object.prototype.hasOwnProperty.call(labels, category) ? labels[category] : String(category).toUpperCase();
}

function buildSectionHeaderHTML(category, opts, groupIndex, groupCount, continued) {
  const alignClass = opts.alignment === "left" ? "align-left" : "align-center";
  // A repeated header at the top of a continuation page is display-only: two
  // editable nodes bound to the same section would fight over the same state.
  const ce = opts.editable && !continued ? `contenteditable="true"` : "";
  const moveCol = opts.editable && !continued ? `
    <div class="section-move-col">
      <button type="button" class="section-move-btn" data-move-section="up" data-category="${escapeHtml(category)}" ${groupIndex === 0 ? "disabled" : ""} title="Move section up">▲</button>
      <button type="button" class="section-move-btn" data-move-section="down" data-category="${escapeHtml(category)}" ${groupIndex === groupCount - 1 ? "disabled" : ""} title="Move section down">▼</button>
    </div>` : "";
  return `
    <div class="menu-section-row ${alignClass}">
      <div class="menu-section" ${ce} data-field="section" data-category="${escapeHtml(category)}" data-placeholder="(section name — click to restore)">${escapeHtml(sectionLabelFor(category, opts))}</div>
      ${moveCol}
    </div>`;
}

function buildDishHTML(item, idx, opts) {
  const st = studioOf(opts.studioKey);
  const alignClass = opts.alignment === "left" ? "align-left" : "align-center";
  const ucClass = opts.uppercase ? "uc" : "";
  const ce = opts.editable ? `contenteditable="true"` : "";
  const dropBtn = opts.editable ? `<button type="button" class="dish-drop" data-drop-dish="${idx}" title="Remove from menu">✕</button>` : "";
  const nameHtml = `<span class="dname ${ucClass}" ${ce} data-idx="${idx}" data-field="name" data-placeholder="${escapeHtml(st.noun)} name">${escapeHtml(item.name)}</span>`;
  const allergHtml = `<span class="dallergens" ${ce} data-idx="${idx}" data-field="allergens" data-placeholder="allergens">${escapeHtml(item.allergens || "")}</span>`;
  const descHtml = `<span class="ddesc" ${ce} data-idx="${idx}" data-field="description" data-placeholder="Add a description…" style="${opts.italics ? "" : "font-style:normal;"}">${escapeHtml(item.description || "")}</span>`;

  if (st.photos && opts.photoLayout) {
    return `<div class="canape-card ${alignClass}">
      ${dropBtn}
      <div class="canape-photo" style="${item.imageBase64 ? `background-image:url('${item.imageBase64}')` : ""}"></div>
      <div class="canape-text">${nameHtml}${allergHtml}${descHtml}</div>
    </div>`;
  }
  return `<div class="menu-dish ${alignClass}">${dropBtn}${nameHtml}${allergHtml}${descHtml}</div>`;
}

/* Flatten the canvas into the units pagination packs: a section heading, then
   one unit per dish (or per pair of dishes in the photo grid, since those sit
   side by side). Splitting per dish rather than per section is what lets a long
   section flow across pages instead of overflowing off the bottom of one. */
function buildUnits(items, opts) {
  const st = studioOf(opts.studioKey);
  const usePhotos = st.photos && opts.photoLayout;
  // Photo cards run one per row, full width — three to a page.
  const perRow = 1;
  const groups = groupByCategory(items, opts.sectionOrder && opts.sectionOrder.length ? opts.sectionOrder : sectionsOf(opts.studioKey));
  const units = [];

  groups.forEach((g, gi) => {
    units.push({
      kind: "section", category: g.category, groupIndex: gi, groupCount: groups.length,
      html: buildSectionHeaderHTML(g.category, opts, gi, groups.length, false),
    });
    for (let i = 0; i < g.items.length; i += perRow) {
      const rowItems = g.items.slice(i, i + perRow);
      const inner = rowItems.map((it) => buildDishHTML(it, items.indexOf(it), opts)).join("");
      units.push({
        kind: "dish", category: g.category, items: rowItems,
        html: usePhotos ? `<div class="canape-grid">${inner}</div>` : inner,
      });
    }
  });
  return units;
}

function buildStudioPageHTML(bodyHtml, opts, pageIndex, pageCount) {
  const st = studioOf(opts.studioKey);
  const alignClass = opts.alignment === "left" ? "align-left" : "align-center";
  const ucClass = opts.uppercase ? "uc" : "";
  const ce = opts.editable ? `contenteditable="true"` : "";
  const first = pageIndex === undefined || pageIndex === 0;

  // Only the first page carries the menu title; continuation pages keep the
  // frame and legend so every printed sheet still reads as the same document.
  const head = first
    ? `<div class="menu-title ${alignClass} ${ucClass}" ${ce} data-field="title" data-placeholder="Menu title">${escapeHtml(opts.titleText || "")}</div>
       <div class="menu-title-rule ${alignClass}"></div>`
    : `<div class="menu-title-rule ${alignClass} continued"></div>`;

  const pageNo = pageCount > 1 ? `<div class="page-number">${(pageIndex || 0) + 1} / ${pageCount}</div>` : "";

  return `
    <div class="menu-page theme-${st.theme}">
      ${st.theme === "sand" ? `<div class="border-strip"></div>` : `<div class="marble-wash"></div>`}
      <div class="brand-logo"></div>
      <div class="menu-content">
        ${head}
        ${bodyHtml}
      </div>
      <div class="allergen-legend">Allergens: D — Dairy &nbsp;·&nbsp; G — Gluten &nbsp;·&nbsp; S — Seafood &nbsp;·&nbsp; N — Nuts</div>
      ${pageNo}
    </div>
  `;
}

/* Real DOM measurement, not a guessed line budget — renders every unit once
   off-screen and packs pages from actual rendered top/bottom positions (not
   summed isolated heights, which silently drop the margin gaps *between*
   blocks), so pagination stays correct whatever the fonts or content do and
   never spills over the legend or logo.

   Returns [{ units, continuedSection }] — continuedSection is set when a page
   picks up mid-section and therefore needs its heading repeated at the top. */
function paginateUnits(units, opts) {
  if (!units.length) return [{ units: [], continuedSection: null }];

  const probe = document.createElement("div");
  probe.style.position = "fixed";
  probe.style.left = "-10000px";
  probe.style.top = "0";
  probe.innerHTML = buildStudioPageHTML(
    units.map((u) => `<div class="page-block">${u.html}</div>`).join(""),
    Object.assign({}, opts, { editable: false }), 0, 1
  );
  document.body.appendChild(probe);

  const pageEl = probe.querySelector(".menu-page");
  // Everything renders on one over-tall page so every unit can be measured in
  // a single pass — .menu-page only has a min-height, so left alone it grows to
  // fit. Pin it to the true page height so the legend's absolute position
  // measures against the real page boundary; overflow:hidden only clips units
  // from view, not from layout, so getBoundingClientRect() still reports them.
  pageEl.style.height = PAGE.heightIn + "in";
  const legendEl = probe.querySelector(".allergen-legend");
  const ruleEl = probe.querySelector(".menu-title-rule");
  const blocks = Array.from(probe.querySelectorAll(".page-block"));
  const pageTop = pageEl.getBoundingClientRect().top;
  const usableBottom = legendEl.getBoundingClientRect().top - pageTop - 10;
  const contentStartTop = ruleEl.getBoundingClientRect().bottom - pageTop + 10;
  const tops = blocks.map((el) => el.getBoundingClientRect().top - pageTop);
  const bottoms = blocks.map((el) => el.getBoundingClientRect().bottom - pageTop);

  // How much a repeated heading costs at the top of a continuation page.
  const firstHeaderIdx = units.findIndex((u) => u.kind === "section");
  const headerH = firstHeaderIdx === -1 ? 0 : (bottoms[firstHeaderIdx] - tops[firstHeaderIdx]) + 12;
  document.body.removeChild(probe);

  const usableHeight = usableBottom - contentStartTop;
  const pages = [];
  let current = [];
  let continuedSection = null;
  let pageStartTop = tops[0];
  let reserved = 0;
  let liveSection = null;

  units.forEach((u, i) => {
    if (u.kind === "section") liveSection = u.category;
    // A heading must bring at least its first row with it — a heading stranded
    // alone at the foot of a page reads as an empty section.
    const needBottom = (u.kind === "section" && i + 1 < units.length) ? bottoms[i + 1] : bottoms[i];
    const consumed = needBottom - pageStartTop;

    if (current.length && consumed > usableHeight - reserved) {
      pages.push({ units: current, continuedSection });
      current = [];
      continuedSection = u.kind === "dish" ? liveSection : null;
      reserved = continuedSection ? headerH : 0;
      pageStartTop = tops[i];
    }
    current.push(u);
  });
  if (current.length) pages.push({ units: current, continuedSection });
  return pages;
}

/* Returns an array of full-page HTML strings for the given canvas. */
function buildMenuPagesHTML(items, opts) {
  if (!items.length) {
    return [buildStudioPageHTML(
      `<div class="menu-empty">Add ${escapeHtml(studioOf(opts.studioKey).plural)} from the library to see them here.</div>`,
      opts, 0, 1
    )];
  }
  const pages = paginateUnits(buildUnits(items, opts), opts);
  return pages.map((page, i) => {
    // Wrapped in .page-block exactly as the measuring probe does, so the page
    // that gets rendered is the same DOM that pagination was computed against.
    const head = page.continuedSection
      ? `<div class="page-block">${buildSectionHeaderHTML(page.continuedSection, opts, 0, 1, true)}</div>`
      : "";
    const body = page.units.map((u) => `<div class="page-block">${u.html}</div>`).join("");
    return buildStudioPageHTML(head + body, opts, i, pages.length);
  });
}

function renderPreview(studioKey) {
  const previewEl = document.getElementById(`preview-wrap-${studioKey}`);
  if (!previewEl) return;
  const opts = previewOptions(studioKey);
  const pages = buildMenuPagesHTML(builderOf(studioKey).canvas, opts);
  previewEl.innerHTML = pages.map((p) => `<div class="menu-page-wrap">${p}</div>`).join("");
  const pagesEl = document.getElementById(`stage-pages-${studioKey}`);
  if (pagesEl) pagesEl.textContent = builderOf(studioKey).canvas.length ? plural(pages.length, "page") : "";
}

/* ============================== Dish editor ==============================
   Shared by all three studios; the studio's config decides whether the modal
   shows a photo field, a section picker, and the costing block. */
function openDishModal(studioKey, dish) {
  const st = studioOf(studioKey);
  const isEdit = !!dish;
  const d = dish || { name: "", category: sectionsOf(studioKey)[0] || "", description: "", allergens: "", cost: 0, prepItems: [], imageBase64: "" };

  // Dishes migrated before the ingredient editor existed only have a flat
  // `cost` number — seed one row from it so nothing is lost, and the user can
  // break it down into real ingredients whenever they're ready.
  const pendingIngredients = (d.ingredients && d.ingredients.length)
    ? d.ingredients.map((i) => ({ ...i }))
    : (d.cost ? [{ name: "(previous flat estimate)", qty: 1, unit: "portion", unitPrice: d.cost }] : []);
  const pendingPrepItems = (d.prepItems || []).slice();
  let pendingImage = d.imageBase64 || "";
  let chosenCat = d.category || sectionsOf(studioKey)[0] || "";

  openModal(`
    <h3>${isEdit ? "Edit" : "New"} ${escapeHtml(st.noun)}</h3>
    ${st.photos ? `
      <div class="section-title" style="margin-top:0;">Photo</div>
      <div id="dm-image-preview"></div>
      <input type="file" id="dm-image-file" accept="image/*" class="field">
    ` : ""}
    <input id="dm-name" class="field" placeholder="${escapeHtml(st.noun)} name" value="${escapeHtml(d.name)}">
    <div class="section-title" style="margin-top:0;">${escapeHtml(st.sectionsNoun)}</div>
    <div id="dm-cats" class="cat-row"></div>
    <textarea id="dm-desc" class="field" placeholder="Description" rows="3">${escapeHtml(d.description)}</textarea>
    <input id="dm-allergens" class="field" placeholder="Allergens — short codes, e.g. D, G, S, N" value="${escapeHtml(d.allergens)}">

    <div class="section-title">Ingredients &amp; cost</div>
    <div id="dm-ingredients"></div>
    <button type="button" id="dm-add-ingredient" class="btn btn-outline btn-sm">＋ Add ingredient</button>
    <div class="cost-bar" style="margin-top:10px;">
      <span>Total ${escapeHtml(st.noun.toLowerCase())} cost</span>
      <span class="total" id="dm-total-cost">${formatCurrency(ingredientsTotal(pendingIngredients))}</span>
    </div>

    <div class="section-title">Prep list</div>
    <p class="hint-text" style="margin:0 0 8px;">What the kitchen has to make ahead. Pull a ready-made list from the Prep Vault, or type your own.</p>
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <button type="button" id="dm-prep-lib" class="btn btn-outline btn-sm">🧾 Use a Prep Vault list</button>
    </div>
    <div id="dm-prep-items"></div>
    <button type="button" id="dm-add-prep" class="btn btn-outline btn-sm">＋ Add prep item</button>

    <div class="modal-foot">
      ${isEdit ? `<button id="dm-delete" class="btn btn-danger">Delete</button>` : "<span></span>"}
      <button id="dm-save" class="btn btn-primary">💾 Save ${escapeHtml(st.noun.toLowerCase())}</button>
    </div>
  `, { wide: true });

  /* --- section chips --- */
  const catsWrap = document.getElementById("dm-cats");
  function renderCatChips() {
    catsWrap.innerHTML = sectionsOf(studioKey).map((c) =>
      `<button type="button" class="cat-chip ${c === chosenCat ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
    ).join("");
    catsWrap.querySelectorAll(".cat-chip").forEach((btn) => {
      btn.addEventListener("click", () => { chosenCat = btn.dataset.cat; renderCatChips(); });
    });
  }
  renderCatChips();

  /* --- photo --- */
  if (st.photos) {
    const previewEl = document.getElementById("dm-image-preview");
    function renderImagePreview() {
      previewEl.innerHTML = pendingImage
        ? `<div class="dm-photo"><img src="${pendingImage}" alt=""><button type="button" id="dm-image-remove" class="icon-btn icon-btn-danger">✕</button></div>`
        : `<div class="hint-text" style="margin-top:0;">No photo yet — choose a file below.</div>`;
      const removeBtn = document.getElementById("dm-image-remove");
      if (removeBtn) removeBtn.addEventListener("click", () => { pendingImage = ""; renderImagePreview(); });
    }
    renderImagePreview();
    document.getElementById("dm-image-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        pendingImage = await resizeImageFile(file, 640, 0.72);
        renderImagePreview();
      } catch (err) {
        toast("Couldn't read that image: " + err.message, "error");
      }
    });
  }

  /* --- ingredients --- */
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
          <button type="button" class="icon-btn icon-btn-danger ing-remove-btn" data-remove-ing="${i}">✕</button>
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
      nameInput.addEventListener("input", () => { pendingIngredients[idx].name = nameInput.value; showIngredientSearch(idx); });
      nameInput.addEventListener("focus", () => showIngredientSearch(idx));
      nameInput.addEventListener("blur", () => setTimeout(() => resultsEl.classList.add("hidden"), 150));
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
      btn.addEventListener("click", () => { pendingIngredients.splice(Number(btn.dataset.removeIng), 1); renderIngredientRows(); });
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
          </div>`).join("")
      : `<div class="ing-search-empty">No match in your price list — you can still type a custom ingredient and price.</div>`;
    if (matches.length > shown.length) html += `<div class="ing-search-empty">+${matches.length - shown.length} more — keep typing to narrow it down</div>`;
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

  /* --- prep --- */
  function renderPrepItemRows() {
    const wrap = document.getElementById("dm-prep-items");
    if (!pendingPrepItems.length) {
      wrap.innerHTML = `<div class="empty-note" style="margin:0 0 8px;">No prep items yet.</div>`;
    } else {
      wrap.innerHTML = pendingPrepItems.map((item, i) => `
        <div class="modal-row" data-idx="${i}">
          <input class="field" style="margin:0;flex:1;" data-field="prep" value="${escapeHtml(item)}" placeholder="Prep item">
          <button type="button" class="icon-btn icon-btn-danger" data-remove-prep="${i}">✕</button>
        </div>
      `).join("");
    }
    wrap.querySelectorAll('[data-field="prep"]').forEach((input, i) => {
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
    const rows = document.querySelectorAll('#dm-prep-items [data-field="prep"]');
    if (rows.length) rows[rows.length - 1].focus();
  });
  document.getElementById("dm-prep-lib").addEventListener("click", () => {
    openPrepPicker(document.getElementById("dm-name").value, (entry, mode) => {
      if (mode === "replace") pendingPrepItems.length = 0;
      entry.items.forEach((it) => { if (!pendingPrepItems.includes(it)) pendingPrepItems.push(it); });
      renderPrepItemRows();
      toast(`Pulled in “${entry.name}”.`);
    });
  });

  /* --- save / delete --- */
  if (isEdit) {
    document.getElementById("dm-delete").addEventListener("click", async () => {
      if (!confirm(`Delete “${d.name}”? This cannot be undone.`)) return;
      await db.collection(st.collection).doc(dish.id).delete();
      closeModal();
      toast("Deleted.");
    });
  }
  document.getElementById("dm-save").addEventListener("click", async () => {
    const nameEl = document.getElementById("dm-name");
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); toast("Give it a name first.", "error"); return; }
    const btn = document.getElementById("dm-save");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
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
        prepItems: pendingPrepItems.map((p) => p.trim()).filter(Boolean),
      };
      if (st.photos) payload.imageBase64 = pendingImage;
      if (isEdit) await db.collection(st.collection).doc(dish.id).update(payload);
      else await db.collection(st.collection).add(payload);
      closeModal();
      toast(isEdit ? "Saved." : `${st.noun} added.`);
    } catch (err) {
      btn.disabled = false; btn.textContent = `💾 Save ${st.noun.toLowerCase()}`;
      toast("Couldn't save: " + err.message, "error");
    }
  });
}

/* ============================== Save / load a menu ============================== */
async function saveCurrentMenu(studioKey) {
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  if (!b.canvas.length) { toast(`Add at least one ${st.noun.toLowerCase()} before saving.`, "error"); return; }
  const name = prompt("Name this menu:", b.filename || b.titleText || `Untitled ${st.short} menu`);
  if (!name) return;
  const payload = {
    studio: studioKey,
    name,
    items: b.canvas,
    titleText: b.titleText,
    alignment: b.alignment,
    uppercase: b.uppercase,
    italics: b.italics,
    photoLayout: !!b.photoLayout,
    sectionLabels: b.sectionLabels || {},
    sectionOrder: getSectionOrder(studioKey),
    totalCost: b.canvas.reduce((s, i) => s + (Number(i.cost) || 0), 0),
    updatedAt: Date.now(),
  };
  try {
    if (b.activeMenuId) await db.collection("menus").doc(b.activeMenuId).set(payload);
    else {
      const ref = await db.collection("menus").add(payload);
      b.activeMenuId = ref.id;
    }
    toast(`Saved “${name}”.`);
  } catch (err) {
    toast("Couldn't save: " + err.message, "error");
  }
}

function loadMenu(id) {
  const m = state.menus.find((x) => x.id === id);
  if (!m) return;
  const studioKey = STUDIOS[m.studio] ? m.studio : "ddr";
  const b = freshBuilder(studioKey);
  b.canvas = (m.items || []).map((i) => ({ ...i }));
  b.titleText = m.titleText || studioOf(studioKey).defaultTitle;
  b.alignment = m.alignment || "center";
  b.uppercase = !!m.uppercase;
  b.italics = m.italics !== false;
  b.photoLayout = m.photoLayout !== undefined ? !!m.photoLayout : studioOf(studioKey).layout === "photo";
  b.sectionLabels = m.sectionLabels || {};
  b.sectionOrder = m.sectionOrder || [];
  b.filename = m.name || "";
  b.activeMenuId = m.id;
  b.pane = "canvas";
  state.builders[studioKey] = b;
  switchView(studioKey);
  toast(`Loaded “${m.name}”.`);
}

/* The marble page's footer mark — smaller and centred, unlike the sand
   template's corner logo. Mirrors .theme-marble .brand-logo in style.css. */
const MARBLE_LOGO = { widthIn: PAGE.logoWidthIn, heightIn: PAGE.logoHeightIn, bottomIn: 0.30 };

/* Canapé photos are transparent PNG cutouts so the marble shows through them;
   anything else the user uploads stays a JPEG. Word needs to be told which. */
function dataUriImageType(uri) {
  return /^data:image\/png/i.test(uri || "") ? "png" : "jpg";
}
function dataUriToBytes(uri) {
  return Uint8Array.from(atob(String(uri).split(",")[1]), (c) => c.charCodeAt(0));
}

/* ============================== Export: Word (.docx) ============================== */
async function exportMenuDocx(studioKey, btn) {
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  if (!b.canvas.length) { toast(`Add at least one ${st.noun.toLowerCase()} before exporting.`, "error"); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Building…";
  try {
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer, AlignmentType,
      HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom, TextWrappingType, TextWrappingSide, PageBreak,
    } = docx;

    const inchesToTwip = (n) => Math.round(n * 1440);
    const inchesToEmu = (n) => Math.round(n * 914400);
    const inchesToPx = (n) => Math.round(n * 96);
    const align = b.alignment === "left" ? AlignmentType.LEFT : AlignmentType.CENTER;

    // docx.js writes every embedded image with a .png extension regardless of
    // the `type` it is given, and [Content_Types].xml maps .png to image/png —
    // so handing it JPEG bytes produces a file whose images are mislabelled.
    // The page frames therefore ship in a second, PNG copy used only here; the
    // .jpg versions stay for the web page, where they're smaller.
    const logoBuf = await fetch("assets/me-dubai-logo.png").then((r) => r.arrayBuffer());
    const frameBuf = await fetch(st.theme === "marble" ? "assets/marble-bg.png" : "assets/border-strip.png").then((r) => r.arrayBuffer());
    const logo = st.theme === "marble"
      ? { widthIn: MARBLE_LOGO.widthIn, heightIn: MARBLE_LOGO.heightIn, bottomIn: MARBLE_LOGO.bottomIn,
          leftIn: (PAGE.widthIn - MARBLE_LOGO.widthIn) / 2 }
      : { widthIn: PAGE.logoWidthIn, heightIn: PAGE.logoHeightIn, bottomIn: PAGE.logoBottomIn, leftIn: PAGE.logoLeftIn };

    // The sand theme anchors a narrow swirl strip down the left margin; the
    // marble theme lays a full-bleed page image behind all the text instead.
    const frameImage = st.theme === "marble"
      ? new ImageRun({
          type: "png", data: frameBuf,
          transformation: { width: inchesToPx(PAGE.widthIn), height: inchesToPx(PAGE.heightIn) },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
            wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
            behindDocument: true, allowOverlap: true,
          },
        })
      : new ImageRun({
          type: "png", data: frameBuf,
          transformation: { width: inchesToPx(PAGE.borderWidthIn), height: inchesToPx(PAGE.borderHeightIn) },
          floating: {
            horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.borderLeftIn) },
            verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.borderTopIn) },
            wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
            behindDocument: false, allowOverlap: true,
          },
        });

    /* Word has no object-fit, so each photo's real aspect ratio has to be known
       up front to size it without distortion. Decoding is async even for a data
       URI, so resolve them all before building the document. */
    const photoAspects = new Map();
    if (st.photos && b.photoLayout) {
      await Promise.all(b.canvas.filter((i) => i.imageBase64).map((i) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { photoAspects.set(i.dishId, img.width / img.height); resolve(); };
        img.onerror = () => resolve();
        img.src = i.imageBase64;
      })));
    }

    /* Mirror the on-screen pagination so the Word file breaks in the same
       places as the preview and the PDF. */
    const opts = previewOptions(studioKey, { editable: false });
    const pages = paginateUnits(buildUnits(b.canvas, opts), opts);

    const children = [];
    const titleText = b.uppercase ? (b.titleText || "").toUpperCase() : (b.titleText || "");
    children.push(new Paragraph({
      alignment: align, spacing: { after: 200 },
      children: [new TextRun({ text: titleText || st.defaultTitle, bold: true, size: 44 })],
    }));

    const sectionParagraph = (category) => {
      const secLabel = sectionLabelFor(category, opts);
      return secLabel
        ? new Paragraph({ alignment: align, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: secLabel, bold: true, size: 26 })] })
        : null;
    };
    const pushDish = (item) => {
      if (st.photos && b.photoLayout && item.imageBase64) {
        try {
          // Sized to fit inside the same 2.2 x 1.5in slot the page uses, keeping
          // the photo's own shape — Word has no object-fit, so the box is
          // computed here rather than letting a tall cone stretch to a square.
          const ar = photoAspects.get(item.dishId) || 1.4;
          const boxW = 2.2, boxH = 1.5;
          const scale = Math.min(boxW / (boxH * ar), 1);
          const w = boxH * ar * scale, h = boxH * scale;
          children.push(new Paragraph({
            alignment: align, spacing: { before: 120, after: 60 },
            children: [new ImageRun({
              type: dataUriImageType(item.imageBase64),
              data: dataUriToBytes(item.imageBase64),
              transformation: { width: inchesToPx(w), height: inchesToPx(h) },
            })],
          }));
        } catch (imgErr) {
          console.warn("Skipped a canapé photo in the Word export:", imgErr.message);
        }
      }
      const name = b.uppercase ? item.name.toUpperCase() : item.name;
      const nameRuns = [new TextRun({ text: name, bold: true, size: 22 })];
      if (item.allergens) nameRuns.push(new TextRun({ text: `  [${item.allergens}]`, italics: true, size: 18 }));
      children.push(new Paragraph({ alignment: align, children: nameRuns }));
      if (item.description) {
        children.push(new Paragraph({ alignment: align, spacing: { after: 120 }, children: [new TextRun({ text: item.description, italics: b.italics, size: 20 })] }));
      }
    };

    pages.forEach((page, pi) => {
      if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
      if (page.continuedSection) {
        const p = sectionParagraph(page.continuedSection);
        if (p) children.push(p);
      }
      page.units.forEach((u) => {
        if (u.kind === "section") {
          const p = sectionParagraph(u.category);
          if (p) children.push(p);
        } else {
          u.items.forEach(pushDish);
        }
      });
    });

    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      border: { top: { color: "E8D9C5", space: 4, style: "single", size: 4 } },
      children: [new TextRun({ text: "Allergens: D — Dairy   ·   G — Gluten   ·   S — Seafood   ·   N — Nuts", size: 14, color: "8B6A4A" })],
    }));

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: inchesToTwip(PAGE.widthIn), height: inchesToTwip(PAGE.heightIn) },
            margin: {
              top: inchesToTwip(PAGE.marginTopIn), bottom: inchesToTwip(PAGE.marginBottomIn),
              left: inchesToTwip(st.theme === "marble" ? 0.6 : PAGE.marginLeftIn),
              right: inchesToTwip(st.theme === "marble" ? 0.6 : PAGE.marginRightIn),
            },
          },
        },
        // Header/footer images are section-level in docx.js, so they repeat on
        // every page automatically — no need to re-add them per page break.
        headers: { default: new Header({ children: [new Paragraph({ children: [frameImage] })] }) },
        footers: {
          default: new Footer({
            children: [new Paragraph({ children: [new ImageRun({
              type: "png", data: logoBuf,
              transformation: { width: inchesToPx(logo.widthIn), height: inchesToPx(logo.heightIn) },
              floating: {
                // marble centres a smaller mark, sand tucks the full one into
                // the right margin — matches the .brand-logo rules in style.css
                horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: inchesToEmu(logo.leftIn) },
                verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: inchesToEmu(PAGE.heightIn - logo.bottomIn - logo.heightIn) },
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
    downloadBlob(blob, `${sanitizeFilename(b.filename || b.titleText || st.short)}.docx`);
    toast("Word file downloaded.");
  } catch (err) {
    console.error(err);
    toast("Couldn't build the Word document: " + err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

/* ============================== Export: PDF ==============================
   Renders a clean off-screen copy of the very same DOM/CSS the preview uses
   (no editing outlines or buttons) at high resolution, then rasterizes each
   page into a PDF sized to the real sheet — so the PDF matches the preview by
   construction rather than by a second layout engine agreeing with the first. */
async function exportMenuPdf(studioKey, btn) {
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  if (!b.canvas.length) { toast(`Add at least one ${st.noun.toLowerCase()} before exporting.`, "error"); return; }
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Building…";
  let holder;
  try {
    const pages = buildMenuPagesHTML(b.canvas, previewOptions(studioKey, { editable: false }));
    holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-10000px";
    holder.style.top = "0";
    holder.innerHTML = pages.map((p) => `<div class="menu-page-wrap" style="padding:0;">${p}</div>`).join("");
    document.body.appendChild(holder);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "in", format: [PAGE.widthIn, PAGE.heightIn] });
    const pageEls = holder.querySelectorAll(".menu-page");
    for (let i = 0; i < pageEls.length; i++) {
      const canvas = await html2canvas(pageEls[i], { scale: 3, useCORS: true, backgroundColor: "#ffffff" });
      if (i > 0) pdf.addPage([PAGE.widthIn, PAGE.heightIn]);
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, PAGE.widthIn, PAGE.heightIn);
    }
    pdf.save(`${sanitizeFilename(b.filename || b.titleText || st.short)}.pdf`);
    toast(`PDF downloaded — ${plural(pageEls.length, "page")}.`);
  } catch (err) {
    console.error(err);
    toast("Couldn't build the PDF: " + err.message, "error");
  } finally {
    if (holder) document.body.removeChild(holder);
    btn.disabled = false; btn.textContent = label;
  }
}

/* ============================== Print ============================== */
function printMenu(studioKey) {
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  if (!b.canvas.length) { toast(`Add at least one ${st.noun.toLowerCase()} before printing.`, "error"); return; }
  const pages = buildMenuPagesHTML(b.canvas, previewOptions(studioKey, { editable: false }));
  document.getElementById("print-area").innerHTML = pages.map((p) => `<div class="menu-page-wrap">${p}</div>`).join("");
  const prevTitle = document.title;
  document.title = sanitizeFilename(b.filename || b.titleText || st.short);
  window.print();
  setTimeout(() => { document.title = prevTitle; }, 500);
}
