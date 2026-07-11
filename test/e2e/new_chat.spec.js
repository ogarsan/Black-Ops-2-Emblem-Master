import { test, expect } from '@playwright/test';

test('new chat clears conversation', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.bo2-ai-handle', { timeout: 60_000 });
  await page.evaluate(() =>
    localStorage.setItem('bo2_chat_history_v1', JSON.stringify([{ role: 'user', content: 'x' }]))
  );
  await page.reload();
  await page.waitForSelector('.bo2-ai-handle', { timeout: 60_000 });

  // Open the drawer via the handle.
  await page.locator('.bo2-ai-handle').click();
  await page.waitForSelector('.bo2-ai-input', { timeout: 5_000 });

  // The persisted user message is rendered as a bubble on mount.
  await expect(page.locator('.bo2-msg-user')).toHaveCount(1);

  // Click "New chat" — clears localStorage and empties the DOM list.
  await page.locator('.bo2-ai-newchat-btn').click();
  await expect(page.locator('.bo2-msg-user')).toHaveCount(0);
});