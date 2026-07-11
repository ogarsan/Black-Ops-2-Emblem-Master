import { test, expect } from '@playwright/test';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

test('Esc during streaming aborts the request', async ({ page }) => {
  // Long-running stream that sends a token then never ends.
  await page.route('https://api.openai.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"x"}}]}\n\n'));
          // Stream stays open until aborted.
        },
      }),
    });
  });

  await gotoAiTabWithKey(page);
  await page.locator('.bo2-ai-input').fill('something');
  await page.locator('.bo2-ai-input').press('Enter');

  // Wait for streaming indicator to appear, then send Escape.
  await expect(page.locator('.bo2-streaming')).toHaveCount(1, { timeout: 5_000 });
  await page.keyboard.press('Escape');

  // Streaming indicator should clear (the spec scope: ensure streaming stops).
  await expect(page.locator('.bo2-streaming')).toHaveCount(0, { timeout: 5_000 });
});