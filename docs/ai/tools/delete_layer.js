// docs/ai/tools/delete_layer.js
//
// Tool: delete_layer — nulls a stack slot at the given 1-indexed position.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

export function registerDeleteLayer() {
  registerTool({
    name: 'delete_layer',
    definition: { description: 'Removes the layer at the given 1-indexed position (1..32). Position becomes empty (null).' },
    schema: z.object({ position: z.number().int().min(1).max(32) }),
    handler: async ({ position }, ctx) => {
      const idx = position - 1;
      if (!ctx.editor.stack[idx]) return { error: `position ${position} is empty` };
      ctx.editor.stack[idx] = null;
      ctx.editor.draw?.();
      ctx.editor.getusedlayers?.();
      window.updateimgs?.();
      ctx.history?.snapshot?.(ctx.currentState?.());
      return { deleted: position };
    },
  });
}

registerDeleteLayer();