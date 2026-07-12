// test/e2e/get_emblem_state_screenshot.spec.js
import { test, expect } from '@playwright/test';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

// Helper: stub OpenAI to first stream a tool call to
// get_emblem_state({includeScreenshot:true}), then stream a text event.
// The second request body — which carries the tool result — must
// include multimodal content (text + image_url) so the provider can SEE
// the canvas.
test('get_emblem_state with includeScreenshot sends multimodal tool content', async ({ page }) => {
  const bodies = [];
  let n = 0;
  await page.route('https://api.openai.com/**', async (route) => {
    n += 1;
    const req = route.request();
    bodies.push({ n, body: req.postData() });
    if (n === 1) {
      // First request: emit a tool_call to get_emblem_state.
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: [
          'data: {"choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_x","type":"function","function":{"name":"get_emblem_state","arguments":""}}]}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"includeScreenshot\\":true}"}}]}}]}\n\n',
          'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ].join(''),
      });
    } else {
      // Second request (after the tool ran): just emit a final text delta.
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: 'data: {"choices":[{"index":0,"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n',
      });
    }
  });

  await gotoAiTabWithKey(page);
  await page.locator('.bo2-ai-input').fill('verify');
  await page.locator('.bo2-ai-input').press('Enter');

  // Wait until the stub provider has been hit twice (turn 1 + turn 2).
  await expect.poll(() => bodies.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);

  // The second request's body is the one that carries the tool result.
  const second = bodies.find((b) => b.n === 2);
  expect(second).toBeTruthy();
  const parsed = JSON.parse(second.body);
  const toolMsg = parsed.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call_x');
  expect(toolMsg).toBeTruthy();
  // Multimodal: content must be an array with both text and image_url blocks.
  expect(Array.isArray(toolMsg.content)).toBe(true);
  expect(toolMsg.content.some((b) => b.type === 'text')).toBe(true);
  expect(toolMsg.content.some((b) => b.type === 'image_url' && b.image_url.url.startsWith('data:image/png;base64,'))).toBe(true);
});
