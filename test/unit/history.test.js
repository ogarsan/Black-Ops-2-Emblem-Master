import { describe, it, expect } from 'vitest';
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