// test/e2e/chat_queue.spec.js
//
// Regression: messages typed while the agent is streaming were silently
// dropped (the textarea cleared on Enter, but onSend returned early
// because `streaming === true`, so neither a user bubble was appended
// nor the message added to the history). Fix: queue + show immediately.

import { test, expect } from '@playwright/test';
import { stubOpenAiSequence } from './helpers/stub_providers.js';
import { gotoAiTabWithKey } from './helpers/ai_tab.js';

// Drive two turns: turn 1 streams a tool call (so streaming stays
// active while we type the second message); turn 2 streams a text-only
// final answer.
test('messages typed while the agent is busy are queued (not lost)', async ({ page }) => {
  await stubOpenAiSequence(page, [
    'openai_tool_call_stream.txt', // turn 1: add_layer (streaming stays active)
    'openai_text_stream.txt',      // turn 2: final answer
  ]);
  await gotoAiTabWithKey(page);

  // First message — starts a streaming turn.
  await page.locator('.bo2-ai-input').fill('first');
  await page.locator('.bo2-ai-input').press('Enter');
  // While the first turn is in flight, type + send a second message.
  // The textarea clears on Enter, but the user bubble MUST appear in the
  // chat (otherwise the user sees their typing vanish with no feedback).
  await page.locator('.bo2-ai-input').fill('second');
  await page.locator('.bo2-ai-input').press('Enter');
  await page.locator('.bo2-ai-input').fill('third');
  await page.locator('.bo2-ai-input').press('Enter');

  // Allow both turns to complete (turn 1's tool call + turn 2's final text).
  // Poll until the streaming indicator is gone.
  await expect(page.locator('.bo2-streaming')).toHaveCount(0, { timeout: 10_000 });

  // All three user messages must be visible.
  const userBubbles = await page.locator('.bo2-msg-user').allTextContents();
  expect(userBubbles).toContain('first');
  expect(userBubbles).toContain('second');
  expect(userBubbles).toContain('third');
  expect(userBubbles).toHaveLength(3);

  // The "Queued" info banner may be present (informational, not required
  // for correctness — we just assert no errors were raised).
  const errorBanners = await page.locator('.bo2-error-banner').allTextContents();
  expect(errorBanners).toEqual([]);
});