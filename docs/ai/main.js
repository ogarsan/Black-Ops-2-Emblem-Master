// docs/ai/main.js
//
// AI tab entrypoint. Loaded as a module AFTER hooks.js so that
// `window.__bo2History` and `window.__bo2ApplyState` are available.
//
// Side effects on import:
//   - Reads settings + persisted conversation from localStorage
//   - Mounts the chat panel inside the existing #ai container
//   - Patches window.editor.changetab so 'ai' is a valid picker category
//   - Wires the send button → OpenAI adapter → execTool → history snapshot
//
// End-to-end flow on send:
//   1. Append user bubble + push {role:'user'} into local `messages`
//   2. Append assistant bubble (streaming updater)
//   3. Stream OpenAI Chat Completions; for each event:
//        - 'text'         → forward to assistant updater
//        - 'tool_call'    → show chip, execTool (mutates editor.stack + history),
//                           push tool result with role:'tool'
//        - 'error'        → show error banner
//   4. After stream: append assistant message + tool results, persist conversation
//   5. Panel streaming indicator off

import { mountPanel } from './panel.js';
import { loadSettings, saveSettings } from './settings.js';
import { loadConversation, saveConversation, truncateForRequest, clearConversation } from './conversation.js';
import { OpenAiAdapter } from './adapters/openai.js';
import { execTool, getToolDefinitions } from './tools/exec.js';
import './tools/index.js'; // side-effect: registers all tools on import
import { buildSystemPrompt } from './system_prompt.js';
import { currentState } from '../store.js';

const EMBLEM_CATALOG = (typeof globalThis.emblemdata === 'object' && globalThis.emblemdata) || {
  type: [], tools: [], ranks: [], gear: [], emblems: [],
};

const aiTab = document.getElementById('ai');
if (aiTab) {
  const initialSettings = loadSettings();
  const initialConversation = loadConversation();
  const panel = mountPanel(aiTab, { settings: initialSettings, conversation: initialConversation });

  let messages = initialConversation.slice();
  let streaming = null;

  // Settings / New chat hooks: re-read or wipe state, then re-render.
  aiTab.addEventListener('bo2:settings', () => {
    const s = loadSettings();
    panel.showError(
      `Settings: provider=${s.provider || 'openai'} model=${s.model || '(default)'} key=${s.apiKey ? '…' + s.apiKey.slice(-4) : '(unset)'}`
    );
  });
  aiTab.addEventListener('bo2:newchat', () => {
    if (streaming) return;
    clearConversation();
    messages = [];
    // Wipe messages DOM
    const list = aiTab.querySelector('.bo2-ai-messages');
    if (list) list.innerHTML = '';
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
    const systemPrompt = buildSystemPrompt();
    const adapter = new OpenAiAdapter();
    const ctx = {
      editor: window.editor,
      history: window.__bo2History,
      icons: window.editor?.icons,
      currentState,
      validEmblemNames: Object.values(EMBLEM_CATALOG).flat(),
    };

    const textParts = [];
    // OpenAI-shaped tool_calls attached to the assistant message; tool results
    // follow as separate role:'tool' messages in the SAME order.
    const toolCalls = [];
    const toolResults = [];

    streaming = (async () => {
      try {
        panel.setStreaming(true);
        for await (const ev of adapter.streamChat({
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
            toolCalls.push({
              id: ev.id,
              type: 'function',
              function: { name: ev.name, arguments: JSON.stringify(ev.args) },
            });
            const result = await execTool(ev.name, ev.args, ctx);
            if (!result.ok) panel.markToolCallError(ev.id, result.error);
            toolResults.push({
              role: 'tool',
              tool_call_id: ev.id,
              content: JSON.stringify(result),
            });
          } else if (ev.type === 'error') {
            panel.showError(`Provider error: ${ev.error?.message ?? 'unknown'}`);
          }
          // 'done' is informational; we finalize below.
        }

        // Persist the assistant message + tool results in the order the
        // provider expects (assistant with tool_calls, then role:'tool' for
        // each). textParts.join('') is the final text the user saw.
        const assistantMsg = { role: 'assistant', content: textParts.join('') };
        if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
        messages.push(assistantMsg, ...toolResults);
        saveConversation(messages);
        // Avoid unused-var warnings on `saveSettings` (it's exposed for future UI).
        void saveSettings;
      } catch (err) {
        panel.showError(`Unhandled error: ${err?.message ?? String(err)}`);
      } finally {
        streaming = null;
        panel.setStreaming(false);
      }
    })();
  });
}

// Patch editor.changetab to recognise 'ai'. Upstream never knew about us so we
// re-use its hide/show infra by pretending to switch to 'emblems' then
// overriding to show our container.
{
  const origChangetab = window.editor?.changetab;
  if (typeof origChangetab === 'function') {
    window.editor.changetab = function (cat) {
      if (cat === 'ai') {
        origChangetab.call(this, 'emblems');
        document.getElementById('tab-emblems')?.classList.remove('selected');
        document.getElementById('tab-emblems')?.classList.add('deselected');
        document.getElementById('emblems').style.display = 'none';
        document.getElementById('tab-ai')?.classList.add('selected');
        document.getElementById('tab-ai')?.classList.remove('deselected');
        document.getElementById('ai').style.display = '';
      } else {
        document.getElementById('tab-ai')?.classList.remove('selected');
        document.getElementById('tab-ai')?.classList.add('deselected');
        document.getElementById('ai').style.display = 'none';
        origChangetab.call(this, cat);
      }
    };
  }
}