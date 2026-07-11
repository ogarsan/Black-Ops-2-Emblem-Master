import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

test('tool validation error: red chip, model recovers without hard error', async ({ page }) => {
  const body = readFileSync(resolve('test/fixtures/openai_tool_error_then_retry.txt'), 'utf8');
  await page.route('https://api.openai.com/**', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body })
  );

  await gotoAiTabWithKey(page);
  await page.locator('.bo2-ai-input').fill('do bad then good');
  await page.locator('.bo2-ai-input').press('Enter');

  // The bad call (position=99) renders a red error chip; the recovery call
  // (position=1) renders a normal chip. The canvas reflects the recovery.
  await expect(page.locator('.bo2-tool-error').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.bo2-tool-chip:not(.bo2-tool-error)')).toHaveCount(1);
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);
});