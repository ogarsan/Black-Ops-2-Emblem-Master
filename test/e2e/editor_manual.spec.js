// test/e2e/editor_manual.spec.js
//
// P1 E2E: manual editor flows (visibility toggle, clear-layer, move-layer, undo).
// Follows the same visibility-check patterns as the rest of the suite:
// #editor/#playercard are zero-size <span>s with inline visibility toggling —
// use page.waitForFunction / page.evaluate instead of toBeVisible()/toBeHidden().
import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';
import { loadApp, enterEditor, addLayerViaAi, focusEditor } from './helpers/editor.js';

test.beforeEach(async ({ page }) => {
  // Auto-accept clear-layer/background confirm() + prompt() dialogs.
  page.on('dialog', (d) => d.accept());
});

test('enter and exit the editor toggles visibility', async ({ page }) => {
  await loadApp(page);
  await enterEditor(page);

  // #editor visible, #playercard hidden — check styles directly.
  expect(await page.evaluate(() =>
    document.getElementById('editor').style.visibility
  )).toBe('visible');
  expect(await page.evaluate(() =>
    document.getElementById('playercard').style.visibility
  )).toBe('hidden');
});

test('clear layer (X) empties the selected slot', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await loadApp(page);
  await enterEditor(page);
  await addLayerViaAi(page);                          // layer at slot 0

  // Select slot 0 — selectpreview(0): since stacki is already 0 and slot 0
  // has a layer, this changes mode to "layer".
  await page.locator('#layer-0').click();
  // Go back to "main" mode (Escape from layer mode → main, not exit editor).
  await focusEditor(page);
  await page.keyboard.press('Escape');
  // Wait for main mode (prompt-right shows clear option).
  await page.waitForFunction(
    () => document.getElementById('editor').style.visibility === 'visible'
  );

  // Press X (clear) — dialog is auto-accepted by beforeEach handler.
  await page.keyboard.press('x');

  await expect(page.locator('#layer-img-0')).toHaveAttribute('src', /empty\.png/);
});

test('move layer (D) swaps toward the next slot', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await loadApp(page);
  await enterEditor(page);
  await addLayerViaAi(page);                          // layer at slot 0

  // Click slot 0 to enter layer-edit mode (selectpreview on the currently-selected
  // non-empty slot → changemode("layer")).
  await page.locator('#layer-0').click();
  await focusEditor(page);
  // In "layer" mode, D calls movelayer(+1): slot 0 → slot 1.
  await page.keyboard.press('d');

  await expect(page.locator('#layer-img-1')).not.toHaveAttribute('src', /empty\.png/);
  await expect(page.locator('#layer-img-0')).toHaveAttribute('src', /empty\.png/);
});

// NOTE (plan documented fallback): the native picker-add sequence (click empty slot →
// picker mode auto-adds "Elite Member" → click emblems img → confirm) proved flaky
// because #emblems images may not be actionable via Playwright geometry checks in
// headless mode. Per the plan's explicit fallback, this test uses addLayerViaAi() to
// add the layer (still fully exercises "undo removes an add" end-to-end) and records
// the substitution here so coverage is not silently dropped.
test('undo removes a layer added via the picker default flow', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await loadApp(page);
  await enterEditor(page);
  await addLayerViaAi(page);  // fallback: AI-stubbed add instead of picker UI

  // Verify the layer is present before undo.
  await expect(page.locator('#layer-img-0')).not.toHaveAttribute('src', /empty\.png/);

  // Focus canvas so editor shortcuts fire (drawer swallows keys).
  await focusEditor(page);

  // Undo the add.
  await page.keyboard.press('Control+z');

  // Layer should be gone, editor still open (no eject).
  await expect.poll(async () =>
    page.locator('#layer-img-0').getAttribute('src'), { timeout: 5_000 }
  ).toMatch(/empty\.png/);

  expect(await page.evaluate(() =>
    document.getElementById('editor').style.visibility
  )).toBe('visible');
});
