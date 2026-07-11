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
      for (let i = 0; i < ctx.editor.stack.length; i++) ctx.editor.stack[i] = null;
      ctx.editor.draw?.();
      ctx.editor.getusedlayers?.();
      window.updateimgs?.();
      ctx.history?.snapshot?.(ctx.currentState?.());
      return { cleared: true };
    },
  });
}

registerClearEmblem();