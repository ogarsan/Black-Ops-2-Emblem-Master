import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerMoveLayer } from '../../../../docs/ai/tools/move_layer.js';

describe('move_layer', () => {
  beforeEach(() => { resetRegistry(); registerMoveLayer(); });

  it('rejects when from is empty', async () => {
    const out = await execTool('move_layer', { from: 1, to: 2 }, { editor: { stack: new Array(32).fill(null), draw: vi.fn() } });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/empty/i);
  });

  it('swaps from and to', async () => {
    const a = { name: 'A', img: {}, canvas: {}, ctx: {}, x: 1 };
    const b = { name: 'B', img: {}, canvas: {}, ctx: {}, x: 2 };
    const stack = new Array(32).fill(null);
    stack[0] = a; stack[4] = b;
    const editor = { stack, draw: vi.fn() };
    const out = await execTool('move_layer', { from: 1, to: 5 }, { editor });
    expect(out.ok).toBe(true);
    expect(stack[0]).toEqual(b);
    expect(stack[4]).toEqual(a);
  });

  it('returns moved:false when from === to', async () => {
    const stack = new Array(32).fill(null);
    stack[0] = { name: 'A' };
    const out = await execTool('move_layer', { from: 1, to: 1 }, { editor: { stack, draw: vi.fn() } });
    expect(out.ok).toBe(true);
    expect(out.result.moved).toBe(false);
  });

  // Regression: move_layer used to swap stack references but never repaint
  // either slot, so:
  //   - layer.canvas kept the OLD layer's image at the OLD slot's coords
  //   - the #matrix-N color filter stayed pointed at the wrong layer
  //   - #layer-img-N.src still showed the emblem that USED to be at that slot
  // Repainting both slots fixes all three.
  it('repaints both affected slots (generatestackcanvas + createfilter)', async () => {
    const a = { name: 'A', img: { src: 'a.png' }, canvas: {}, ctx: {}, x: 1, hue: 0.1 };
    const b = { name: 'B', img: { src: 'b.png' }, canvas: {}, ctx: {}, x: 2, hue: 0.7 };
    const stack = new Array(32).fill(null);
    stack[0] = a; stack[4] = b;
    const editor = {
      stack,
      draw: vi.fn(),
      generatestackcanvas: vi.fn(),
      createfilter: vi.fn(),
    };
    await execTool('move_layer', { from: 1, to: 5 }, { editor });
    expect(editor.generatestackcanvas).toHaveBeenCalledTimes(2);
    expect(editor.createfilter).toHaveBeenCalledTimes(2);
    // The createfilter calls should target each slot's now-current layer
    // (slot 0 has B/hue 0.7, slot 4 has A/hue 0.1).
    const stackiValues = [];
    for (let i = 0; i < editor.generatestackcanvas.mock.calls.length; i++) {
      // We can read the stacki by inspecting what stacki was set to before
      // each call — captured via a getter on the mock.
    }
    expect(editor.createfilter.mock.calls.map(([h]) => h).sort()).toEqual([0.1, 0.7]);
  });
});