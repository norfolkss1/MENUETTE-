/* global db, STUDIOS, STUDIO_KEYS, state, studioOf, builderOf, dishesOf, escapeHtml, plural,
   nameKey, sanitizeFilename, downloadBlob, openModal, closeModal, toast, docx, html2canvas */

/* ==========================================================================
   PREP VAULT
   Two halves of the same idea:
     · By dish     — every dish in every studio, with its prep list, so it is
                     always visible which food still has no prep written down.
     · Prep library — reusable named prep lists (seeded from the kitchen's
                     master prep workbook) that can be tied onto any dish.
   No costing here on purpose — this is the kitchen's work document.
   ========================================================================== */

function allDishRecords() {
  const out = [];
  STUDIO_KEYS.forEach((key) => {
    dishesOf(key).forEach((d) => out.push({ ...d, _studio: key }));
  });
  return out;
}

function renderPrepShell() {
  const el = document.getElementById("view-prep");
  const p = state.prep;
  el.innerHTML = `
    <div class="page">
      <header class="page-top">
        <div class="studio-heading">
          <h1>🧾 Prep Vault</h1>
          <p>Every dish's prep list in one place, plus a reusable library you can tie onto any dish.</p>
        </div>
        <div class="studio-actions">
          <button class="btn btn-primary btn-sm" data-act="new-prep">＋ New prep list</button>
        </div>
      </header>

      <div class="seg-tabs">
        <button class="seg ${p.tab === "by-dish" ? "active" : ""}" data-tab="by-dish">By dish</button>
        <button class="seg ${p.tab === "library" ? "active" : ""}" data-tab="library">Prep library <span class="chip-n">${state.prepVault.length}</span></button>
      </div>

      <div class="filter-bar">
        <input id="prep-search" class="field field-sm" placeholder="🔍 Search dishes and prep items…" value="${escapeHtml(p.search)}">
        <div class="cat-row" id="prep-filters"></div>
      </div>

      <div id="prep-body"></div>
    </div>
  `;

  el.querySelectorAll(".seg").forEach((t) => t.addEventListener("click", () => {
    state.prep.tab = t.dataset.tab;
    renderPrepShell();
  }));
  el.querySelector('[data-act="new-prep"]').addEventListener("click", () => openPrepEntryModal(null));
  document.getElementById("prep-search").addEventListener("input", (e) => {
    state.prep.search = e.target.value;
    renderPrepBody();
  });

  renderPrepFilters();
  renderPrepBody();
}

function renderPrepFilters() {
  const wrap = document.getElementById("prep-filters");
  if (!wrap) return;
  const p = state.prep;
  if (p.tab !== "by-dish") { wrap.innerHTML = ""; return; }

  const counts = {};
  STUDIO_KEYS.forEach((k) => { counts[k] = dishesOf(k).length; });
  const total = STUDIO_KEYS.reduce((s, k) => s + counts[k], 0);
  const missing = allDishRecords().filter((d) => !(d.prepItems || []).length).length;

  wrap.innerHTML = `
    <button class="cat-chip ${p.studioFilter === "all" ? "active" : ""}" data-sf="all">All <span class="chip-n">${total}</span></button>
    ${STUDIO_KEYS.map((k) => `<button class="cat-chip ${p.studioFilter === k ? "active" : ""}" data-sf="${k}">${STUDIOS[k].icon} ${escapeHtml(STUDIOS[k].short)} <span class="chip-n">${counts[k]}</span></button>`).join("")}
    <button class="cat-chip ${p.missingOnly ? "active" : ""}" data-missing="1">⚠ Missing prep <span class="chip-n">${missing}</span></button>
  `;
  wrap.querySelectorAll("[data-sf]").forEach((btn) => btn.addEventListener("click", () => {
    state.prep.studioFilter = btn.dataset.sf;
    renderPrepFilters(); renderPrepBody();
  }));
  wrap.querySelector("[data-missing]").addEventListener("click", () => {
    state.prep.missingOnly = !state.prep.missingOnly;
    renderPrepFilters(); renderPrepBody();
  });
}

function renderPrepBody() {
  const body = document.getElementById("prep-body");
  if (!body) return;
  renderPrepFilters();
  if (state.prep.tab === "by-dish") renderPrepByDish(body);
  else renderPrepLibrary(body);
}

