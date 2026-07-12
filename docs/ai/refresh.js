// docs/ai/refresh.js
//
// Cron-driven safety net for the editor's per-slot DOM. For every layer
// position (0..31) it syncs:
//   - #layer-img-N.src   ← stack[i].img.src (or img/empty.png when null)
//   - #matrix-N values   ← createfilter(stack[i].hue, sat, bri, alpha)
//   - stack[i].canvas    ← generatestackcanvas() so the MAIN canvas
//                          shows colors too (the main canvas composites
//                          stack[i].canvas; #matrix-N only affects the
//                          per-layer preview). Without this, the cron
//                          updates the bottom strip but the main canvas
//                          stays white where it was first painted.
// Then re-composites the main canvas, the layers-used counter, and the
// playercard preview.
//
// Idempotent and best-effort: every DOM and editor call is null-guarded
// and the whole body is wrapped in try/catch so the 3s setInterval
// callback can never throw.

const IDENTITY_VALUES = '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0';

export function refreshEditorView() {
  try {
    const ed = window.editor;
    if (!ed) return;
    for (let i = 0; i < 32; i++) {
      const L = ed.stack[i];
      const imgEl = document.getElementById(`layer-img-${i}`);
      const matrixEl = document.getElementById(`matrix-${i}`);
      if (!imgEl || !matrixEl) continue;
      if (!L || !L.img || !L.img.src) {
        imgEl.src = 'img/empty.png';
        matrixEl.setAttribute('values', IDENTITY_VALUES);
      } else {
        imgEl.src = L.img.src;
        // Order matters:
        //   1. createfilter sets #matrix-${stacki} (used by bottom strip)
        //   2. generatestackcanvas re-paints stack[stacki].canvas with
        //      that filter (used by the MAIN canvas via editor.draw())
        // If we paint first, stack[i].canvas is baked with the OLD
        // filter and the main canvas stays white where colors were added.
        ed.stacki = i;
        ed.createfilter?.(
          L.hue ?? 0,
          L.saturation ?? 0,
          L.brightness ?? 1,
          L.alpha ?? 1,
        );
        ed.generatestackcanvas?.();
      }
    }
    ed.draw?.();
    ed.getusedlayers?.();
    window.updateimgs?.();
  } catch {
    // Best-effort; never throw out of the timer callback.
  }
}
