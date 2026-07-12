// docs/ai/tools/get_layer.js
//
// Tool: get_layer
// Args:
//   - position  int 1..32
// Returns: the current state of one layer (name, x, y, rotate, hue,
// saturation, brightness, alpha, scalex, scaley). Lighter than
// get_emblem_state when you only need a single layer's data — useful
// before calling update_layer on a layer you haven't touched recently,
// so you can patch just the fields you want without overwriting others.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

// Mirrors store.js KEPT_FIELDS — the serializable subset of a layer.
// Kept in sync by hand; if store.js grows fields, update here too.
const KEPT_FIELDS = [
  'name', 'x', 'y',
  'rotate', 'hue', 'saturation', 'brightness', 'alpha',
  'scalex', 'scaley',
];

function stripLayer(layer) {
  const out = {};
  for (const k of KEPT_FIELDS) out[k] = layer[k];
  return out;
}

export function registerGetLayer() {
  registerTool({
    name: 'get_layer',
    definition: {
      description:
        'Returns the full state of one layer at the given 1-indexed ' +
        'position (name, x, y, rotate, hue, saturation, brightness, ' +
        'alpha, scalex, scaley). Lighter than get_emblem_state when ' +
        'you only need one layer. Use before update_layer to inspect ' +
        'current values before patching.',
    },
    schema: z.object({
      position: z.number().int().min(1).max(32),
    }),
    handler: async ({ position }, ctx) => {
      const idx = position - 1;
      const layer = ctx.editor?.stack?.[idx];
      if (!layer) return { error: `position ${position} is empty` };
      return { position, ...stripLayer(layer) };
    },
  });
}

registerGetLayer();
