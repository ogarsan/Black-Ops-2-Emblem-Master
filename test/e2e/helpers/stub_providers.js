// test/e2e/helpers/stub_providers.js
//
// Playwright `page.route()` helpers that intercept outbound provider requests
// with our fixture SSE streams. The E2E specs don't hit the network —
// `webServer` runs the static app, and these helpers stand in for OpenAI /
// Anthropic / Gemini.

import { readFileSync } from 'fs';
import { resolve } from 'path';

export function stubOpenAi(page, fixture = 'openai_text_stream.txt') {
  const body = readFileSync(resolve(`test/fixtures/${fixture}`), 'utf8');
  return page.route('https://api.openai.com/**', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body,
    })
  );
}

// Multi-turn stub: serves each successive request a different fixture body.
// Useful for specs that exercise the agent loop (model emits tool_calls on
// turn 1, then a final answer on turn 2). After exhausting the list, the last
// fixture is replayed.
export function stubOpenAiSequence(page, fixtures) {
  const bodies = fixtures.map((f) => readFileSync(resolve(`test/fixtures/${f}`), 'utf8'));
  let i = 0;
  return page.route('https://api.openai.com/**', async (route) => {
    const body = bodies[Math.min(i, bodies.length - 1)];
    i += 1;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body,
    });
  });
}

export function stubAnthropic(page, fixture = 'anthropic_text_stream.txt') {
  const body = readFileSync(resolve(`test/fixtures/${fixture}`), 'utf8');
  return page.route('https://api.anthropic.com/**', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body })
  );
}

export function stubGemini(page, fixture = 'gemini_stream.txt') {
  const body = readFileSync(resolve(`test/fixtures/${fixture}`), 'utf8');
  return page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body })
  );
}