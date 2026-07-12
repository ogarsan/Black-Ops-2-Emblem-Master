// docs/ai/tools/get_emblem_state.js
//
// Tool: get_emblem_state
// Args: { includeScreenshot?: boolean } — opt-in. When true, the result
//   includes a `screenshot` field (`data:image/png;base64,...`) so the model
//   can SEE the rendered result, not just the data.
// Returns: the current stack serialised by `store.serializeStack` —
//   { layers: [{ position, name, x, y, rotate, hue, ... }], layers_used,
//     screenshot?: 'data:image/png;base64,...' }.
//
// The model calls this on the first turn of a session and after any tool call
// to learn what changed.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';
import { serializeStack } from '../../store.js';

export function registerGetEmblemState() {
  registerTool({
    name: 'get_emblem_state',
    definition: {
      description: 'Returns the current emblem state as a serialised snapshot (positions 1-indexed, layers with name/x/y/rotate/hue/saturation/brightness/alpha/scalex/scaley). Pass `includeScreenshot: true` to also receive a PNG of the current canvas so the model can SEE the rendered result, not just the data — useful before reporting done.',
    },
    schema: z.object({
      // Opt-in: when true, the result includes a `screenshot` field with
      // `data:image/png;base64,...`. Default false (backward-compatible).
      includeScreenshot: z.boolean().optional(),
    }),
    handler: async (args, ctx) => {
      const result = serializeStack(ctx.editor.stack);
      if (args && args.includeScreenshot) {
        // Best-effort: a tainted canvas (cross-origin image used) makes
        // toDataURL throw. Return the structured data only — the model can
        // retry or proceed without the image.
        try {
          const canvas = ctx.editor?.canvas;
          if (canvas && typeof canvas.toDataURL === 'function') {
            result.screenshot = canvas.toDataURL('image/png');
          }
        } catch {
          // swallow; screenshot stays undefined
        }
      }
      return result;
    },
  });
}

registerGetEmblemState();
