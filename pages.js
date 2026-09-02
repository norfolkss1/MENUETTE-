/* global db, STUDIOS, STUDIO_KEYS, state, studioOf, dishesOf, sectionsOf, escapeHtml, plural,
   formatCurrency, nameKey, openModal, closeModal, toast, loadMenu, mammoth, pdfjsLib */

/* ==========================================================================
   SAVED MENUS
   ========================================================================== */
function renderSavedShell() {
  const el = document.getElementById("view-saved");
  el.innerHTML = `
    <div class="page">
      <header class="page-top">
        <div class="studio-heading">
          <h1>📚 Saved Menus</h1>
          <p>Every menu you've saved, from all three studios. Open one to keep editing it.</p>
        </div>
      </header>
      <div class="filter-bar">
        <input id="saved-search" class="field field-sm" placeholder="🔍 Search saved menus…" value="${escapeHtml(state.savedSearch)}">
      </div>
      <div id="saved-list"></div>
    </div>
  `;
  document.getElementById("saved-search").addEventListener("input", (e) => {
    state.savedSearch = e.target.value;
    renderSavedList();
  });
  renderSavedList();
}

function renderSavedList() {
  const listEl = document.getElementById("saved-list");
  if (!listEl) return;
  const q = state.savedSearch.trim().toLowerCase();
  const rows = q
    ? state.menus.filter((m) => String(m.name || "").toLowerCase().includes(q) ||
        (m.items || []).some((i) => String(i.name || "").toLowerCase().includes(q)))
    : state.menus;

  if (!rows.length) {
    listEl.innerHTML = `<div class="empty-note big">${state.menus.length
      ? "No saved menus match that search."
      : "Nothing saved yet. Build a menu in any studio and hit 💾 Save menu."}</div>`;
    return;
  }

  listEl.innerHTML = `
    <div class="result-line">${plural(rows.length, "saved menu")}</div>
    <div class="saved-grid">
      ${rows.map((m) => {
        const st = STUDIOS[m.studio] || STUDIOS.ddr;
        const items = m.items || [];
        const sections = [...new Set(items.map((i) => i.category))];
        return `
        <article class="saved-card">
          <header>
            <div>
              <div class="saved-card-title">${escapeHtml(m.name)}</div>
              <div class="prep-card-sub">
                <span class="badge">${st.icon} ${escapeHtml(st.short)}</span>
                <span class="badge badge-quiet">${plural(items.length, "dish", "dishes")}</span>
                ${m.totalCost ? `<span class="badge badge-quiet">${formatCurrency(m.totalCost)}/cover</span>` : ""}
                ${statusBadge(m)}
              </div>
            </div>
          </header>
          <div class="saved-card-sections">${sections.slice(0, 6).map((s) => escapeHtml(s)).join(" · ")}${sections.length > 6 ? " …" : ""}</div>
          <div class="saved-card-foot">
            <span class="saved-card-date">${m.updatedAt ? new Date(m.updatedAt).toLocaleString() : ""}</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-primary btn-sm" data-open="${m.id}">Open</button>
              <button class="icon-btn icon-btn-danger" data-del="${m.id}" title="Delete">✕</button>
            </div>
          </div>
        </article>`;
      }).join("")}
    </div>
  `;

  listEl.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => loadMenu(btn.dataset.open)));
  listEl.querySelectorAll("[data-del]").forEach((btn) => btn.addEventListener("click", async () => {
    const m = state.menus.find((x) => x.id === btn.dataset.del);
    if (!m || !confirm(`Delete the saved menu “${m.name}”?`)) return;
    await db.collection("menus").doc(btn.dataset.del).delete();
    toast("Saved menu deleted.");
  }));
}

/* ==========================================================================
   IMPORT & EXTRACT
   Reads an existing Word or PDF menu and pulls the dishes out of it, so an
   old proposal can be turned back into library entries instead of retyped.
   ========================================================================== */
