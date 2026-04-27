/**
 * Base Fixture — Authenticated page + API client
 *
 * Community edition: no JWT required — the gateway auto-seeds a local user
 * and requireAuth skips token validation.
 */
import { test as base } from '@playwright/test';
const BACKEND_URL = 'http://localhost:5002/api';
export const test = base.extend({
    authenticatedPage: async ({ page }, use) => {
        // Navigate to app — community edition requires no login
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        // Enable action logging for test observability
        await page.evaluate(() => {
            localStorage.setItem('ice-action-log', 'true');
        });
        // Reload to pick up the action-log flag
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        await use(page);
    },
    apiClient: async ({}, use) => {
        const client = {
            post: async (path, body) => {
                const res = await fetch(`${BACKEND_URL}${path}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body ? JSON.stringify(body) : undefined,
                });
                return res.json();
            },
            get: async (path) => {
                const res = await fetch(`${BACKEND_URL}${path}`);
                return res.json();
            },
        };
        await use(client);
    },
});
export { expect } from '@playwright/test';