/* ---------------- By dish ---------------- */
function renderPrepByDish(body) {
  const p = state.prep;
  const q = p.search.trim().toLowerCase();
  let rows = allDishRecords();
  if (p.studioFilter !== "all") rows = rows.filter((d) => d._studio === p.studioFilter);
  if (p.missingOnly) rows = rows.filter((d) => !(d.prepItems || []).length);
  if (q) {
    rows = rows.filter((d) =>
      String(d.name || "").toLowerCase().includes(q) ||
      (d.prepItems || []).some((it) => String(it).toLowerCase().includes(q)));
  }
  rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const withPrep = rows.filter((d) => (d.prepItems || []).length).length;
  if (!rows.length) {
    body.innerHTML = `<div class="empty-note big">No dishes match those filters.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="result-line">${plural(rows.length, "dish", "dishes")} · ${withPrep} with a prep list, ${rows.length - withPrep} still empty</div>
    <div class="prep-grid">
      ${rows.map((d) => {
        const items = d.prepItems || [];
        return `
        <article class="prep-card ${items.length ? "" : "is-empty"}">
          <header>
            <div>
              <div class="prep-card-title">${escapeHtml(d.name)}</div>
              <div class="prep-card-sub">
                <span class="badge">${STUDIOS[d._studio].icon} ${escapeHtml(STUDIOS[d._studio].short)}</span>
                <span class="badge badge-quiet">${escapeHtml(d.category || "—")}</span>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" data-edit-dish="${d.id}" data-studio="${d._studio}">${items.length ? "Edit prep" : "＋ Add prep"}</button>
          </header>
          ${items.length
            ? `<ul class="prep-items">${items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>`
            : `<div class="prep-none">No prep written down yet.</div>`}
        </article>`;
      }).join("")}
    </div>
  `;

  body.querySelectorAll("[data-edit-dish]").forEach((btn) => btn.addEventListener("click", () => {
    const studioKey = btn.dataset.studio;
    const dish = dishesOf(studioKey).find((x) => x.id === btn.dataset.editDish);
    if (dish) openDishPrepModal(studioKey, dish);
  }));
}

/* A trimmed-down editor for prep only — the Prep Vault deliberately keeps
   costing out of the way, so this shows the prep list and nothing else. */
function openDishPrepModal(studioKey, dish) {
  const st = studioOf(studioKey);
  const pending = (dish.prepItems || []).slice();

  openModal(`
    <h3>Prep — ${escapeHtml(dish.name)}</h3>
    <p class="hint-text" style="margin-top:0;">${STUDIOS[studioKey].icon} ${escapeHtml(st.short)} · ${escapeHtml(dish.category || "—")}</p>
    <div style="display:flex;gap:8px;margin:12px 0;">
      <button type="button" id="dp-lib" class="btn btn-outline btn-sm">🧾 Pull from prep library</button>
    </div>
    <div id="dp-items"></div>
    <button type="button" id="dp-add" class="btn btn-outline btn-sm">＋ Add prep item</button>
    <div class="modal-foot">
      <button id="dp-clear" class="btn btn-ghost">Clear all</button>
      <button id="dp-save" class="btn btn-primary">💾 Save prep list</button>
    </div>
  `, { wide: true });

  function renderRows() {
    const wrap = document.getElementById("dp-items");
    wrap.innerHTML = pending.length
      ? pending.map((item, i) => `
        <div class="modal-row">
          <span class="row-handle">${i + 1}</span>
          <input class="field" style="margin:0;flex:1;" data-field="prep" value="${escapeHtml(item)}" placeholder="Prep item">
          <button type="button" class="icon-btn" data-up="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="icon-btn" data-down="${i}" ${i === pending.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="icon-btn icon-btn-danger" data-rm="${i}">✕</button>
        </div>`).join("")
      : `<div class="empty-note">Nothing yet — add items below, or pull a ready-made list from the library.</div>`;
    wrap.querySelectorAll('[data-field="prep"]').forEach((input, i) =>
      input.addEventListener("input", () => { pending[i] = input.value; }));
    wrap.querySelectorAll("[data-rm]").forEach((btn) =>
      btn.addEventListener("click", () => { pending.splice(Number(btn.dataset.rm), 1); renderRows(); }));
    wrap.querySelectorAll("[data-up]").forEach((btn) => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.up); [pending[i - 1], pending[i]] = [pending[i], pending[i - 1]]; renderRows();
    }));
    wrap.querySelectorAll("[data-down]").forEach((btn) => btn.addEventListener("click", () => {
      const i = Number(btn.dataset.down); [pending[i + 1], pending[i]] = [pending[i], pending[i + 1]]; renderRows();
    }));
  }
  renderRows();

  document.getElementById("dp-add").addEventListener("click", () => {
    pending.push(""); renderRows();
    const rows = document.querySelectorAll('#dp-items [data-field="prep"]');
    if (rows.length) rows[rows.length - 1].focus();
  });
  document.getElementById("dp-clear").addEventListener("click", () => { pending.length = 0; renderRows(); });
  document.getElementById("dp-lib").addEventListener("click", () => {
    openPrepPicker(dish.name, (entry, mode) => {
      if (mode === "replace") pending.length = 0;
      entry.items.forEach((it) => { if (!pending.includes(it)) pending.push(it); });
      renderRows();
      toast(`Pulled in “${entry.name}”.`);
    });
  });
  document.getElementById("dp-save").addEventListener("click", async () => {
    const btn = document.getElementById("dp-save");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await db.collection(st.collection).doc(dish.id).update({ prepItems: pending.map((s) => s.trim()).filter(Boolean) });
      closeModal();
      toast("Prep list saved.");
    } catch (err) {
      btn.disabled = false; btn.textContent = "💾 Save prep list";
      toast("Couldn't save: " + err.message, "error");
    }
  });
}

