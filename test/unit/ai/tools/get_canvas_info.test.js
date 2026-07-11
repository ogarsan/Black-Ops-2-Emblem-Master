// test/unit/ai/tools/get_canvas_info.test.js
//
// Unit tests for docs/ai/tools/get_canvas_info.js — the tool that lets the
// AI know the canvas dimensions + visible coord range, so it stops guessing
// scale and stacking everything huge or off-canvas.

import { describe, it, expect, beforeEach } from 'vitest';
import { execTool, resetRegistry } from '../../../../docs/ai/tools/exec.js';
import { registerGetCanvasInfo } from '../../../../docs/ai/tools/get_canvas_info.js';

describe('get_canvas_info', () => {
  beforeEach(() => {
    resetRegistry();
    registerGetCanvasInfo();
  });

  it('returns dimensions, coord range, and scale semantics from a real-ish editor', async () => {
    globalThis.window.editor = { canvas: { width: 300, height: 300 } };
    const out = await execTool('get_canvas_info', {}, { editor: window.editor });
    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({
      width_px: 300,
      height_px: 300,
      coord_range: { x: [-2, 2], y: [-2, 2] },
    });
    expect(out.result.scale).toMatchObject({ default: 1.0 });
    expect(out.result.fields.x).toMatch(/integer/);
  });

  it('falls back to 300×300 when no editor in ctx (e.g. first call before layers exist)', async () => {
    const out = await execTool('get_canvas_info', {}, { editor: undefined });
    expect(out.ok).toBe(true);
    expect(out.result.width_px).toBe(300);
    expect(out.result.height_px).toBe(300);
  });
});
