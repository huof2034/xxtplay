import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  fullyParallel: true,
  workers: 3,
  use: { browserName: 'chromium', headless: true, channel: process.env.PW_CHANNEL || undefined, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
});
