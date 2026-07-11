// docs/ai/conversation.js
//
// Persists chat history (user/assistant/tool messages) in localStorage and
// truncates the request window sent to the LLM to `maxTurns * 2` messages.

const KEY = 'bo2_chat_history_v1';

export function loadConversation() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversation(messages) {
  localStorage.setItem(KEY, JSON.stringify(messages));
}

export function clearConversation() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function truncateForRequest(messages, { maxTurns = 20 } = {}) {
  const maxMessages = maxTurns * 2;
  if (messages.length <= maxMessages) return messages.slice();
  return messages.slice(messages.length - maxMessages);
}