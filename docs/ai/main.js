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
import { runAgentLoop } from './agent.js';
import { refreshEditorView } from './refresh.js';
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

// 3s safety-net cron: re-sync the editor's per-slot DOM (#layer-img-N,
// #matrix-N) from the live stack. Most tool handlers refresh these
// themselves on mutation; this catches anything we missed and any future
// regressions. Idempotent and best-effort — see refresh.js.
setInterval(refreshEditorView, 3000);

let messages = loadConversation().slice();
let streaming = null;
let lastAiTurnSnapshot = null;
let currentAbort = null;
// Queue of messages the user typed while the agent was busy. The panel
// cleared the textarea on Enter, so without queuing we lose these — the
// user sees no bubble, no AI response to their typing. We append the user
// bubble immediately (so they SEE that their input was accepted) and
// drain the queue automatically when the current stream finishes.
let pendingQueue = [];

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
  const s = loadSettings();
  if (!s.apiKey) {
    panel.showError('Set your API key in Settings (⚙) before sending.');
    return;
  }

  // If the agent is busy, queue the message + show it as a pending bubble so
  // the user SEES that their typing was accepted (the textarea is cleared on
  // Enter, so without this they'd see nothing happen and no AI response).
  if (streaming) {
    pendingQueue.push(text);
    panel.appendUser(text);
    panel.showInfo?.('Queued — will send after current reply finishes.');
    return;
  }

  panel.appendUser(text);
  messages.push({ role: 'user', content: text });
  await runOneTurn(text, s);
});

async function runOneTurn(_userText, s) {
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
  const request = {
    apiKey: s.apiKey,
    model: s.model,
    baseUrl: s.baseUrl,
    tools: getToolDefinitions(),
    systemPrompt,
  };

  streaming = (async () => {
    currentAbort = new AbortController();
    try {
      panel.setStreaming(true);
      await runAgentLoop({
        adapter,
        request: { ...request, messages: truncateForRequest(messages) },
        messages,
        ctx,
        signal: currentAbort.signal,
        onEvent: (ev) => {
          if (ev.type === 'text') {
            assistantUpdater(ev.delta);
          } else if (ev.type === 'tool_call') {
            panel.appendToolCall({ id: ev.id, name: ev.name, args: ev.args });
          } else if (ev.type === 'tool_result') {
            if (!ev.result.ok) panel.markToolCallError(ev.id, ev.result.error);
          } else if (ev.type === 'error') {
            panel.showError(`Provider error: ${ev.error?.message ?? 'unknown'}`);
          } else if (ev.type === 'retrying') {
            panel.showInfo?.(ev.message);
          } else if (ev.type === 'turn_failed') {
            panel.showError(`Request failed: ${ev.error?.message ?? 'unknown'}`);
          }
        },
      });
      saveConversation(messages);
      lastAiTurnSnapshot = currentState();
    } catch (err) {
      panel.showError(`Unhandled error: ${err?.message ?? String(err)}`);
    } finally {
      streaming = null;
      currentAbort = null;
      panel.setStreaming(false);
      // Drain the queue: if the user typed more messages while we were
      // streaming, send the next one. Order preserved; the rest stay queued.
      if (pendingQueue.length) {
        const next = pendingQueue.shift();
        messages.push({ role: 'user', content: next });
        // Recurse (not loop) so each turn's microtasks drain fully. No await
        // here — the IIFE resolves, the UI is free, and the next turn
        // starts asynchronously.
        runOneTurn(next, s).catch((e) => panel.showError(String(e)));
      }
    }
  })();
}