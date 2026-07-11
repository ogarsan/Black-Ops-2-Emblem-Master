// docs/ai/tools/update_layer.js
//
// Tool: update_layer — partial patch on an existing layer.
// Schema mirrors add_layer's optional fields. Only provided keys overwrite
// the live layer; everything else is preserved. `rotate` is normalised to
// [0, 360).
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

const schema = z.object({
  position: z.number().int().min(1).max(32),
  x: z.number().int().min(-300).max(300).optional(),
  y: z.number().int().min(-300).max(300).optional(),
  rotate: z.number().optional(),
  hue: z.number().min(0).max(1).optional(),
  saturation: z.number().min(0).max(1).optional(),
  brightness: z.number().min(0).max(1).optional(),
  alpha: z.number().min(0).max(1).optional(),
  scalex: z.number().min(-5).max(5).optional(),
  scaley: z.number().min(-5).max(5).optional(),
});

export function registerUpdateLayer() {
  registerTool({
    name: 'update_layer',
    definition: { description: 'Updates one or more attributes of an existing layer at the given 1-indexed position. Only the fields you send are changed.' },
    schema,
    handler: async (args, ctx) => {
      const idx = args.position - 1;
      const cur = ctx.editor.stack[idx];
      if (!cur) return { error: `position ${args.position} is empty` };
      const { position, ...patch } = args;
      if ('rotate' in patch) patch.rotate = ((patch.rotate % 360) + 360) % 360;
      Object.assign(cur, patch);
      // Repaint the layer's own canvas + update its SVG color filter so the
      // main canvas and bottom-strip preview reflect the new properties.
      ctx.editor.stacki = idx;
      ctx.editor.generatestackcanvas?.();
      ctx.editor.createfilter?.(cur.hue, cur.saturation, cur.brightness, cur.alpha);
      ctx.editor.draw?.();
      ctx.editor.getusedlayers?.();
      window.updateimgs?.();
      ctx.history?.snapshot?.(ctx.currentState?.());
      return { updated: position, fields: Object.keys(patch) };
    },
  });
}

registerUpdateLayer();