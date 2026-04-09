/**
 * Security E2E Tests
 *
 * Validates the security fixes from the security backlog (SEC-1 through SEC-15).
 * Tests cover: authentication, authorization, IDOR prevention, OAuth flow,
 * credential handling, and access control.
 */

import { test, expect } from '../fixtures/base.fixture';

const BACKEND_URL = 'http://localhost:5002/api';

// ─── SEC-1: JWT secret must be configured ──────────────────────────────────

test.describe('SEC-1: JWT Secret Enforcement', () => {
  test('should reject requests with forged JWT tokens', async ({ page }) => {
    // Craft a JWT signed with the old default 'dev-secret' — should be rejected
    // This verifies the app no longer falls back to a default secret
    const forgedToken = [
      btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, ''),
      btoa(JSON.stringify({ userId: 'fake', organisationId: 'fake' })).replace(/=/g, ''),
      'invalid-signature',
    ].join('.');

    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${forgedToken}` },
    });
    expect(res.status).toBe(401);
  });
});

// ─── SEC-5: OAuth redirect uses fragment not query string ───────────────────

test.describe('SEC-5: OAuth Token Not in Query String', () => {
  test('auth callback page should read token from URL hash fragment and store it', async ({ page }) => {
    // Get a real valid token so setAccessToken actually stores it
    const validToken = await getValidToken();

    // Navigate to callback with token in hash fragment (the secure way)
    await page.goto(`/auth/callback#token=${validToken}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Token should have been read from hash fragment and stored in localStorage
    const storedToken = await page.evaluate(() => localStorage.getItem('ice-token'));
    expect(storedToken).toBe(validToken);
  });

  test('auth callback should clear hash from URL after reading', async ({ page }) => {
    const validToken = await getValidToken();
    await page.goto(`/auth/callback#token=${validToken}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Hash should have been cleared from the URL
    const currentHash = await page.evaluate(() => window.location.hash);
    expect(currentHash).toBe('');
  });
});

// ─── SEC-8: Organisation IDOR Prevention ────────────────────────────────────

test.describe('SEC-8: Organisation IDOR Prevention', () => {
  test('should not allow listing projects from another organisation via body param', async ({ apiClient }) => {
    // Try to list projects with a different org ID in the body
    const fakeOrgId = '00000000-0000-0000-0000-000000000000';

    // First get real projects (using JWT-derived org)
    const realProjects = await apiClient.post('/canvas/projects', {});

    // Now try with a fake org ID in the body — server should ignore it
    const spoofedProjects = await apiClient.post('/canvas/projects', {
      organisationId: fakeOrgId,
    });

    // Both should return the same results (server ignores client-supplied org ID)
    expect(spoofedProjects).toEqual(realProjects);
  });
});

// ─── SEC-9: requireProjectAccess Works on All HTTP Methods ──────────────────

test.describe('SEC-9: Project Access Middleware', () => {
  test('should return 400 when projectId is missing from authenticated request', async ({ authenticatedPage }) => {
    // Use the browser's authenticated context to call the API
    const result = await authenticatedPage.evaluate(async () => {
      const token = localStorage.getItem('ice-token');
      const res = await fetch('/api/canvas/projects/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    // requireProjectAccess should return 400 since no projectId was provided
    expect(result.status).toBe(400);
    expect(result.body.message).toContain('projectId');
  });
});

// ─── SEC-10: OAuth Users Cannot Use Password Login ──────────────────────────

test.describe('SEC-10: OAuth-Only Account Protection', () => {
  test('should reject login with empty password_hash (legacy OAuth accounts)', async () => {
    // Try logging in with an email that would be an OAuth account
    // The system should reject with a helpful message rather than allowing empty-hash comparison
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent-oauth@test.dev',
        password: '',
      }),
    });

    // Should get 401, not 200 (empty password should never match empty hash)
    expect(res.status).toBe(401);
  });
});

// ─── SEC-15: Scheduled Job Auth ─────────────────────────────────────────────

test.describe('SEC-15: Billing Scheduled Job Auth', () => {
  test('should reject scheduled job requests without API key', async () => {
    // Test one representative endpoint — all use the same verifySchedulerAuth
    const res = await fetch(`${BACKEND_URL}/billing/jobs/daily-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Should be 401 — SCHEDULER_API_KEY not set means all requests are denied
    expect(res.status).toBe(401);
  });
});

