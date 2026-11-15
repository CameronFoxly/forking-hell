import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 3,
  retries: 0,
  use: { baseURL: process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: process.env.PREVIEW_URL ? undefined : {
    command: 'npm run dev -- --port 4173', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    { name: 'firefox', use: { browserName: 'firefox', viewport: { width: 1280, height: 800 } } },
    { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
    { name: 'touch', use: { browserName: 'chromium', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
  ],
});
