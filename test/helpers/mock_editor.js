// test/helpers/mock_editor.js
//
// Stubs `window.editor` + `window.details` for unit tests that read these globals.
// Tests that need a populated `editor.icons` map should pass `{ icons: {...} }` and
// then assign via the returned object's `setIcons`.
export function mockEditor({ stack = [], stacki = 0, icons = {} } = {}) {
  globalThis.window.editor = {
    stack,
    stacki,
    icons,
    draw: () => {},
    getusedlayers: () => {},
  };
  globalThis.window.details = { playername: 'P', playerclantag: '[C]', playerbg: '' };
  return globalThis.window.editor;
}