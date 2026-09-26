/* global db, STUDIOS, state, studioOf, builderOf, escapeHtml, plural, formatCurrency,
   sanitizeFilename, isManager, roleLabel, pendingMenus, openModal, closeModal, toast,
   loadMenu, getSectionOrder, updateSidebarCounts, DEFAULT_PIN, DEFAULT_MANAGER_PIN */

/* ==========================================================================
   APPROVALS
   A menu you've built can be sent for approval instead of just saved. It then
   sits in one of three states, and a manager decides which:

     pending  → waiting for a manager to look at it
     approved → signed off; a frozen copy is kept in the archive
     changes  → sent back with a note saying what needs doing

   Both roles see this page and both can send a menu for approval — only a
   manager sees the Approve / Send back buttons. That's the only difference
   between the two roles anywhere in the app.

   Approving writes a SNAPSHOT into `menuArchive` rather than just flagging the
   live menu: if someone edits the menu afterwards, the archive still holds the
   version that was actually signed off, which is the whole point of having one.
   ========================================================================== */

const MENU_STATUS = {
  draft:    { label: "Draft",            badge: "badge-quiet" },
  pending:  { label: "Waiting approval", badge: "badge-warn" },
  approved: { label: "Approved",         badge: "badge-prep" },
  changes:  { label: "Changes asked",    badge: "badge-danger" },
};

function menuStatus(m) { return MENU_STATUS[m && m.status] || MENU_STATUS.draft; }

function statusBadge(m) {
  const st = menuStatus(m);
  return `<span class="badge ${st.badge}">${escapeHtml(st.label)}</span>`;
}

function whenText(ts) {
  return ts ? new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
}

/* ---------------- Sending a menu for approval (called from a studio) ---------------- */
async function submitForApproval(studioKey) {
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  if (!b.canvas.length) { toast(`Add at least one ${st.noun.toLowerCase()} first.`, "error"); return; }

  const existing = b.activeMenuId ? state.menus.find((m) => m.id === b.activeMenuId) : null;

  openModal(`
    <h3>Send for approval</h3>
    <p class="hint-text" style="margin-top:0;">The menu is saved and passed to a manager to sign off. You can keep editing it while it waits — it just goes back to waiting when you send it again.</p>
    <div class="section-title">Menu name</div>
    <input id="ap-name" class="field" value="${escapeHtml(existing ? existing.name : (b.filename || b.titleText || ""))}" placeholder="e.g. Aspen Day 2 — CB + Lunch">
    <div class="section-title">Note for the manager <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted);">(optional)</span></div>
    <textarea id="ap-note" class="field" rows="3" placeholder="Anything they should know — the event, the date, what changed since last time"></textarea>
    <div class="modal-foot">
      <span class="hint-text" style="margin:0;">Sent as ${escapeHtml(roleLabel())}</span>
      <button id="ap-send" class="btn btn-primary">📩 Send for approval</button>
    </div>
  `);

  document.getElementById("ap-send").addEventListener("click", async () => {
    const nameEl = document.getElementById("ap-name");
    const name = nameEl.value.trim();
    if (!name) { nameEl.focus(); toast("Give the menu a name first.", "error"); return; }
    const btn = document.getElementById("ap-send");
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await persistMenu(studioKey, name, {
        status: "pending",
        submittedAt: Date.now(),
        submittedBy: roleLabel(),
        submittedNote: document.getElementById("ap-note").value.trim(),
        reviewNote: "",
      });
      closeModal();
      toast(`“${name}” sent for approval.`);
    } catch (err) {
      btn.disabled = false; btn.textContent = "📩 Send for approval";
      toast("Couldn't send it: " + err.message, "error");
    }
  });
}

