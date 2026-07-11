// docs/ai/adapters/gemini.js
//
// Google Gemini `streamGenerateContent` endpoint. Auth via `?key=` query param.
//
// Wire format differs from OpenAI in four ways:
//   - System prompt lives at top-level `systemInstruction` (not as a message)
//   - Tools are wrapped in `{ functionDeclarations: [...] }`
//   - Assistant messages with tool_calls become `role:'model'` parts with
//     `functionCall` entries; tool results become `role:'user'` parts with
//     `functionResponse` entries (NOT separate `role:'tool'` messages)
//   - Gemini 3.x requires the `thoughtSignature` from a prior functionCall
//     to be echoed back in the next request, or the API rejects it
//
// We accept raw JSON lines OR `data: …` SSE lines (the `?alt=sse` variant).
import { AiAdapter } from './base.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiAdapter extends AiAdapter {
  static supportedModels = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
  ];
  static baseUrl = BASE;

  async *streamChat({ apiKey, model, messages, tools, systemPrompt, signal }) {
    const url = `${BASE}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messagesToGeminiContents(messages ?? []),
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
          if (typeof p.text === 'string') return { text: p.text };
          if (p.functionCall) {
            counter += 1;
            // Gemini 3.x requires we echo back thoughtSignature in the next
            // request; round-trip it via the tool_call event.
            return {
              tool_call: {
                id: p.functionCall.id ?? `gemini-${counter}`,
                name: p.functionCall.name,
                args: p.functionCall.args ?? {},
                ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
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

/**
 * Convert our OpenAI-style message history into Gemini's `contents` shape.
 *
 * - `role:'user'`             → `{ role:'user', parts:[{text}] }`
 * - `role:'assistant'`        → `{ role:'model', parts:[{text}? + {functionCall}*] }`
 * - `role:'tool'`             → `{ role:'user', parts:[{functionResponse:{name, response}}] }`
 *
 * Gemini 3.x requires each functionCall part to also carry the original
 * thoughtSignature so the model can keep its reasoning chain intact.
 */
function messagesToGeminiContents(messages) {
  // First pass: build a tool_call_id → function name lookup (tool messages
  // reference the id, not the name, so we need to find the matching assistant
  // message earlier in the history).
  const idToName = new Map();
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id && tc?.function?.name) idToName.set(tc.id, tc.function.name);
      }
    }
  }

  const contents = [];
  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string' && m.content.length) {
        contents.push({ role: 'user', parts: [{ text: m.content }] });
      }
    } else if (m.role === 'assistant') {
      const parts = [];
      if (typeof m.content === 'string' && m.content.length) parts.push({ text: m.content });
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const name = tc?.function?.name;
          if (!name) continue;
          let args = {};
          try { args = JSON.parse(tc.function.arguments ?? '{}'); } catch { /* keep {} */ }
          const callPart = { functionCall: { name, args } };
          if (tc.thoughtSignature) callPart.thoughtSignature = tc.thoughtSignature;
          parts.push(callPart);
        }
      }
      if (parts.length) contents.push({ role: 'model', parts });
    } else if (m.role === 'tool') {
      const name = idToName.get(m.tool_call_id);
      if (!name) continue;
      let response = m.content;
      try { response = JSON.parse(m.content ?? '{}'); } catch { /* keep raw */ }
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name, response } }],
      });
    }
  }
  return contents;
}