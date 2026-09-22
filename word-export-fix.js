/* Word export compatibility fix.
   The editable Word builder still uses the retired strip/marble frame assets.
   Route that option through the exact DOM artwork exporter so Word receives the
   same supplied paper background as the PDF, preview and print outputs. */
function exportMenuDocxText(studioKey, btn) {
  return exportMenuDocxStyled(studioKey, btn);
}
