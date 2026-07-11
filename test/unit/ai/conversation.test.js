import { describe, it, expect, beforeEach } from 'vitest';
import { loadConversation, saveConversation, truncateForRequest, clearConversation } from '../../../docs/ai/conversation.js';

describe('conversation', () => {
  beforeEach(() => localStorage.clear());

  it('loadConversation returns [] when empty', () => {
    expect(loadConversation()).toEqual([]);
  });

  it('saveConversation + loadConversation round-trips', () => {
    const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];
    saveConversation(msgs);
    expect(loadConversation()).toEqual(msgs);
  });

  it('truncateForRequest keeps last N turns', () => {
    const msgs = [];
    for (let i = 0; i < 50; i++) {
      msgs.push({ role: i % 2 ? 'assistant' : 'user', content: String(i) });
    }
    const out = truncateForRequest(msgs, { maxTurns: 20 });
    expect(out.length).toBe(40);
    expect(out[0].content).toBe('10');
  });

  it('clearConversation empties storage', () => {
    saveConversation([{ role: 'user', content: 'x' }]);
    clearConversation();
    expect(loadConversation()).toEqual([]);
  });

  it('recovers from corrupt JSON', () => {
    localStorage.setItem('bo2_chat_history_v1', '{not json');
    expect(loadConversation()).toEqual([]);
  });
});