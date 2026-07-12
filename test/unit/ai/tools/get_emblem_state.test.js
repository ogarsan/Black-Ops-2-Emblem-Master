import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockEditor } from '../../../helpers/mock_editor.js';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerGetEmblemState } from '../../../../docs/ai/tools/get_emblem_state.js';

describe('get_emblem_state', () => {
  beforeEach(() => {
    resetRegistry();
    registerGetEmblemState();
    mockEditor({
      stack: [
        { name: 'A', img: {}, canvas: {}, ctx: {}, x: 1, y: 1, rotate: 0, hue: 0, saturation: 0, brightness: 1, alpha: 1, scalex: 1, scaley: 1 },
        null,
      ],
      stacki: 0,
    });
  });

  it('returns layers_used and serialized layers', async () => {
    const out = await execTool('get_emblem_state', {}, { editor: window.editor });
    expect(out.ok).toBe(true);
    expect(out.result.layers_used).toBe(1);
    expect(out.result.layers[0]).toMatchObject({ position: 1, name: 'A' });
    expect(out.result.layers[0]).not.toHaveProperty('img');
  });
});

describe('get_emblem_state screenshot support', () => {
  beforeEach(() => {
    resetRegistry();
    registerGetEmblemState();
  });

  it('omits the screenshot field by default (backward-compatible)', async () => {
    const stack = [null, null];
    const editor = { stack, canvas: { toDataURL: vi.fn(() => 'data:image/png;base64,XXX') } };
    const out = await execTool('get_emblem_state', {}, { editor });
    expect(out.ok).toBe(true);
    expect(out.result.screenshot).toBeUndefined();
  });

  it('appends a PNG data URL when includeScreenshot is true', async () => {
    const stack = [null];
    const editor = { stack, canvas: { toDataURL: vi.fn(() => 'data:image/png;base64,FAKE') } };
    const out = await execTool('get_emblem_state', { includeScreenshot: true }, { editor });
    expect(out.ok).toBe(true);
    expect(out.result.screenshot).toBe('data:image/png;base64,FAKE');
    expect(editor.canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });
});