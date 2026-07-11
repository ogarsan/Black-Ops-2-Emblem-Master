import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountDrawer } from '../../../docs/ai/drawer.js';

describe('mountDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('appends a drawer with an AI handle and a mounted panel input', () => {
    mountDrawer({ settings: { provider: 'openai', apiKey: '', model: 'gpt-4o-mini' }, conversation: [] });
    const drawer = document.querySelector('.bo2-ai-drawer');
    expect(drawer).not.toBe(null);
    expect(drawer.querySelector('.bo2-ai-handle').textContent).toBe('AI');
    expect(drawer.querySelector('.bo2-ai-input')).not.toBe(null);
  });

  it('starts closed and toggles open via the handle', () => {
    const d = mountDrawer({ settings: {}, conversation: [] });
    expect(d.root.getAttribute('data-open')).toBe('false');
    d.root.querySelector('.bo2-ai-handle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(d.root.getAttribute('data-open')).toBe('true');
  });

  it('swallows keyboard events so they never reach document (editor shortcuts)', () => {
    const d = mountDrawer({ settings: {}, conversation: [] });
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    const input = d.root.querySelector('.bo2-ai-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(spy).not.toHaveBeenCalled(); // stopped at the drawer boundary
    document.removeEventListener('keydown', spy);
  });

  it('does NOT swallow keyboard events fired outside the drawer', () => {
    mountDrawer({ settings: {}, conversation: [] });
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect(spy).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', spy);
  });

  it('dispatches bo2:abort on the root when Escape is pressed in the drawer', () => {
    const d = mountDrawer({ settings: {}, conversation: [] });
    const spy = vi.fn();
    d.root.addEventListener('bo2:abort', spy);
    d.root.querySelector('.bo2-ai-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});