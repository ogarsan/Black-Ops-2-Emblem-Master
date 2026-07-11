// docs/js/bo2_catalog_capture.js
//
// docs/js/editor.js sets the global \`var emblemdata\` (defined by emblems.js)
// to \`null\` after all 261 PNGs finish decoding, to free memory — by the time
// the deferred module ai/main.js executes, \`globalThis.emblemdata\` is gone.
//
// To make the catalog available to the AI system prompt regardless, this
// classic script runs IMMEDIATELY after emblems.js (and BEFORE editor.js's
// checkdone loop nulls it) and freezes a deep copy onto window.__bo2Catalog.
//
// Loaded as a classic <script> in docs/index.html, placed right after
// js/emblems.js. Do not move it to a module — modules are deferred and the
// global would already be null by then.
(function () {
  if (typeof emblemdata === 'undefined' || !emblemdata) return;
  // JSON round-trip gives a deep, frozen copy with no live references back
  // into the source object — so when editor.js later assigns emblemdata =
  // null, our copy survives untouched.
  window.__bo2Catalog = Object.freeze(JSON.parse(JSON.stringify(emblemdata)));
})();