/* ---------------- Page ---------------- */
function renderApprovalsShell() {
  const el = document.getElementById("view-approvals");
  const a = state.approvals;
  el.innerHTML = `
    <div class="page">
      <header class="page-top">
        <div class="studio-heading">
          <h1>✅ Approvals</h1>
          <p>${isManager()
            ? "Menus waiting on you, and the archive of everything signed off."
            : "Menus you've sent for approval, and the archive of everything signed off."}</p>
        </div>
        <div class="studio-actions">
          <span class="role-pill">Signed in as <b>${escapeHtml(roleLabel())}</b></span>
          ${isManager() ? `<button class="btn btn-ghost btn-sm" data-act="codes">🔑 Access codes</button>` : ""}
        </div>
      </header>

      <div class="seg-tabs">
        <button class="seg ${a.tab === "pending" ? "active" : ""}" data-tab="pending">Waiting <span class="chip-n" id="ap-n-pending"></span></button>
        <button class="seg ${a.tab === "changes" ? "active" : ""}" data-tab="changes">Sent back <span class="chip-n" id="ap-n-changes"></span></button>
        <button class="seg ${a.tab === "archive" ? "active" : ""}" data-tab="archive">Archive <span class="chip-n" id="ap-n-archive"></span></button>
      </div>

      <div class="filter-bar">
        <input id="ap-search" class="field field-sm" placeholder="🔍 Search menus…" value="${escapeHtml(a.search)}">
      </div>
      <div id="approvals-body"></div>
    </div>
  `;

  el.querySelectorAll(".seg").forEach((t) => t.addEventListener("click", () => {
    state.approvals.tab = t.dataset.tab;
    renderApprovalsShell();
  }));
  document.getElementById("ap-search").addEventListener("input", (e) => {
    state.approvals.search = e.target.value;
    renderApprovalsBody();
  });
  const codesBtn = el.querySelector('[data-act="codes"]');
  if (codesBtn) codesBtn.addEventListener("click", openAccessCodesModal);

  renderApprovalsBody();
}

function renderApprovalsBody() {
  const body = document.getElementById("approvals-body");
  if (!body) return;
  const a = state.approvals;
  const q = a.search.trim().toLowerCase();

  const counts = {
    pending: pendingMenus().length,
    changes: state.menus.filter((m) => m.status === "changes").length,
    archive: state.archive.length,
  };
  ["pending", "changes", "archive"].forEach((k) => {
    const el = document.getElementById("ap-n-" + k);
    if (el) el.textContent = counts[k] || "";
  });

  if (a.tab === "archive") { renderArchiveList(body, q); return; }

  const wanted = a.tab === "pending" ? "pending" : "changes";
  let rows = state.menus.filter((m) => m.status === wanted);
  if (q) rows = rows.filter((m) => String(m.name || "").toLowerCase().includes(q));
  rows.sort((x, y) => (y.submittedAt || 0) - (x.submittedAt || 0));

  if (!rows.length) {
    body.innerHTML = `<div class="empty-note big">${a.tab === "pending"
      ? "Nothing waiting for approval. Send a menu from any studio with <b>📩 Send for approval</b>."
      : "Nothing has been sent back."}</div>`;
    return;
  }

  body.innerHTML = `
    <div class="result-line">${plural(rows.length, "menu")}</div>
    <div class="saved-grid">
      ${rows.map((m) => {
        const studio = STUDIOS[m.studio] || STUDIOS.ddr;
        const items = m.items || [];
        return `
        <article class="saved-card">
          <header>
            <div>
              <div class="saved-card-title">${escapeHtml(m.name)}</div>
              <div class="prep-card-sub">
                <span class="badge">${studio.icon} ${escapeHtml(studio.short)}</span>
                <span class="badge badge-quiet">${plural(items.length, "dish", "dishes")}</span>
                ${statusBadge(m)}
              </div>
            </div>
          </header>
          <div class="saved-card-sections">
            Sent by ${escapeHtml(m.submittedBy || "—")} · ${escapeHtml(whenText(m.submittedAt))}
            ${m.submittedNote ? `<div class="review-note">“${escapeHtml(m.submittedNote)}”</div>` : ""}
            ${m.reviewNote ? `<div class="review-note review-note-back"><b>Sent back:</b> ${escapeHtml(m.reviewNote)}</div>` : ""}
          </div>
          <div class="saved-card-foot">
            <span class="saved-card-date">${m.totalCost ? formatCurrency(m.totalCost) + "/cover" : ""}</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <button class="btn btn-ghost btn-sm" data-open="${m.id}">Open &amp; edit</button>
              ${isManager() && a.tab === "pending" ? `
                <button class="btn btn-outline btn-sm" data-changes="${m.id}">Send back</button>
                <button class="btn btn-primary btn-sm" data-approve="${m.id}">✓ Approve</button>` : ""}
              ${isManager() && a.tab === "changes" ? `<button class="btn btn-primary btn-sm" data-approve="${m.id}">✓ Approve</button>` : ""}
            </div>
          </div>
        </article>`;
      }).join("")}
    </div>
  `;

  body.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => loadMenu(btn.dataset.open)));
  body.querySelectorAll("[data-approve]").forEach((btn) => btn.addEventListener("click", () => approveMenu(btn.dataset.approve)));
  body.querySelectorAll("[data-changes]").forEach((btn) => btn.addEventListener("click", () => openSendBackModal(btn.dataset.changes)));
}

