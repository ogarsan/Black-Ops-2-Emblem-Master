import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  retries: 1,
  // Keep timeouts generous — first load waits on `loadedall()` (261 PNGs).
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:8080', headless: true },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});