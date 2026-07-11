import { describe, it, expect } from 'vitest';
import { beforeSend } from '../../../docs/ai/context_note.js';

const snap = (layers) => ({
  stack: layers.map((n) => (n ? { name: n } : null)),
  stacki: 0,
  details: {},
});

describe('beforeSend', () => {
  it('returns null when snapshots match', () => {
    expect(beforeSend({ lastAiTurnSnapshot: snap(['A']), currentSnapshot: snap(['A']) })).toBe(null);
  });

  it('returns null when there is no lastAiTurnSnapshot (first turn)', () => {
    expect(beforeSend({ lastAiTurnSnapshot: null, currentSnapshot: snap(['A']) })).toBe(null);
  });

  it('notes layer removal', () => {
    const note = beforeSend({ lastAiTurnSnapshot: snap(['A', 'B']), currentSnapshot: snap(['A']) });
    expect(note).toMatch(/Layer 2 'B' was removed/i);
  });

  it('notes attribute change', () => {
    const a = snap(['A']);
    a.stack[0].x = 100;
    const b = snap(['A']);
    b.stack[0].x = 200;
    const note = beforeSend({ lastAiTurnSnapshot: a, currentSnapshot: b });
    expect(note).toMatch(/Layer 1 'A' x changed from 100 → 200/);
  });
});