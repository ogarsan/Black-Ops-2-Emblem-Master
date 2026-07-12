// test/unit/ai/tools/get_layer.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerGetLayer } from '../../../../docs/ai/tools/get_layer.js';

describe('get_layer', () => {
  beforeEach(() => {
    resetRegistry();
    registerGetLayer();
  });

  it('returns the full state of a single layer by 1-indexed position', async () => {
    const stack = new Array(32).fill(null);
    stack[2] = {
      name: 'Full Circle', img: {}, canvas: {}, ctx: {},
      x: 50, y: 60, rotate: 90, hue: 0.3, saturation: 0.5,
      brightness: 0.8, alpha: 1, scalex: 1.2, scaley: 1.3,
    };
    const out = await execTool('get_layer', { position: 3 }, { editor: { stack } });
    expect(out.ok).toBe(true);
    expect(out.result).toEqual({
      position: 3,
      name: 'Full Circle',
      x: 50, y: 60, rotate: 90,
      hue: 0.3, saturation: 0.5, brightness: 0.8, alpha: 1,
      scalex: 1.2, scaley: 1.3,
    });
  });

  it('omits non-serializable fields (img/canvas/ctx)', async () => {
    const stack = new Array(32).fill(null);
    stack[0] = { name: 'A', img: { src: 'x' }, canvas: { w: 1 }, ctx: {}, x: 1 };
    const out = await execTool('get_layer', { position: 1 }, { editor: { stack } });
    expect(out.ok).toBe(true);
    expect(out.result).not.toHaveProperty('img');
    expect(out.result).not.toHaveProperty('canvas');
    expect(out.result).not.toHaveProperty('ctx');
  });

  it('returns an error for an empty position', async () => {
    const stack = new Array(32).fill(null);
    const out = await execTool('get_layer', { position: 5 }, { editor: { stack } });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/empty/i);
  });

  it('rejects out-of-range positions', async () => {
    const stack = new Array(32).fill(null);
    const out = await execTool('get_layer', { position: 99 }, { editor: { stack } });
    expect(out.ok).toBe(false);
  });
});
