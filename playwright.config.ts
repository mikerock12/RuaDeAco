import { defineConfig, devices } from '@playwright/test';

const chromeVisible = {
  ...devices['Desktop Chrome'],
  channel: 'chrome' as const,
  headless: false,
  viewport: { width: 1280, height: 720 },
  screen: { width: 1280, height: 720 },
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort --force',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chrome-visible-real-policy',
      use: chromeVisible,
    },
  ],
});
