// test/unit/hooks.test.js
//
// Unit tests for docs/hooks.js — undo/redo wired to the live editor.
//
// Faithful restore: __bo2ApplyState must rebuild each slot the way
// editor.loaddata does (generatestackcanvas + createfilter with stacki === i),
// so restored layers actually have painted canvases and the correct
// #matrix-${i} values. It must also stay in the editor (never toggle visibility)
// and land in the general ('main') view, highlighting the layer that changed.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// A mock editor that records the value of `stacki` at each
// generatestackcanvas / createfilter call, plus changemode/changestacki calls,
// so tests can prove the restore targets the correct slot.
function makeEditor() {
  const calls = { gen: [], filter: [], changemode: [], changestacki: [] };
  const ed = {
    stack: new Array(32).fill(null),
    stacki: 0,
    mode: 'main',
    icons: {
      Skull: { src: 'emblems/Skull.png' },
      'Letter A': { src: 'emblems/LetterA.png' },
    },
    canvas: { width: 300, height: 300 },
    generatestackcanvas() {
      calls.gen.push(this.stacki);
      const L = this.stack[this.stacki];
      if (L) { L.canvas = { width: 300, height: 300 }; L.ctx = {}; } // simulate paint
    },
    createfilter(h, s, v, a) { calls.filter.push({ stacki: this.stacki, h, s, v, a }); },
    changemode(m) { calls.changemode.push(m); this.mode = m; },
    changestacki(i) { calls.changestacki.push(i); this.stacki = i; },
    draw() {},
    getusedlayers() {},
  };
  return { ed, calls };
}

// Build a fresh DOM with all the nodes hooks.js touches. The default
// editorVisible=true matches the production "editor open" state.
function makeDom({ editorVisible = true } = {}) {
  document.body.innerHTML = '';
  const canvas = document.createElement('canvas'); canvas.id = 'canvas'; document.body.appendChild(canvas);
  const editor = document.createElement('div'); editor.id = 'editor';
  editor.style.visibility = editorVisible ? 'visible' : 'hidden'; document.body.appendChild(editor);
  const pc = document.createElement('div'); pc.id = 'playercard'; pc.style.visibility = 'hidden'; document.body.appendChild(pc);
  for (const id of ['playername', 'playerclantag']) {
    const e = document.createElement('div'); e.id = id; document.body.appendChild(e);
  }
  const bg = document.createElement('img'); bg.id = 'playercard-bg'; document.body.appendChild(bg);
  for (let i = 0; i < 32; i++) {
    const img = document.createElement('img'); img.id = `layer-img-${i}`; img.src = 'img/empty.png'; document.body.appendChild(img);
    const m = document.createElement('div'); m.id = `matrix-${i}`;
    m.setAttribute('values', '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0'); document.body.appendChild(m);
  }
}

const layer = (name = 'Skull', over = {}) => ({
  name, x: 150, y: 150, rotate: 0, hue: 0.5, saturation: 0.5, brightness: 0.9, alpha: 1, scalex: 1.15, scaley: 1.15, ...over,
});

async function loadHooksFresh() {
  vi.resetModules();
  // Set up a stub global loadedall BEFORE hooks.js evaluates, so its wrap
  // captures it. We populate icons via makeEditor in beforeEach — hooks.js
  // will seed the baseline on import.
  globalThis.window.loadedall = function () {};
  await import('../../docs/hooks.js');
}

describe('hooks.js undo — capture', () => {
  let ed;
  beforeEach(() => {
    localStorage.clear();
    makeDom({ editorVisible: true });
    ({ ed } = makeEditor());
    window.editor = ed;
    window.details = { playername: 'P', playerclantag: '[C]', playerbg: '' };
    window.updateimgs = () => {};
    delete window.__bo2History;
    delete window.__bo2Commit;
    delete window.__bo2ApplyState;
  });

  it('seeds one baseline on import (icons already populated)', async () => {
    await loadHooksFresh();
    expect(window.__bo2History.size()).toBe(1);
    window.loadedall(); // idempotent — already seeded
    expect(window.__bo2History.size()).toBe(1);
  });

  it('records one snapshot per changed action and dedupes no-ops', async () => {
    await loadHooksFresh();
    // baseline = 1 (from icons already populated at import)
    ed.stack[0] = layer('Skull');
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'v' }));   // change → 2
    document.dispatchEvent(new MouseEvent('mouseup'));                  // no change → deduped
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' })); // no change
    expect(window.__bo2History.size()).toBe(2);
  });
});