/* ---------------- Prep library ---------------- */
function suggestedDishesFor(entry) {
  const key = nameKey(entry.name);
  if (!key) return [];
  return allDishRecords().filter((d) => nameKey(d.name) === key);
}

function renderPrepLibrary(body) {
  const q = state.prep.search.trim().toLowerCase();
  let rows = state.prepVault;
  if (q) {
    rows = rows.filter((e) =>
      String(e.name || "").toLowerCase().includes(q) ||
      (e.items || []).some((it) => String(it).toLowerCase().includes(q)));
  }

  if (!rows.length) {
    body.innerHTML = `<div class="empty-note big">${state.prepVault.length
      ? "No prep lists match that search."
      : "The prep library is empty. Click ＋ New prep list to start one."}</div>`;
    return;
  }

  body.innerHTML = `
    <div class="result-line">${plural(rows.length, "prep list")} in the library</div>
    <div class="prep-grid">
      ${rows.map((e) => {
        const items = e.items || [];
        const linked = e.linkedTo || [];
        const suggestions = suggestedDishesFor(e).filter((d) => !(d.prepItems || []).length);
        return `
        <article class="prep-card">
          <header>
            <div>
              <div class="prep-card-title">${escapeHtml(e.name)}</div>
              <div class="prep-card-sub">
                <span class="badge badge-quiet">${plural(items.length, "item")}</span>
                ${e.occurrences > 1 ? `<span class="badge badge-quiet" title="Appeared on ${e.occurrences} past event prep sheets">${e.occurrences}× used</span>` : ""}
                ${linked.length ? `<span class="badge badge-prep" title="${escapeHtml(linked.join(", "))}">tied to ${plural(linked.length, "dish", "dishes")}</span>` : ""}
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-outline btn-sm" data-tie="${e.id}">🔗 Tie to dish</button>
              <button class="icon-btn" data-edit-entry="${e.id}" title="Edit">✎</button>
            </div>
          </header>
          ${items.length ? `<ul class="prep-items">${items.map((it) => `<li>${escapeHtml(it)}</li>`).join("")}</ul>` : `<div class="empty-note" style="margin:8px 0 0;">No items yet.</div>`}
          ${suggestions.length ? `<div class="prep-suggest">Matches <b>${escapeHtml(suggestions[0].name)}</b> (${escapeHtml(STUDIOS[suggestions[0]._studio].short)}), which has no prep yet —
            <button class="link-btn" data-quick-tie="${e.id}" data-dish="${suggestions[0].id}" data-studio="${suggestions[0]._studio}">tie it now</button></div>` : ""}
        </article>`;
      }).join("")}
    </div>
  `;

  body.querySelectorAll("[data-tie]").forEach((btn) => btn.addEventListener("click", () => {
    const entry = state.prepVault.find((x) => x.id === btn.dataset.tie);
    if (entry) openTieToDishModal(entry);
  }));
  body.querySelectorAll("[data-edit-entry]").forEach((btn) => btn.addEventListener("click", () => {
    const entry = state.prepVault.find((x) => x.id === btn.dataset.editEntry);
    if (entry) openPrepEntryModal(entry);
  }));
  body.querySelectorAll("[data-quick-tie]").forEach((btn) => btn.addEventListener("click", () => {
    const entry = state.prepVault.find((x) => x.id === btn.dataset.quickTie);
    const dish = dishesOf(btn.dataset.studio).find((d) => d.id === btn.dataset.dish);
    if (entry && dish) tiePrepToDish(entry, btn.dataset.studio, dish, "replace");
  }));
}

