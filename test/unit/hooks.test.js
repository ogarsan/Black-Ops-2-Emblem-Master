import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockEditor } from '../helpers/mock_editor.js';

// Reset module registry between tests so each `await import('../../docs/hooks.js')`
// re-runs the entrypoint's side effects (otherwise the second test sees the first
// test's `window.__bo2History` and listeners).
beforeEach(() => {
  vi.resetModules();
  mockEditor({ stack: [], stacki: 0 });
  localStorage.clear();
});

describe('hooks.js wiring', () => {
  it('captures snapshot on canvas mouseup (debounced to localStorage)', async () => {
    await import('../../docs/hooks.js');
    expect(window.__bo2History).toBeDefined();
    const canvas = document.getElementById('canvas');
    canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    expect(localStorage.getItem('bo2_history_v1')).not.toBe(null);
  });

  it('Ctrl+Z triggers undo without throwing and updates history state', async () => {
    await import('../../docs/hooks.js');
    // First snapshot comes from the baseline; trigger one more via mouseup so
    // the past stack has ≥ 2 entries and undo() actually returns a state.
    const canvas = document.getElementById('canvas');
    canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const sizeBefore = window.__bo2History.size();
    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    }).not.toThrow();
    // After undo, either the past stack shrinks by 1 (size went down) OR the
    // future stack grew; either way canRedo becomes true.
    expect(window.__bo2History.canRedo()).toBe(true);
    expect(window.__bo2History.size()).toBe(sizeBefore - 1);
  });

  it('exposes __bo2ApplyState that rebuilds editor.stack from a stripped snapshot', async () => {
    await import('../../docs/hooks.js');
    expect(typeof window.__bo2ApplyState).toBe('function');
    // Build a stripped snapshot (no img/canvas/ctx) like history.js would store.
    const before = window.editor.stack.length;
    const snapshot = {
      stack: [{ name: 'Replaced', x: 50, y: 60, rotate: 0, hue: 0, saturation: 0, brightness: 1, alpha: 1, scalex: 1, scaley: 1 }],
      stacki: 0,
      details: { playername: 'X', playerclantag: '[Y]', playerbg: 'Hexed' },
    };
    window.__bo2ApplyState(snapshot);
    expect(window.editor.stack[0]).toBeTruthy();
    expect(window.editor.stack[0].name).toBe('Replaced');
    expect(window.editor.stack[0].x).toBe(50);
    expect(window.editor.stack[0].canvas).toBeDefined();
    expect(window.editor.stack[0].ctx).toBeDefined();
    expect(window.editor.stack.length).toBe(before + 1);
  });
});

describe('Undo/Redo UI surface', () => {
  it('exposes canUndo/canRedo as booleans via window.__bo2History', async () => {
    await import('../../docs/hooks.js');
    expect(typeof window.__bo2History.canUndo()).toBe('boolean');
    expect(typeof window.__bo2History.canRedo()).toBe('boolean');
  });
});