function renderImportShell() {
  const el = document.getElementById("view-import");
  el.innerHTML = `
    <div class="page">
      <header class="page-top">
        <div class="studio-heading">
          <h1>📥 Import Menu</h1>
          <p>Pull the dishes out of an old Word or PDF menu and add them straight to a library.</p>
        </div>
      </header>

      <div class="card info-card">
        <b>How it reads a file.</b>
        In a <b>.docx</b>, a paragraph whose text is entirely bold is treated as a dish name and the plain
        line under it as its description. In a <b>.pdf</b>, short ALL-CAPS or Title-Case lines are treated as
        dish names. In both, a line on its own that matches one of the target library's section names switches
        the section for everything after it. Nothing is saved until you review it below.
      </div>

      <div class="section-title">1. Which library should these go into?</div>
      <div class="cat-row" id="import-studio-pick"></div>

      <div class="section-title">2. Choose the file</div>
      <input type="file" id="import-file" class="field" accept=".docx,.pdf">

      <div id="import-review"></div>
    </div>
  `;

  function renderStudioPick() {
    document.getElementById("import-studio-pick").innerHTML = STUDIO_KEYS.map((k) =>
      `<button class="cat-chip ${state.importStudio === k ? "active" : ""}" data-is="${k}">${STUDIOS[k].icon} ${escapeHtml(STUDIOS[k].label)}</button>`).join("");
    document.querySelectorAll("#import-studio-pick [data-is]").forEach((btn) => btn.addEventListener("click", () => {
      state.importStudio = btn.dataset.is;
      renderStudioPick();
      if (state.importReview.length) renderImportReview();
    }));
  }
  renderStudioPick();

  document.getElementById("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) handleImportFile(e.target.files[0]);
  });
}

async function handleImportFile(file) {
  const reviewEl = document.getElementById("import-review");
  reviewEl.innerHTML = `<div class="empty-note big">Reading ${escapeHtml(file.name)}…</div>`;
  try {
    let dishes;
    if (/\.docx$/i.test(file.name)) {
      const buf = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer: buf });
      dishes = parseHtmlToDishes(result.value);
    } else if (/\.pdf$/i.test(file.name)) {
      dishes = await parsePdfToDishes(file);
    } else {
      throw new Error("Only .docx and .pdf files can be read.");
    }
    if (!dishes.length) throw new Error("No dish names could be found in that file.");
    state.importReview = dishes;
    renderImportReview();
  } catch (err) {
    reviewEl.innerHTML = `<div class="warn-box">Couldn't read that file: ${escapeHtml(err.message)}</div>`;
  }
}

/* A paragraph counts as a dish name only when the WHOLE paragraph is bold —
   an earlier version flagged any paragraph containing a single bold run, which
   swallowed half the descriptions. A standalone line matching a section name
   switches the section instead of becoming a dish. */
function parseHtmlToDishes(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const sections = sectionsOf(state.importStudio);
  const sectionByKey = new Map(sections.map((s) => [nameKey(s), s]));

  const dishes = [];
  let current = sections[0] || "Uncategorized";
  let last = null;

  Array.from(doc.body.querySelectorAll("p, h1, h2, h3, h4, li")).forEach((node) => {
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (!text) return;

    const hit = sectionByKey.get(nameKey(text));
    if (hit) { current = hit; last = null; return; }

    const bolds = node.querySelectorAll("strong, b");
    const boldText = Array.from(bolds).map((n) => n.textContent.replace(/\s+/g, " ").trim()).join(" ").trim();
    const wholeBold = /^h[1-4]$/i.test(node.tagName) || (boldText && boldText.length >= text.length - 2);

    if (wholeBold) {
      last = { name: text, category: current, description: "", allergens: "", include: true };
      // Allergen codes written into the name — "BASQUE CHEESE CAKE (G, D)" —
      // are split out rather than left glued to the dish name.
      const m = text.match(/^(.*?)[\s—–-]*[([]\s*([A-Za-z](?:\s*,\s*[A-Za-z])*)\s*[)\]]\s*$/);
      if (m) { last.name = m[1].trim(); last.allergens = m[2].replace(/\s+/g, "").toUpperCase(); }
      dishes.push(last);
    } else if (last && !last.description) {
      last.description = text;
    }
  });
  return dishes;
}

async function parsePdfToDishes(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group text items into visual lines by their y position, so a wrapped
    // dish name doesn't arrive as a pile of disconnected fragments.
    const byY = new Map();
    content.items.forEach((it) => {
      const y = Math.round(it.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y).push(it.str);
    });
    [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, parts]) => {
      const line = parts.join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    });
  }

  const sections = sectionsOf(state.importStudio);
  const sectionByKey = new Map(sections.map((s) => [nameKey(s), s]));
  const dishes = [];
  let current = sections[0] || "Uncategorized";
  let last = null;

  lines.forEach((line) => {
    const hit = sectionByKey.get(nameKey(line));
    if (hit) { current = hit; last = null; return; }

    const letters = line.replace(/[^A-Za-z]/g, "");
    const isShort = line.length <= 60;
    const isCaps = letters.length > 1 && letters === letters.toUpperCase();
    if (isShort && isCaps) {
      last = { name: line, category: current, description: "", allergens: "", include: true };
      const m = line.match(/^(.*?)[\s—–-]+([A-Z](?:\s*,\s*[A-Z])*)\s*$/);
      if (m) { last.name = m[1].trim(); last.allergens = m[2].replace(/\s+/g, "").toUpperCase(); }
      dishes.push(last);
    } else if (last && !last.description) {
      last.description = line;
    }
  });
  return dishes;
}

