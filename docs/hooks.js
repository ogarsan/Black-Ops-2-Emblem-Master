// docs/hooks.js
//
// Wires docs/history.js to the live editor. Entrypoint script (no exports).
// Side effects:
//   - Owns the single shared history instance (window.__bo2History)
//   - Captures a baseline snapshot on first load
//   - Captures commit events: canvas mouseup, slider/number change
//   - Defines window.__bo2ApplyState — rebuilds the live editor from a stripped
//     snapshot (undo/redo + AI-driven restores both go through here)
//   - Registers keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Y or
//     Ctrl/Cmd+Shift+Z (redo)
//
// TODO(followup): expand the commit-event listener set per
// docs/upstream-api-notes.md §6 — currently misses x/c/v/a/d/e keys, wheel,
// URL load, text load, alterbg. The plan covers only mouseup + slider change
// here; adding the rest is a Task 9 follow-up or a dedicated task.

import { createHistory } from './history.js';
import { currentState } from './store.js';

const canvas = document.getElementById('canvas');
if (canvas) {
  const hist = createHistory();
  hist.loadFromStorage();

  const capture = () => hist.snapshot(currentState());

  // Baseline: without an initial snapshot, undoing the first edit has nothing to
  // restore to. Only seed when the in-memory stack starts empty (no persisted
  // history loaded, or a clean install).
  if (hist.size() === 0 && window.editor) capture();

  // Manual commit events. Picker selection / paste / clear layer / load-from-URL
  // are additional commit points (spec §3) that must be wired once the upstream
  // entry points identified in the upstream-API audit (Task 3) are confirmed —
  // TODO once those function names are confirmed.
  canvas.addEventListener('mouseup', capture);
  document
    .querySelectorAll('#editor input[type="range"], #editor input[type="number"]')
    .forEach((s) => s.addEventListener('change', capture));

  // Restore a stripped snapshot: rebuild live layer objects (img/canvas/ctx were
  // stripped for serialisation) and repaint. Shared by keyboard undo/redo and the
  // AI tab.
  window.__bo2ApplyState = (state) => {
    if (!state || !window.editor) return;
    const incoming = Array.isArray(state.stack) ? state.stack : [];
    window.editor.stack = incoming.map((l) => (l ? rebuildLayer(l) : null));
    if (typeof state.stacki === 'number') window.editor.stacki = state.stacki;
    if (state.details && window.details) Object.assign(window.details, state.details);
    window.editor.draw?.();
    window.editor.getusedlayers?.();
    window.updateimgs?.();
  };

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      window.__bo2ApplyState(hist.undo());
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      window.__bo2ApplyState(hist.redo());
    }
  });

  window.__bo2History = hist;
}

// Rebuild a full layer object from a stripped snapshot layer. Matches the shape
// that `editor.generatestackcanvas` would have produced for `stack[stacki]`,
// minus the `alterstackcanvas` paint pass (the editor calls that on its next
// `draw()`).
function rebuildLayer(l) {
  const layer = { ...l };
  const img = window.editor?.icons?.[l.name];
  if (img) layer.img = img;
  const c = document.createElement('canvas');
  // Match the editor canvas size so `alterstackcanvas` (called by draw) doesn't
  // blow up on size mismatch. In production #canvas is 300x300; in jsdom it's
  // also 300x300 by default.
  const editorCanvas = window.editor?.canvas;
  c.width = editorCanvas?.width ?? 300;
  c.height = editorCanvas?.height ?? 300;
  layer.canvas = c;
  layer.ctx = c.getContext('2d');
  return layer;
}