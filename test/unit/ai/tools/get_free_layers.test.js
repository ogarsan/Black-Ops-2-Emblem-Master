// test/unit/ai/tools/get_free_layers.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerGetFreeLayers } from '../../../../docs/ai/tools/get_free_layers.js';

describe('get_free_layers', () => {
  beforeEach(() => {
    resetRegistry();
    registerGetFreeLayers();
  });

  it('returns all 32 positions when the stack is empty', async () => {
    const stack = new Array(32).fill(null);
    const out = await execTool('get_free_layers', {}, { editor: { stack } });
    expect(out.ok).toBe(true);
    expect(out.result.count).toBe(32);
    expect(out.result.free).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
  });

  it('returns only the empty positions when the stack has layers', async () => {
    const stack = new Array(32).fill(null);
    stack[0] = { name: 'A' };
    stack[4] = { name: 'B' };
    stack[31] = { name: 'C' };
    const out = await execTool('get_free_layers', {}, { editor: { stack } });
    expect(out.ok).toBe(true);
    expect(out.result.count).toBe(29);
    expect(out.result.free).not.toContain(1);
    expect(out.result.free).not.toContain(5);
    expect(out.result.free).not.toContain(32);
    expect(out.result.free).toContain(2);
    expect(out.result.free).toContain(4);
    expect(out.result.free).toContain(6);
    expect(out.result.free).toContain(31);
  });

  it('handles a missing editor ctx gracefully (count 0, empty free array)', async () => {
    const out = await execTool('get_free_layers', {}, {});
    expect(out.ok).toBe(true);
    expect(out.result.count).toBe(0);
    expect(out.result.free).toEqual([]);
  });
});
