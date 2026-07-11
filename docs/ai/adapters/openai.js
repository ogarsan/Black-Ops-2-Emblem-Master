// docs/ai/adapters/openai.js
//
// OpenAI Chat Completions adapter. Streams SSE responses and yields the
// common StreamEvent shape (`text`, `tool_call`, `error`, `done`).
//
// Supports the standard Chat Completions endpoint (api.openai.com) plus any
// OpenAI-compatible base URL — set `baseUrl` on the instance or pass it via
// streamChat options. Other adapters in this directory (groq, openai_compat)
// reuse this file's logic where their wire format matches.

import { AiAdapter } from './base.js';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export class OpenAiAdapter extends AiAdapter {
  static supportedModels = [
    'gpt-4o-mini', 'gpt-4o',
    'gpt-4.1', 'gpt-4.1-mini',
    'o4-mini',
  ];
  static baseUrl = ENDPOINT;

  async *streamChat({ apiKey, model, baseUrl, messages, tools, systemPrompt, signal }) {
    // Use this.constructor so subclasses (GroqAdapter, OpenAiCompatAdapter) inherit their own baseUrl.
    const url = baseUrl || this.constructor.baseUrl;
    const body = {
      model,
      stream: true,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      ...(tools && tools.length
        ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) }
        : {}),
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      // Network failure or abort (AbortError) — surface as an error event, never throw.
      yield { type: 'error', error: err };
      return;
    }
    if (!res.ok) {
      const err = new Error(`OpenAI ${res.status}`);
      err.status = res.status;
      yield { type: 'error', error: err };
      return;
    }
    if (!res.body) {
      yield { type: 'error', error: new Error('OpenAI: empty response body') };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // id -> { name, argsBuf }
    const toolAcc = new Map();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE: events separated by blank lines, lines by \n, comments start with :
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const raw of lines) {
          const line = raw.trim();
          if (!line || line.startsWith(':')) continue;
          const stripped = line.startsWith('data:') ? line.slice(5).trim() : line;
          if (stripped === '[DONE]') continue;

          let parsed;
          try { parsed = JSON.parse(stripped); } catch { continue; }
          const choice = parsed.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta ?? {};

          if (typeof delta.content === 'string' && delta.content.length > 0) {
            yield { type: 'text', delta: delta.content };
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              // OpenAI streams only emit `id` on the first chunk for a given
              // tool call; subsequent chunks use `index` to point at the same
              // call. Key by index, capture id on first sight.
              const idx = tc.index ?? 0;
              const key = `idx-${idx}`;
              const fn = tc.function ?? {};
              if (!toolAcc.has(key)) {
                toolAcc.set(key, { id: tc.id, name: fn.name ?? '', argsBuf: fn.arguments ?? '' });
              } else {
                const cur = toolAcc.get(key);
                if (tc.id && !cur.id) cur.id = tc.id;
                if (fn.name) cur.name = fn.name;
                if (typeof fn.arguments === 'string') cur.argsBuf += fn.arguments;
              }
            }
          }
        }
      }
    } catch (err) {
      yield { type: 'error', error: err };
      return;
    }

    // Emit accumulated tool calls as fully-parsed objects.
    for (const [, { id, name, argsBuf }] of toolAcc) {
      let args = {};
      try { args = argsBuf ? JSON.parse(argsBuf) : {}; } catch (err) {
        yield { type: 'error', error: new Error(`tool_call ${name}: bad JSON args: ${err.message}`) };
        continue;
      }
      yield { type: 'tool_call', id: id ?? `call_${name}`, name, args };
    }

    yield { type: 'done' };
  }
}