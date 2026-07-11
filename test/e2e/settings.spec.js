import { test, expect } from '@playwright/test';

test('settings persist across reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.getElementById('playercard')?.style.visibility === 'visible', { timeout: 60_000 });
  await page.evaluate(() =>
    localStorage.setItem(
      'bo2_ai_settings_v1',
      JSON.stringify({ provider: 'groq', apiKey: 'gsk-x', model: 'llama-3.1-70b-versatile', baseUrl: '' })
    )
  );
  await page.reload();
  await page.waitForFunction(() => document.getElementById('playercard')?.style.visibility === 'visible');
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('bo2_ai_settings_v1')));
  expect(s.provider).toBe('groq');
  expect(s.apiKey).toBe('gsk-x');
});