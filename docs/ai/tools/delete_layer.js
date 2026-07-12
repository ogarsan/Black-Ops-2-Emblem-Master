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
      // Reset the per-slot DOM so the bottom-strip preview doesn't keep
      // showing the deleted layer's emblem and color filter.
      const imgEl = document.getElementById(`layer-img-${idx}`);
      if (imgEl) imgEl.src = 'img/empty.png';
      const matrixEl = document.getElementById(`matrix-${idx}`);
      if (matrixEl) matrixEl.setAttribute('values', '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0');
      ctx.editor.draw?.();
      ctx.editor.getusedlayers?.();
      window.updateimgs?.();
      ctx.history?.snapshot?.(ctx.currentState?.());
      return { deleted: position };
    },
  });
}

registerDeleteLayer();