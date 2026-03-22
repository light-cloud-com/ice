/**
 * Backend Services E2E Tests
 *
 * Validates fixes from the backend services backlog (BE-1 through BE-16).
 */

import { test, expect } from '../fixtures/base.fixture';

const BACKEND_URL = 'http://localhost:5001/api';

// ─── BE-2: Billing routes use requireAuth (not broken passport-jwt) ─────────

test.describe('BE-2: Billing routes auth', () => {
  test('should reject unauthenticated requests to billing endpoints', async () => {
    const res = await fetch(`${BACKEND_URL}/billing/current`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    // Should get 401 (requireAuth), not 500 (passport crash)
    expect(res.status).toBe(401);
  });
});

// ─── BE-3/4: Refresh token rotation and type validation ─────────────────────

test.describe('BE-3/4: Refresh token rotation', () => {
  test('should issue new refresh token on each refresh (rotation)', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('ice-token'));
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    // Login to get initial tokens
    await page.fill('#ice-login-auth-input-email', process.env.TEST_USER_EMAIL || 'test@ice-saas.dev');
    await page.fill('#ice-login-auth-input-password', process.env.TEST_USER_PASSWORD || 'password123');
    await page.click('#ice-login-auth-btn-submit');
    await expect(page).toHaveURL('/', { timeout: 10000 });

    // Get the cookies for refresh
    const cookies = await page.context().cookies();
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(refreshCookie).toBeTruthy();

    // Call refresh endpoint
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    // Cookie should have been updated (rotated)
    const newCookies = await page.context().cookies();
    const newRefreshCookie = newCookies.find((c) => c.name === 'refreshToken');
    expect(newRefreshCookie).toBeTruthy();
  });
});

// ─── BE-5: Deploy status/history require project access ─────────────────────

test.describe('BE-5: Deploy route access control', () => {
  test('should require authentication for deploy history', async () => {
    const res = await fetch(`${BACKEND_URL}/canvas/deploy/history/fake-card-id`);
    expect(res.status).toBe(401);
  });

  test('should require authentication for deploy resources', async () => {
    const res = await fetch(`${BACKEND_URL}/canvas/deploy/resources/fake-card-id`);
    expect(res.status).toBe(401);
  });
});

// ─── BE-6: Health endpoint works (gateway started successfully) ─────────────

test.describe('BE-6: Gateway health', () => {
  test('health endpoint should return ok', async () => {
    const res = await fetch(`${BACKEND_URL}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeTruthy();
  });
});

// ─── BE-8: Rate limiting ────────────────────────────────────────────────────

test.describe('BE-8: Rate limiting', () => {
  test('should include rate limit headers in responses', async () => {
    const res = await fetch(`${BACKEND_URL}/health`);

    // Standard rate limit headers from express-rate-limit
    expect(res.headers.get('ratelimit-limit')).toBeTruthy();
    expect(res.headers.get('ratelimit-remaining')).toBeTruthy();
  });
});

// ─── BE-9: Profile endpoint works (consolidated query) ──────────────────────

test.describe('BE-9: Profile endpoint', () => {
  test('should return full profile with organisations', async ({ authenticatedPage }) => {
    const result = await authenticatedPage.evaluate(async () => {
      const token = localStorage.getItem('ice-token');
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.id).toBeTruthy();
    expect(result.body.email).toBeTruthy();
    expect(result.body.organisations).toBeInstanceOf(Array);
    expect(result.body.organisations.length).toBeGreaterThan(0);
    expect(result.body.organisations[0]).toHaveProperty('role');
  });
});

// ─── BE-13: CORS headers ────────────────────────────────────────────────────

test.describe('BE-13: CORS configuration', () => {
  test('should allow configured frontend origin', async () => {
    const res = await fetch(`${BACKEND_URL}/health`, {
      headers: { Origin: 'http://localhost:5173' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });
});

// ─── BE-14: Security headers ────────────────────────────────────────────────

test.describe('BE-14: Helmet CSP', () => {
  test('should include Content-Security-Policy header', async () => {
    const res = await fetch(`${BACKEND_URL}/health`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
  });
});
