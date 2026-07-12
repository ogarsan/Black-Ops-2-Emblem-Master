// docs/ai/adapters/anthropic.js
//
// Anthropic Messages API. Different shape from OpenAI:
//   - x-api-key + anthropic-version headers (not Bearer)
//   - SSE events are framed as "event: <type>\ndata: <json>\n\n"
//   - Tools use { name, description, input_schema } (not function wrapping)
//   - system prompt is a top-level `system` field, not a message
//   - Content blocks stream incrementally: content_block_start, deltas, stop
import { AiAdapter } from './base.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';

export class AnthropicAdapter extends AiAdapter {
  static supportedModels = [
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-opus-latest',
  ];
  static baseUrl = ENDPOINT;

  async *streamChat({ apiKey, model, baseUrl, messages, tools, systemPrompt, signal }) {
    const url = baseUrl || this.constructor.baseUrl;
    const body = {
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: convertOpenAIToAnthropic(messages),
      tools: (tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
      stream: true,
    };

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      yield { type: 'error', error: err };
      return;
    }
    if (!res.ok) {
      yield { type: 'error', error: Object.assign(new Error(`Anthropic ${res.status}`), { status: res.status }) };
      return;
    }
    if (!res.body) {
      yield { type: 'error', error: new Error('Anthropic: empty response body') };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // index -> { type, name, id, inputBuf }
    const blocks = new Map();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const ev of events) {
          const lineMap = {};
          for (const line of ev.split('\n')) {
            const idx = line.indexOf(':');
            if (idx < 0) continue;
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim();
            lineMap[k] = v;
          }
          if (!lineMap.event || !lineMap.data) continue;
          let data;
          try { data = JSON.parse(lineMap.data); } catch { continue; }

          if (lineMap.event === 'content_block_start') {
            blocks.set(data.index, {
              type: data.content_block.type,
              name: data.content_block.name,
              id: data.content_block.id,
              inputBuf: '',
            });
          } else if (lineMap.event === 'content_block_delta') {
            const b = blocks.get(data.index);
            if (b?.type === 'text' && data.delta?.text) {
              yield { type: 'text', delta: data.delta.text };
            } else if (b?.type === 'tool_use' && data.delta?.partial_json) {
              b.inputBuf += data.delta.partial_json;
            }
          } else if (lineMap.event === 'content_block_stop') {
            const b = blocks.get(data.index);
            if (b?.type === 'tool_use') {
              let args = {};
              try { args = b.inputBuf ? JSON.parse(b.inputBuf) : {}; } catch { args = {}; }
              yield { type: 'tool_call', id: b.id, name: b.name, args };
            }
          }
          // Other events (message_start, message_delta, message_stop, ping, error)
          // are informational; the final 'done' below covers end-of-stream.
        }
      }
    } catch (err) {
      yield { type: 'error', error: err };
      return;
    }

    yield { type: 'done' };
  }
}

/**
 * Translate OpenAI-shape messages to Anthropic Messages API format.
 * Specifically:
 *   - role:'tool' messages become role:'user' messages with a single
 *     `{type:'tool_result', tool_use_id, content:[...]}` block.
 *     Content can be:
 *       - a string (legacy) → wrapped in `{type:'text', text}`
 *       - an array of text/image_url blocks → emitted as
 *         `{type:'text'}` and `{type:'image', source:{type:'base64', ...}}`.
 *   - All other messages pass through unchanged.
 */
function convertOpenAIToAnthropic(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role !== 'tool') {
      out.push(m);
      continue;
    }
    const inner = [];
    if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          inner.push({ type: 'text', text: block.text });
        } else if (block.type === 'image_url' && block.image_url && typeof block.image_url.url === 'string') {
          const url = block.image_url.url;
          const dm = url.match(/^data:([^;]+);base64,(.*)$/);
          if (dm) {
            inner.push({
              type: 'image',
              source: { type: 'base64', media_type: dm[1], data: dm[2] },
            });
          }
        }
      }
    } else {
      // Legacy: tool result was a JSON string of the result.
      inner.push({ type: 'text', text: typeof m.content === 'string' ? m.content : '' });
    }
    out.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: m.tool_call_id,
        content: inner,
      }],
    });
  }
  return out;
}
