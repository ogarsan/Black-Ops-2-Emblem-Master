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
      // Both slots now host a different layer — repaint each so:
      //   - layer.canvas is re-rendered with the new layer's image at the new
      //     slot's coordinates / filter (the SVG filter is keyed to the slot)
      //   - the #layer-img-N preview src is updated to the now-current emblem
      const repaint = (idx) => {
        ctx.editor.changestacki?.(idx);
        // createfilter first (sets the SVG color filter), then
        // generatestackcanvas re-paints stack[i].canvas with that filter
        // for the main canvas. Wrong order bakes the OLD filter into the
        // main canvas.
        const layer = ctx.editor.stack[idx];
        if (layer) {
          ctx.editor.createfilter?.(layer.hue, layer.saturation, layer.brightness, layer.alpha);
          ctx.editor.generatestackcanvas?.();
          const previewImg = document.getElementById(`layer-img-${idx}`);
          if (previewImg && layer.img && layer.img.src) previewImg.src = layer.img.src;
        } else {
          // Slot is empty after the swap (we just moved something off it).
          const previewImg = document.getElementById(`layer-img-${idx}`);
          if (previewImg) previewImg.src = 'img/empty.png';
          const matrixEl = document.getElementById(`matrix-${idx}`);
          if (matrixEl) matrixEl.setAttribute('values', '1 0 0 0 0\n0 1 0 0 0\n0 0 1 0 0\n0 0 0 1 0');
        }
      };
      repaint(a);
      repaint(b);
      ctx.editor.draw?.();
      ctx.editor.getusedlayers?.();
      window.updateimgs?.();
      ctx.history?.snapshot?.(ctx.currentState?.());
      return { moved: true, from, to };
    },
  });
}

registerMoveLayer();