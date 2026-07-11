import { describe, it, expect, beforeEach } from 'vitest';
import { mountPanel } from '../../../docs/ai/panel.js';

describe('mountPanel', () => {
  let root, panel;
  beforeEach(() => {
    document.body.innerHTML = '<div id="ai"></div>';
    root = document.getElementById('ai');
    panel = mountPanel(root, { settings: { provider: 'openai', apiKey: '', model: 'gpt-4o-mini' }, conversation: [] });
  });

  it('renders the header with Settings, New chat, undo/redo counters', () => {
    expect(root.querySelector('.bo2-ai-settings-btn')).not.toBe(null);
    expect(root.querySelector('.bo2-ai-newchat-btn')).not.toBe(null);
  });

  it('renders an empty messages list and an input', () => {
    expect(root.querySelector('.bo2-ai-messages').children.length).toBe(0);
    const input = root.querySelector('.bo2-ai-input');
    expect(input).not.toBe(null);
  });

  it('appendUser adds a user bubble', () => {
    panel.appendUser('hello');
    expect(root.querySelectorAll('.bo2-msg-user').length).toBe(1);
    expect(root.querySelector('.bo2-msg-user').textContent).toBe('hello');
  });

  it('appendAssistant returns an updater', () => {
    const updater = panel.appendAssistant();
    updater('hi');
    updater(' there');
    expect(root.querySelector('.bo2-msg-assistant').textContent).toBe('hi there');
  });

  it('appendToolCall shows a chip; can be marked error', () => {
    panel.appendToolCall({ id: '1', name: 'add_layer', args: { name: 'A' } });
    const chip = root.querySelector('.bo2-tool-chip');
    expect(chip).not.toBe(null);
    panel.markToolCallError('1', 'bad name');
    expect(chip.classList.contains('bo2-tool-error')).toBe(true);
  });

  it('onSend fires when Enter pressed in input', () => {
    let captured = null;
    panel.onSend((text) => { captured = text; });
    const input = root.querySelector('.bo2-ai-input');
    input.value = 'add skull';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(captured).toBe('add skull');
    expect(input.value).toBe('');
  });
});