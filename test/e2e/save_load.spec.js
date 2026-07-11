// test/e2e/save_load.spec.js
//
// P1 E2E: save ↔ load round-trip for the emblem stack.
// savedata() serialises the live editor.stack into #datatext; loaddata() reads
// it back and rehydrates the stack. After clearing and loading, slot 0 must be
// populated again.
import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';
import { loadApp, enterEditor, addLayerViaAi } from './helpers/editor.js';

test('save then load round-trips the emblem', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await loadApp(page);
  await enterEditor(page);
  await addLayerViaAi(page);

  // Sanity: slot 0 is populated before we save.
  await expect(page.locator('#layer-img-0')).not.toHaveAttribute('src', /empty\.png/);

  // SAVE writes serialized data into #datatext (savedata()).
  await page.evaluate(() => window.savedata());
  const saved = await page.locator('#datatext').inputValue();
  expect(saved.length).toBeGreaterThan(0);

  // Clear the live stack, then verify slot 0 is empty.
  await page.evaluate(() => {
    for (let i = 0; i < 32; i++) window.editor.stack[i] = null;
    window.editor.draw();
    // Also clear the preview images so we can detect loaddata() restored them.
    for (let i = 0; i < 32; i++) {
      const img = document.getElementById('layer-img-' + i);
      if (img) img.src = 'img/empty.png';
    }
  });
  await expect(page.locator('#layer-img-0')).toHaveAttribute('src', /empty\.png/);

  // LOAD from the same data.
  await page.evaluate(() => window.loaddata());

  // The emblem is back: slot 0 should be populated again.
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src'), { timeout: 5_000 }
  ).not.toMatch(/empty\.png/);
});
