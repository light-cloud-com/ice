import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'gcp-integration',
      testMatch: 'gcp-template-suite.spec.ts',
      timeout: 900_000, // 15 min per template
      retries: 0,
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'on',
        headless: false, // Visible browser — watch tests execute
        launchOptions: {
          slowMo: 300, // Slow down so you can follow the actions
        },
      },
    },
  ],
  webServer: {
    command: 'cd ../packages/web && npx vite --port 5173',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
  },
});
