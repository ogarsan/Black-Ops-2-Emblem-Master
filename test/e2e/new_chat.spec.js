import { test, expect } from '@playwright/test';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

test('new chat clears conversation', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('playercard')?.style.visibility === 'visible', { timeout: 60_000 });
  await page.evaluate(() =>
    localStorage.setItem('bo2_chat_history_v1', JSON.stringify([{ role: 'user', content: 'x' }]))
  );
  await page.reload();
  await page.waitForFunction(() => document.getElementById('playercard')?.style.visibility === 'visible');

  // Wait for the AI-tab patch to be installed (ai/main.js polls for window.editor).
  await page.waitForFunction(
    () => typeof window.editor?.changetab === 'function' && window.editor.changetab.__bo2Patched === true,
    { timeout: 10_000 }
  );
  await page.evaluate(() => window.editor.changetab('ai'));
  await page.waitForSelector('.bo2-ai-input', { timeout: 5_000 });

  // The persisted user message is rendered as a bubble on mount.
  await expect(page.locator('.bo2-msg-user')).toHaveCount(1);

  // Click "New chat" — clears localStorage and empties the DOM list.
  await page.locator('.bo2-ai-newchat-btn').click();
  await expect(page.locator('.bo2-msg-user')).toHaveCount(0);
});