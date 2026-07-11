// docs/store.js
//
// Serialisable snapshot of the live editor state. Used by:
//   - docs/history.js  → strips heavy objects before pushing into past/future
//   - docs/ai/tools/*  → serialises the emblem state to send to the LLM
//
// We keep only the layer fields the renderer needs to rebuild (see
// docs/upstream-api-notes.md §4). `img`, `canvas`, `ctx` are NOT JSON-safe
// and are re-attached at restore time.

const KEPT_FIELDS = [
  'name', 'x', 'y',
  'rotate', 'hue', 'saturation', 'brightness', 'alpha',
  'scalex', 'scaley',
];

function stripLayer(layer) {
  const out = {};
  for (const k of KEPT_FIELDS) out[k] = layer[k];
  return out;
}

/**
 * Serialize the editor stack into a compact, JSON-safe form.
 * Empty layers (null) are omitted entirely. `position` is 1-indexed so the
 *   LLM conversation matches human "Layer 1..32" language.
 *
 * @param {Array<object|null>} editorStack
 * @returns {{ layers: Array<object>, layers_used: number }}
 */
export function serializeStack(editorStack) {
  const layers = [];
  for (let i = 0; i < editorStack.length; i++) {
    const l = editorStack[i];
    if (!l) continue;
    layers.push({ position: layers.length + 1, ...stripLayer(l) });
  }
  return { layers, layers_used: layers.length };
}

/**
 * Read the current live state from `window.editor` + `window.details`.
 * The returned object is JSON-safe (deep-cloned) and can be passed straight
 * to `history.snapshot()`.
 */
export function currentState() {
  const editor = window.editor;
  const details = window.details;
  return {
    stack: editor.stack.map((l) =>
      l ? JSON.parse(JSON.stringify({ ...l, img: undefined, canvas: undefined, ctx: undefined })) : null
    ),
    stacki: editor.stacki,
    details: { ...details },
  };
}