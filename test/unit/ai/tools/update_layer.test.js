import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerUpdateLayer } from '../../../../docs/ai/tools/update_layer.js';

const layer = () => ({ name: 'A', img: {}, canvas: {}, ctx: {}, x: 150, y: 150, rotate: 0, hue: 0, saturation: 0, brightness: 1, alpha: 1, scalex: 1.15, scaley: 1.15 });

describe('update_layer', () => {
  beforeEach(() => { resetRegistry(); registerUpdateLayer(); });

  it('rejects when position is empty', async () => {
    const editor = { stack: new Array(32).fill(null), draw: vi.fn() };
    const out = await execTool('update_layer', { position: 1, x: 50 }, { editor });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/empty/i);
  });

  it('updates only the sent fields; preserves the rest', async () => {
    const stack = new Array(32).fill(null);
    stack[2] = layer();
    const editor = { stack, draw: vi.fn() };
    const out = await execTool('update_layer', { position: 3, x: 50, hue: 0.7 }, { editor });
    expect(out.ok).toBe(true);
    expect(stack[2].x).toBe(50);
    expect(stack[2].hue).toBe(0.7);
    expect(stack[2].y).toBe(150);
  });

  it('normalizes rotate to [0, 360)', async () => {
    const stack = new Array(32).fill(null);
    stack[0] = layer();
    const editor = { stack, draw: vi.fn() };
    await execTool('update_layer', { position: 1, rotate: 720 }, { editor });
    expect(stack[0].rotate).toBe(0);
  });

  it('rejects out-of-range hue', async () => {
    const stack = new Array(32).fill(null);
    stack[0] = layer();
    const out = await execTool('update_layer', { position: 1, hue: 2 }, { editor: { stack, draw: vi.fn() } });
    expect(out.ok).toBe(false);
  });

  it('rejects out-of-range position', async () => {
    const out = await execTool('update_layer', { position: 99, x: 1 }, { editor: { stack: new Array(32).fill(null), draw: vi.fn() } });
    expect(out.ok).toBe(false);
  });

  // Regression: update_layer used to skip generatestackcanvas + createfilter,
  // so when the model changed colors the #matrix-N color filter wasn't
  // updated and the bottom-strip layer preview kept showing the OLD color.
  // Both calls are now required so the main canvas AND the per-layer preview
  // reflect the new properties.
  it('calls editor.changestacki + repaints via createfilter/generatestackcanvas', async () => {
    const stack = new Array(32).fill(null);
    stack[4] = layer();
    const editor = {
      stack,
      draw: vi.fn(),
      generatestackcanvas: vi.fn(),
      createfilter: vi.fn(),
      changestacki: vi.fn(),
    };
    await execTool('update_layer', { position: 5, hue: 0.8, saturation: 0.4 }, { editor });
    expect(editor.changestacki).toHaveBeenCalledOnce();
    expect(editor.changestacki).toHaveBeenCalledWith(4);
    expect(editor.generatestackcanvas).toHaveBeenCalledOnce();
    expect(editor.createfilter).toHaveBeenCalledOnce();
    const [h, s, v, a] = editor.createfilter.mock.calls[0];
    expect([h, s, v, a]).toEqual([0.8, 0.4, 1, 1]);
  });
});