/* Create / edit one library entry. */
function openPrepEntryModal(entry) {
  const isEdit = !!entry;
  const pending = entry ? (entry.items || []).slice() : [""];

  openModal(`
    <h3>${isEdit ? "Edit" : "New"} prep list</h3>
    <input id="pe-name" class="field" placeholder="What is this prep for? e.g. MUSHROOM IN THE FOREST" value="${escapeHtml(entry ? entry.name : "")}">
    <div class="section-title">Prep items</div>
    <div id="pe-items"></div>
    <button type="button" id="pe-add" class="btn btn-outline btn-sm">＋ Add prep item</button>
    ${entry && (entry.altItems || []).length ? `
      <div class="section-title">Other items seen on past sheets</div>
      <p class="hint-text" style="margin-top:0;">This prep appeared on ${entry.occurrences} past event sheets with slightly different breakdowns. Click one to add it.</p>
      <div class="chip-set">${entry.altItems.filter((a) => !(entry.items || []).includes(a)).map((a) => `<button type="button" class="cat-chip" data-alt="${escapeHtml(a)}">＋ ${escapeHtml(a)}</button>`).join("")}</div>
    ` : ""}
    <div class="modal-foot">
      ${isEdit ? `<button id="pe-delete" class="btn btn-danger">Delete</button>` : "<span></span>"}
      <button id="pe-save" class="btn btn-primary">💾 Save prep list</button>
    </div>
  `, { wide: true });

  function renderRows() {
    const wrap = document.getElementById("pe-items");
    wrap.innerHTML = pending.length
      ? pending.map((item, i) => `
        <div class="modal-row">
          <span class="row-handle">${i + 1}</span>
          <input class="field" style="margin:0;flex:1;" data-field="prep" value="${escapeHtml(item)}" placeholder="Prep item">
          <button type="button" class="icon-btn icon-btn-danger" data-rm="${i}">✕</button>
        </div>`).join("")
      : `<div class="empty-note">No items yet.</div>`;
    wrap.querySelectorAll('[data-field="prep"]').forEach((input, i) =>
      input.addEventListener("input", () => { pending[i] = input.value; }));
    wrap.querySelectorAll("[data-rm]").forEach((btn) =>
      btn.addEventListener("click", () => { pending.splice(Number(btn.dataset.rm), 1); renderRows(); }));
  }
  renderRows();

  document.getElementById("pe-add").addEventListener("click", () => {
    pending.push(""); renderRows();
    const rows = document.querySelectorAll('#pe-items [data-field="prep"]');
    if (rows.length) rows[rows.length - 1].focus();
  });
  document.querySelectorAll("[data-alt]").forEach((btn) => btn.addEventListener("click", () => {
    if (!pending.includes(btn.dataset.alt)) { pending.push(btn.dataset.alt); renderRows(); }
    btn.disabled = true;
  }));

  if (isEdit) {
    document.getElementById("pe-delete").addEventListener("click", async () => {
      if (!confirm(`Delete the prep list “${entry.name}”? Dishes already using it keep their own copy.`)) return;
      await db.collection("prepVault").doc(entry.id).delete();
      closeModal();
      toast("Prep list deleted.");
    });
  }
  document.getElementById("pe-save").addEventListener("click", async () => {
    const nameEl = document.getElementById("pe-name");
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); toast("Give the prep list a name.", "error"); return; }
    const btn = document.getElementById("pe-save");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const items = pending.map((s) => s.trim()).filter(Boolean);
      if (isEdit) await db.collection("prepVault").doc(entry.id).update({ name, items });
      else await db.collection("prepVault").add({ name, items, altItems: [], occurrences: 1, sources: ["added in app"], linkedTo: [] });
      closeModal();
      toast("Prep list saved.");
    } catch (err) {
      btn.disabled = false; btn.textContent = "💾 Save prep list";
      toast("Couldn't save: " + err.message, "error");
    }
  });
}

