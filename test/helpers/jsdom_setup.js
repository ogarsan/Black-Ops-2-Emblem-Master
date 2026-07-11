// Pre-create DOM nodes that hooks.js and the editor expect.
// Loaded automatically by vitest.config.js before each test file.

globalThis.window = globalThis.window || {};
globalThis.window.editor = undefined;
globalThis.window.details = { playername: '', playerclantag: '', playerbg: '' };

// Pre-create nodes that hooks.js expects.
const ids = [
  'frame', 'playercard', 'editor', 'previews', 'preview-contain', 'canvas', 'status',
  'usedlayers', 'usedlayers-num', 'prompt-left', 'prompt-right', 'nametext', 'littleicon',
  'clipboard', 'clipboard-img', 'spinner', 'emblemcount', 'playercard-bg', 'playername',
  'playerclantag', 'smallemblem', 'bigemblem', 'datatext', 'picker',
];
for (const id of ids) {
  if (!document.getElementById(id)) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
}
// Pre-create 32 layer preview containers (id "layer-N") and their inner <img>
// elements (id "layer-img-N"). The latter is what `editor.loaddata()` rewrites
// the src of; tests don't actually render anything, but the IDs need to exist.
for (let i = 0; i < 32; i++) {
  if (!document.getElementById(`layer-${i}`)) {
    const el = document.createElement('div');
    el.id = `layer-${i}`;
    document.body.appendChild(el);
  }
  if (!document.getElementById(`layer-img-${i}`)) {
    const el = document.createElement('img');
    el.id = `layer-img-${i}`;
    document.body.appendChild(el);
  }
}

// jsdom doesn't implement canvas.getContext('2d') without the `canvas` npm
// package. We don't actually render pixels in unit tests — we just need a
// defined ctx object so rebuildLayer in hooks.js doesn't fail. Returning a
// no-op stub keeps the API surface honest (setTransform, drawImage, etc.
// don't blow up if called).
HTMLCanvasElement.prototype.getContext = function () {
  const noop = () => {};
  return new Proxy({}, { get: (_t, prop) => (prop in {} ? noop : noop) });
};