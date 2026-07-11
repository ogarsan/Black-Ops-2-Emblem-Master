import { describe, it, expect, beforeEach } from 'vitest';
import { serializeStack, currentState } from '../../docs/store.js';
import { mockEditor } from '../helpers/mock_editor.js';

const layer = (name, extras = {}) => ({
  name, img: { src: 'emblems/X.png' }, canvas: {}, ctx: {},
  x: 150, y: 150, rotate: 0, hue: 0, saturation: 0, brightness: 1, alpha: 1, scalex: 1.15, scaley: 1.15,
  ...extras,
});

describe('serializeStack', () => {
  it('returns layers_used count of non-null layers', () => {
    const stack = [layer('A'), null, layer('B'), null, null];
    const out = serializeStack(stack);
    expect(out.layers_used).toBe(2);
  });

  it('strips img, canvas, ctx from each layer', () => {
    const out = serializeStack([layer('A')]);
    expect(out.layers[0]).not.toHaveProperty('img');
    expect(out.layers[0]).not.toHaveProperty('canvas');
    expect(out.layers[0]).not.toHaveProperty('ctx');
    expect(out.layers[0]).toHaveProperty('name', 'A');
  });

  it('numbers positions 1-indexed and only for non-null layers', () => {
    const stack = [null, layer('A'), null, layer('B')];
    const out = serializeStack(stack);
    expect(out.layers.map((l) => l.position)).toEqual([1, 2]);
  });

  it('omits empty layers entirely', () => {
    const out = serializeStack([null, null, layer('A')]);
    expect(out.layers.length).toBe(1);
    expect(out.layers[0].position).toBe(1);
  });
});

describe('currentState', () => {
  beforeEach(() => mockEditor());

  it('reads stack, stacki, details from window globals', () => {
    mockEditor({ stack: [layer('A')], stacki: 0 });
    const s = currentState();
    expect(s.stack.length).toBe(1);
    expect(s.stacki).toBe(0);
    expect(s.details.playername).toBe('P');
  });
});