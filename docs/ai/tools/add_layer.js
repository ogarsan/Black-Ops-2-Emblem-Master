// docs/ai/tools/add_layer.js
//
// Tool: add_layer
// Args (validated by Zod):
//   - name      string   (must be in VALID_EMBLEM_NAMES; checked at runtime)
//   - position  int 1..32 (1-indexed, mapped to stack[position - 1])
//   - x, y      int -300..300 (optional, default 150)
//   - rotate    number   (degrees; clamped to [0, 360); default 0)
//   - hue, saturation, brightness, alpha   0..1 (optional)
//   - scalex, scaley   number (clamped to [-5, 5]; default 1.15)
//
// Side effects: mutates ctx.editor.stack[position-1], calls editor.draw() +
// editor.getusedlayers() + window.updateimgs() + ctx.history.snapshot().
// Returns { inserted_at, name } on success; { error: '…' } on domain failure.

import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

const schema = z.object({
  name: z.string(),
  position: z.number().int().min(1).max(32),
  x: z.number().int().min(-300).max(300).optional(),
  y: z.number().int().min(-300).max(300).optional(),
  rotate: z.number().optional(),
  hue: z.number().min(0).max(1).optional(),
  saturation: z.number().min(0).max(1).optional(),
  brightness: z.number().min(0).max(1).optional(),
  alpha: z.number().min(0).max(1).optional(),
  scalex: z.number().optional(),
  scaley: z.number().optional(),
});

const DEFAULTS = {
  x: 150,
  y: 150,
  rotate: 0,
  hue: 0,
  saturation: 0,
  brightness: 1,
  alpha: 1,
  scalex: 1.15,
  scaley: 1.15,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function registerAddLayer() {
  registerTool({
    name: 'add_layer',
    definition: {
      description:
        'Adds a new layer at the given position. **Position 1 = bottom ' +
        '(background), position 32 = top (foreground); higher positions ' +
        'cover lower ones.** Default: use a higher position for layers ' +
        'that should sit on top (text labels, eyes, details). ' +
        'Use get_emblem_state first to find the next free position. ' +
        'Returns the inserted_at position and the name used.',
    },
    schema,
    handler: async (args, ctx) => {
      const catalog = ctx.validEmblemNames ?? [];
      if (catalog.length && !catalog.includes(args.name)) {
        return { error: `name '${args.name}' is not in the emblem catalog` };
      }
      const idx = args.position - 1;
      if (ctx.editor.stack[idx]) {
        return { error: `position ${args.position} is already occupied` };
      }
      const img = ctx.icons?.[args.name];
      if (!img) return { error: `no image asset loaded for '${args.name}' (catalog still loading?)` };

      // Destructure position/name out so they don't leak onto the layer object
      // as stray fields the renderer doesn't expect.
      const { position, name, ...overrides } = args;
      const layer = {
        name,
        img,
        canvas: document.createElement('canvas'),
        ctx: null,
        ...DEFAULTS,
        ...overrides,
      };
      layer.rotate = (((layer.rotate ?? 0) % 360) + 360) % 360;
      layer.scalex = clamp(layer.scalex, -5, 5);
      layer.scaley = clamp(layer.scaley, -5, 5);
      layer.canvas.width = 300;
      layer.canvas.height = 300;
      layer.ctx = layer.canvas.getContext('2d');

      ctx.editor.stack[idx] = layer;
      // Mirror upstream's editor.addstack. Order matters:
      //   1. createfilter sets #matrix-${stacki} (bottom strip color)
      //   2. generatestackcanvas re-paints stack[stacki].canvas with that
      //      filter (the MAIN canvas composites stack[i].canvas; without
      //      this re-paint, the main canvas stays white where colors are added).
      ctx.editor.stacki = idx;
      ctx.editor.createfilter?.(layer.hue, layer.saturation, layer.brightness, layer.alpha);
      ctx.editor.generatestackcanvas?.();
      ctx.editor.draw?.();
      ctx.editor.getusedlayers?.();
      window.updateimgs?.();
      // Mirror what upstream's icon.onclick does: refresh the per-layer preview
      // image so #layer-img-N shows the actual emblem, not img/empty.png.
      const previewImg = document.getElementById(`layer-img-${idx}`);
      if (previewImg && layer.img && layer.img.src) previewImg.src = layer.img.src;
      ctx.history?.snapshot(ctx.currentState?.());

      return { inserted_at: position, name };
    },
  });
}

// Self-register on import so `import './add_layer.js'` is enough for tests +
// the registry-auto-import side effect.
registerAddLayer();