describe('hooks.js undo — faithful restore', () => {
  let ed, calls;
  beforeEach(() => {
    localStorage.clear();
    makeDom({ editorVisible: true });
    ({ ed, calls } = makeEditor());
    window.editor = ed;
    window.details = { playername: 'P', playerclantag: '[C]', playerbg: '' };
    window.updateimgs = () => {};
    delete window.__bo2History;
    delete window.__bo2Commit;
    delete window.__bo2ApplyState;
  });

  it('rebuilds each non-null slot with stacki === i (paints canvas, correct matrix)', async () => {
    await loadHooksFresh();
    window.__bo2ApplyState({
      stack: [null, null, layer('Letter A', { hue: 0.3 }), null],
      stacki: 2,
      details: { playername: 'P', playerclantag: '[C]', playerbg: '' },
    });
    // generatestackcanvas + createfilter must have run with stacki === 2 (the layer's slot).
    expect(calls.gen).toContain(2);
    expect(calls.filter.some((c) => c.stacki === 2 && c.h === 0.3)).toBe(true);
    expect(ed.stack[2].name).toBe('Letter A');
    expect(ed.stack[2].img).toBe(ed.icons['Letter A']); // re-attached from icons
    expect(document.getElementById('layer-img-2').src).toMatch(/LetterA\.png$/);
  });

  it('exact revert: undo returns the emblem to the prior full state', async () => {
    await loadHooksFresh();
    window.loadedall(); // baseline: empty (size 1)
    ed.stack[5] = layer('Skull');
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'v' })); // committed: layer at 5
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(ed.stack[5]).toBe(null);                      // back to empty baseline
    for (let i = 0; i < 32; i++) expect(ed.stack[i]).toBe(null);
  });

  it('lands in the general view and highlights the changed layer', async () => {
    await loadHooksFresh();
    window.__bo2ApplyState({
      stack: Object.assign(new Array(32).fill(null), { 7: layer('Skull') }),
      stacki: 0,
      details: { playername: 'P', playerclantag: '[C]', playerbg: '' },
    });
    expect(calls.changemode).toContain('main');          // general layers view
    expect(calls.changestacki.at(-1)).toBe(7);           // changed layer highlighted
  });

  it('never shows the playercard / hides the editor during restore', async () => {
    await loadHooksFresh();
    window.__bo2ApplyState({ stack: new Array(32).fill(null), stacki: 0, details: {} });
    expect(document.getElementById('playercard').style.visibility).toBe('hidden');
    expect(document.getElementById('editor').style.visibility).toBe('visible');
  });

  it('no-ops undo/redo when the editor is not visible', async () => {
    makeDom({ editorVisible: false }); // override — editor hidden
    window.editor = ed;                // re-attach since makeDom wiped body
    window.updateimgs = () => {};
    await loadHooksFresh();
    ed.stack[0] = layer('Skull');
    const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    const prevent = vi.spyOn(e, 'preventDefault');
    document.dispatchEvent(e);
    expect(ed.stack[0]).not.toBe(null);   // unchanged
    expect(prevent).not.toHaveBeenCalled(); // native undo left alone
  });
});

describe('hooks.js — no stale onload eject', () => {
  let ed;
  beforeEach(() => {
    localStorage.clear();
    makeDom({ editorVisible: true });                 // creates #editor(visible), #bigemblem, #layer-img-*, #matrix-*
    const bg = document.getElementById('bigemblem') || (() => {
      const e = document.createElement('img'); e.id = 'bigemblem'; document.body.appendChild(e); return e;
    })();
    bg.onload = () => { throw new Error('stale onload must not survive a restore'); };
    ({ ed } = makeEditor());
    window.editor = ed;
    window.details = { playername: 'P', playerclantag: '[C]', playerbg: '' };
    window.updateimgs = () => {}; // no-op; the point is that hooks cleared onload first
    delete window.__bo2ApplyState;
  });

  it('clears #bigemblem.onload before calling updateimgs during restore', async () => {
    await loadHooksFresh();
    window.__bo2ApplyState({ stack: new Array(32).fill(null), stacki: 0, details: {} });
    expect(document.getElementById('bigemblem').onload).toBe(null);
  });
});
