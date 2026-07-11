// test/e2e/helpers/ai_tab.js
//
// Shared helper for E2E specs that exercise the AI tab. Loads the app, waits
// for the playercard to become visible (i.e. all 261 emblem PNGs decoded),
// stores a fake API key, then drives the patched `editor.changetab('ai')`
// to surface the AI panel without going through upstream picker-mode.
//
// The patched changetab flips `#editor` to visible, `#picker` to inline, and
// `#ai` to default display — which is enough to make `.bo2-ai-input` reachable
// by Playwright's locator engine.

export async function gotoAiTabWithKey(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.getElementById('playercard')?.style.visibility === 'visible',
    { timeout: 60_000 }
  );
  await page.evaluate(() =>
    localStorage.setItem(
      'bo2_ai_settings_v1',
      JSON.stringify({ provider: 'openai', apiKey: 'sk-fake', model: 'gpt-4o-mini', baseUrl: '' })
    )
  );
  // Wait for BOTH the editor to exist and the AI-tab patch to be installed
  // (ai/main.js polls for window.editor, so a fresh navigation can race).
  await page.waitForFunction(
    () => typeof window.editor?.changetab === 'function' && window.editor.changetab.__bo2Patched === true,
    { timeout: 10_000 }
  );
  await page.evaluate(() => window.editor.changetab('ai'));
  await page.waitForSelector('.bo2-ai-input', { timeout: 5_000 });
}