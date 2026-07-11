import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerClearEmblem } from '../../../../docs/ai/tools/clear_emblem.js';

describe('clear_emblem', () => {
  beforeEach(() => { resetRegistry(); registerClearEmblem(); });

  it('empties all 32 layers', async () => {
    const stack = new Array(32).fill(null);
    stack[0] = { name: 'A', img: {}, canvas: {}, ctx: {} };
    stack[3] = { name: 'B', img: {}, canvas: {}, ctx: {} };
    const draw = vi.fn();
    const getusedlayers = vi.fn();
    const out = await execTool('clear_emblem', {}, { editor: { stack, draw, getusedlayers } });
    expect(out.ok).toBe(true);
    expect(stack.every((l) => l === null)).toBe(true);
    expect(draw).toHaveBeenCalled();
    expect(getusedlayers).toHaveBeenCalled();
  });
});