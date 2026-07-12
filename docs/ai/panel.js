// docs/ai/panel.js
//
// Chat panel DOM mount. Renders the chat header (settings/new chat/undo counter),
// scrolling messages list, textarea input, and an inline settings form.
//
// Security: every helper that takes user/LLM-supplied text uses textContent
// (never innerHTML), so untrusted content can't inject markup. The header
// buttons set textContent for hardcoded emoji labels.

import { loadSettings, saveSettings, clearKey } from './settings.js';

const ICONS = {
  settings: '⚙',
  newchat: '🧹',
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  // textContent for user-provided strings; innerHTML reserved for hardcoded
  // markup only (see ICONS above).
  if (text != null) e.textContent = text;
  return e;
}

export function mountPanel(root, { settings, conversation }) {
  root.innerHTML = '';
  const header = el('div', 'bo2-ai-header');
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'bo2-ai-settings-btn';
  settingsBtn.textContent = `${ICONS.settings} Settings`;
  const newChatBtn = document.createElement('button');
  newChatBtn.className = 'bo2-ai-newchat-btn';
  newChatBtn.textContent = `${ICONS.newchat} New chat`;
  header.append(settingsBtn, newChatBtn, el('span', 'bo2-undo-counter', '↶ 0 / ↷ 0'));
  const messages = el('div', 'bo2-ai-messages');
  const inputRow = el('div', 'bo2-ai-inputrow');
  const input = el('textarea', 'bo2-ai-input');
  input.rows = 2;
  input.placeholder = 'Type a message...';
  inputRow.appendChild(input);
  root.append(header, messages, inputRow);

  // ---- Inline settings view (toggled by the ⚙ button) ----
  const settingsForm = el('div', 'bo2-ai-settings');
  settingsForm.setAttribute('data-open', 'false');
  const cur = loadSettings();
  const providerSel = document.createElement('select');
  providerSel.className = 'bo2-set-provider';
  for (const p of ['openai', 'groq', 'gemini', 'anthropic', 'openai_compat']) {
    const o = document.createElement('option');
    o.value = p;
    o.textContent = p;
    if (p === cur.provider) o.selected = true;
    providerSel.appendChild(o);
  }
  const modelInput = document.createElement('input');
  modelInput.className = 'bo2-set-model';
  modelInput.type = 'text';
  modelInput.placeholder = 'model';
  modelInput.value = cur.model || '';
  const baseUrlInput = document.createElement('input');
  baseUrlInput.className = 'bo2-set-baseurl';
  baseUrlInput.type = 'text';
  baseUrlInput.placeholder = 'base URL (openai_compat only)';
  baseUrlInput.value = cur.baseUrl || '';
  const keyInput = document.createElement('input');
  keyInput.className = 'bo2-set-key';
  keyInput.type = 'password';
  keyInput.placeholder = 'API key';
  keyInput.value = cur.apiKey || '';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'bo2-set-save';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'bo2-set-clear';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear key';
  settingsForm.append(
    labeled('Provider', providerSel),
    labeled('Model', modelInput),
    labeled('Base URL', baseUrlInput),
    labeled('API key', keyInput),
    saveBtn,
    clearBtn,
  );
  root.append(settingsForm);

  function labeled(text, control) {
    const row = el('label', 'bo2-set-row');
    row.append(el('span', 'bo2-set-label', text), control);
    return row;
  }

  saveBtn.addEventListener('click', () => {
    saveSettings({
      provider: providerSel.value,
      model: modelInput.value.trim(),
      baseUrl: baseUrlInput.value.trim(),
      apiKey: keyInput.value,
    });
    settingsForm.setAttribute('data-open', 'false');
  });
  clearBtn.addEventListener('click', () => { clearKey(); keyInput.value = ''; });

  let sendHandler = () => {};
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendHandler(text);
    }
  });
  settingsBtn.addEventListener('click', () => {
    const openNow = settingsForm.getAttribute('data-open') !== 'true';
    settingsForm.setAttribute('data-open', String(openNow));
  });
  newChatBtn.addEventListener('click', () => root.dispatchEvent(new CustomEvent('bo2:newchat')));

  // Restore prior messages.
  for (const msg of conversation) {
    if (msg.role === 'user') appendUser(msg.content);
    else if (msg.role === 'assistant') {
      const u = appendAssistant();
      u(msg.content || '');
      for (const tc of msg.tool_calls || []) appendToolCall(tc);
    }
  }

  function appendUser(text) {
    const bubble = el('div', 'bo2-msg bo2-msg-user', text);
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function appendAssistant() {
    const bubble = el('div', 'bo2-msg bo2-msg-assistant', '');
    messages.appendChild(bubble);
    let text = '';
    return (delta) => {
      text += delta;
      bubble.textContent = text; // textContent: LLM content rendered as text, not HTML
      messages.scrollTop = messages.scrollHeight;
    };
  }

  const toolChipsById = new Map();
  function appendToolCall({ id, name, args }) {
    // Truncate args JSON so the chip stays narrow.
    const chipText = `[tool] ${name} ${JSON.stringify(args).slice(0, 60)}…`;
    const chip = el('div', 'bo2-tool-chip', chipText);
    chip.dataset.id = id;
    toolChipsById.set(id, chip);
    messages.appendChild(chip);
    messages.scrollTop = messages.scrollHeight;
    return chip;
  }

  function markToolCallError(id, errMsg) {
    const chip = toolChipsById.get(id);
    if (!chip) return;
    chip.classList.add('bo2-tool-error');
    chip.title = errMsg;
  }

  function setStreaming(on) {
    let indicator = root.querySelector('.bo2-streaming');
    if (on) {
      if (!indicator) {
        indicator = el('div', 'bo2-streaming', '▌ applying…');
        messages.appendChild(indicator);
      }
    } else if (indicator) {
      indicator.remove();
    }
  }

  function showError(msg) {
    let banner = root.querySelector('.bo2-error-banner');
    if (!banner) {
      banner = el('div', 'bo2-error-banner', msg);
      messages.prepend(banner);
    } else {
      banner.textContent = msg;
    }
  }

  // Non-fatal status banner (e.g. "Rate limited, retrying in 4s…"). Same shape
  // as the error banner but visually distinct so the user knows we're still
  // working, not failing.
  function showInfo(msg) {
    let banner = root.querySelector('.bo2-info-banner');
    if (!banner) {
      banner = el('div', 'bo2-info-banner', msg);
      messages.prepend(banner);
    } else {
      banner.textContent = msg;
    }
  }

  function updateCounter({ canUndo, canRedo }) {
    const c = root.querySelector('.bo2-undo-counter');
    if (c) c.textContent = `↶ ${canUndo ? '1+' : '0'} / ↷ ${canRedo ? '1+' : '0'}`;
  }

  return {
    appendUser,
    appendAssistant,
    appendToolCall,
    markToolCallError,
    setStreaming,
    showError,
    showInfo,
    updateCounter,
    focusInput: () => input.focus(),
    getInputValue: () => input.value,
    clearInput: () => { input.value = ''; },
    onSend: (fn) => { sendHandler = fn; },
  };
}