// test/e2e/undo_eject.spec.js
import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';
import { loadApp, enterEditor, addLayerViaAi, exitEditorViaEscape, focusEditor } from './helpers/editor.js';

// Reproduces the real bug: an Escape-exit arms #bigemblem.onload; a later undo
// used to re-fire it and eject the user. After the fix, undo stays in the editor.
test('undo after Escape-exit + re-enter stays in the editor (no eject)', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await loadApp(page);
  await enterEditor(page);
  await addLayerViaAi(page);
  await exitEditorViaEscape(page);        // arms the stale onload, lands on playercard
  await enterEditor(page);                // re-enter
  await focusEditor(page);
  await page.keyboard.press('Control+z'); // undo

  // Editor must remain open — NOT ejected to playercard.
  // #editor and #playercard are zero-size <span>s with inline visibility;
  // check styles directly instead of toBeVisible()/toBeHidden().
  await page.waitForFunction(
    () => document.getElementById('editor')?.style.visibility === 'visible',
    { timeout: 5_000 }
  );
  expect(await page.evaluate(() =>
    document.getElementById('playercard').style.visibility
  )).toBe('hidden');
});

test('re-entering the editor shows the saved layers in the previewer', async ({ page }) => {
  await stubOpenAi(page, 'openai_tool_call_stream.txt');
  await loadApp(page);
  await enterEditor(page);
  await addLayerViaAi(page);
  await exitEditorViaEscape(page);
  await enterEditor(page);

  // #previews and the layer image must reflect the saved stack.
  // #previews uses inline visibility (not display:none), check it directly.
  await page.waitForFunction(
    () => document.getElementById('previews')?.style.visibility !== 'hidden',
    { timeout: 5_000 }
  );
  await expect(page.locator('#layer-img-0')).not.toHaveAttribute('src', /empty\.png/);
});
