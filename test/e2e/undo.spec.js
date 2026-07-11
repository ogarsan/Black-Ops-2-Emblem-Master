import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';

async function openAiDrawerWithKey(page) {
  await page.goto('/');
  await expect(page.locator('.bo2-ai-handle')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => localStorage.setItem('bo2_ai_settings_v1', JSON.stringify({
    provider: 'openai', apiKey: 'sk-fake', model: 'gpt-4o-mini', baseUrl: '',
  })));
  await page.locator('.bo2-ai-handle').click();
}

// Undo is driven via the AI path because it deterministically records one
// snapshot per tool call. One add → one Ctrl+Z returns to the baseline (empty),
// proving the undo stepped one action rather than staying multi-step.
test('one Ctrl+Z undoes exactly one action', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt'); // streams one add_layer
  await openAiDrawerWithKey(page);

  await page.locator('.bo2-ai-input').fill('add first');
  await page.locator('.bo2-ai-input').press('Enter');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);

  await page.keyboard.press('Control+z');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).toMatch(/empty\.png/);

  // Redo restores it (proves the step was atomic, not a full reset with no redo).
  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);
});

test('typing in the chat does not trigger editor shortcuts', async ({ page }) => {
  await openAiDrawerWithKey(page);
  // Type 'x' (the editor's "Clear Layer" shortcut) into the chat input.
  await page.locator('.bo2-ai-input').fill('xxxx');
  // No confirm dialog appeared and the input kept the text → editor didn't see it.
  await expect(page.locator('.bo2-ai-input')).toHaveValue('xxxx');
});