function renderArchiveList(body, q) {
  let rows = state.archive;
  if (q) rows = rows.filter((m) => String(m.name || "").toLowerCase().includes(q));

  if (!rows.length) {
    body.innerHTML = `<div class="empty-note big">Nothing in the archive yet. Approved menus are kept here exactly as they were signed off.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="result-line">${plural(rows.length, "approved menu")} — each stored as it was when it was signed off</div>
    <div class="saved-grid">
      ${rows.map((m) => {
        const studio = STUDIOS[m.studio] || STUDIOS.ddr;
        const items = m.items || [];
        return `
        <article class="saved-card">
          <header>
            <div>
              <div class="saved-card-title">${escapeHtml(m.name)}</div>
              <div class="prep-card-sub">
                <span class="badge">${studio.icon} ${escapeHtml(studio.short)}</span>
                <span class="badge badge-quiet">${plural(items.length, "dish", "dishes")}</span>
                <span class="badge badge-prep">Approved</span>
              </div>
            </div>
          </header>
          <div class="saved-card-sections">
            Approved by ${escapeHtml(m.approvedBy || "Manager")} · ${escapeHtml(whenText(m.approvedAt))}
            ${m.submittedBy ? `<br>Sent by ${escapeHtml(m.submittedBy)}` : ""}
          </div>
          <div class="saved-card-foot">
            <span class="saved-card-date">${m.totalCost ? formatCurrency(m.totalCost) + "/cover" : ""}</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-ghost btn-sm" data-restore="${m.id}">Open a copy</button>
              ${isManager() ? `<button class="icon-btn icon-btn-danger" data-del-archive="${m.id}" title="Remove from archive">✕</button>` : ""}
            </div>
          </div>
        </article>`;
      }).join("")}
    </div>
  `;

  body.querySelectorAll("[data-restore]").forEach((btn) => btn.addEventListener("click", () => openArchivedMenu(btn.dataset.restore)));
  body.querySelectorAll("[data-del-archive]").forEach((btn) => btn.addEventListener("click", async () => {
    const m = state.archive.find((x) => x.id === btn.dataset.delArchive);
    if (!m || !confirm(`Remove “${m.name}” from the archive? The approved copy is deleted for good.`)) return;
    await db.collection("menuArchive").doc(btn.dataset.delArchive).delete();
    toast("Removed from the archive.");
  }));
}

/* ---------------- Manager actions ---------------- */
async function approveMenu(menuId) {
  if (!isManager()) { toast("Only a manager can approve menus.", "error"); return; }
  const m = state.menus.find((x) => x.id === menuId);
  if (!m) return;
  try {
    // The archive keeps its own copy, frozen at the moment of approval.
    await db.collection("menuArchive").add({
      sourceMenuId: m.id,
      studio: m.studio || "ddr",
      name: m.name,
      items: m.items || [],
      titleText: m.titleText || "",
      alignment: m.alignment || "center",
      uppercase: !!m.uppercase,
      italics: m.italics !== false,
      photoLayout: !!m.photoLayout,
      sectionLabels: m.sectionLabels || {},
      sectionOrder: m.sectionOrder || [],
      totalCost: m.totalCost || 0,
      submittedBy: m.submittedBy || "",
      submittedNote: m.submittedNote || "",
      approvedBy: roleLabel(),
      approvedAt: Date.now(),
    });
    await db.collection("menus").doc(menuId).update({
      status: "approved", approvedAt: Date.now(), approvedBy: roleLabel(), reviewNote: "",
    });
    toast(`“${m.name}” approved and archived.`);
  } catch (err) {
    toast("Couldn't approve it: " + err.message, "error");
  }
}

function openSendBackModal(menuId) {
  if (!isManager()) return;
  const m = state.menus.find((x) => x.id === menuId);
  if (!m) return;

  openModal(`
    <h3>Send “${escapeHtml(m.name)}” back</h3>
    <p class="hint-text" style="margin-top:0;">It moves to <b>Sent back</b> with your note attached, so whoever built it knows what to change.</p>
    <textarea id="sb-note" class="field" rows="4" placeholder="What needs changing?"></textarea>
    <div class="modal-foot">
      <span></span>
      <button id="sb-send" class="btn btn-primary">Send back</button>
    </div>
  `);

  document.getElementById("sb-send").addEventListener("click", async () => {
    const note = document.getElementById("sb-note").value.trim();
    if (!note) { document.getElementById("sb-note").focus(); toast("Add a note so they know what to change.", "error"); return; }
    const btn = document.getElementById("sb-send");
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      await db.collection("menus").doc(menuId).update({
        status: "changes", reviewNote: note, reviewedAt: Date.now(), reviewedBy: roleLabel(),
      });
      closeModal();
      toast("Sent back with your note.");
    } catch (err) {
      btn.disabled = false; btn.textContent = "Send back";
      toast("Couldn't send it back: " + err.message, "error");
    }
  });
}

