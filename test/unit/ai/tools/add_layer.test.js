import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerAddLayer } from '../../../../docs/ai/tools/add_layer.js';

const ICONS = { 'Letter A': { src: 'X' }, 'Skull': { src: 'Y' } };

const ctx = () => ({
  editor: { stack: new Array(32).fill(null), draw: vi.fn(), getusedlayers: vi.fn(), icons: ICONS },
  history: { snapshot: vi.fn() },
  currentState: vi.fn(() => ({ stack: [], stacki: 0, details: {} })),
  icons: ICONS,
  validEmblemNames: ['Letter A', 'Skull'],
});

describe('add_layer', () => {
  // add_layer.js self-registers on import; re-register after each resetRegistry.
  beforeEach(() => { resetRegistry(); registerAddLayer(); });

  it('rejects when name is not in the catalog', async () => {
    const out = await execTool('add_layer', { name: 'NotAReal', position: 1 }, ctx());
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/catalog/i);
  });

  it('rejects when position is out of range', async () => {
    const out = await execTool('add_layer', { name: 'Letter A', position: 99 }, ctx());
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/position/i);
  });

  it('rejects when position is already occupied', async () => {
    const c = ctx();
    c.editor.stack[0] = { name: 'Skull' };
    const out = await execTool('add_layer', { name: 'Letter A', position: 1 }, c);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/occupied/i);
  });

  it('happy path: inserts layer with defaults, calls editor hooks, snapshots history', async () => {
    const c = ctx();
    const out = await execTool('add_layer', { name: 'Letter A', position: 5 }, c);
    expect(out.ok).toBe(true);
    expect(c.editor.stack[4].name).toBe('Letter A');
    expect(c.editor.stack[4].x).toBe(150);
    expect(c.editor.stack[4].scalex).toBe(1.15);
    expect(c.editor.draw).toHaveBeenCalledOnce();
    expect(c.editor.getusedlayers).toHaveBeenCalledOnce();
    expect(c.history.snapshot).toHaveBeenCalledOnce();
  });

  it('honors user-provided optional fields', async () => {
    const c = ctx();
    const out = await execTool('add_layer', { name: 'Letter A', position: 1, x: 50, y: 75, hue: 0.5, rotate: 90 }, c);
    expect(out.ok).toBe(true);
    expect(c.editor.stack[0].x).toBe(50);
    expect(c.editor.stack[0].y).toBe(75);
    expect(c.editor.stack[0].hue).toBe(0.5);
    expect(c.editor.stack[0].rotate).toBe(90 % 360);
  });

  it('clamps scalex/scaley to [-5, 5]', async () => {
    const c = ctx();
    await execTool('add_layer', { name: 'Letter A', position: 1, scalex: 99 }, c);
    expect(c.editor.stack[0].scalex).toBeLessThanOrEqual(5);
  });

  it('returns {error} (soft fail) when icon is missing — model self-corrects', async () => {
    const c = ctx();
    c.icons = {}; // no icons loaded
    const out = await execTool('add_layer', { name: 'Letter A', position: 1 }, c);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/no image/i);
  });
});