// test/e2e/helpers/ai_tab.js
//
// Shared helper for E2E specs that exercise the AI chat. Loads the app, waits
// for the playercard to become visible (i.e. all 261 emblem PNGs decoded),
// stores a fake API key, then clicks the AI handle to open the drawer.

export async function gotoAiTabWithKey(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // The drawer is appended to <body> by ai/main.js; wait for the handle.
  await page.waitForSelector('.bo2-ai-handle', { timeout: 60_000 });
  await page.evaluate(() =>
    localStorage.setItem(
      'bo2_ai_settings_v1',
      JSON.stringify({ provider: 'openai', apiKey: 'sk-fake', model: 'gpt-4o-mini', baseUrl: '' })
    )
  );
  await page.locator('.bo2-ai-handle').click();
  await page.waitForSelector('.bo2-ai-input', { timeout: 5_000 });
}