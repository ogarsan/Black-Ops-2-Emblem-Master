import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./test/helpers/jsdom_setup.js'],
    include: ['test/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['docs/ai/**/*.js', 'docs/history.js', 'docs/store.js', 'docs/hooks.js'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});