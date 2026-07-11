// docs/ai/agent.js
//
// Agent loop for AI-driven tool calling. One "turn" = one adapter request.
// When the response contains tool_calls, we execute them, append the results
// to the message history, and re-send. The loop stops when:
//   - a turn emits no tool_calls (model's final answer)
//   - maxDepth is reached (safety against runaway loops)
//
// Extracted from main.js so it's pure logic and unit-testable with a scripted
// adapter (no DOM, no network).

import { execTool } from './tools/exec.js';

const DEFAULT_MAX_DEPTH = 10;

/**
 * Drive a multi-turn tool-calling loop against `adapter`.
 *
 * @param {object}   opts
 * @param {object}   opts.adapter        — any AiAdapter (must implement async *streamChat)
 * @param {object}   opts.request        — provider-agnostic request payload
 *                                          (apiKey, model, baseUrl, tools, systemPrompt)
 *                                          — passed to every streamChat call
 * @param {Array}    opts.messages       — OpenAI-format message history (mutated in place)
 * @param {object}   opts.ctx            — ctx passed to tool handlers
 * @param {Function} [opts.execTool]     — dispatcher (defaults to ./tools/exec.js)
 * @param {Function} opts.onEvent        — receives { type:'text'|'tool_call'|'tool_result'|'done'|'error', ... }
 * @param {number}   [opts.maxDepth=10]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ messages: Array, turns: number }>}
 */
export async function runAgentLoop({
  adapter,
  request,
  messages,
  ctx,
  execTool: dispatch = execTool,
  onEvent = () => {},
  maxDepth = DEFAULT_MAX_DEPTH,
  signal,
}) {
  const tool = dispatch;
  let turns = 0;

  for (let depth = 0; depth < maxDepth; depth++) {
    turns += 1;

    const textParts = [];
    const toolCalls = [];
    const toolResults = [];

    for await (const ev of adapter.streamChat({
      ...request,
      signal,
      messages,
    })) {
      if (ev.type === 'text') {
        textParts.push(ev.delta);
        onEvent({ type: 'text', delta: ev.delta });
      } else if (ev.type === 'tool_call') {
        toolCalls.push({
          id: ev.id,
          type: 'function',
          function: { name: ev.name, arguments: JSON.stringify(ev.args ?? {}) },
          // Provider-specific metadata (e.g. Gemini's thoughtSignature) must
          // round-trip back to the provider on the next request. Adapters that
          // emit it include it on the tool_call event; we store it here and
          // the adapter reads it back when re-serializing.
          ...(ev.thoughtSignature ? { thoughtSignature: ev.thoughtSignature } : {}),
        });
        onEvent({ type: 'tool_call', id: ev.id, name: ev.name, args: ev.args });
        const result = await tool(ev.name, ev.args ?? {}, ctx);
        onEvent({ type: 'tool_result', id: ev.id, name: ev.name, result });
        toolResults.push({
          role: 'tool',
          tool_call_id: ev.id,
          content: JSON.stringify(result),
        });
      } else if (ev.type === 'error') {
        onEvent({ type: 'error', error: ev.error });
      } else if (ev.type === 'done') {
        onEvent({ type: 'done' });
      }
    }

    // Persist the assistant turn + tool results into the conversation.
    const assistantMsg = { role: 'assistant', content: textParts.join('') };
    if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
    messages.push(assistantMsg, ...toolResults);

    // If the turn had no tool_calls, the model is done — return.
    if (toolCalls.length === 0) return { messages, turns };
  }

  // Exceeded maxDepth — return whatever we have so the caller can surface a
  // warning to the user rather than hanging.
  return { messages, turns };
}
