import { test, expect } from '@playwright/test';
import { stubOpenAiSequence } from './helpers/stub_providers.js';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

// With the agent loop, the model can emit tool calls across multiple turns;
// the stub serves a tool call on request 1, then a plain-text final answer on
// request 2 so the loop terminates cleanly with one tool chip in the UI.
test('AI tab happy path: stubbed provider streams add_layer tool call; layer appears on canvas', async ({ page }) => {
  await stubOpenAiSequence(page, ['openai_tool_call_stream.txt', 'openai_text_stream.txt']);
  await gotoAiTabWithKey(page);

  await page.locator('.bo2-ai-input').fill('add Letter A');
  await page.locator('.bo2-ai-input').press('Enter');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);
  await expect(page.locator('.bo2-tool-chip')).toHaveCount(1);
});