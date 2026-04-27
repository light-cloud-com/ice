import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
// Load .env so suites that need credentials (test:gcp, test:scenarios)
// pick them up automatically without callers having to export them.
// Existing process.env values win over .env.
(function loadDotEnv() {
    try {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const envPath = resolve(__dirname, '..', '.env');
        const file = readFileSync(envPath, 'utf-8');
        for (const line of file.split('\n')) {
            const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
            if (m && process.env[m[1]] === undefined) {
                let v = m[2].trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
                    v = v.slice(1, -1);
                }
                process.env[m[1]] = v;
            }
        }
    }
    catch {
        /* .env is optional */
    }
})();
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
        {
            name: 'scenarios',
            testDir: './deployment-tests',
            testMatch: /.*\.spec\.ts/,
            timeout: 1_800_000, // up to 30 min — covers scenarios + bulk destroy-all
            retries: 0,
            use: {
                ...devices['Desktop Chrome'],
                screenshot: 'on',
                headless: false,
                launchOptions: {
                    slowMo: 300,
                },
            },
        },
    ],
    webServer: {
        command: 'pnpm --dir .. dev:all',
        url: 'http://localhost:5174',
        reuseExistingServer: true,
        timeout: 180_000,
    },
});
