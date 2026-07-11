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
// Pre-create 32 layer preview nodes.
for (let i = 0; i < 32; i++) {
  if (!document.getElementById(`layer-${i}`)) {
    const el = document.createElement('div');
    el.id = `layer-${i}`;
    document.body.appendChild(el);
  }
}