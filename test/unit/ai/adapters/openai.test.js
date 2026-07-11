import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAiAdapter } from '../../../../docs/ai/adapters/openai.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIX = (n) => readFileSync(resolve(`test/fixtures/${n}`), 'utf8');

async function collect(asyncIter) {
  const out = [];
  for await (const e of asyncIter) out.push(e);
  return out;
}

describe('OpenAiAdapter', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('yields text deltas from a streamed text response', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('openai_text_stream.txt'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const events = await collect(new OpenAiAdapter().streamChat({
      apiKey: 'sk-x', model: 'gpt-4o-mini', messages: [], tools: [], systemPrompt: '',
    }));
    const texts = events.filter((e) => e.type === 'text').map((e) => e.delta).join('');
    expect(texts).toBe('Hello world');
    expect(events.at(-1).type).toBe('done');
  });

  it('parses tool_call streaming and accumulates JSON args', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('openai_tool_call_stream.txt'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const events = await collect(new OpenAiAdapter().streamChat({
      apiKey: 'sk-x', model: 'gpt-4o-mini', messages: [], tools: [], systemPrompt: '',
    }));
    const tc = events.find((e) => e.type === 'tool_call');
    expect(tc).toBeDefined();
    expect(tc.name).toBe('add_layer');
    expect(tc.args).toEqual({ name: 'Letter A', position: 1 });
  });

  it('emits error event on 401', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('openai_401.json'), { status: 401, headers: { 'content-type': 'application/json' } }));
    const events = await collect(new OpenAiAdapter().streamChat({
      apiKey: 'sk-bad', model: 'gpt-4o-mini', messages: [], tools: [], systemPrompt: '',
    }));
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    expect(err.error.status).toBe(401);
  });

  it('aborts cleanly when the signal fires', async () => {
    const ctrl = new AbortController();
    globalThis.fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    setTimeout(() => ctrl.abort(), 10);
    const events = await collect(new OpenAiAdapter().streamChat({
      apiKey: 'sk-x', model: 'gpt-4o-mini', messages: [], tools: [], systemPrompt: '', signal: ctrl.signal,
    }));
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });

  it('emits done event at the end', async () => {
    globalThis.fetch = vi.fn(async () => new Response(FIX('openai_text_stream.txt'), { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const events = await collect(new OpenAiAdapter().streamChat({
      apiKey: 'sk-x', model: 'gpt-4o-mini', messages: [], tools: [], systemPrompt: '',
    }));
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('supportedModels lists at least gpt-4o-mini', () => {
    expect(OpenAiAdapter.supportedModels).toContain('gpt-4o-mini');
  });
});