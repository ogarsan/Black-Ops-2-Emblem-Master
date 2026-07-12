// docs/ai/tools/clear_emblem.js
//
// Tool: clear_emblem — wipes all 32 layers.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

export function registerClearEmblem() {
  registerTool({
    name: 'clear_emblem',
    definition: { description: 'Empties all 32 layers of the emblem. The playercard metadata (name/clantag/background) is left untouched.' },
    schema: z.object({}),
    handler: async (_args, ctx) => {
      for (let i = 0; i < ctx.editor.stack.length; i++) {
        ctx.editor.stack[i] = null;
        const imgEl = document.getElementById(`layer-img-${i}`);
        if (imgEl) imgEl.src = 'img/empty.png';
        const matrixEl = document.getElementById(`matrix-${i}`);
        if (matrixEl) matrixEl.setAttribute('values', '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0');
      }
      ctx.editor.draw?.();
      ctx.editor.getusedlayers?.();
      window.updateimgs?.();
      ctx.history?.snapshot?.(ctx.currentState?.());
      return { cleared: true };
    },
  });
}

registerClearEmblem();