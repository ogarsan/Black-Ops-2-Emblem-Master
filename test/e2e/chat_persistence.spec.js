// test/e2e/chat_persistence.spec.js
import { test, expect } from '@playwright/test';

// Regression: drawer open state used to be persisted to localStorage
// (key `bo2_ai_drawer_open_v1`), which left the drawer stuck across
// reloads and made it hard to reopen. The fix removes the localStorage
// reads/writes entirely; the drawer always starts closed.
test('drawer starts closed on reload even if previous session stored open=true', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () => document.getElementById('playercard')?.style.visibility === 'visible',
    { timeout: 15_000 },
  );
  // Plant a stale "open=true" in localStorage as if a prior session left
  // it open. The new code must ignore this.
  await page.evaluate(() => {
    localStorage.setItem('bo2_ai_drawer_open_v1', '1');
  });
  await page.reload();
  await page.waitForFunction(
    () => document.getElementById('playercard')?.style.visibility === 'visible',
    { timeout: 15_000 },
  );

  const dataOpen = await page.evaluate(() =>
    document.querySelector('.bo2-ai-drawer')?.getAttribute('data-open')
  );
  expect(dataOpen).toBe('false');
});

test('drawer toggle still works in-session (open/close via the handle)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(
    () => document.getElementById('playercard')?.style.visibility === 'visible',
    { timeout: 15_000 },
  );
  await page.locator('.bo2-ai-handle').click();
  expect(
    await page.evaluate(() => document.querySelector('.bo2-ai-drawer')?.getAttribute('data-open')),
  ).toBe('true');
  await page.locator('.bo2-ai-handle').click();
  expect(
    await page.evaluate(() => document.querySelector('.bo2-ai-drawer')?.getAttribute('data-open')),
  ).toBe('false');
});
