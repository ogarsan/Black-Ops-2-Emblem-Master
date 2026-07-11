import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { registerTool, execTool, getToolDefinitions, resetRegistry } from '../../../../docs/ai/tools/exec.js';

beforeEach(resetRegistry);

describe('execTool', () => {
  it('returns {ok:false} for unknown tool', async () => {
    const out = await execTool('nope', {}, {});
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/unknown tool/i);
  });

  it('validates args with Zod and returns {ok:false} on failure', async () => {
    registerTool({
      name: 'do_it',
      definition: { description: 'd' },
      schema: z.object({ x: z.number() }),
      handler: async ({ x }) => ({ doubled: x * 2 }),
    });
    const out = await execTool('do_it', { x: 'nope' }, {});
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/expected number/i);
  });

  it('passes parsed args to handler and returns {ok:true, result}', async () => {
    registerTool({
      name: 'do_it',
      definition: { description: 'd' },
      schema: z.object({ x: z.number() }),
      handler: async ({ x }) => ({ doubled: x * 2 }),
    });
    const out = await execTool('do_it', { x: 3 }, {});
    expect(out).toEqual({ ok: true, result: { doubled: 6 } });
  });

  it('returns {ok:false} when handler throws', async () => {
    registerTool({
      name: 'boom',
      definition: { description: 'd' },
      schema: z.object({}),
      handler: async () => { throw new Error('kapow'); },
    });
    const out = await execTool('boom', {}, {});
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/kapow/);
  });

  it('treats handler return {error: ...} as ok:false (domain failure, model self-corrects)', async () => {
    registerTool({
      name: 'soft_fail',
      definition: { description: 'd' },
      schema: z.object({}),
      handler: async () => ({ error: 'bad input name' }),
    });
    const out = await execTool('soft_fail', {}, {});
    expect(out.ok).toBe(false);
    expect(out.error).toBe('bad input name');
  });
});

describe('getToolDefinitions', () => {
  it('includes name from the Map key (adapters read t.name for OpenAI/Anthropic/Gemini wire formats)', () => {
    // Regression: getToolDefinitions used to spread only `definition` (description)
    // and drop the `name` Map key, breaking every adapter that builds
    // function_declarations / function objects with `name: t.name`.
    registerTool({
      name: 'add_layer',
      definition: { description: 'adds a layer' },
      schema: z.object({ name: z.string() }),
      handler: async () => ({}),
    });
    const defs = getToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('add_layer');
    expect(defs[0].description).toBe('adds a layer');
    expect(defs[0].parameters).toEqual({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
  });
});