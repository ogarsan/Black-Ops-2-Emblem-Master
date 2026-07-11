// docs/ai/tools/set_playercard.js
//
// Tool: set_playercard — update playercard metadata.
// Refines: at least one of {playername, playerclantag, playerbg} must be set.
// Limits match BO2 client constraints: name 20 chars, clantag 6 chars.
import { z } from '../../vendor/zod.min.js';
import { registerTool } from './exec.js';

const schema = z.object({
  playername: z.string().max(20).optional(),
  playerclantag: z.string().max(6).optional(),
  playerbg: z.string().optional(),
}).refine(
  (o) => o.playername !== undefined || o.playerclantag !== undefined || o.playerbg !== undefined,
  { message: 'at least one field required' }
);

export function registerSetPlayercard() {
  registerTool({
    name: 'set_playercard',
    definition: { description: 'Updates playercard metadata: playername (max 20 chars), playerclantag (max 6 chars), playerbg (URL to a 256x64 PNG). At least one field is required.' },
    schema,
    handler: async (args, ctx) => {
      Object.assign(window.details, args);
      ctx.editor?.draw?.();
      ctx.history?.snapshot?.(ctx.currentState?.());
      return { updated: Object.keys(args) };
    },
  });
}

registerSetPlayercard();