/* Copy a library entry's items onto a real dish, and remember the link. */
async function tiePrepToDish(entry, studioKey, dish, mode) {
  const st = studioOf(studioKey);
  const existing = dish.prepItems || [];
  const merged = mode === "replace" ? entry.items.slice() : existing.slice();
  if (mode !== "replace") entry.items.forEach((it) => { if (!merged.includes(it)) merged.push(it); });

  const tag = `${studioKey}:${dish.name}`;
  const links = (entry.linkedTo || []).slice();
  if (!links.includes(tag)) links.push(tag);

  try {
    await db.collection(st.collection).doc(dish.id).update({ prepItems: merged });
    await db.collection("prepVault").doc(entry.id).update({ linkedTo: links });
    toast(`“${entry.name}” tied to ${dish.name}.`);
  } catch (err) {
    toast("Couldn't tie that prep list on: " + err.message, "error");
  }
}

/* Pick a dish (any studio) to tie a library entry onto. */
function openTieToDishModal(entry) {
  let search = "";
  let studioFilter = "all";
  let mode = "replace";

  openModal(`
    <h3>Tie “${escapeHtml(entry.name)}” to a dish</h3>
    <p class="hint-text" style="margin-top:0;">Its ${plural((entry.items || []).length, "prep item")} will be copied onto the dish you choose. Dishes that already have prep are marked.</p>
    <div class="opt-row">
      <label class="opt"><input type="radio" name="tie-mode" value="replace" checked> Replace the dish's prep</label>
      <label class="opt"><input type="radio" name="tie-mode" value="merge"> Add to what's already there</label>
    </div>
    <input id="tie-search" class="field" placeholder="🔍 Search dishes…" autocomplete="off">
    <div class="cat-row" id="tie-filters"></div>
    <div id="tie-results" class="tie-results"></div>
  `, { wide: true });

  function renderFilters() {
    document.getElementById("tie-filters").innerHTML = `
      <button class="cat-chip ${studioFilter === "all" ? "active" : ""}" data-sf="all">All</button>
      ${STUDIO_KEYS.map((k) => `<button class="cat-chip ${studioFilter === k ? "active" : ""}" data-sf="${k}">${STUDIOS[k].icon} ${escapeHtml(STUDIOS[k].short)}</button>`).join("")}
    `;
    document.querySelectorAll("#tie-filters [data-sf]").forEach((btn) => btn.addEventListener("click", () => {
      studioFilter = btn.dataset.sf; renderFilters(); renderResults();
    }));
  }

  function renderResults() {
    const q = search.trim().toLowerCase();
    let rows = allDishRecords();
    if (studioFilter !== "all") rows = rows.filter((d) => d._studio === studioFilter);
    if (q) rows = rows.filter((d) => String(d.name || "").toLowerCase().includes(q));
    // Exact-name matches first — that's almost always the one being looked for.
    const key = nameKey(entry.name);
    rows.sort((a, b) => (nameKey(b.name) === key) - (nameKey(a.name) === key) || String(a.name).localeCompare(String(b.name)));
    const shown = rows.slice(0, 80);

    document.getElementById("tie-results").innerHTML = shown.length
      ? shown.map((d) => `
        <div class="tie-row">
          <div>
            <div class="tie-row-name">${escapeHtml(d.name)} ${nameKey(d.name) === key ? `<span class="badge badge-prep">name match</span>` : ""}</div>
            <div class="tie-row-meta">${STUDIOS[d._studio].icon} ${escapeHtml(STUDIOS[d._studio].short)} · ${escapeHtml(d.category || "—")}${(d.prepItems || []).length ? ` · has ${plural(d.prepItems.length, "prep item")}` : " · no prep yet"}</div>
          </div>
          <button class="btn btn-primary btn-sm" data-tie-dish="${d.id}" data-studio="${d._studio}">Tie</button>
        </div>`).join("") + (rows.length > shown.length ? `<div class="empty-note">+${rows.length - shown.length} more — keep typing to narrow it down</div>` : "")
      : `<div class="empty-note">No dishes match.</div>`;

    document.querySelectorAll("[data-tie-dish]").forEach((btn) => btn.addEventListener("click", async () => {
      const dish = dishesOf(btn.dataset.studio).find((x) => x.id === btn.dataset.tieDish);
      if (!dish) return;
      btn.disabled = true; btn.textContent = "…";
      await tiePrepToDish(entry, btn.dataset.studio, dish, mode);
      closeModal();
    }));
  }

  document.getElementById("tie-search").addEventListener("input", (e) => { search = e.target.value; renderResults(); });
  document.querySelectorAll('input[name="tie-mode"]').forEach((r) =>
    r.addEventListener("change", (e) => { mode = e.target.value; }));
  renderFilters();
  renderResults();
  document.getElementById("tie-search").focus();
}

