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

  it('translates role:tool messages with structured content (text + image_url) into Anthropic tool_result blocks', async () => {
    // Stub a minimal successful SSE response so the adapter reaches the
    // body construction phase (we don't care about parsed events here).
    globalThis.fetch = vi.fn(async () => new Response(
      'event: message_start\ndata: {"type":"message_start"}\n\n' +
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    ));
    const iter = new AnthropicAdapter().streamChat({
      apiKey: 'x', model: 'claude-3-5-sonnet-latest',
      messages: [
        { role: 'user', content: 'snap' },
        { role: 'assistant', content: '', tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'get_emblem_state', arguments: '{}' } },
        ] },
        { role: 'tool', tool_call_id: 'c1', content: [
          { type: 'text', text: JSON.stringify({ layers_used: 0 }) },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,FAKE' } },
        ] },
      ],
      tools: [], systemPrompt: 'sys',
    });
    for await (const _ of iter) {}
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    // The tool message must have been converted to a user message with
    // a tool_result block containing a text part and an image block.
    const userResults = body.messages.filter((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result'));
    expect(userResults).toHaveLength(1);
    const block = userResults[0].content.find((b) => b.type === 'tool_result');
    expect(block.tool_use_id).toBe('c1');
    const inner = block.content;
    expect(inner.some((b) => b.type === 'text' && b.text.includes('layers_used'))).toBe(true);
    const img = inner.find((b) => b.type === 'image');
    expect(img).toBeTruthy();
    expect(img.source.type).toBe('base64');
    expect(img.source.media_type).toBe('image/png');
    expect(img.source.data).toBe('FAKE');
  });
});
