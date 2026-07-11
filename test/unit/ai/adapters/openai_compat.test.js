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
});