/* Library picker used from inside a dish editor — the reverse direction. */
function openPrepPicker(dishName, onPick) {
  let search = dishName ? String(dishName).trim() : "";

  openModal(`
    <h3>Pull a prep list from the vault</h3>
    <input id="pp-search" class="field" placeholder="🔍 Search the prep library…" value="${escapeHtml(search)}" autocomplete="off">
    <div class="opt-row">
      <label class="opt"><input type="radio" name="pp-mode" value="replace" checked> Replace current prep</label>
      <label class="opt"><input type="radio" name="pp-mode" value="merge"> Add to it</label>
    </div>
    <div id="pp-results" class="tie-results"></div>
  `, { wide: true });

  let mode = "replace";
  function renderResults() {
    const q = search.trim().toLowerCase();
    const key = nameKey(search);
    let rows = state.prepVault;
    if (q) rows = rows.filter((e) => String(e.name || "").toLowerCase().includes(q) || (e.items || []).some((it) => String(it).toLowerCase().includes(q)));
    rows = rows.slice().sort((a, b) => (nameKey(b.name) === key) - (nameKey(a.name) === key) || String(a.name).localeCompare(String(b.name)));
    const shown = rows.slice(0, 60);

    document.getElementById("pp-results").innerHTML = shown.length
      ? shown.map((e) => `
        <div class="tie-row">
          <div>
            <div class="tie-row-name">${escapeHtml(e.name)} ${nameKey(e.name) === key && key ? `<span class="badge badge-prep">name match</span>` : ""}</div>
            <div class="tie-row-meta">${escapeHtml((e.items || []).slice(0, 5).join(" · "))}${(e.items || []).length > 5 ? ` +${e.items.length - 5} more` : ""}</div>
          </div>
          <button class="btn btn-primary btn-sm" data-pick="${e.id}">Use</button>
        </div>`).join("") + (rows.length > shown.length ? `<div class="empty-note">+${rows.length - shown.length} more — keep typing to narrow it down</div>` : "")
      : `<div class="empty-note">Nothing in the library matches. Close this and type the prep by hand, or add it to the library from the Prep Vault page.</div>`;

    document.querySelectorAll("[data-pick]").forEach((btn) => btn.addEventListener("click", () => {
      const entry = state.prepVault.find((x) => x.id === btn.dataset.pick);
      if (!entry) return;
      closeModal();
      onPick(entry, mode);
    }));
  }

  document.getElementById("pp-search").addEventListener("input", (e) => { search = e.target.value; renderResults(); });
  document.querySelectorAll('input[name="pp-mode"]').forEach((r) =>
    r.addEventListener("change", (e) => { mode = e.target.value; }));
  renderResults();
}

/* ==========================================================================
   PREP ON DEMAND — the prep sheet for whatever is currently on a studio's
   canvas. Deliberately plain: a kitchen work document, not the guest-facing
   branded menu, so no border, no logo, no costs — just a checklist.
   ========================================================================== */
