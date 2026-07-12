// test/e2e/cron_refresh.spec.js
import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

// The 3s refresh cron must restore any out-of-sync #layer-img-N.src
// back to the live editor.stack state. We provoke an out-of-sync
// condition by overwriting the DOM img src directly, then wait for the
// cron to fix it.
test('cron refresh re-syncs an overwritten #layer-img src within 4s', async ({ page }) => {
  await stubOpenAi(page); // stub text response so we don't make a real call
  await gotoAiTabWithKey(page);

  // Wait for loadedall() to populate editor.icons.
  await page.waitForFunction(() => !!window.editor?.icons && Object.keys(window.editor.icons).length > 0,
    { timeout: 15_000 });

  // Pick a real emblem and put it at slot 0, so #layer-img-0.src reflects it.
  // (Note: we skip window.editor.draw() here because stack[0] lacks the
  // per-slot `canvas` field that draw() expects. The cron's contract is on
  // #layer-img-N.src alone, so we just set it directly — same as the upstream
  // loaddata() helper at docs/js/editor.js:423.)
  const emblemSrc = await page.evaluate(() => {
    const name = Object.keys(window.editor.icons)[0];
    const stack = window.editor.stack;
    stack[0] = {
      name, img: window.editor.icons[name],
      x: 150, y: 150, rotate: 0,
      hue: 0, saturation: 0, brightness: 1, alpha: 1,
      scalex: 1.15, scaley: 1.15,
    };
    document.getElementById('layer-img-0').src = stack[0].img.src;
    return stack[0].img.src;
  });
  // Make sure the DOM has caught up.
  await page.waitForFunction((s) =>
    document.getElementById('layer-img-0').src.endsWith(s.split('/').pop()),
    emblemSrc,
    { timeout: 5_000 },
  );

  // Now mutate the DOM out-of-sync — simulates some bug that left the
  // preview stale. The cron should restore it within ~3s.
  await page.evaluate(() => {
    document.getElementById('layer-img-0').src = 'img/empty.png';
  });

  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src'),
    { timeout: 5_000 },
  ).not.toMatch(/empty\.png$/);
});