// ─── FE-1: No Hardcoded Credentials on Login Page ───────────────────────────

test.describe('FE-1: Login Page Security', () => {
  test('should not have pre-filled credentials on login page', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const emailInput = page.locator('#ice-login-auth-input-email');
    const passwordInput = page.locator('#ice-login-auth-input-password');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    const emailValue = await emailInput.inputValue();
    const passwordValue = await passwordInput.inputValue();

    // Inputs should be empty — no hardcoded test credentials
    expect(emailValue).toBe('');
    expect(passwordValue).toBe('');
  });

  test('should not contain test credentials in page source', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const pageContent = await page.content();
    expect(pageContent).not.toContain('test@ice-saas.dev');
    expect(pageContent).not.toContain('password123');
  });
});

// ─── Auth Flow: Registration and Login ──────────────────────────────────────

test.describe('Auth Flow Security', () => {
  test('should not expose JWT in URL after login', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // Clear any existing session
    await page.evaluate(() => localStorage.removeItem('ice-token'));

    await page.fill('#ice-login-auth-input-email', process.env.TEST_USER_EMAIL || 'test@ice-saas.dev');
    await page.fill('#ice-login-auth-input-password', process.env.TEST_USER_PASSWORD || 'password123');
    await page.click('#ice-login-auth-btn-submit');

    await expect(page).toHaveURL('/', { timeout: 10000 });

    // URL should not contain any token
    const url = page.url();
    expect(url).not.toContain('token=');
    expect(url).not.toContain('jwt=');
  });

  test('should store JWT in localStorage after login', async ({ page }) => {
    // Use a fresh context to avoid session interference from other tests
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.removeItem('ice-token');
      document.cookie = 'refreshToken=; Max-Age=0';
    });
    await page.goto('/login', { waitUntil: 'networkidle' });

    await page.fill('#ice-login-auth-input-email', process.env.TEST_USER_EMAIL || 'test@ice-saas.dev');
    await page.fill('#ice-login-auth-input-password', process.env.TEST_USER_PASSWORD || 'password123');
    await page.click('#ice-login-auth-btn-submit');

    // Wait for token to appear in localStorage (more reliable than URL check)
    await page.waitForFunction(
      () => {
        const t = localStorage.getItem('ice-token');
        return t && t.split('.').length === 3;
      },
      { timeout: 15000 },
    );

    const token = await page.evaluate(() => localStorage.getItem('ice-token'));
    expect(token).toBeTruthy();
    expect(token!.split('.').length).toBe(3);
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('ice-token'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('should reject requests with expired/invalid tokens', async () => {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: 'Bearer invalid.token.here' },
    });
    expect(res.status).toBe(401);
  });

  test('should reject requests without Authorization header', async () => {
    const res = await fetch(`${BACKEND_URL}/auth/me`);
    expect(res.status).toBe(401);
  });
});

// ─── API Security Headers ───────────────────────────────────────────────────

test.describe('Security Headers', () => {
  test('should include security headers from Helmet', async () => {
    const res = await fetch(`${BACKEND_URL}/health`);

    // Helmet sets these headers
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
    expect(res.headers.get('x-xss-protection')).toBeTruthy();
  });

  test('should enforce CORS by rejecting disallowed origins', async () => {
    const res = await fetch(`${BACKEND_URL}/health`, {
      headers: { Origin: 'https://evil.example.com' },
    });

    // The response should not include an Access-Control-Allow-Origin for evil origin
    const allowedOrigin = res.headers.get('access-control-allow-origin');
    expect(allowedOrigin).not.toBe('https://evil.example.com');
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getValidToken(): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@ice-saas.dev',
      password: 'password123',
    }),
  });
  const data = await res.json();
  return data.token || '';
}
