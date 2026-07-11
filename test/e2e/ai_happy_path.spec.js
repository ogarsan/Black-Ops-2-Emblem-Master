import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

test('AI tab happy path: stubbed provider streams add_layer tool call; layer appears on canvas', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await gotoAiTabWithKey(page);

  await page.locator('.bo2-ai-input').fill('add Letter A');
  await page.locator('.bo2-ai-input').press('Enter');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);
  await expect(page.locator('.bo2-tool-chip')).toHaveCount(1);
});