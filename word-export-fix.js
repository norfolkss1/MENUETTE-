/* Word export compatibility fix.
 *
 * Word must use the current editorial paper artwork, while menu wording must
 * remain real Word text.  The previous exporter used the retired strip/marble
 * assets and the old shim redirected the editable option to the screenshot
 * exporter.  This implementation deliberately builds text runs and uses the
 * current SVG paper as a page background.
 */
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
      Document, Packer, Paragraph, TextRun, ImageRun, Header,
      AlignmentType, PageBreak, BorderStyle,
      HorizontalPositionRelativeFrom, VerticalPositionRelativeFrom,
      TextWrappingType, TextWrappingSide,
    } = docx;

    const twip = (px) => Math.round(px * 15);
    const halfPt = (px) => Math.round(px * 1.5);
    const inchesToTwip = (n) => Math.round(n * 1440);
    const inchesToPx = (n) => Math.round(n * 96);
    const inchesToEmu = (n) => Math.round(n * 914400);
    const align = b.alignment === "left" ? AlignmentType.LEFT : AlignmentType.CENTER;
    const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

    // This is the current design used by the preview/PDF, not the retired
    // border-strip.jpg or marble-bg.png artwork.
    const paperBytes = new Uint8Array(await fetch("assets/menu-paper-bg.svg").then((r) => r.arrayBuffer()));
    const paper = new ImageRun({
      type: "svg",
      data: paperBytes,
      transformation: { width: inchesToPx(PAGE.widthIn), height: inchesToPx(PAGE.heightIn) },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        wrap: { type: TextWrappingType.NONE, side: TextWrappingSide.BOTH_SIDES },
        behindDocument: true,
        allowOverlap: true,
      },
    });

    const children = [];
    const title = b.uppercase ? (b.titleText || "").toUpperCase() : (b.titleText || st.defaultTitle);
    children.push(new Paragraph({
      alignment: align,
      spacing: { after: twip(4) },
      children: [new TextRun({
        text: title,
        font: TYPE.displayFont,
        bold: true,
        color: "6F4D25",
        size: halfPt(TYPE.title.px),
        characterSpacing: twip(TYPE.title.letterPx),
      })],
    }));
    children.push(new Paragraph({
      alignment: align,
      spacing: { before: twip(10), after: twip(20) },
      border: { bottom: { color: "A47731", style: BorderStyle.SINGLE, size: 10, space: 0 } },
      children: [new TextRun({ text: "", size: 2 })],
    }));

    const groups = groupByCategory(b.canvas, getSectionOrder(studioKey));
    let itemCount = 0;
    groups.forEach((group) => {
      children.push(new Paragraph({
        alignment: align,
        spacing: { before: twip(TYPE.section.beforePx), after: twip(TYPE.section.afterPx) },
        border: { bottom: { color: "E8D9C5", style: BorderStyle.SINGLE, size: 6, space: 4 } },
        children: [new TextRun({
          text: sectionLabelFor(group.category, { sectionLabels: b.sectionLabels || {} }),
          font: TYPE.displayFont,
          bold: true,
          color: "8A6129",
          size: halfPt(TYPE.section.px),
          characterSpacing: twip(TYPE.section.letterPx),
        })],
      }));

      group.items.forEach((item) => {
        if (itemCount && itemCount % 18 === 0) children.push(pageBreak());
        const name = b.uppercase ? item.name.toUpperCase() : item.name;
        const runs = [new TextRun({
          text: name,
          font: TYPE.bodyFont,
          bold: true,
          color: TYPE.ink,
          size: halfPt(TYPE.dish.px),
        })];
        if (item.allergens) runs.push(new TextRun({
          text: `  [${item.allergens}]`,
          font: TYPE.bodyFont,
          italics: true,
          color: TYPE.muted,
          size: halfPt(TYPE.allergens.px),
        }));
        children.push(new Paragraph({ alignment: align, spacing: { before: twip(TYPE.dish.beforePx) }, children: runs }));
        if (item.description) children.push(new Paragraph({
          alignment: align,
          spacing: { before: twip(TYPE.desc.beforePx) },
          children: [new TextRun({
            text: item.description,
            font: TYPE.bodyFont,
            italics: b.italics,
            color: TYPE.muted,
            size: halfPt(TYPE.desc.px),
          })],
        }));
        itemCount++;
      });
    });

    const doc = new Document({
      styles: { default: { document: { run: { font: TYPE.bodyFont, color: TYPE.ink } } } },
      sections: [{
        properties: {
          page: {
            size: { width: inchesToTwip(PAGE.widthIn), height: inchesToTwip(PAGE.heightIn) },
            margin: {
              top: inchesToTwip(0.78), bottom: inchesToTwip(1.05),
              left: inchesToTwip(0.92), right: inchesToTwip(0.48),
              footer: inchesToTwip(0.55),
            },
          },
        },
        headers: { default: new Header({ children: [new Paragraph({ children: [paper] })] }) },
        children,
      }],
    });

    const blob = await Packer.toBlob(doc);
    downloadBlob(blob, `${sanitizeFilename(b.filename || b.titleText || st.short)}.docx`);
    toast("Editable Word file downloaded.");
  } catch (err) {
    console.error(err);
    toast("Couldn't build the editable Word document: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
