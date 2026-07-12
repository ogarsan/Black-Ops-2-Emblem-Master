// test/unit/ai/tools/delete_layer.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerDeleteLayer } from '../../../../docs/ai/tools/delete_layer.js';

const IDENTITY = '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0';

describe('delete_layer', () => {
  beforeEach(() => {
    resetRegistry();
    registerDeleteLayer();
    // jsdom_setup.js does not pre-create #matrix-N nodes — add them so the
    // handler has something to write to.
    for (let i = 0; i < 32; i++) {
      const m = document.getElementById(`matrix-${i}`)
        ?? (() => {
          const el = document.createElement('div');
          el.id = `matrix-${i}`;
          document.body.appendChild(el);
          return el;
        })();
      m.setAttribute('values', 'NON-IDENTITY');
    }
  });

  it('resets #layer-img-N.src and #matrix-N values when the slot is cleared', async () => {
    const stack = new Array(32).fill(null);
    stack[4] = { name: 'A', img: { src: 'a.png' }, x: 1 };
    const editor = {
      stack,
      draw: () => {},
      getusedlayers: () => {},
    };
    const img = document.getElementById('layer-img-4');
    img.src = 'a.png';

    const out = await execTool('delete_layer', { position: 5 }, { editor });

    expect(out.ok).toBe(true);
    expect(stack[4]).toBe(null);
    expect(img.src).toMatch(/empty\.png$/);
    expect(document.getElementById('matrix-4').getAttribute('values'))
      .toBe(IDENTITY);
  });

  it('is a no-op DOM-wise when the position is already empty', async () => {
    const stack = new Array(32).fill(null);
    const editor = { stack, draw: () => {}, getusedlayers: () => {} };
    const img = document.getElementById('layer-img-2');
    const before = img.src;
    const matrix = document.getElementById('matrix-2');
    const matrixBefore = matrix.getAttribute('values');

    const out = await execTool('delete_layer', { position: 3 }, { editor });

    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/empty/i);
    // Don't overwrite DOM state on error.
    expect(img.src).toBe(before);
    expect(matrix.getAttribute('values')).toBe(matrixBefore);
  });
});
