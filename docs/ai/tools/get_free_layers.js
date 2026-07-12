// docs/ai/tools/get_free_layers.js
//
// Tool: get_free_layers
// Args: none.
// Returns the 1-indexed positions in the stack that are empty (null), and
// a count. Lighter than scanning get_emblem_state when the model only needs
// to know which slots are free (e.g. before calling add_layer with an
// explicit position).
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

export function registerGetFreeLayers() {
  registerTool({
    name: 'get_free_layers',
    definition: {
      description:
        'Returns the 1-indexed layer positions that are currently empty ' +
        '(null) and a count. Use before add_layer if you want to pick a ' +
        'specific free slot instead of letting the tool pick the first one.',
    },
    schema: z.object({}),
    handler: async (_args, ctx) => {
      const stack = ctx.editor?.stack ?? [];
      const free = [];
      for (let i = 0; i < stack.length; i++) {
        if (stack[i] === null) free.push(i + 1);
      }
      return { free, count: free.length };
    },
  });
}

registerGetFreeLayers();
