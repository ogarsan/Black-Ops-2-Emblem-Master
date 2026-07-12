// test/unit/ai/refresh.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { refreshEditorView } from '../../../docs/ai/refresh.js';

const IDENTITY_VALUES = '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0';

function makeEditor() {
  return {
    stack: new Array(32).fill(null),
    stacki: 0,
    icons: {},
    canvas: { width: 300, height: 300 },
    draw: vi.fn(),
    getusedlayers: vi.fn(),
    createfilter: vi.fn(),
    generatestackcanvas: vi.fn(),
  };
}

function seedMatrixNodes() {
  for (let i = 0; i < 32; i++) {
    const el = document.getElementById(`matrix-${i}`)
      ?? (() => {
        const n = document.createElement('div');
        n.id = `matrix-${i}`;
        document.body.appendChild(n);
        return n;
      })();
    el.setAttribute('values', 'NON-IDENTITY');
  }
}

describe('refreshEditorView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    // jsdom_setup.js creates the canvas/layer-img nodes; re-seed cleanly.
    const canvas = document.createElement('canvas');
    canvas.id = 'canvas';
    document.body.appendChild(canvas);
    for (let i = 0; i < 32; i++) {
      const img = document.createElement('img');
      img.id = `layer-img-${i}`;
      img.src = 'img/empty.png';
      document.body.appendChild(img);
    }
    seedMatrixNodes();
    window.updateimgs = vi.fn();
  });

  it('no-ops cleanly when window.editor is undefined', () => {
    delete window.editor;
    expect(() => refreshEditorView()).not.toThrow();
  });

  it('resets every empty slot to empty.png + identity matrix', () => {
    window.editor = makeEditor();
    refreshEditorView();
    for (let i = 0; i < 32; i++) {
      expect(document.getElementById(`layer-img-${i}`).src).toMatch(/empty\.png$/);
      expect(document.getElementById(`matrix-${i}`).getAttribute('values')).toBe(IDENTITY_VALUES);
    }
  });

  it('syncs each populated slot to the layer\'s img.src and bakes createfilter', () => {
    const ed = makeEditor();
    ed.stack[3] = { name: 'A', img: { src: 'a.png' }, hue: 0.2, saturation: 0.5, brightness: 0.9, alpha: 0.7 };
    ed.stack[9] = { name: 'B', img: { src: 'b.png' }, hue: 0.5, saturation: 0.2, brightness: 1, alpha: 1 };
    window.editor = ed;

    refreshEditorView();

    expect(document.getElementById('layer-img-3').src).toMatch(/a\.png$/);
    expect(document.getElementById('layer-img-9').src).toMatch(/b\.png$/);
    expect(ed.createfilter).toHaveBeenCalledTimes(2);
    expect(ed.createfilter).toHaveBeenCalledWith(0.2, 0.5, 0.9, 0.7);
    expect(ed.createfilter).toHaveBeenCalledWith(0.5, 0.2, 1, 1);
    expect(ed.stacki).toBe(9); // last slot visited
    expect(ed.draw).toHaveBeenCalledOnce();
    expect(ed.getusedlayers).toHaveBeenCalledOnce();
  });

  it('is idempotent — running twice gives the same DOM state', () => {
    const ed = makeEditor();
    ed.stack[1] = { name: 'A', img: { src: 'a.png' }, hue: 0.4, saturation: 0.5, brightness: 0.8, alpha: 1 };
    window.editor = ed;

    refreshEditorView();
    refreshEditorView();

    expect(document.getElementById('layer-img-1').src).toMatch(/a\.png$/);
    expect(ed.createfilter).toHaveBeenCalledTimes(2);
  });

  // Regression: the cron previously only updated the SVG filter (#matrix-N)
  // which fixes the bottom-strip previews but leaves the MAIN canvas white,
  // because the main canvas composites stack[i].canvas (painted once when
  // the layer was created — with whatever filter was current at that time).
  // The fix: re-paint stack[i].canvas via generatestackcanvas AFTER
  // setting the filter so the main canvas picks up the color.
  it('re-paints stack[i].canvas via generatestackcanvas so the main canvas reflects the layer\'s color filter', () => {
    const ed = makeEditor();
    ed.stack[1] = { name: 'A', img: { src: 'a.png' }, hue: 0.4, saturation: 0.5, brightness: 0.8, alpha: 1 };
    window.editor = ed;

    refreshEditorView();

    expect(ed.generatestackcanvas).toHaveBeenCalledTimes(1);
    expect(ed.stacki).toBe(1); // last slot visited
    // createfilter is called BEFORE generatestackcanvas so the re-paint
    // bakes the new filter into stack[i].canvas.
    const callOrder = ed.createfilter.mock.invocationCallOrder[0];
    const genOrder = ed.generatestackcanvas.mock.invocationCallOrder[0];
    expect(callOrder).toBeLessThan(genOrder);
  });
});
