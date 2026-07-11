import { describe, it, expect, beforeEach } from 'vitest';
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