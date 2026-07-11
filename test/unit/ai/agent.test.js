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
});
