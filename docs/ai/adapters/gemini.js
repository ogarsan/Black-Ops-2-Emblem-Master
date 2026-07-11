// docs/ai/adapters/gemini.js
//
// Google Gemini `streamGenerateContent` endpoint. Auth via `?key=` query param.
// Wire format differs from OpenAI in three ways:
//   - System prompt lives at top-level `systemInstruction` (not as a message)
//   - Tools are wrapped in `{ functionDeclarations: [...] }`
//   - Each chunk is a JSON object containing `candidates[0].content.parts[]`
//     with either `{ text }` or `{ functionCall: { name, args } }`
//
// Gemini returns raw JSON lines by default; with `?alt=sse` it wraps each in
// `data: …`. We accept both so tests don't have to pick one.
import { AiAdapter } from './base.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiAdapter extends AiAdapter {
  static supportedModels = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash-exp',
  ];
  static baseUrl = BASE;

  async *streamChat({ apiKey, model, messages, tools, systemPrompt, signal }) {
    const url = `${BASE}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: (messages ?? []).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content ?? '' }],
      })),
      ...(tools && tools.length
        ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }] }
        : {}),
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      yield { type: 'error', error: err };
      return;
    }
    if (!res.ok) {
      yield { type: 'error', error: Object.assign(new Error(`Gemini ${res.status}`), { status: res.status }) };
      return;
    }
    if (!res.body) {
      yield { type: 'error', error: new Error('Gemini: empty response body') };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let counter = 0;

    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      if (!payload || payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        for (const p of parts) {
          if (typeof p.text === 'string') {
            // text events yield synchronously; tool_call yields via async
            return { text: p.text };
          }
          if (p.functionCall) {
            counter += 1;
            return {
              tool_call: {
                id: `gemini-${counter}`,
                name: p.functionCall.name,
                args: p.functionCall.args ?? {},
              },
            };
          }
        }
      } catch {
        /* ignore malformed chunks */
      }
      return null;
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const result = processLine(line);
          if (!result) continue;
          if (result.text) yield { type: 'text', delta: result.text };
          if (result.tool_call) yield { type: 'tool_call', ...result.tool_call };
        }
      }
      // Flush whatever's left after the stream ends.
      const result = processLine(buffer);
      if (result) {
        if (result.text) yield { type: 'text', delta: result.text };
        if (result.tool_call) yield { type: 'tool_call', ...result.tool_call };
      }
    } catch (err) {
      yield { type: 'error', error: err };
      return;
    }

    yield { type: 'done' };
  }
}