// docs/ai/agent.js
//
// Agent loop for AI-driven tool calling. One "turn" = one adapter request.
// When the response contains tool_calls, we execute them, append the results
// to the message history, and re-send. The loop stops when:
//   - a turn emits no tool_calls (model's final answer)
//   - maxDepth is reached (safety against runaway loops)
//
// Retryable errors (e.g. Gemini 429 rate-limit, marked by adapters via
// `ev.error.retryable === true`) trigger exponential backoff and a re-send
// of the same turn. Non-retryable errors abort the turn cleanly without
// polluting the message history with an empty assistant entry.
//
// Extracted from main.js so it's pure logic and unit-testable with a scripted
// adapter (no DOM, no network).

import { execTool } from './tools/exec.js';

// A "turn" is one adapter request. The cap is a safety net against
// runaway loops (model keeps emitting tool_calls forever, hammering
// the provider). 50 is plenty for any real emblem build (32 layers +
// retries + a couple of self-reviews) while keeping genuine loops
// short. Raise it if the model hits this in normal use, but first
// check whether the model is mis-planning rather than running out of
// room.
const DEFAULT_MAX_DEPTH = 50;
const DEFAULT_MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => { clearTimeout(t); reject(new Error('aborted')); };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

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
 * @param {Function} opts.onEvent        — receives { type:'text'|'tool_call'|'tool_result'|'done'|'error'|'retrying', ... }
 * @param {number}   [opts.maxDepth=50]
 * @param {number}   [opts.maxRetries=3] — per-turn retries on retryable errors (e.g. 429)
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ messages: Array, turns: number, aborted?: boolean }>}
 */
export async function runAgentLoop({
  adapter,
  request,
  messages,
  ctx,
  execTool: dispatch = execTool,
  onEvent = () => {},
  maxDepth = DEFAULT_MAX_DEPTH,
  maxRetries = DEFAULT_MAX_RETRIES,
  signal,
}) {
  const tool = dispatch;
  let turns = 0;

  for (let depth = 0; depth < maxDepth; depth++) {
    turns += 1;

    // Nudge check: if the LAST assistant message had tool_calls AND no text
    // content, the model "stopped replying" after the tool result. Inject
    // a synthetic user message asking it to write a brief reply before the
    // next iteration. Fires on EVERY stuck iteration (not one-shot) because
    // a chatty model that keeps calling tools without emitting text will
    // otherwise exit silently with only the user's last bubble visible.
    // maxDepth caps the absolute iteration count, so this can't loop forever.
    if (depth > 0) {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant && lastAssistant.tool_calls?.length && !lastAssistant.content?.trim()) {
        messages.push({
          role: 'user',
          content:
            '[nudge] The previous tool call has finished. ' +
            'Reply briefly about what you saw and whether the design matches the user\'s request. ' +
            'Do not call more tools — just emit one short sentence (e.g. "Done." or "Looks good.").',
        });
      }
    }

    const textParts = [];
    const toolCalls = [];
    const toolResults = [];
    let sawError = false;
    let finalError = null;

    // Per-turn retry loop: a 429 from the provider triggers exponential
    // backoff (2s, 4s, 8s, capped at MAX_BACKOFF_MS) and re-sends the same
    // request. Other errors are surfaced immediately and the turn ends.
    let attempt = 0;
    retryTurn: while (true) {
      sawError = false;
      finalError = null;
      textParts.length = 0;
      toolCalls.length = 0;
      toolResults.length = 0;

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
          // Build the tool result message. If the tool returned a `screenshot`,
          // attach it as image content so multimodal providers can SEE the canvas
          // (not just the structured data). For the legacy (no-screenshot)
          // path we preserve the pre-existing wire format: stringify the
          // result envelope (`{ok, result}`) directly — primitives pass through
          // unwrapped so a tool that returns `"done"` stays `"done"`.
          const screenshot = result
            && typeof result === 'object'
            && typeof result.result === 'object'
            && typeof result.result.screenshot === 'string'
              ? result.result.screenshot
              : undefined;
          let content;
          if (screenshot) {
            // Strip the screenshot from the text payload so we don't send the
            // base64 twice (once in text, once in image_url).
            const textPayload = { ...result.result };
            delete textPayload.screenshot;
            content = [
              { type: 'text', text: JSON.stringify(textPayload) },
              { type: 'image_url', image_url: { url: screenshot } },
            ];
          } else {
            content = JSON.stringify(result);
          }
          toolResults.push({
            role: 'tool',
            tool_call_id: ev.id,
            content,
          });
        } else if (ev.type === 'error') {
          sawError = true;
          finalError = ev.error;
          onEvent({ type: 'error', error: ev.error });
          if (ev.error?.retryable && attempt < maxRetries) {
            // Retryable — wait with exponential backoff and re-emit the
            // stream. Any partial events already yielded above are discarded
            // (in practice the adapter errors out before any payload events
            // for 429s, so this is safe).
            attempt += 1;
            const delay = Math.min(2 ** attempt, MAX_BACKOFF_MS / 1000) * 1000;
            onEvent({
              type: 'retrying',
              attempt,
              maxRetries,
              delayMs: delay,
              message: `Rate limited — retrying in ${delay / 1000}s (attempt ${attempt}/${maxRetries})…`,
            });
            try {
              await sleep(delay, signal);
            } catch {
              // aborted during wait
              messages.push({ role: 'assistant', content: textParts.join('') });
              return { messages, turns, aborted: true };
            }
            continue retryTurn;
          }
          break; // non-retryable: end the turn
        } else if (ev.type === 'done') {
          onEvent({ type: 'done' });
        }
      }

      // Stream finished (cleanly or after a non-retryable error). Break out
      // of the retry loop; either persist the turn or skip it below.
      break;
    }

    // Persist the assistant turn + tool results. Skip an empty assistant
    // entry on error so a failed stream doesn't leave a ghost message.
    if (sawError && textParts.length === 0 && toolCalls.length === 0) {
      onEvent({ type: 'turn_failed', error: finalError });
    } else {
      const assistantMsg = { role: 'assistant', content: textParts.join('') };
      if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
      messages.push(assistantMsg, ...toolResults);
    }

    // If the turn had no tool_calls (and didn't retry to a successful turn),
    // the model is done — return.
    if (toolCalls.length === 0) return { messages, turns };
  }

  // Exceeded maxDepth — return whatever we have so the caller can surface a
  // warning to the user rather than hanging.
  return { messages, turns };
}
