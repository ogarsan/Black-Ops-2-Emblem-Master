// docs/ai/tools/get_emblem_state.js
//
// Tool: get_emblem_state
// Args: none.
// Returns: the current stack serialised by `store.serializeStack` —
//   { layers: [{ position, name, x, y, rotate, hue, ... }], layers_used }.
//
// The model calls this on the first turn of a session and after any tool call
// to learn what changed.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';
import { serializeStack } from '../../store.js';

export function registerGetEmblemState() {
  registerTool({
    name: 'get_emblem_state',
    definition: { description: 'Returns the current emblem state as a serialised snapshot (positions 1-indexed, layers with name/x/y/rotate/hue/saturation/brightness/alpha/scalex/scaley).' },
    schema: z.object({}),
    handler: async (_args, ctx) => serializeStack(ctx.editor.stack),
  });
}

registerGetEmblemState();