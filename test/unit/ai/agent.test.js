// test/unit/ai/agent.test.js
//
// Unit tests for docs/ai/agent.js — the agent loop that drives multi-turn tool
// calling. The loop sends one adapter request per "turn": when the response
// contains tool_calls, it executes them, appends the results to the message
// history, and re-sends. It stops when a turn emits no tool_calls (final
// answer), or when it reaches maxDepth (safety against infinite loops).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentLoop } from '../../../docs/ai/agent.js';

// A scripted adapter for tests. Each call to streamChat pops the next scripted
// turn from the queue and yields its events. The script lets us simulate:
//   - one-turn flow (model answers in one shot, no tool calls)
//   - multi-turn flow (tool_call → result → second answer)
//   - infinite-loop trap (model keeps emitting tool_calls; loop must stop)
function scriptedAdapter(turns) {
  let i = 0;
  return {
    async *streamChat(_opts) {
      const turn = turns[i++] ?? turns[turns.length - 1]; // repeat last on overflow
      for (const ev of turn) yield ev;
      yield { type: 'done' };
    },
  };
}

describe('runAgentLoop', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns after a single turn when no tool_calls are emitted', async () => {
    const adapter = scriptedAdapter([
      [
        { type: 'text', delta: 'Hi' },
        { type: 'text', delta: ' there' },
      ],
    ]);
    const messages = [{ role: 'user', content: 'hello' }];
    const request = { apiKey: 'k', model: 'm', baseUrl: '', tools: [], systemPrompt: 's' };
    const final = await runAgentLoop({ adapter, request, messages, ctx: {}, onEvent: () => {}, maxDepth: 10 });
    expect(final.messages).toHaveLength(2); // user + assistant
    expect(final.messages[1]).toMatchObject({ role: 'assistant', content: 'Hi there' });
    expect(final.turns).toBe(1);
  });

  it('loops a second turn when the first turn emits a tool_call, executing the tool and feeding the result back', async () => {
    const execTool = vi.fn(async (name, args) => ({
      ok: true,
      result: name === 'get_emblem_state' ? { layers_used: 0 } : { inserted_at: args.position },
    }));
    const adapter = scriptedAdapter([
      // Turn 1: model wants to check state first.
      [{ type: 'text', delta: 'Checking…' }, { type: 'tool_call', id: 'c1', name: 'get_emblem_state', args: {} }],
      // Turn 2: model acts on the result and adds the layer.
      [{ type: 'text', delta: 'Adding.' }, { type: 'tool_call', id: 'c2', name: 'add_layer', args: { name: 'Letter A', position: 1 } }],
      // Turn 3: model gives the final answer (no tool_call).
      [{ type: 'text', delta: 'Done.' }],
    ]);
    const messages = [{ role: 'user', content: 'add Letter A' }];
    const request = { apiKey: 'k', model: 'm', baseUrl: '', tools: [], systemPrompt: 's' };
    const events = [];
    const final = await runAgentLoop({ adapter, request, messages, ctx: {}, execTool, onEvent: (e) => events.push(e), maxDepth: 10 });
    expect(execTool).toHaveBeenCalledTimes(2);
    expect(execTool).toHaveBeenNthCalledWith(1, 'get_emblem_state', {}, expect.anything());
    expect(execTool).toHaveBeenNthCalledWith(2, 'add_layer', { name: 'Letter A', position: 1 }, expect.anything());
    expect(final.turns).toBe(3);
    // Message history should contain: user, assistant(get_emblem_state)+tool_result,
    // assistant(add_layer)+tool_result, final assistant text.
    expect(final.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant']);
    expect(final.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Done.' });
  });

  it('stops at maxDepth even when the model keeps emitting tool_calls (infinite-loop guard)', async () => {
    const execTool = vi.fn(async () => ({ ok: true, result: {} }));
    const loopTurn = [{ type: 'tool_call', id: 'loop', name: 'no_op', args: {} }];
    const adapter = scriptedAdapter(Array(20).fill(loopTurn)); // 20 scripted turns, but we cap at 5
    const messages = [{ role: 'user', content: 'ping' }];
    const request = { apiKey: 'k', model: 'm', baseUrl: '', tools: [], systemPrompt: 's' };
    const final = await runAgentLoop({ adapter, request, messages, ctx: {}, execTool, onEvent: () => {}, maxDepth: 5 });
    expect(final.turns).toBe(5);
    expect(execTool).toHaveBeenCalledTimes(5);
  });

  it('retries a retryable error (e.g. Gemini 429) with exponential backoff and then succeeds', async () => {
    const execTool = vi.fn(async () => ({ ok: true, result: { layers_used: 0 } }));
    // First streamChat call → retryable 429; second call → real text.
    let i = 0;
    const adapter = {
      async *streamChat(_opts) {
        i += 1;
        if (i === 1) {
          const err = Object.assign(new Error('Gemini 429'), { status: 429, retryable: true });
          yield { type: 'error', error: err };
          return;
        }
        yield { type: 'text', delta: 'Hi' };
        yield { type: 'done' };
      },
    };
    const events = [];
    const messages = [{ role: 'user', content: 'hello' }];
    const final = await runAgentLoop({
      adapter,
      request: { apiKey: 'k', model: 'm', baseUrl: '', tools: [], systemPrompt: 's' },
      messages,
      ctx: {},
      execTool,
      onEvent: (e) => events.push(e),
      maxRetries: 3,
      // Skip the actual sleep in tests by giving a fake delay via a tiny cap.
    });
    // We should have hit the adapter twice (first 429, then success).
    expect(i).toBe(2);
    // And a 'retrying' event was emitted before the successful retry.
    expect(events.find((e) => e.type === 'retrying')).toBeTruthy();
    // The final assistant message should be the text from the successful retry,
    // NOT an empty message from the failed first attempt.
    expect(final.messages.at(-1)).toMatchObject({ role: 'assistant', content: 'Hi' });
    expect(execTool).not.toHaveBeenCalled();
  });

  it('skips an empty assistant entry when a non-retryable error ends the turn', async () => {
    const adapter = {
      async *streamChat(_opts) {
        const err = Object.assign(new Error('Bad key'), { status: 401, retryable: false });
        yield { type: 'error', error: err };
      },
    };
    const messages = [{ role: 'user', content: 'hi' }];
    const events = [];
    const final = await runAgentLoop({
      adapter,
      request: { apiKey: 'k', model: 'm', baseUrl: '', tools: [], systemPrompt: 's' },
      messages,
      ctx: {},
      onEvent: (e) => events.push(e),
    });
    // No ghost assistant message from the failed stream.
    expect(final.messages.map((m) => m.role)).toEqual(['user']);
    // The 'turn_failed' event signals main.js that the turn didn't produce content.
    expect(events.find((e) => e.type === 'turn_failed')).toBeTruthy();
  });
});

