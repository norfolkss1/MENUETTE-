/*
 * Current-design editable Word export.
 *
 * This file is loaded after studio.js and intentionally replaces the legacy
 * Word-export UI.  It produces a DOCX containing real Word paragraphs/runs;
 * only the paper artwork and logo are images.  PDF remains a visual snapshot.
 */
function openWordExportModal(studioKey, btn) {
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  if (!b.canvas.length) {
    toast(`Add at least one ${st.noun.toLowerCase()} before exporting.`, "error");
    return;
  }

  openModal(`
    <h3>Export editable Word menu</h3>
    <p class="hint-text" style="margin-top:0;">
      The new paper design is included as artwork, while the title, sections,
      dish names, allergens and descriptions remain editable Word text.
    </p>
    <div class="modal-foot">
      <span></span>
      <button id="editable-word-export" class="btn btn-primary">📄 Download editable Word</button>
    </div>
  `);
  document.getElementById("editable-word-export").addEventListener("click", (e) => {
    closeModal();
    exportMenuDocxText(studioKey, btn);
  });
}

async function exportMenuDocxText(studioKey, btn) {
  const b = builderOf(studioKey);
  const st = studioOf(studioKey);
  if (!b.canvas.length) {
    toast(`Add at least one ${st.noun.toLowerCase()} before exporting.`, "error");
    return;
  }

  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Building…";

  try {
    const {
      Document, Packer, Paragraph, TextRun, ImageRun, Header, Footer,
      AlignmentType, PageBreak, BorderStyle,
      HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
      TextWrappingType, TextWrappingSide,
    } = docx;
    const toTwip = (px) => Math.round(px * 15);
    const toHalfPoint = (px) => Math.round(px * 1.5);
    const toTwipIn = (inches) => Math.round(inches * 1440);
    const toPx = (inches) => Math.round(inches * 96);
    const toEmu = (inches) => Math.round(inches * 914400);
    const alignment = b.alignment === "left" ? AlignmentType.LEFT : AlignmentType.CENTER;

    // This is the current design asset used by menu-export-theme.css.  Do not
    // use border-strip.png or marble-bg.png here: those are retired assets.
    const paperResponse = await fetch("assets/menu-paper-bg.svg");
    if (!paperResponse.ok) throw new Error("The current menu paper artwork could not be loaded.");
    const paperData = new Uint8Array(await paperResponse.arrayBuffer());
    const paperImage = new ImageRun({
      type: "svg",
      data: paperData,
      transformation: { width: toPx(PAGE.widthIn), height: toPx(PAGE.heightIn) },
      altText: { title: "Menu paper background", description: "Current Menuette paper design", name: "menu-paper-bg" },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
        behindDocument: true,
        allowOverlap: true,
      },
    });

    const logoResponse = await fetch("assets/me-dubai-logo.png");
    const logoData = logoResponse.ok ? new Uint8Array(await logoResponse.arrayBuffer()) : null;
    const logoImage = logoData ? new ImageRun({
      type: "png",
      data: logoData,
      transformation: { width: toPx(PAGE.logoWidthIn), height: toPx(PAGE.logoHeightIn) },
      floating: {
        horizontalPosition: {
          relative: HorizontalPositionRelativeFrom.PAGE,
          offset: toEmu(PAGE.widthIn - PAGE.logoRightIn - PAGE.logoWidthIn),
        },
        verticalPosition: {
          relative: VerticalPositionRelativeFrom.PAGE,
          offset: toEmu(PAGE.heightIn - PAGE.logoBottomIn - PAGE.logoHeightIn),
        },
        wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
        behindDocument: true,
        allowOverlap: true,
      },
    }) : null;

    const children = [];
    const title = b.uppercase ? (b.titleText || "").toUpperCase() : (b.titleText || st.defaultTitle);
    children.push(new Paragraph({
      alignment,
      spacing: { after: toTwip(4) },
      children: [new TextRun({
        text: title,
        font: TYPE.displayFont,
        bold: true,
        color: "6F4D25",
        size: toHalfPoint(TYPE.title.px),
        characterSpacing: toTwip(TYPE.title.letterPx),
      })],
    }));
    children.push(new Paragraph({
      alignment,
      spacing: { before: toTwip(10), after: toTwip(20) },
      border: { bottom: { color: "A47731", style: BorderStyle.SINGLE, size: 10, space: 0 } },
      children: [new TextRun({ text: "", size: 2 })],
    }));

    const groups = groupByCategory(b.canvas, getSectionOrder(studioKey));
    groups.forEach((group) => {
      children.push(new Paragraph({
        alignment,
        spacing: { before: toTwip(TYPE.section.beforePx), after: toTwip(TYPE.section.afterPx) },
        border: { bottom: { color: "E8D9C5", style: BorderStyle.SINGLE, size: 6, space: 4 } },
        children: [new TextRun({
          text: sectionLabelFor(group.category, { sectionLabels: b.sectionLabels || {} }),
          font: TYPE.displayFont,
          bold: true,
          color: "8A6129",
          size: toHalfPoint(TYPE.section.px),
          characterSpacing: toTwip(TYPE.section.letterPx),
        })],
      }));

      group.items.forEach((item) => {
        const name = b.uppercase ? item.name.toUpperCase() : item.name;
        const nameRuns = [new TextRun({
          text: name,
          font: TYPE.bodyFont,
          bold: true,
          color: TYPE.ink,
          size: toHalfPoint(TYPE.dish.px),
        })];
        if (item.allergens) nameRuns.push(new TextRun({
          text: `  [${item.allergens}]`,
          font: TYPE.bodyFont,
          italics: true,
          color: TYPE.muted,
          size: toHalfPoint(TYPE.allergens.px),
        }));
        children.push(new Paragraph({
          alignment,
          spacing: { before: toTwip(TYPE.dish.beforePx) },
          children: nameRuns,
        }));
        if (item.description) children.push(new Paragraph({
          alignment,
          spacing: { before: toTwip(TYPE.desc.beforePx) },
          children: [new TextRun({
            text: item.description,
            font: TYPE.bodyFont,
            italics: b.italics,
            color: TYPE.muted,
            size: toHalfPoint(TYPE.desc.px),
          })],
        }));
      });
    });

    const legend = new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { color: "E8D9C5", style: BorderStyle.SINGLE, size: 6, space: 6 } },
      children: [new TextRun({
        text: "Allergens: D — Dairy   ·   G — Gluten   ·   S — Seafood   ·   N — Nuts",
        font: TYPE.bodyFont,
        color: TYPE.muted,
        size: toHalfPoint(TYPE.legend.px),
      })],
    });

    const doc = new Document({
      styles: { default: { document: { run: { font: TYPE.bodyFont, color: TYPE.ink } } } },
      sections: [{
        properties: {
          page: {
            size: { width: toTwipIn(PAGE.widthIn), height: toTwipIn(PAGE.heightIn) },
            margin: {
              top: toTwipIn(0.78), bottom: toTwipIn(1.05),
              left: toTwipIn(0.92), right: toTwipIn(0.48),
              footer: toTwipIn(0.55),
            },
          },
        },
        headers: { default: new Header({ children: [new Paragraph({ children: [paperImage] })] }) },
        footers: { default: new Footer({ children: [legend, ...(logoImage ? [new Paragraph({ children: [logoImage] })] : [])] }) },
        children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${sanitizeFilename(b.filename || b.titleText || st.short)}-editable.docx`);
    toast("Editable Word menu downloaded.");
  } catch (err) {
    console.error(err);
    toast("Couldn't build the editable Word document: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
