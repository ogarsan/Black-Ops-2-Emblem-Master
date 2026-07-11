import { describe, it, expect, vi } from 'vitest';
import { OpenAiCompatAdapter } from '../../../../docs/ai/adapters/openai_compat.js';
import { OpenAiAdapter } from '../../../../docs/ai/adapters/openai.js';

describe('OpenAiCompatAdapter', () => {
  it('inherits from OpenAiAdapter', () => {
    expect(new OpenAiCompatAdapter()).toBeInstanceOf(OpenAiAdapter);
  });

  it('yields error when baseUrl is missing', async () => {
    const fetch = vi.fn();
    globalThis.fetch = fetch;
    const iter = new OpenAiCompatAdapter().streamChat({ apiKey: 'k', model: 'm', messages: [], tools: [], systemPrompt: '' });
    const events = [];
    for await (const ev of iter) events.push(ev);
    expect(fetch).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: 'error' });
    expect(events[0].error.message).toMatch(/baseUrl/i);
  });

  it('hits the provided baseUrl + /v1/chat/completions', async () => {
    const fetch = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    globalThis.fetch = fetch;
    const iter = new OpenAiCompatAdapter().streamChat({ apiKey: 'k', model: 'm', baseUrl: 'https://my.local', messages: [], tools: [], systemPrompt: '' });
    for await (const _ of iter) {}
    expect(fetch.mock.calls[0][0]).toBe('https://my.local/v1/chat/completions');
  });

  it('strips a trailing slash from baseUrl before appending the path', async () => {
    const fetch = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    globalThis.fetch = fetch;
    const iter = new OpenAiCompatAdapter().streamChat({ apiKey: 'k', model: 'm', baseUrl: 'https://my.local/', messages: [], tools: [], systemPrompt: '' });
    for await (const _ of iter) {}
    expect(fetch.mock.calls[0][0]).toBe('https://my.local/v1/chat/completions');
  });

  // Regression: MiniMax users paste `https://api.minimax.io/v1` (the OpenAI-
  // compat base), and the adapter used to add another /v1 → /v1/v1/chat/...
  // → 404. We now detect the trailing /v1 and only append /chat/completions.
  it('does not double-up /v1 when baseUrl already ends in /v1 (MiniMax case)', async () => {
    const fetch = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    globalThis.fetch = fetch;
    const iter = new OpenAiCompatAdapter().streamChat({
      apiKey: 'k', model: 'm',
      baseUrl: 'https://api.minimax.io/v1',
      messages: [], tools: [], systemPrompt: '',
    });
    for await (const _ of iter) {}
    expect(fetch.mock.calls[0][0]).toBe('https://api.minimax.io/v1/chat/completions');
  });

  it('does not double-up /v1 with a trailing slash on /v1', async () => {
    const fetch = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    globalThis.fetch = fetch;
    const iter = new OpenAiCompatAdapter().streamChat({
      apiKey: 'k', model: 'm',
      baseUrl: 'https://api.minimax.io/v1/',
      messages: [], tools: [], systemPrompt: '',
    });
    for await (const _ of iter) {}
    expect(fetch.mock.calls[0][0]).toBe('https://api.minimax.io/v1/chat/completions');
  });

  it('uses a baseUrl that already ends in /v1/chat/completions as-is', async () => {
    const fetch = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    globalThis.fetch = fetch;
    const iter = new OpenAiCompatAdapter().streamChat({
      apiKey: 'k', model: 'm',
      baseUrl: 'https://api.minimax.io/v1/chat/completions',
      messages: [], tools: [], systemPrompt: '',
    });
    for await (const _ of iter) {}
    expect(fetch.mock.calls[0][0]).toBe('https://api.minimax.io/v1/chat/completions');
  });
});