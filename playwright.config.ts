import { defineConfig, devices } from '@playwright/test';

const headless = Boolean(process.env.CI || process.env.PLAYWRIGHT_HEADLESS);
// Chromium completo usa o mesmo modo headless do Chrome local.
const browserChannel = { channel: process.env.CI ? 'chromium' as const : 'chrome' as const };
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const chromeVisible = {
  ...devices['Desktop Chrome'],
  ...browserChannel,
  headless,
  viewport: { width: 1280, height: 720 },
  screen: { width: 1280, height: 720 },
};

const chromeMobileLandscape = {
  ...devices['Desktop Chrome'],
  ...browserChannel,
  headless,
  viewport: { width: 720, height: 405 },
  screen: { width: 720, height: 405 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
};

export default defineConfig({
  testDir: './e2e',
  testIgnore: 'online.spec.ts',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
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
    command: `${npmCommand} run dev -- --host 127.0.0.1 --port 5173 --strictPort --force`,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chrome-visible-real-policy',
      use: chromeVisible,
    },
    {
      name: 'chrome-mobile-landscape',
      use: chromeMobileLandscape,
    },
  ],
});
