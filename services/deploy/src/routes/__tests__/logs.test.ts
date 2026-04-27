/**
 * HTTP tests for the Canvas Logs router (`/api/canvas/logs/...`).
 *
 * No supertest in the workspace, so we boot a tiny in-process Express app
 * on an ephemeral port and hit it with `fetch`. The LT-3 service module is
 * mocked at the module boundary so the router's job — body validation,
 * organisationId provenance, error envelope shape — is what we actually
 * exercise.
 *
 * The auth middleware (`requireAuth`, `requireProjectAccess`) is also
 * mocked: in real life desktop mode skips JWT and project-access checks
 * the membership table; here we install a deterministic auth shim so each
 * test can dial in the auth outcome it cares about.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks (must be hoisted before the router import) ──────────────────

const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();

vi.mock('../../services/log-stream.service.js', () => ({
  subscribe: (...args: unknown[]) => subscribeMock(...args),
  unsubscribe: (...args: unknown[]) => unsubscribeMock(...args),
}));

// Auth middleware shim: each test sets `currentAuth` to control the outcome.
type AuthMode = 'allow' | 'no-auth' | 'no-project-access' | 'no-org';
let currentAuth: AuthMode = 'allow';
let currentUserId = 'user-1';
let currentOrgId = 'org-real';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = currentUserId;
    req.organisationId = currentAuth === 'no-org' ? undefined : currentOrgId;
    next();
  },
  requireProjectAccess:
    (_role: string) =>
    (_req: any, res: any, next: any) => {
      if (currentAuth === 'no-project-access') {
        return res.status(403).json({ message: 'Insufficient project permissions' });
      }
      next();
    },
}));

// ── Test harness ──────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  currentAuth = 'allow';
  currentUserId = 'user-1';
  currentOrgId = 'org-real';

  // Suppress the router's console.error noise during expected error cases
  // so test output stays readable. We re-stub fresh per test.
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Import after mocks are set up — Vitest hoists `vi.mock` but the
  // router itself must be loaded once mocks are in place.
  const { default: logsRouter } = await import('../logs.js');
  const app = express();
  app.use(express.json());
  app.use('/api/canvas/logs', logsRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
});

// Helper to POST JSON.
async function post(path: string, body: unknown, headers?: Record<string, string>) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, raw: text };
}

const validSubscribeBody = {
  cardId: 'card-1',
  environmentId: 'env-1',
  terminalNodeId: 'log-1',
  mode: 'polling' as const,
};

// ── 1. Subscribe — happy path ─────────────────────────────────────────

describe('POST /api/canvas/logs/subscribe — happy path', () => {
  it('returns 200 with { subscriptionId, resolution } and forwards organisationId from auth', async () => {
    const expected = {
      subscriptionId: 'sub-abc',
      resolution: {
        state: 'resolved' as const,
        sourceNodeId: 'src-1',
        iceType: 'Compute.Container',
      },
    };
    subscribeMock.mockResolvedValue(expected);

    const res = await post('/api/canvas/logs/subscribe', validSubscribeBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expected);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith({
      cardId: 'card-1',
      environmentId: 'env-1',
      terminalNodeId: 'log-1',
      mode: 'polling',
      organisationId: 'org-real',
    });
  });
});

// ── 2. Subscribe — body validation ────────────────────────────────────

describe('POST /api/canvas/logs/subscribe — body validation', () => {
  it('returns 400 with details mentioning `mode` when mode is missing', async () => {
    const { mode: _omit, ...rest } = validSubscribeBody;
    const res = await post('/api/canvas/logs/subscribe', rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid request');
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.some((d: string) => d.includes('mode'))).toBe(true);
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('returns 400 with details listing valid modes when mode is invalid', async () => {
    const res = await post('/api/canvas/logs/subscribe', {
      ...validSubscribeBody,
      mode: 'streaming',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid request');
    const detail = res.body.details.find((d: string) => d.includes('mode')) as string | undefined;
    expect(detail).toBeDefined();
    expect(detail).toContain('polling');
    expect(detail).toContain('tail');
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('returns 400 when cardId is missing', async () => {
    const { cardId: _omit, ...rest } = validSubscribeBody;
    const res = await post('/api/canvas/logs/subscribe', rest);
    expect(res.status).toBe(400);
    expect(res.body.details.some((d: string) => d.includes('cardId'))).toBe(true);
  });
});

// ── 3. Subscribe — auth ────────────────────────────────────────────────

describe('POST /api/canvas/logs/subscribe — auth', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/canvas/logs/subscribe', validSubscribeBody);
    expect(res.status).toBe(401);
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await post('/api/canvas/logs/subscribe', validSubscribeBody);
    expect(res.status).toBe(403);
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});

// ── 4. Subscribe — service error ──────────────────────────────────────

describe('POST /api/canvas/logs/subscribe — service error', () => {
  it('returns 500 with `error: "internal"` when the service throws', async () => {
    subscribeMock.mockRejectedValue(new Error('SDK explosion: filter=resource.type="cloud_run_revision"'));

    const res = await post('/api/canvas/logs/subscribe', validSubscribeBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal');
    // The actual error message must NOT leak — it could carry a filter
    // string or a project id. The router substitutes a generic message.
    expect(JSON.stringify(res.body)).not.toContain('SDK explosion');
    expect(JSON.stringify(res.body)).not.toContain('cloud_run_revision');
  });
});

// ── 5. Subscribe — organisationId provenance ──────────────────────────

describe('POST /api/canvas/logs/subscribe — organisationId is auth-derived', () => {
  it('ignores any organisationId in the request body and uses req.organisationId', async () => {
    subscribeMock.mockResolvedValue({
      subscriptionId: 'sub-spoof',
      resolution: { state: 'resolved', sourceNodeId: 'src-1', iceType: 'Compute.Container' },
    });

    const res = await post('/api/canvas/logs/subscribe', {
      ...validSubscribeBody,
      organisationId: 'evil', // attacker-controlled
    });

    expect(res.status).toBe(200);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    const callArg = subscribeMock.mock.calls[0][0];
    // Spoofed value is dropped; auth-derived org wins.
    expect(callArg.organisationId).toBe('org-real');
    expect(callArg.organisationId).not.toBe('evil');
  });

  it('returns 400 with actionable detail when auth context is missing organisationId', async () => {
    currentAuth = 'no-org';
    const res = await post('/api/canvas/logs/subscribe', validSubscribeBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid request');
    expect(res.body.details.some((d: string) => d.toLowerCase().includes('organisationid'))).toBe(true);
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});

// ── 6. Unsubscribe — happy path ───────────────────────────────────────

describe('POST /api/canvas/logs/unsubscribe — happy path', () => {
  it('returns 204 with empty body and forwards subscriptionId to the service', async () => {
    unsubscribeMock.mockResolvedValue(undefined);

    const res = await post('/api/canvas/logs/unsubscribe', { subscriptionId: 'sub-abc' });

    expect(res.status).toBe(204);
    expect(res.raw).toBe('');
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeMock).toHaveBeenCalledWith('sub-abc');
  });
});

// ── 7. Unsubscribe — body validation ──────────────────────────────────

describe('POST /api/canvas/logs/unsubscribe — body validation', () => {
  it('returns 400 when subscriptionId is missing', async () => {
    const res = await post('/api/canvas/logs/unsubscribe', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid request');
    expect(res.body.details.some((d: string) => d.includes('subscriptionId'))).toBe(true);
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });

  it('returns 400 when subscriptionId is empty', async () => {
    const res = await post('/api/canvas/logs/unsubscribe', { subscriptionId: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid request');
  });
});

// ── 8. Unsubscribe — service errors ───────────────────────────────────

describe('POST /api/canvas/logs/unsubscribe — service error semantics', () => {
  it('returns 204 for an unknown subscriptionId (LT-3 contract: idempotent no-op)', async () => {
    // The LT-3 service quietly returns when the id isn't in its map. As long
    // as it doesn't throw, the route returns 204 — same as any successful
    // unsubscribe. This mirrors the contract described in
    // services/log-stream.service.ts unsubscribe() docstring.
    unsubscribeMock.mockResolvedValue(undefined);

    const res = await post('/api/canvas/logs/unsubscribe', { subscriptionId: 'never-existed' });

    expect(res.status).toBe(204);
    expect(unsubscribeMock).toHaveBeenCalledWith('never-existed');
  });

  it('returns 500 only when the service throws an unexpected error', async () => {
    unsubscribeMock.mockRejectedValue(new Error('timer cleanup blew up'));

    const res = await post('/api/canvas/logs/unsubscribe', { subscriptionId: 'sub-abc' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('internal');
    expect(JSON.stringify(res.body)).not.toContain('timer cleanup blew up');
  });
});
