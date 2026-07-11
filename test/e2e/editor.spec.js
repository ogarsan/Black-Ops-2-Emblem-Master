import { test, expect } from '@playwright/test';

test('editor core: page loads, all 261 emblems decode, playercard becomes visible', async ({ page }) => {
  // Pure smoke: don't drive the picker (upstream UI quirks — `#picker` is `display:none`
  // even after smallemblem click; the real entry into picker mode requires going
  // through the layer-previews UI which is hard to script reliably). Just verify
  // the app loads and `loadedall()` fires within the timeout.

  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // `loadedall()` sets visibility on #playercard. Once visible we know all 261
  // emblem PNGs decoded without error and `window.editor` is set up.
  await page.waitForFunction(() => {
    const pc = document.getElementById('playercard');
    return pc && pc.style.visibility === 'visible';
  }, { timeout: 60_000 });

  // window.editor + window.__bo2History should both exist (hooks.js installed).
  await page.waitForFunction(
    () => typeof window.editor !== 'undefined' && typeof window.__bo2History !== 'undefined',
    { timeout: 10_000 }
  );

  // Editor is reachable: clicking smallemblem flips visibility on #editor.
  await page.locator('#smallemblem').click();
  await page.waitForFunction(() => document.getElementById('editor')?.style.visibility === 'visible');
});