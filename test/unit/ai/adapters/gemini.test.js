import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter } from '../../../../docs/ai/adapters/gemini.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIX = (n) => readFileSync(resolve(`test/fixtures/${n}`), 'utf8');
async function collect(it) { const out = []; for await (const e of it) out.push(e); return out; }

describe('GeminiAdapter', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('yields text deltas', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('gemini_stream.txt'), { status: 200, headers: { 'content-type': 'application/json' } }));
    const events = await collect(new GeminiAdapter().streamChat({ apiKey: 'AIza-x', model: 'gemini-1.5-flash', messages: [], tools: [], systemPrompt: '' }));
    expect(events.filter((e) => e.type === 'text').map((e) => e.delta).join('')).toBe('Hello world');
  });

  it('yields tool_call from functionCall', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('gemini_stream.txt'), { status: 200, headers: { 'content-type': 'application/json' } }));
    const events = await collect(new GeminiAdapter().streamChat({ apiKey: 'AIza-x', model: 'gemini-1.5-flash', messages: [], tools: [], systemPrompt: '' }));
    const tc = events.find((e) => e.type === 'tool_call');
    expect(tc).toMatchObject({ type: 'tool_call', name: 'add_layer', args: { name: 'Letter A', position: 1 } });
  });

  it('maps tools to functionDeclarations', async () => {
    const fetch = vi.fn(async () => new Response(FIX('gemini_stream.txt'), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetch;
    const iter = new GeminiAdapter().streamChat({ apiKey: 'AIza-x', model: 'gemini-1.5-flash', messages: [], tools: [{ name: 'add_layer', description: 'd', parameters: { type: 'object' } }], systemPrompt: '' });
    for await (const _ of iter) {}
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.tools[0].functionDeclarations[0].name).toBe('add_layer');
  });

  it('emits error on non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"error":"x"}', { status: 403, headers: { 'content-type': 'application/json' } }));
    const events = await collect(new GeminiAdapter().streamChat({ apiKey: 'AIza-x', model: 'gemini-1.5-flash', messages: [], tools: [], systemPrompt: '' }));
    expect(events[0].type).toBe('error');
  });

  it('lists supported models', () => {
    expect(GeminiAdapter.supportedModels).toContain('gemini-1.5-flash');
  });
});