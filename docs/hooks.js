// docs/hooks.js
//
// Wires docs/history.js to the live editor. Entrypoint script (no exports).
//
// The upstream editor is imperative and emits no events, AND it captured
// `document.onkeypress = self.keyfuncs` BY REFERENCE at construction
// (editor.js:347) — so wrapping editor methods would not intercept keyboard
// edits. Instead we record commits on the trailing edge of interactions
// (keyup / mouseup / debounced wheel), DEDUPED by serialized state so that
// no-op interactions (selecting a layer, navigation keys, hovers that changed
// nothing) never create spurious snapshots. That dedupe is what makes one
// Ctrl+Z equal one atomic action.
//
// Upstream calls the global `loadedall()` after all 261 emblem PNGs decode
// (and after any `?load=…` is applied), so wrapping it gives us a race-free
// place to seed the baseline snapshot.
//
// Re-entrancy: `__bo2ApplyState` mutates `editor.stack` and calls
// `editor.draw()` etc., which would trip the capture listeners. An
// `isRestoring` flag suspends capture during restore.

import { createHistory } from './history.js';
import { currentState } from './store.js';

const canvas = document.getElementById('canvas');
if (canvas) {
  const hist = createHistory();
  hist.loadFromStorage();

  let isRestoring = false;
  let lastJson = null;

  // Single source of truth for recording a commit; deduped by serialized state.
  const commit = () => {
    if (isRestoring || !window.editor) return;
    const st = currentState();
    const json = JSON.stringify(st);
    if (json === lastJson) return;
    lastJson = json;
    hist.snapshot(st);
  };
  window.__bo2Commit = commit;

  // Deterministic baseline: wrap the global `loadedall()` so the first
  // snapshot is recorded exactly once, right after upstream finished setting
  // up the editor and applying any `?load=…` from the URL.
  let seeded = false;
  const seedBaseline = () => {
    if (seeded || !window.editor) return;
    seeded = true;
    if (hist.size() === 0) commit();                    // fresh session → baseline
    else lastJson = JSON.stringify(currentState());     // restored history → sync ref
  };
  const origLoadedall = typeof window.loadedall === 'function' ? window.loadedall : null;
  window.loadedall = function (...args) {
    const r = origLoadedall ? origLoadedall.apply(this, args) : undefined;
    seedBaseline();
    return r;
  };
  // Fallback: if loadedall already ran before this module loaded (icons populated),
  // seed now.
  if (window.editor && window.editor.icons && Object.keys(window.editor.icons).length) {
    seedBaseline();
  }

  // Commit on the trailing edge of interactions. keyup fires AFTER the editor's
  // onkeypress/onkeydown mutated state; mouseup covers canvas drags AND picker
  // clicks; wheel (debounced) covers fixed-scale zoom. commit()'s dedupe drops
  // the no-ops.
  document.addEventListener('keyup', commit);
  document.addEventListener('mouseup', commit);
  let wheelTimer = null;
  window.addEventListener('wheel', () => {
    if (wheelTimer) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelTimer = null; commit(); }, 250);
  }, { passive: true });

  // Restore a stripped snapshot onto the live editor. isRestoring suppresses
  // the capture listeners that the restore's own draw()/DOM writes would trip.
  window.__bo2ApplyState = (state) => {
    if (!state || !window.editor) return;
    isRestoring = true;
    try {
      const incoming = Array.isArray(state.stack) ? state.stack : [];
      window.editor.stack = incoming.map((l) => (l ? rebuildLayer(l) : null));
      if (typeof state.stacki === 'number') window.editor.stacki = state.stacki;
      if (state.details && window.details) Object.assign(window.details, state.details);

      // Reset all 32 previews + filters, then repopulate slots that have a layer
      // (matches what upstream's `loaddata` does).
      for (let i = 0; i < 32; i++) {
        const imgEl = document.getElementById(`layer-img-${i}`);
        if (imgEl) imgEl.src = 'img/empty.png';
        const matrixEl = document.getElementById(`matrix-${i}`);
        if (matrixEl) matrixEl.setAttribute('values', '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0');
      }
      for (let i = 0; i < window.editor.stack.length; i++) {
        const L = window.editor.stack[i];
        if (!L) continue;
        const imgEl = document.getElementById(`layer-img-${i}`);
        if (imgEl && L.img && L.img.src) imgEl.src = L.img.src;
        window.editor.createfilter?.(L.hue, L.saturation, L.brightness, L.alpha);
      }

      window.editor.draw?.();
      window.editor.getusedlayers?.();
      window.updateimgs?.();
      lastJson = JSON.stringify(state); // keep dedupe ref in sync with live state
    } finally {
      isRestoring = false;
    }
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

// Rebuild a full layer object from a stripped snapshot layer (img/canvas/ctx were
// stripped for serialization). Mirrors editor.generatestackcanvas for a layer.
function rebuildLayer(l) {
  const layer = { ...l };
  const img = window.editor?.icons?.[l.name];
  if (img) layer.img = img;
  const c = document.createElement('canvas');
  const editorCanvas = window.editor?.canvas;
  c.width = editorCanvas?.width ?? 300;
  c.height = editorCanvas?.height ?? 300;
  layer.canvas = c;
  layer.ctx = c.getContext('2d');
  return layer;
}