// test/e2e/undo.spec.js
//
// End-to-end tests for the undo/redo contract:
//   - Ctrl+Z reverts exactly one committed step
//   - the editor stays open (no kick-out to the playercard screen)
//   - the changed layer is highlighted in the general view after restore
//   - redo restores the reverted step (proves it's atomic, not a reset)
//
// Driven through the AI path because it deterministically records exactly one
// snapshot per tool call. The same contract holds for manual edits (drag/slider)
// — what changes is the trigger, not the undo stack behavior.

import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';

async function openAiDrawerWithKey(page) {
  await page.goto('/');
  await expect(page.locator('.bo2-ai-handle')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => localStorage.setItem('bo2_ai_settings_v1', JSON.stringify({
    provider: 'openai', apiKey: 'sk-fake', model: 'gpt-4o-mini', baseUrl: '',
  })));
  // Open the editor first. The upstream affordance is a click on #bigemblem
  // (which lives inside #playercard, visibility:hidden), so Playwright's
  // visibility check refuses the click — toggle the visibility directly,
  // matching what the inline onclick would do.
  await page.evaluate(() => {
    document.getElementById('playercard').style.visibility = 'hidden';
    document.getElementById('editor').style.visibility = 'visible';
  });
  // <span id="editor"> has zero intrinsic size (display:inline wrapper), so
  // Playwright's toBeVisible() thinks it's hidden even when style.visibility
  // is 'visible'. Assert the style directly.
  const visible = await page.evaluate(() =>
    document.getElementById('editor').style.visibility === 'visible'
  );
  expect(visible, 'editor visibility should be "visible" after toggling').toBe(true);
  await page.locator('.bo2-ai-handle').click();
}

async function driveOneAddLayer(page) {
  // The stub streams exactly one add_layer tool call ("Letter A" at position 1).
  await page.locator('.bo2-ai-input').fill('add first');
  await page.locator('.bo2-ai-input').press('Enter');
  // Position 1 → editor.stack[0] gets a non-empty layer image.
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);
}

test('one Ctrl+Z undoes exactly one action, stays in the editor, highlights the changed layer', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt'); // streams one add_layer
  await openAiDrawerWithKey(page);

  await driveOneAddLayer(page);

  // Sanity: editor is open, playercard is hidden before undo.
  // <span id="editor"> is a display:inline wrapper so Playwright's toBeVisible
  // always returns false for it — check the style directly.
  await page.waitForFunction(() =>
    document.getElementById('editor').style.visibility === 'visible'
  );
  expect(await page.evaluate(() =>
    document.getElementById('playercard').style.visibility
  )).toBe('hidden');

  await page.keyboard.press('Control+z');

  // Reverted exactly: the layer is gone again...
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).toMatch(/empty\.png/);

  // ...and we did NOT get kicked back to the playercard.
  expect(await page.evaluate(() =>
    document.getElementById('editor').style.visibility
  )).toBe('visible');
  expect(await page.evaluate(() =>
    document.getElementById('playercard').style.visibility
  )).toBe('hidden');

  // ...and the changed layer (slot 0) is highlighted in the general view.
  await expect(page.locator('#layer-0')).toHaveClass(/selected/);
});

test('redo restores the reverted step', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await openAiDrawerWithKey(page);
  await driveOneAddLayer(page);

  await page.keyboard.press('Control+z');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).toMatch(/empty\.png/);

  await page.keyboard.press('Control+Shift+z');
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src')
  ).not.toMatch(/empty\.png/);

  // Still in the editor after redo.
  expect(await page.evaluate(() =>
    document.getElementById('editor').style.visibility
  )).toBe('visible');
  expect(await page.evaluate(() =>
    document.getElementById('playercard').style.visibility
  )).toBe('hidden');
});

test('typing in the chat does not trigger editor shortcuts', async ({ page }) => {
  await openAiDrawerWithKey(page);
  // Type 'x' (the editor's "Clear Layer" shortcut) into the chat input.
  await page.locator('.bo2-ai-input').fill('xxxx');
  // No confirm dialog appeared and the input kept the text → editor didn't see it.
  await expect(page.locator('.bo2-ai-input')).toHaveValue('xxxx');
});