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
      // Give the agent loop enough info to (a) recognise rate-limits and
      // auto-retry with backoff, and (b) show a human-readable message.
      const status = res.status;
      let bodyText = '';
      try { bodyText = (await res.text()).slice(0, 500); } catch { /* ignore */ }
      const hint = status === 429
        ? 'rate limit hit — free tier allows ~5-15 requests per minute, wait or upgrade in AI Studio'
        : status === 401 || status === 403
          ? 'API key invalid or missing billing/quota'
          : status === 404
            ? `model '${model}' not found or not available to this key`
            : '';
      const msg = `Gemini ${status}${hint ? ` (${hint})` : ''}`;
      const err = Object.assign(new Error(msg), { status, provider: 'gemini', retryable: status === 429 });
      yield { type: 'error', error: err };
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
      // Tool result content can be:
      //   - legacy: a JSON string (parsed into Gemini's functionResponse.response)
      //   - structured: an array of {type, ...} blocks (e.g. text + image_url
      //     when the AI asked get_emblem_state for a screenshot)
      // For structured content, build parts accordingly and merge the
      // functionResponse metadata so Gemini still gets the response name.
      let parts = [];
      if (Array.isArray(m.content)) {
        for (const block of m.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            parts.push({ text: block.text });
          } else if (block.type === 'image_url' && block.image_url && typeof block.image_url.url === 'string') {
            const url = block.image_url.url;
            // Expect 'data:<mime>;base64,<data>'. Strip the prefix and pass
            // base64 + mime to Gemini's inline_data.
            const m2 = url.match(/^data:([^;]+);base64,(.*)$/);
            if (m2) {
              parts.push({ inline_data: { mime_type: m2[1], data: m2[2] } });
            }
          }
        }
        // Gemini requires a functionResponse part alongside any extras.
        // Pull the text part (if any) as the `response` field so the model
        // can still see the structured data even if multiple parts are sent.
        // Keep the inline_data part (image) but STRIP the text part from the
        // array so we don't send the same text twice — once as a {text} block
        // and once inside functionResponse.response. Multimodal Gemini models
        // can still SEE the canvas via the inline_data block.
        const textPart = parts.find((p) => 'text' in p);
        let response = {};
        if (textPart) {
          try { response = JSON.parse(textPart.text); } catch { response = textPart.text; }
        }
        const nonTextParts = parts.filter((p) => !('text' in p));
        parts = [{ functionResponse: { name, response } }, ...nonTextParts];
      } else {
        let response = m.content;
        try { response = JSON.parse(m.content ?? '{}'); } catch { /* keep raw */ }
        parts = [{ functionResponse: { name, response } }];
      }
      contents.push({ role: 'user', parts });
    }
  }
  return contents;
}