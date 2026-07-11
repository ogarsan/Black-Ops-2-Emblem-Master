// test/unit/hooks.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockEditor } from '../helpers/mock_editor.js';

// hooks.js runs its side effects on import and reads #canvas + window.editor.
// jsdom_setup.js pre-creates #canvas and the layer nodes.
async function loadHooksFresh() {
  vi.resetModules();
  await import('../../docs/hooks.js');
}

const layer = (name = 'Skull', x = 150) => ({
  name, img: {}, canvas: {}, ctx: {},
  x, y: 150, rotate: 0, hue: 0, saturation: 0, brightness: 1, alpha: 1, scalex: 1.15, scaley: 1.15,
});

describe('hooks.js granular capture', () => {
  beforeEach(() => {
    localStorage.clear();
    mockEditor({ stack: new Array(32).fill(null), stacki: 0 });
    delete window.__bo2History;
    delete window.__bo2Commit;
    delete window.__bo2ApplyState;
  });

  it('seeds exactly one baseline snapshot when loadedall fires', async () => {
    await loadHooksFresh();
    expect(window.__bo2History.size()).toBe(0); // not seeded until editor "ready"
    window.loadedall();                          // upstream calls this after images load
    expect(window.__bo2History.size()).toBe(1);
  });

  it('records one snapshot per changed action (keyup)', async () => {
    await loadHooksFresh();
    window.loadedall();                           // baseline = 1
    window.editor.stack[0] = layer('Skull');      // simulate an edit
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'x' }));
    expect(window.__bo2History.size()).toBe(2);
  });

  it('dedupes no-op interactions (same state → no new snapshot)', async () => {
    await loadHooksFresh();
    window.loadedall();                           // baseline = 1
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })); // nothing changed
    document.dispatchEvent(new MouseEvent('mouseup'));                         // nothing changed
    expect(window.__bo2History.size()).toBe(1);
  });

  it('coalesces one action that would fire two events into one snapshot', async () => {
    await loadHooksFresh();
    window.loadedall();
    window.editor.stack[0] = layer('Skull');
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' }));
    document.dispatchEvent(new MouseEvent('mouseup')); // same state → deduped
    expect(window.__bo2History.size()).toBe(2);
  });

  it('__bo2ApplyState records no new snapshot (restore guard)', async () => {
    await loadHooksFresh();
    window.loadedall();
    window.editor.stack[0] = layer('Skull');
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'x' })); // size 2
    const before = window.__bo2History.size();
    window.__bo2ApplyState({ stack: [null], stacki: 0, details: {} });
    expect(window.__bo2History.size()).toBe(before); // restore didn't snapshot
  });

  it('Ctrl+Z applies the previous state via __bo2ApplyState', async () => {
    await loadHooksFresh();
    window.loadedall();                              // baseline: empty stack
    window.editor.stack[0] = layer('Skull');
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'x' })); // committed: 1 layer
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(window.editor.stack[0]).toBe(null);       // back to baseline (empty)
  });
});