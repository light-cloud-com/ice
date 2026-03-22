/**
 * Base Fixture — Authenticated page + API client
 */

import { test as base, type Page, request as apiRequest } from '@playwright/test';

const BACKEND_URL = 'http://localhost:5001/api';
const TEST_EMAIL = 'test@ice-saas.dev';
const TEST_PASSWORD = 'password123';

export interface ApiClient {
  post: (path: string, body?: any) => Promise<any>;
  get: (path: string) => Promise<any>;
}

let _cachedToken: string | null = null;

async function getToken(): Promise<string> {
  if (_cachedToken) return _cachedToken;

  // Retry up to 3 times (bcrypt can be slow, server may not be ready)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      });
      const data = await res.json();
      if (data.token) {
        _cachedToken = data.token;
        return _cachedToken;
      }
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error('Failed to get auth token after 3 attempts');
}

export const test = base.extend<{
  authenticatedPage: Page;
  apiClient: ApiClient;
}>({
  authenticatedPage: async ({ page }, use) => {
    const token = await getToken();

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate((t) => {
      localStorage.setItem('ice-token', t);
      localStorage.setItem('ice-action-log', 'true');
    }, token);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Retry if redirected to login
    if (page.url().includes('/login')) {
      await page.evaluate((t) => localStorage.setItem('ice-token', t), token);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    }

    await use(page);
  },

  apiClient: async ({}, use) => {
    const token = await getToken();

    const client: ApiClient = {
      post: async (path, body) => {
        const res = await fetch(`${BACKEND_URL}${path}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        return res.json();
      },
      get: async (path) => {
        const res = await fetch(`${BACKEND_URL}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return res.json();
      },
    };

    await use(client);
  },
});

export { expect } from '@playwright/test';
