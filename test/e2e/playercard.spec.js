// test/e2e/playercard.spec.js
//
// P1 E2E: playercard inline-edit flows.
// #playername and #playerclantag are contenteditable divs; their oninput handlers
// write to window.details. We assert the live window.details object is updated.
import { test, expect } from '@playwright/test';
import { loadApp } from './helpers/editor.js';

test('editing the player name updates details', async ({ page }) => {
  await loadApp(page);

  // Clear the current name and type a new one.
  const name = page.locator('#playername');
  await name.click();
  // Select all and delete existing content, then type the new name.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('TestOperator');

  const stored = await page.evaluate(() => window.details.playername);
  expect(stored).toContain('TestOperator');
});

test('editing the clan tag updates details', async ({ page }) => {
  await loadApp(page);

  const clan = page.locator('#playerclantag');
  await clan.click();
  // Select all and clear, then type new tag.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('WOLF');

  const stored = await page.evaluate(() => window.details.playerclantag);
  expect(stored).toContain('WOLF');
});
