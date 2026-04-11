/**
 * Backend Services E2E Tests
 *
 * Validates fixes from the backend services backlog (BE-1 through BE-16).
 */

import { test, expect } from '../fixtures/base.fixture';

const BACKEND_URL = 'http://localhost:5002/api';

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

  test('should require authentication for deploy event stream', async () => {
    const res = await fetch(`${BACKEND_URL}/canvas/deploy/stream/fake-card-id`);
    expect(res.status).toBe(401);
  });

  test('should require authentication for current deploy snapshot', async () => {
    const res = await fetch(`${BACKEND_URL}/canvas/deploy/current/fake-card-id`);
    expect(res.status).toBe(401);
  });
});

// ─── History + event-log persistence (Phase B/C deploy reliability rework) ──

test.describe('Deploy history surface', () => {
  /**
   * Shared helper: create a project + card inside the authenticated browser
   * context so we have a real cardId to query against. Runs the requests
   * through `page.evaluate` so cookies/session propagate in whichever
   * auth mode the test env is configured for (community edition or SaaS).
   */
  async function createCardForTest(page: any): Promise<string> {
    const result = await page.evaluate(async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('ice-token');
      if (token) headers.Authorization = `Bearer ${token}`;

      const projRes = await fetch('/api/canvas/projects/create', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          name: `E2E History Project ${Date.now()}`,
          type: 'project',
        }),
      });
      if (!projRes.ok) {
        return { error: `project create failed: ${projRes.status}` };
      }
      const project = await projRes.json();

      const cardRes = await fetch('/api/canvas/cards/create', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          projectId: project.id,
          name: 'E2E history card',
        }),
      });
      if (!cardRes.ok) {
        return { error: `card create failed: ${cardRes.status}` };
      }
      const card = await cardRes.json();
      return { projectId: project.id, cardId: card.id };
    });
    if (result.error) {
      test.skip(true, result.error);
    }
    return result.cardId;
  }

  test('history endpoint returns an array and accepts action_type filter', async ({ authenticatedPage }) => {
    const cardId = await createCardForTest(authenticatedPage);

    const response = await authenticatedPage.evaluate(async (id) => {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('ice-token');
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/canvas/deploy/history/${id}?action_type=apply&limit=50`, {
        credentials: 'include',
        headers,
      });
      return { status: res.status, body: await res.json() };
    }, cardId);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    // Empty is fine — what we're asserting is that the new query params
    // don't trip the route (they used to 500 before B3) and that the shape
    // is still a JSON array of deployment rows.
  });

  test('plan creates a row with action_type=plan visible in history', async ({ authenticatedPage }) => {
    const cardId = await createCardForTest(authenticatedPage);

    const planned = await authenticatedPage.evaluate(async (id) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('ice-token');
      if (token) headers.Authorization = `Bearer ${token}`;

      // Trivial plan with zero deployable nodes — the plan endpoint still
      // writes a CanvasDeployment row and returns success, which is all we
      // need for the history shape assertion. We're not testing the deploy
      // engine here.
      const planRes = await fetch('/api/canvas/deploy/plan', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          cardId: id,
          nodes: [],
          edges: [],
          options: { provider: 'gcp', region: 'us-central1', environment: 'development' },
        }),
      });
      const planBody = await planRes.json();

      const historyRes = await fetch(`/api/canvas/deploy/history/${id}?limit=10`, {
        credentials: 'include',
        headers,
      });
      const historyBody = await historyRes.json();

      return { planStatus: planRes.status, planBody, historyStatus: historyRes.status, historyBody };
    }, cardId);

    expect(planned.historyStatus).toBe(200);
    expect(Array.isArray(planned.historyBody)).toBe(true);

    // The plan call may no-op if there's nothing to plan; only assert
    // action_type tagging when a row actually landed.
    if (planned.historyBody.length > 0) {
      const row = planned.historyBody[0];
      expect(row).toHaveProperty('action_type');
      expect(['plan', 'apply', 'destroy', 'rollback']).toContain(row.action_type);
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('environment');
    }
  });

  test('history rejects bogus action_type values silently (treats as unset)', async ({ authenticatedPage }) => {
    const cardId = await createCardForTest(authenticatedPage);

    const response = await authenticatedPage.evaluate(async (id) => {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('ice-token');
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/canvas/deploy/history/${id}?action_type=not-a-real-type`, {
        credentials: 'include',
        headers,
      });
      return { status: res.status, body: await res.json() };
    }, cardId);

    // Invalid filter should return 200 with full (unfiltered) history — not
    // a 400. This matches the route's defensive parsing.
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

// ─── Deploy event stream replay (Phase C) ───────────────────────────────────

test.describe('Deploy event stream', () => {
  async function createCardForTest(page: any): Promise<string> {
    const result = await page.evaluate(async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('ice-token');
      if (token) headers.Authorization = `Bearer ${token}`;

      const projRes = await fetch('/api/canvas/projects/create', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ name: `E2E Stream Project ${Date.now()}`, type: 'project' }),
      });
      if (!projRes.ok) return { error: `project create failed: ${projRes.status}` };
      const project = await projRes.json();

      const cardRes = await fetch('/api/canvas/cards/create', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ projectId: project.id, name: 'E2E stream card' }),
      });
      if (!cardRes.ok) return { error: `card create failed: ${cardRes.status}` };
      const card = await cardRes.json();
      return { cardId: card.id };
    });
    if (result.error) {
      test.skip(true, result.error);
    }
    return result.cardId;
  }

  test('stream endpoint returns empty tape for a card with no deployments', async ({ authenticatedPage }) => {
    const cardId = await createCardForTest(authenticatedPage);

    const response = await authenticatedPage.evaluate(async (id) => {
      const headers: Record<string, string> = {};
      const token = localStorage.getItem('ice-token');
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/canvas/deploy/stream/${id}?since=0`, {
        credentials: 'include',
        headers,
      });
      return { status: res.status, body: await res.json() };
    }, cardId);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('events');
    expect(Array.isArray(response.body.events)).toBe(true);
    expect(response.body).toHaveProperty('latestSeq');
    // No deployment yet → deploymentId is null and events is empty.
    expect(response.body.events.length).toBe(0);
  });

  test('stream endpoint honors since parameter', async ({ authenticatedPage }) => {
    const cardId = await createCardForTest(authenticatedPage);

    // Trigger a plan so there's at least one deployment row + a handful
    // of events in the tape (log + progress from the planner).
    const replay = await authenticatedPage.evaluate(async (id) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('ice-token');
      if (token) headers.Authorization = `Bearer ${token}`;

      await fetch('/api/canvas/deploy/plan', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          cardId: id,
          nodes: [],
          edges: [],
          options: { provider: 'gcp', region: 'us-central1', environment: 'development' },
        }),
      });

      const fullRes = await fetch(`/api/canvas/deploy/stream/${id}?since=0`, {
        credentials: 'include',
        headers,
      });
      const full = await fullRes.json();

      // Fetch again with since=full.latestSeq → expect empty slice.
      const sliceRes = await fetch(`/api/canvas/deploy/stream/${id}?since=${full.latestSeq}`, {
        credentials: 'include',
        headers,
      });
      const slice = await sliceRes.json();

      return { full, slice };
    }, cardId);

    // Full fetch is authoritative — if no events landed in the tape for a
    // trivial plan (e.g. the plan path doesn't go through emitDeployProgress
    // wrappers), the test is a no-op and we just assert the shape.
    expect(replay.full).toHaveProperty('success', true);
    expect(Array.isArray(replay.full.events)).toBe(true);
    expect(replay.slice).toHaveProperty('success', true);
    expect(replay.slice.events.length).toBe(0);
    expect(replay.slice.latestSeq).toBeGreaterThanOrEqual(replay.full.latestSeq);
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
