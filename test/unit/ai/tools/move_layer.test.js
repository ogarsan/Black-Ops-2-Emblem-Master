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
});