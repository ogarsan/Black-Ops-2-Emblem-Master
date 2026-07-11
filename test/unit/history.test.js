import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHistory } from '../../docs/history.js';

const sampleLayer = (name = 'Letter A', x = 150) => ({
  name, x, y: 150, rotate: 0, hue: 0, saturation: 0, brightness: 1, alpha: 1, scalex: 1.15, scaley: 1.15,
});
const sampleState = (overrides = {}) => ({
  stack: [sampleLayer('Skull'), null, null, null, sampleLayer('Letter A')],
  stacki: 0,
  details: { playername: 'P', playerclantag: '[C]', playerbg: 'Hexed' },
  ...overrides,
});

describe('createHistory — basics', () => {
  it('returns an object with the documented methods', () => {
    const h = createHistory();
    expect(typeof h.snapshot).toBe('function');
    expect(typeof h.undo).toBe('function');
    expect(typeof h.redo).toBe('function');
    expect(typeof h.canUndo).toBe('function');
    expect(typeof h.canRedo).toBe('function');
    expect(typeof h.subscribe).toBe('function');
    expect(typeof h.loadFromStorage).toBe('function');
    expect(typeof h.clear).toBe('function');
    expect(typeof h.size).toBe('function');
  });

  it('starts empty: size 0, cannot undo/redo', () => {
    const h = createHistory();
    expect(h.size()).toBe(0);
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it('snapshot pushes state, size grows', () => {
    const h = createHistory();
    h.snapshot(sampleState());
    expect(h.size()).toBe(1);
    h.snapshot(sampleState({ stacki: 1 }));
    expect(h.size()).toBe(2);
  });

  it('snapshot drops redo future when called after an undo', () => {
    const h = createHistory();
    const s1 = sampleState();
    const s2 = sampleState({ stacki: 1 });
    const s3 = sampleState({ stacki: 2 });
    h.snapshot(s1);
    h.snapshot(s2);
    h.undo();
    expect(h.canRedo()).toBe(true);
    h.snapshot(s3);
    expect(h.canRedo()).toBe(false);
  });
});

describe('createHistory — persistence', () => {
  beforeEach(() => localStorage.clear());

  it('loadFromStorage restores past from localStorage', () => {
    const persisted = [{ stack: [], stacki: 0, details: { playername: 'x', playerclantag: '', playerbg: '' } }];
    localStorage.setItem('bo2_history_v1', JSON.stringify({ past: persisted, future: [], limit: 200 }));
    const h = createHistory();
    h.loadFromStorage();
    expect(h.size()).toBe(1);
    expect(h.canUndo()).toBe(true);
  });

  it('snapshot debounces writes to localStorage (~250 ms)', async () => {
    const h = createHistory();
    h.snapshot(sampleState());
    h.snapshot(sampleState({ stacki: 1 }));
    expect(localStorage.getItem('bo2_history_v1')).toBe(null); // not yet
    await new Promise((r) => setTimeout(r, 300));
    expect(localStorage.getItem('bo2_history_v1')).not.toBe(null);
  });

  it('clear empties in-memory stacks and localStorage', () => {
    const h = createHistory();
    h.snapshot(sampleState());
    h.clear();
    expect(h.size()).toBe(0);
    // clear() calls removeItem, so the key is gone (not an empty-arrays JSON string).
    expect(localStorage.getItem('bo2_history_v1')).toBe(null);
  });

  it('handles corrupt localStorage by resetting silently', () => {
    localStorage.setItem('bo2_history_v1', '{not json');
    const h = createHistory();
    expect(() => h.loadFromStorage()).not.toThrow();
    expect(h.size()).toBe(0);
  });

  it('recovers from a quota error by trimming the oldest 100 snapshots and retrying', () => {
    const h = createHistory({ limit: 500 });
    for (let i = 0; i < 150; i++) h.snapshot(sampleState({ stacki: i }));
    // First persist attempt throws QuotaExceededError; the retry after trimming succeeds.
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
    });
    h.flush();
    expect(spy).toHaveBeenCalledTimes(2); // throwing attempt + successful retry
    expect(h.size()).toBe(50);            // 150 - 100 trimmed
    spy.mockRestore();
  });

  it('flushes pending writes on demand (synchronous)', async () => {
    const h = createHistory();
    h.snapshot(sampleState());
    h.flush();
    expect(localStorage.getItem('bo2_history_v1')).not.toBe(null);
  });
});