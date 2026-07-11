// docs/ai/main.js
//
// AI chat entrypoint. Loaded as a module AFTER hooks.js so window.__bo2History /
// __bo2Commit / __bo2ApplyState exist. Mounts the chat as a viewport-level drawer
// (see drawer.js) instead of a picker tab, and wires send → adapter → execTool.

import { mountDrawer } from './drawer.js';
import { loadSettings } from './settings.js';
import { loadConversation, saveConversation, truncateForRequest, clearConversation } from './conversation.js';
import { OpenAiAdapter } from './adapters/openai.js';
import { GroqAdapter } from './adapters/groq.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { AnthropicAdapter } from './adapters/anthropic.js';
import { OpenAiCompatAdapter } from './adapters/openai_compat.js';
import { execTool, getToolDefinitions } from './tools/exec.js';
import './tools/index.js'; // side-effect: registers all tools
import { buildSystemPrompt } from './system_prompt.js';
import { beforeSend } from './context_note.js';
import { currentState } from '../store.js';

const ADAPTERS = {
  openai: OpenAiAdapter,
  groq: GroqAdapter,
  gemini: GeminiAdapter,
  anthropic: AnthropicAdapter,
  openai_compat: OpenAiCompatAdapter,
};
const getAdapter = (provider) => new (ADAPTERS[provider] ?? OpenAiAdapter)();

const EMBLEM_CATALOG = (typeof globalThis.emblemdata === 'object' && globalThis.emblemdata) || {
  type: [], tools: [], ranks: [], gear: [], emblems: [],
};

const drawer = mountDrawer({ settings: loadSettings(), conversation: loadConversation() });
const panel = drawer.panel;

let messages = loadConversation().slice();
let streaming = null;
let lastAiTurnSnapshot = null;
let currentAbort = null;

// Undo counter: subscribe once history exists (hooks.js ran first).
window.__bo2History?.subscribe(({ canUndo, canRedo }) => panel.updateCounter({ canUndo, canRedo }));

// New chat: wipe conversation + messages DOM.
drawer.host.addEventListener('bo2:newchat', () => {
  if (streaming) return;
  clearConversation();
  messages = [];
  const list = drawer.host.querySelector('.bo2-ai-messages');
  if (list) list.innerHTML = '';
});

// Abort a stream on Escape (drawer emits bo2:abort; document Escape is swallowed
// inside the drawer, so we listen here on the root).
drawer.root.addEventListener('bo2:abort', () => {
  if (streaming && currentAbort) currentAbort.abort();
});

panel.onSend(async (text) => {
  if (streaming) return;
  const s = loadSettings();
  if (!s.apiKey) {
    panel.showError('Set your API key in Settings (⚙) before sending.');
    return;
  }

  panel.appendUser(text);
  messages.push({ role: 'user', content: text });

  const assistantUpdater = panel.appendAssistant();
  const note = beforeSend({ lastAiTurnSnapshot, currentSnapshot: currentState() });
  const systemPrompt = buildSystemPrompt({ extra: note ?? '' });
  const adapter = getAdapter(s.provider);
  const ctx = {
    editor: window.editor,
    // Route tool snapshots through the deduped commit so manual + AI edits share
    // one clean, granular history stack.
    history: { snapshot: () => window.__bo2Commit?.() },
    icons: window.editor?.icons,
    currentState,
    validEmblemNames: Object.values(EMBLEM_CATALOG).flat(),
  };

  const textParts = [];
  const toolCalls = [];
  const toolResults = [];

  streaming = (async () => {
    currentAbort = new AbortController();
    try {
      panel.setStreaming(true);
      for await (const ev of adapter.streamChat({
        signal: currentAbort.signal,
        apiKey: s.apiKey,
        model: s.model,
        baseUrl: s.baseUrl,
        messages: truncateForRequest(messages),
        tools: getToolDefinitions(),
        systemPrompt,
      })) {
        if (ev.type === 'text') {
          assistantUpdater(ev.delta);
          textParts.push(ev.delta);
        } else if (ev.type === 'tool_call') {
          panel.appendToolCall({ id: ev.id, name: ev.name, args: ev.args });
          toolCalls.push({ id: ev.id, type: 'function', function: { name: ev.name, arguments: JSON.stringify(ev.args) } });
          const result = await execTool(ev.name, ev.args, ctx);
          if (!result.ok) panel.markToolCallError(ev.id, result.error);
          toolResults.push({ role: 'tool', tool_call_id: ev.id, content: JSON.stringify(result) });
        } else if (ev.type === 'error') {
          panel.showError(`Provider error: ${ev.error?.message ?? 'unknown'}`);
        }
      }
      const assistantMsg = { role: 'assistant', content: textParts.join('') };
      if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
      messages.push(assistantMsg, ...toolResults);
      saveConversation(messages);
      lastAiTurnSnapshot = currentState();
    } catch (err) {
      panel.showError(`Unhandled error: ${err?.message ?? String(err)}`);
    } finally {
      streaming = null;
      currentAbort = null;
      panel.setStreaming(false);
    }
  })();
});