import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const ticketSecret = randomBytes(48).toString('base64url');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'online.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results-online',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-online' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    // Trace registra headers de rede; fica desativado para que tickets
    // efêmeros jamais sejam serializados em artefatos de falha.
    trace: 'off',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm.cmd --prefix server run dev -- --ip 127.0.0.1',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { TICKET_SECRET: ticketSecret },
    },
    {
      command: 'npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort --force',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_MULTIPLAYER_URL: 'http://127.0.0.1:8787' },
    },
  ],
  projects: [
    {
      name: 'online-chrome-desktop',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        headless: false,
        viewport: { width: 1280, height: 720 },
        screen: { width: 1280, height: 720 },
      },
    },
    {
      name: 'online-chrome-mobile-landscape',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        headless: false,
        viewport: { width: 720, height: 405 },
        screen: { width: 720, height: 405 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      },
    },
  ],
});
