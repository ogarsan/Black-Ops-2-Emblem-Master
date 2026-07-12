// test/e2e/visual_selection.spec.js
//
// Regression: after AI actions, the bottom-strip layer preview should
// always show exactly one layer with the `.selected` class. Before the
// changestacki fix, multiple layers could accumulate `.selected` because
// the tools + cron were setting editor.stacki directly without going
// through editor.changestacki (the only function that updates .selected).
import { test, expect } from '@playwright/test';
import { stubOpenAi } from './helpers/stub_providers.js';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

test('only one layer has .selected at a time after AI actions', async ({ page }) => {
  // Stub: turn 1 emits a tool_call (add_layer), turn 2 emits a text reply.
  // We use a generic add_layer stream that fires the layer-creation path.
  await page.route('https://api.openai.com/**', async (route, req) => {
    const body = JSON.parse(req.postData());
    const isFirst = body.messages.filter((m) => m.role === 'tool').length === 0;
    if (isFirst) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: [
          'data: {"choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_x","type":"function","function":{"name":"add_layer","arguments":"{\\"name\\":\\"Letter A\\",\\"position\\":1}"}}]}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ].join(''),
      });
    } else {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: 'data: {"choices":[{"index":0,"delta":{"content":"Done."}}]}\n\ndata: [DONE]\n\n',
      });
    }
  });

  await gotoAiTabWithKey(page);
  await page.locator('.bo2-ai-input').fill('add Letter A');
  await page.locator('.bo2-ai-input').press('Enter');

  // Wait for the streaming indicator to clear (turn 1 + turn 2 done).
  await expect(page.locator('.bo2-streaming')).toHaveCount(0, { timeout: 10_000 });

  // After AI actions, exactly one layer preview has .selected.
  const selectedCount = await page.locator('.layer-preview.selected').count();
  expect(selectedCount).toBe(1);
});