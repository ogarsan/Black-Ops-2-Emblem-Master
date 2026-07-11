import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerDeleteLayer } from '../../../../docs/ai/tools/delete_layer.js';

describe('delete_layer', () => {
  beforeEach(() => { resetRegistry(); registerDeleteLayer(); });

  it('rejects when position is empty', async () => {
    const out = await execTool('delete_layer', { position: 5 }, { editor: { stack: new Array(32).fill(null), draw: vi.fn() } });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/empty/i);
  });

  it('removes the layer and draws', async () => {
    const stack = new Array(32).fill(null);
    stack[0] = { name: 'A', img: {}, canvas: {}, ctx: {} };
    const draw = vi.fn();
    const getusedlayers = vi.fn();
    const out = await execTool('delete_layer', { position: 1 }, { editor: { stack, draw, getusedlayers } });
    expect(out.ok).toBe(true);
    expect(stack[0]).toBe(null);
    expect(draw).toHaveBeenCalled();
    expect(getusedlayers).toHaveBeenCalled();
  });
});