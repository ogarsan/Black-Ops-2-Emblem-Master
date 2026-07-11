// docs/ai/tools/move_layer.js
//
// Tool: move_layer — swaps the layer at `from` with the layer at `to`.
// Both indices are 1-indexed. A no-op swap (from === to) returns moved:false
// without touching state.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

export function registerMoveLayer() {
  registerTool({
    name: 'move_layer',
    definition: { description: 'Swaps the layer at 1-indexed position `from` with the one at `to`. Use to reorder the stack.' },
    schema: z.object({
      from: z.number().int().min(1).max(32),
      to: z.number().int().min(1).max(32),
    }),
    handler: async ({ from, to }, ctx) => {
      if (from === to) return { moved: false };
      const a = from - 1;
      const b = to - 1;
      if (!ctx.editor.stack[a]) return { error: `position ${from} is empty` };
      const tmp = ctx.editor.stack[b];
      ctx.editor.stack[b] = ctx.editor.stack[a];
      ctx.editor.stack[a] = tmp;
      ctx.editor.draw?.();
      ctx.editor.getusedlayers?.();
      window.updateimgs?.();
      ctx.history?.snapshot?.(ctx.currentState?.());
      return { moved: true, from, to };
    },
  });
}

registerMoveLayer();