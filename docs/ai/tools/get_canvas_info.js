// docs/ai/tools/get_canvas_info.js
//
// Tool: get_canvas_info
// Args: none.
// Returns: canvas dimensions and the layer coordinate semantics. The model
// has no other reliable source for the actual pixel-coordinate system;
// without it the model tends to place layers at (0, 0) (upper-left) or
// invent a centered system that doesn't match the renderer.
//
// Important — the actual coordinate system (verified against editor.js
// alterstackcanvas):
//   c.ctx.setTransform(1, 0, 0, 1, c.x, c.y) — translates by (c.x, c.y) in
//   CANVAS PIXELS. c.img is drawn centered at that point, so:
//     - (c.x, c.y) = (0, 0)          → image center at canvas UPPER-LEFT
//     - (c.x, c.y) = (150, 150)        → image center at canvas CENTER (default)
//     - (c.x, c.y) = (300, 300)        → image center at canvas LOWER-RIGHT
//   - positive x = right, positive y = DOWN (screen coords)
//   - the canvas is 300×300 px; positions outside [0..300] draw partially /
//     fully off-canvas (useful for clipping effects, but the model should
//     start inside and only push out when an artistic clipping is wanted)
//   - scale is a multiplier on the emblem image (the source image is
//     256×256 px, drawn centered). scale 1.0 ≈ emblem fills ~half-canvas;
//     scale 2.0 ≈ fills the canvas.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

export function registerGetCanvasInfo() {
  registerTool({
    name: 'get_canvas_info',
    description:
      'Returns the canvas dimensions and the layer coordinate semantics. ' +
      'Call this before adding or scaling layers so you pick positions and ' +
      'sizes that actually fit on the emblem. CRITICAL: the canvas origin ' +
      '(0, 0) is the UPPER-LEFT, not the center. (150, 150) is the center. ' +
      'x/y are integer pixels in [0..300].',
    schema: z.object({}),
    handler: async (_args, ctx) => {
      const ed = ctx?.editor;
      const canvas = ed?.canvas ?? (typeof document !== 'undefined' ? document.getElementById('canvas') : null);
      const width = canvas?.width ?? 300;
      const height = canvas?.height ?? 300;
      return {
        // Canvas pixel dimensions.
        width_px: width,
        height_px: height,
        // Coordinate system. The origin (0, 0) is the UPPER-LEFT corner of
        // the canvas; (width, height) is the LOWER-RIGHT.
        origin: 'top-left',
        x_range_px: [0, width],
        y_range_px: [0, height],
        // Pre-computed "centered" coords so the model doesn't have to
        // remember 150 by heart.
        center: { x: Math.round(width / 2), y: Math.round(height / 2) },
        // Scale semantics.
        scale: { default: 1.15, fills_half_canvas: 1.0, fills_canvas: 2.0, hard_limit: 5.0 },
        // Field semantics, exactly.
        fields: {
          x: 'integer pixels, distance from the LEFT edge of the canvas (positive = right)',
          y: 'integer pixels, distance from the TOP edge of the canvas (positive = down — screen-style)',
          rotate: 'degrees, 0..360; rotates the layer around its center',
          scalex_scaley: 'float multiplier on the emblem image size; 1.0 = default, clamp [-5, 5]',
          hue: 'float 0..1, color wheel position',
          saturation: 'float 0..1',
          brightness: 'float 0..1',
          alpha: 'float 0..1',
        },
        // Position index semantics.
        position: '1-indexed; 1 is the bottom layer (rendered first), 32 is the topmost',
      };
    },
  });
}

registerGetCanvasInfo();