import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicAdapter } from '../../../../docs/ai/adapters/anthropic.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIX = (n) => readFileSync(resolve(`test/fixtures/${n}`), 'utf8');
async function collect(asyncIter) { const out = []; for await (const e of asyncIter) out.push(e); return out; }

describe('AnthropicAdapter', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('yields text deltas', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('anthropic_text_stream.txt'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const events = await collect(new AnthropicAdapter().streamChat({ apiKey: 'sk-ant', model: 'claude-3-5-sonnet-latest', messages: [], tools: [], systemPrompt: '' }));
    expect(events.filter((e) => e.type === 'text').map((e) => e.delta).join('')).toBe('Hello there');
  });

  it('parses tool_use and accumulates input JSON', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('anthropic_tool_use_stream.txt'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const events = await collect(new AnthropicAdapter().streamChat({ apiKey: 'sk-ant', model: 'claude-3-5-sonnet-latest', messages: [], tools: [], systemPrompt: '' }));
    const tc = events.find((e) => e.type === 'tool_call');
    expect(tc).toBeDefined();
    expect(tc.name).toBe('add_layer');
    expect(tc.args).toEqual({ name: 'Letter A', position: 1 });
  });

  it('sets x-api-key and anthropic-version headers', async () => {
    const fetch = vi.fn(async () => new Response(FIX('anthropic_text_stream.txt'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    globalThis.fetch = fetch;
    const iter = new AnthropicAdapter().streamChat({ apiKey: 'sk-ant', model: 'claude-3-5-sonnet-latest', messages: [], tools: [], systemPrompt: '' });
    for await (const _ of iter) {}
    const init = fetch.mock.calls[0][1];
    expect(init.headers['x-api-key']).toBe('sk-ant');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('emits error event on non-OK response', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{"error":"x"}', { status: 401, headers: { 'content-type': 'application/json' } }));
    const events = await collect(new AnthropicAdapter().streamChat({ apiKey: 'sk-ant', model: 'claude-3-5-sonnet-latest', messages: [], tools: [], systemPrompt: '' }));
    expect(events[0].type).toBe('error');
  });

  it('emits done at end', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('anthropic_text_stream.txt'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const events = await collect(new AnthropicAdapter().streamChat({ apiKey: 'sk-ant', model: 'claude-3-5-sonnet-latest', messages: [], tools: [], systemPrompt: '' }));
    expect(events.at(-1).type).toBe('done');
  });

  it('lists supported models', () => {
    expect(AnthropicAdapter.supportedModels).toContain('claude-3-5-sonnet-latest');
  });
});