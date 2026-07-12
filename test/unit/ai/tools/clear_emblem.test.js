// test/unit/ai/tools/clear_emblem.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerClearEmblem } from '../../../../docs/ai/tools/clear_emblem.js';

const IDENTITY = '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0';

describe('clear_emblem', () => {
  beforeEach(() => {
    resetRegistry();
    registerClearEmblem();
    // jsdom_setup.js creates #layer-img-i for i=0..31 but not #matrix-i.
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

  it('resets all 32 #layer-img-N.src to empty.png and all #matrix-N to identity', async () => {
    const stack = new Array(32).fill(null);
    stack[3] = { name: 'A', img: { src: 'a.png' } };
    stack[7] = { name: 'B', img: { src: 'b.png' } };
    document.getElementById('layer-img-3').src = 'a.png';
    document.getElementById('layer-img-7').src = 'b.png';

    const noop = () => {};
    const editor = { stack, draw: noop, getusedlayers: noop };
    const out = await execTool('clear_emblem', {}, { editor });

    expect(out.ok).toBe(true);
    expect(stack.every((s) => s === null)).toBe(true);
    // All layer images reset.
    for (let i = 0; i < 32; i++) {
      expect(document.getElementById(`layer-img-${i}`).src)
        .toMatch(/empty\.png$/);
      expect(document.getElementById(`matrix-${i}`).getAttribute('values'))
        .toBe(IDENTITY);
    }
  });
});