function buildPrepListHTML(items, titleText, subtitle) {
  return `
    <div class="prep-doc">
      <div class="prep-doc-title">PREP LIST</div>
      <div class="prep-doc-sub">${escapeHtml(titleText || "Menu")}${subtitle ? ` · ${escapeHtml(subtitle)}` : ""}</div>
      ${items.map((item) => `
        <div class="prep-doc-block">
          <div class="prep-doc-dish">${escapeHtml(item.name)}</div>
          <ul>${(item.prepItems || []).map((p) => `<li><span class="tick"></span>${escapeHtml(p)}</li>`).join("")}</ul>
        </div>
      `).join("")}
    </div>
  `;
}

function openPrepListModal(studioKey) {
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  const onMenu = b.canvas;
  const withPrep = onMenu.filter((i) => (i.prepItems || []).length);
  const without = onMenu.filter((i) => !(i.prepItems || []).length);

  if (!onMenu.length) { toast(`Add ${st.plural} to the menu first.`, "error"); return; }

  const dateStr = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  openModal(`
    <h3>Prep list — ${escapeHtml(b.titleText || st.defaultTitle)}</h3>
    <p class="hint-text" style="margin-top:0;">${plural(withPrep.length, "dish", "dishes")} on this menu ${withPrep.length === 1 ? "has" : "have"} a prep list.${without.length ? ` ${plural(without.length, "dish", "dishes")} still ${without.length === 1 ? "has" : "have"} none.` : ""}</p>
    ${without.length ? `<div class="warn-box">
      <b>No prep written down yet for:</b> ${without.map((i) => escapeHtml(i.name)).join(", ")}.
      <br>Add it from the Prep Vault, or from the dish's Edit screen — this sheet will pick it up straight away.
    </div>` : ""}
    ${withPrep.length ? `<div class="prep-doc-frame">${buildPrepListHTML(withPrep, b.titleText || st.defaultTitle, dateStr)}</div>` : `<div class="empty-note big">Nothing to print yet.</div>`}
    ${withPrep.length ? `<div class="modal-foot">
      <button id="prep-export-docx" class="btn btn-outline">📄 Word</button>
      <button id="prep-export-pdf" class="btn btn-primary">📕 PDF</button>
    </div>` : ""}
  `, { wide: true });

  if (!withPrep.length) return;
  const fname = sanitizeFilename((b.filename || b.titleText || st.short) + "-prep-list");
  document.getElementById("prep-export-docx").addEventListener("click", (e) => exportPrepListDocx(withPrep, b.titleText || st.defaultTitle, dateStr, fname, e.currentTarget));
  document.getElementById("prep-export-pdf").addEventListener("click", (e) => exportPrepListPdf(withPrep, b.titleText || st.defaultTitle, dateStr, fname, e.currentTarget));
}

async function exportPrepListDocx(items, titleText, subtitle, filename, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Building…";
  try {
    const { Document, Packer, Paragraph, TextRun } = docx;
    const children = [
      new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "PREP LIST", bold: true, size: 32 })] }),
      new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: `${titleText}  ·  ${subtitle}`, size: 22, color: "8B6A4A" })] }),
    ];
    items.forEach((item) => {
      children.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: item.name, bold: true, size: 24 })] }));
      (item.prepItems || []).forEach((p) => {
        children.push(new Paragraph({ children: [new TextRun({ text: "☐  " + p, size: 21 })] }));
      });
    });
    const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
    downloadBlob(blob, `${filename}.docx`);
    toast("Prep list downloaded.");
  } catch (err) {
    toast("Couldn't build the prep list: " + err.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

async function exportPrepListPdf(items, titleText, subtitle, filename, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Building…";
  const holder = document.createElement("div");
  holder.style.position = "fixed"; holder.style.left = "-10000px"; holder.style.top = "0";
  holder.style.width = "8.27in"; holder.style.padding = "0.6in"; holder.style.background = "#fff";
  holder.innerHTML = buildPrepListHTML(items, titleText, subtitle);
  document.body.appendChild(holder);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(holder, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const widthIn = 8.27;
    const heightIn = (canvas.height / canvas.width) * widthIn;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "in", format: [widthIn, heightIn] });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, widthIn, heightIn);
    pdf.save(`${filename}.pdf`);
    toast("Prep list downloaded.");
  } catch (err) {
    toast("Couldn't build the prep list: " + err.message, "error");
  } finally {
    document.body.removeChild(holder);
    btn.disabled = false; btn.textContent = label;
  }
}