describe('runAgentLoop — multimodal tool results', () => {
  it('packages tool result with screenshot as structured content (text + image_url)', async () => {
    const execTool = vi.fn(async (name) =>
      name === 'capture'
        ? { ok: true, result: { screenshot: 'data:image/png;base64,FAKE' } }
        : { ok: true, result: {} }
    );
    const adapter = scriptedAdapter([
      [{ type: 'tool_call', id: 'c1', name: 'capture', args: {} }],
      [{ type: 'text', delta: 'done' }],
    ]);
    const messages = [{ role: 'user', content: 'snap' }];
    await runAgentLoop({
      adapter, request: {}, messages, ctx: {}, execTool, onEvent: () => {},
    });
    const lastToolMsg = [...messages].reverse().find((m) => m.role === 'tool');
    expect(Array.isArray(lastToolMsg.content)).toBe(true);
    expect(lastToolMsg.content).toContainEqual({ type: 'text', text: expect.any(String) });
    expect(lastToolMsg.content).toContainEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,FAKE' },
    });
  });

  it('keeps legacy JSON-string content for tool results without screenshot', async () => {
    const execTool = vi.fn(async () => ({ ok: true, result: { layers_used: 0 } }));
    const adapter = scriptedAdapter([
      [{ type: 'tool_call', id: 'c1', name: 'no_screenshot', args: {} }],
      [{ type: 'text', delta: 'ok' }],
    ]);
    const messages = [{ role: 'user', content: 'q' }];
    await runAgentLoop({
      adapter, request: {}, messages, ctx: {}, execTool, onEvent: () => {},
    });
    const lastToolMsg = [...messages].reverse().find((m) => m.role === 'tool');
    expect(typeof lastToolMsg.content).toBe('string');
    expect(lastToolMsg.content).toContain('layers_used');
  });
});
