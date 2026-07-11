import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('.bo2-ai-handle')).toBeVisible({ timeout: 15_000 });
}

test('drawer opens and closes via the AI handle', async ({ page }) => {
  await ready(page);
  const drawer = page.locator('.bo2-ai-drawer');
  await expect(drawer).toHaveAttribute('data-open', 'false');
  await page.locator('.bo2-ai-handle').click();
  await expect(drawer).toHaveAttribute('data-open', 'true');
  await page.locator('.bo2-ai-handle').click();
  await expect(drawer).toHaveAttribute('data-open', 'false');
});

test('no AI tab remains in the picker', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#tab-ai')).toHaveCount(0);
});

test('AI adds a layer from the drawer (stubbed provider)', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await ready(page);
  await page.evaluate(() => localStorage.setItem('bo2_ai_settings_v1', JSON.stringify({
    provider: 'openai', apiKey: 'sk-fake', model: 'gpt-4o-mini', baseUrl: '',
  })));
  await page.locator('.bo2-ai-handle').click();
  await page.locator('.bo2-ai-input').fill('add Letter A');
  await page.locator('.bo2-ai-input').press('Enter');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);
});