import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';

async function gotoAiTabWithKey(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('playercard')?.style.visibility === 'visible', { timeout: 60_000 });
  await page.evaluate(() =>
    localStorage.setItem(
      'bo2_ai_settings_v1',
      JSON.stringify({ provider: 'openai', apiKey: 'sk-fake', model: 'gpt-4o-mini', baseUrl: '' })
    )
  );
  await page.waitForFunction(() => typeof window.editor?.changetab === 'function');
  // Our patched changetab('ai') makes the AI container + #picker visible
  // without requiring the user to navigate into picker mode via the upstream
  // layer-preview UI (which is hard to script reliably).
  await page.evaluate(() => window.editor.changetab('ai'));
  await page.waitForSelector('.bo2-ai-input', { timeout: 5_000 });
}

test('undo/redo: AI adds a layer, Ctrl+Z removes it, Ctrl+Shift+Z restores it', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await gotoAiTabWithKey(page);

  await page.locator('.bo2-ai-input').fill('add Letter A');
  await page.locator('.bo2-ai-input').press('Enter');
  // Wait for the layer to be inserted.
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);

  await page.keyboard.press('Control+z');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).toMatch(/empty\.png/);

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);
});

test('undo stack persists across reload', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await gotoAiTabWithKey(page);

  await page.locator('.bo2-ai-input').fill('add Letter A');
  await page.locator('.bo2-ai-input').press('Enter');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);

  // Wait for the debounced 250ms history write to fire.
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => typeof window.__bo2History !== 'undefined');
  const canUndo = await page.evaluate(() => window.__bo2History?.canUndo());
  expect(canUndo).toBe(true);
});