function renderImportReview() {
  const el = document.getElementById("import-review");
  const rows = state.importReview;
  const st = studioOf(state.importStudio);
  const existing = new Set(dishesOf(state.importStudio).map((d) => nameKey(d.name)));

  el.innerHTML = `
    <div class="section-title">3. Review — ${plural(rows.length, "dish", "dishes")} found</div>
    <p class="hint-text" style="margin-top:0;">Untick anything you don't want, fix names and sections, then add them to the <b>${escapeHtml(st.label)}</b> library. Dishes already in that library are flagged.</p>
    <div class="import-rows">
      ${rows.map((d, i) => `
        <div class="import-row ${d.include ? "" : "off"}">
          <label class="import-check"><input type="checkbox" data-inc="${i}" ${d.include ? "checked" : ""}></label>
          <div class="import-fields">
            <input class="field field-sm" data-f="name" data-i="${i}" value="${escapeHtml(d.name)}" placeholder="Dish name">
            <input class="field field-sm" data-f="description" data-i="${i}" value="${escapeHtml(d.description)}" placeholder="Description">
            <div class="import-row-foot">
              <select class="field field-sm" data-f="category" data-i="${i}">
                ${sectionsOf(state.importStudio).map((c) => `<option value="${escapeHtml(c)}" ${c === d.category ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
              </select>
              <input class="field field-sm import-allerg" data-f="allergens" data-i="${i}" value="${escapeHtml(d.allergens)}" placeholder="Allergens">
              ${existing.has(nameKey(d.name)) ? `<span class="badge badge-warn">already in library</span>` : ""}
            </div>
          </div>
        </div>`).join("")}
    </div>
    <div class="modal-foot" style="border:none;padding-top:16px;">
      <button id="import-none" class="btn btn-ghost btn-sm">Untick all</button>
      <button id="import-commit" class="btn btn-primary">Add ticked ${escapeHtml(st.plural)} to the library</button>
    </div>
  `;

  el.querySelectorAll("[data-inc]").forEach((cb) => cb.addEventListener("change", () => {
    rows[Number(cb.dataset.inc)].include = cb.checked;
    cb.closest(".import-row").classList.toggle("off", !cb.checked);
  }));
  el.querySelectorAll("[data-f]").forEach((input) => input.addEventListener("input", () => {
    rows[Number(input.dataset.i)][input.dataset.f] = input.value;
  }));
  document.getElementById("import-none").addEventListener("click", () => {
    rows.forEach((r) => { r.include = false; });
    renderImportReview();
  });
  document.getElementById("import-commit").addEventListener("click", commitImport);
}

async function commitImport() {
  const st = studioOf(state.importStudio);
  const picked = state.importReview.filter((d) => d.include && d.name.trim());
  if (!picked.length) { toast("Nothing ticked to import.", "error"); return; }
  const btn = document.getElementById("import-commit");
  btn.disabled = true; btn.textContent = "Adding…";
  try {
    const batch = db.batch();
    picked.forEach((d) => {
      batch.set(db.collection(st.collection).doc(), {
        name: d.name.trim(),
        category: d.category || sectionsOf(state.importStudio)[0] || "Uncategorized",
        description: (d.description || "").trim(),
        allergens: (d.allergens || "").trim(),
        ingredients: [],
        cost: 0,
        prepItems: [],
        ...(st.photos ? { imageBase64: "" } : {}),
      });
    });
    await batch.commit();
    state.importReview = [];
    document.getElementById("import-review").innerHTML =
      `<div class="ok-box">Added ${plural(picked.length, "dish", "dishes")} to the ${escapeHtml(st.label)} library. They're ready to use in the studio.</div>`;
    toast(`${picked.length} added.`);
  } catch (err) {
    btn.disabled = false; btn.textContent = `Add ticked ${st.plural} to the library`;
    toast("Couldn't import: " + err.message, "error");
  }
}
