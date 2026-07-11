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

  it('returns the actual pixel coordinate system (origin at upper-left, range 0..300)', async () => {
    globalThis.window.editor = { canvas: { width: 300, height: 300 } };
    const out = await execTool('get_canvas_info', {}, { editor: window.editor });
    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({
      width_px: 300,
      height_px: 300,
      origin: 'top-left',
      x_range_px: [0, 300],
      y_range_px: [0, 300],
      center: { x: 150, y: 150 },
    });
    expect(out.result.scale).toMatchObject({ fills_half_canvas: 1.0, fills_canvas: 2.0 });
    expect(out.result.fields.x).toMatch(/LEFT edge/);
    expect(out.result.fields.y).toMatch(/TOP edge/);
  });

  it('falls back to 300×300 when no editor in ctx (e.g. first call before layers exist)', async () => {
    const out = await execTool('get_canvas_info', {}, { editor: undefined });
    expect(out.ok).toBe(true);
    expect(out.result.width_px).toBe(300);
    expect(out.result.height_px).toBe(300);
  });
});
