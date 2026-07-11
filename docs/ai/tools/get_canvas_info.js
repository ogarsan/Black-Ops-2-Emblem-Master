// docs/ai/tools/get_canvas_info.js
//
// Tool: get_canvas_info
// Args: none.
// Returns: the dimensions and visible-coordinate range of the emblem canvas.
// The model has no other way to know the canvas size — without it the model
// guesses scale and stacks everything huge or off-canvas.
//
// Coordinate model (BO2 emblem editor):
//   - canvas: 300x300 px
//   - the editor's render-to-canvas transform scales the layer coordinate
//     system to roughly (-1, +1) → canvas (-150, +150) px, so x/y ∈ [-1, +1]
//     already covers most of the visible area
//   - scale is a multiplier on the base emblem size (1.0 = default; max ±5)
//   - rotate is in degrees, 0..360
//
// The model should treat this as authoritative and stop guessing scale.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

export function registerGetCanvasInfo() {
  registerTool({
    name: 'get_canvas_info',
    definition: {
      description:
        'Returns the canvas dimensions and the visible coordinate range. ' +
        'Call this before adding or scaling layers so you pick sizes that ' +
        'actually fit on the emblem (the canvas is 300x300 px; x/y range ' +
        'roughly -2 to +2 covers the whole visible area; scale is a ' +
        'multiplier where 1.0 is the default emblem size).',
    },
    schema: z.object({}),
    handler: async (_args, ctx) => {
      const ed = ctx?.editor;
      const canvas = ed?.canvas ?? (typeof document !== 'undefined' ? document.getElementById('canvas') : null);
      const width = canvas?.width ?? 300;
      const height = canvas?.height ?? 300;
      // The editor's render path maps stack coordinates to canvas pixels.
      // Empirically, x/y in [-2, +2] spans the full visible emblem; values
      // outside that range are off-canvas. Scale 1.0 ≈ half the canvas size;
      // scale 2.0 ≈ fills the canvas.
      return {
        width_px: width,
        height_px: height,
        // Approximate coordinate range the model can use without going off-canvas.
        // Centered at (0, 0); y grows downward like screen coords.
        coord_range: { x: [-2, 2], y: [-2, 2] },
        // Scale semantics.
        scale: { default: 1.0, typical_max: 2.0, hard_limit: 5.0 },
        // Reminder of layer field semantics.
        fields: {
          x: 'integer, center horizontal position',
          y: 'integer, center vertical position (positive = down)',
          rotate: 'degrees, 0..360',
          scalex_scaley: 'float, multiplier on emblem size (1.0 = default)',
          hue: 'float 0..1',
          saturation: 'float 0..1',
          brightness: 'float 0..1',
          alpha: 'float 0..1',
        },
      };
    },
  });
}

registerGetCanvasInfo();