import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroqAdapter } from '../../../../docs/ai/adapters/groq.js';
import { OpenAiAdapter } from '../../../../docs/ai/adapters/openai.js';

describe('GroqAdapter', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('inherits from OpenAiAdapter', () => {
    expect(new GroqAdapter()).toBeInstanceOf(OpenAiAdapter);
  });

  it('targets groq endpoint by default', async () => {
    const fetch = vi.fn(async () => new Response('data: [DONE]\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    globalThis.fetch = fetch;
    const iter = new GroqAdapter().streamChat({ apiKey: 'gsk-x', model: 'llama-3.1-70b-versatile', messages: [], tools: [], systemPrompt: '' });
    for await (const _ of iter) {}
    const url = fetch.mock.calls[0][0];
    expect(url).toMatch(/groq\.com/);
  });

  it('lists supported models', () => {
    expect(GroqAdapter.supportedModels.length).toBeGreaterThan(0);
  });
});