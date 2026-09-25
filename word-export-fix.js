/*
 * Compatibility shim for the Word export.
 *
 * The real editable exporter lives in studio.js.  A previous workaround was
 * overwriting exportMenuDocxText() to force the designed export, which made
 * Word files look like a picture instead of editable text.  Keep the real
 * implementation in place and only provide a fallback for older builds that do
 * not define it yet.
 */
if (typeof exportMenuDocxText !== "function") {
  function exportMenuDocxText(studioKey, btn) {
    if (typeof exportMenuDocxStyled === "function") {
      return exportMenuDocxStyled(studioKey, btn);
    }
    throw new Error("Editable Word export is unavailable.");
  }
}