/* Open an archived menu as a fresh working copy, so signing-off history can't
   be rewritten by editing what was approved. */
function openArchivedMenu(archiveId) {
  const m = state.archive.find((x) => x.id === archiveId);
  if (!m) return;
  loadMenu(null, m);
}

/* ---------------- Access codes (manager only) ---------------- */
function openAccessCodesModal() {
  if (!isManager()) return;
  openModal(`
    <h3>Access codes</h3>
    <p class="hint-text" style="margin-top:0;">Two codes, two roles. Both open the whole studio; only the manager code can approve menus. Anyone already signed in stays signed in until they lock the studio.</p>
    <div class="section-title">Chef code</div>
    <input id="ac-staff" class="field" value="${escapeHtml(state.pin)}" autocomplete="off">
    <div class="section-title">Manager code</div>
    <input id="ac-manager" class="field" value="${escapeHtml(state.managerPin)}" autocomplete="off">
    <div class="modal-foot">
      <span></span>
      <button id="ac-save" class="btn btn-primary">💾 Save codes</button>
    </div>
  `);

  document.getElementById("ac-save").addEventListener("click", async () => {
    const staff = document.getElementById("ac-staff").value.trim();
    const manager = document.getElementById("ac-manager").value.trim();
    if (!staff || !manager) { toast("Both codes need a value.", "error"); return; }
    const btn = document.getElementById("ac-save");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await db.collection("config").doc("menuSettings").update({ pin: staff, managerPin: manager });
      closeModal();
      toast("Access codes saved.");
    } catch (err) {
      btn.disabled = false; btn.textContent = "💾 Save codes";
      toast("Couldn't save: " + err.message, "error");
    }
  });
}
