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

  it('captures thoughtSignature from a functionCall part (Gemini 3.x round-trip requirement)', async () => {
    const body = JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            functionCall: { name: 'get_emblem_state', args: {}, id: 'g1' },
            thoughtSignature: 'sig-xyz',
          }],
          role: 'model',
        },
        finishReason: 'STOP',
      }],
    });
    globalThis.fetch = vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
    const events = await collect(new GeminiAdapter().streamChat({ apiKey: 'AIza-x', model: 'gemini-3.5-flash', messages: [], tools: [], systemPrompt: '' }));
    const tc = events.find((e) => e.type === 'tool_call');
    expect(tc).toMatchObject({ type: 'tool_call', name: 'get_emblem_state', thoughtSignature: 'sig-xyz' });
  });

  it('maps an OpenAI-style assistant message with tool_calls to Gemini model+functionCall parts', async () => {
    const fetch = vi.fn(async () => new Response('{"candidates":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetch;
    const iter = new GeminiAdapter().streamChat({
      apiKey: 'AIza-x', model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'add Letter A' },
        { role: 'assistant', content: 'On it.', tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'add_layer', arguments: '{"name":"Letter A","position":1}' }, thoughtSignature: 'sig-c1' },
        ] },
        { role: 'tool', tool_call_id: 'c1', content: '{"ok":true,"result":{"inserted_at":1}}' },
        { role: 'assistant', content: 'Done.' },
      ],
      tools: [], systemPrompt: 'sys',
    });
    for await (const _ of iter) {}
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'add Letter A' }] },
      { role: 'model', parts: [
        { text: 'On it.' },
        { functionCall: { name: 'add_layer', args: { name: 'Letter A', position: 1 } }, thoughtSignature: 'sig-c1' },
      ] },
      // Tool result is sent as a 'user' turn with a functionResponse part
      // (Gemini's wire format — see https://ai.google.dev/gemini-api/docs/function-calling).
      { role: 'user', parts: [{ functionResponse: { name: 'add_layer', response: { ok: true, result: { inserted_at: 1 } } } }] },
      { role: 'model', parts: [{ text: 'Done.' }] },
    ]);
  });

  it('lists supported models', () => {
    expect(GeminiAdapter.supportedModels).toContain('gemini-1.5-flash');
  });

  it('maps a tool message with image_url structured content to inline_data parts', async () => {
    const fetch = vi.fn(async () => new Response(FIX('gemini_stream.txt'), { status: 200, headers: { 'content-type': 'application/json' } }));
    globalThis.fetch = fetch;
    const iter = new GeminiAdapter().streamChat({
      apiKey: 'AIza-x', model: 'gemini-3.5-flash',
      messages: [
        { role: 'user', content: 'snap please' },
        { role: 'assistant', content: '', tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'get_emblem_state', arguments: '{}' } },
        ] },
        { role: 'tool', tool_call_id: 'c1', content: [
          { type: 'text', text: JSON.stringify({ layers_used: 0 }) },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,FAKE_BASE64' } },
        ] },
      ],
      tools: [], systemPrompt: 'sys',
    });
    for await (const _ of iter) {}
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    const lastUserContent = body.contents[body.contents.length - 1];
    expect(lastUserContent.role).toBe('user');
    // 'text' is now inside the functionResponse's response field (the
    // model's structured data), while inline_data is a separate part.
    const fnPart = lastUserContent.parts.find((p) => p.functionResponse);
    expect(fnPart).toBeTruthy();
    // The response field contains the structured data — text fields live in
    // a 'text' sub-property when the tool result was JSON, or as the
    // response itself when it wasn't.
    const responseStr = typeof fnPart.functionResponse.response === 'string'
      ? fnPart.functionResponse.response
      : JSON.stringify(fnPart.functionResponse.response);
    expect(responseStr).toContain('layers_used');
    const partTypes = lastUserContent.parts.map((p) => Object.keys(p)[0]);
    expect(partTypes).toContain('inline_data');
    const inline = lastUserContent.parts.find((p) => p.inline_data);
    expect(inline.inline_data.mime_type).toBe('image/png');
    expect(inline.inline_data.data).toBe('FAKE_BASE64'); // data: URL prefix stripped
  });
});