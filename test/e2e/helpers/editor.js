// test/e2e/helpers/editor.js
import { expect } from '@playwright/test';

export async function loadApp(page) {
  await page.goto('/');
  // Wait for all 261 emblems to decode (#playercard becomes visible after loadedall()).
  // #playercard is a <span> with inline visibility toggling; use waitForFunction
  // since Playwright's toBeVisible() fails on zero-size spans.
  await page.waitForFunction(
    () => document.getElementById('playercard')?.style.visibility === 'visible',
    { timeout: 15_000 }
  );
}

export async function enterEditor(page) {
  // #bigemblem lives inside #playercard (visibility:hidden), so Playwright's
  // locator.click() refuses it. Toggle visibility the same way the inline onclick
  // would, then call __bo2RefreshView so the previewer reflects the stack.
  await page.evaluate(() => {
    document.getElementById('playercard').style.visibility = 'hidden';
    document.getElementById('editor').style.visibility = 'visible';
    // If the fix's refresh hook is installed, call it now (Task 2 fix).
    window.__bo2RefreshView?.();
  });
  // Verify editor is now open via style (not toBeVisible — #editor is a zero-size span).
  await page.waitForFunction(
    () => document.getElementById('editor')?.style.visibility === 'visible'
  );
}

// Add a layer deterministically via the AI drawer + stubbed provider.
export async function addLayerViaAi(page, prompt = 'add Letter A') {
  await page.evaluate(() => localStorage.setItem('bo2_ai_settings_v1', JSON.stringify({
    provider: 'openai', apiKey: 'sk-fake', model: 'gpt-4o-mini', baseUrl: '',
  })));
  await page.locator('.bo2-ai-handle').click();          // open drawer
  await page.waitForSelector('.bo2-ai-input', { timeout: 5_000 });
  await page.locator('.bo2-ai-input').fill(prompt);
  await page.locator('.bo2-ai-input').press('Enter');
  // Wait for the layer to appear (stub streams one add_layer for slot 0).
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src'), { timeout: 10_000 }
  ).not.toMatch(/empty\.png/);
}

// Move focus to the canvas so editor keyboard shortcuts fire
// (the AI drawer input swallows keys while focused).
export async function focusEditor(page) {
  await page.locator('#canvas').click({ position: { x: 5, y: 5 } });
}

export async function exitEditorViaEscape(page) {
  // Ensure canvas has focus before pressing Escape so the editor's
  // document.onkeydown picks it up (the drawer swallows keys if open).
  await focusEditor(page);
  await page.keyboard.press('Escape');
  // Escape runs keyfuncs({key:'escape',override:true}) which hides #editor
  // and shows #playercard.  Both are <span>s with inline visibility, so
  // check styles directly.
  await page.waitForFunction(
    () => document.getElementById('playercard')?.style.visibility === 'visible',
    { timeout: 5_000 }
  );
}
