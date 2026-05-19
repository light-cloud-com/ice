/**
 * HTTP tests for the Canvas Deploy router (`/api/canvas/deploy/...`).
 *
 * Same in-process Express + ephemeral-port + fetch pattern as logs.test.ts —
 * no supertest in the workspace. The downstream service modules are mocked at
 * the module boundary so what we exercise is the router's job: argument
 * threading from body/params/auth, body validation, error envelope shape,
 * and the few branches in /current and /stream that fall back across data
 * sources.
 */

import http from 'node:http';
import express from 'express';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';

// ── Mocks (must be hoisted before the router import) ──────────────────

const planDeploymentMock = vi.fn();
const applyDeploymentMock = vi.fn();
const destroyDeploymentMock = vi.fn();
const destroyAllForCardMock = vi.fn();
const requestDeployCancelMock = vi.fn();
const rollbackDeploymentMock = vi.fn();
const getDeploymentStatusMock = vi.fn();
const getDeployedResourcesMock = vi.fn();
const getCurrentDeploySnapshotMock = vi.fn();
const getDeploymentHistoryMock = vi.fn();
const getNodeDeploymentOverlayMock = vi.fn();
const checkDriftMock = vi.fn();

vi.mock('../../services/deploy.service', () => ({
  planDeployment: (...args: unknown[]) => planDeploymentMock(...args),
  applyDeployment: (...args: unknown[]) => applyDeploymentMock(...args),
  destroyDeployment: (...args: unknown[]) => destroyDeploymentMock(...args),
  destroyAllForCard: (...args: unknown[]) => destroyAllForCardMock(...args),
  requestDeployCancel: (...args: unknown[]) => requestDeployCancelMock(...args),
  rollbackDeployment: (...args: unknown[]) => rollbackDeploymentMock(...args),
  getDeploymentStatus: (...args: unknown[]) => getDeploymentStatusMock(...args),
  getDeployedResources: (...args: unknown[]) => getDeployedResourcesMock(...args),
  getCurrentDeploySnapshot: (...args: unknown[]) => getCurrentDeploySnapshotMock(...args),
  getDeploymentHistory: (...args: unknown[]) => getDeploymentHistoryMock(...args),
  getNodeDeploymentOverlay: (...args: unknown[]) => getNodeDeploymentOverlayMock(...args),
  checkDrift: (...args: unknown[]) => checkDriftMock(...args),
}));

const findLatestDeploymentIdMock = vi.fn();
const loadDeployEventsMock = vi.fn();

vi.mock('../../services/deploy-event-log', () => ({
  findLatestDeploymentId: (...args: unknown[]) => findLatestDeploymentIdMock(...args),
  loadDeployEvents: (...args: unknown[]) => loadDeployEventsMock(...args),
}));

const cleanupOrphansMock = vi.fn();

vi.mock('../../services/orphan-cleanup.service', () => ({
  cleanupOrphanedIceResources: (...args: unknown[]) => cleanupOrphansMock(...args),
}));

const resolveForCardMock = vi.fn();
const loadPersistedStatusesMock = vi.fn();

vi.mock('../../services/requirements.service', () => ({
  resolveForCard: (...args: unknown[]) => resolveForCardMock(...args),
  loadPersistedStatuses: (...args: unknown[]) => loadPersistedStatusesMock(...args),
}));

// Auth shim — controllable per test.
type AuthMode = 'allow' | 'no-auth' | 'no-project-access';
let currentAuth: AuthMode = 'allow';
let currentUserId: string | undefined = 'user-1';
let currentOrgId: string | undefined = 'org-real';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = currentUserId;
    req.organisationId = currentOrgId;
    next();
  },
  requireProjectAccess: (_role: string) => (_req: any, res: any, next: any) => {
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

  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: canvasDeployRouter } = await import('../canvas-deploy');
  const app = express();
  app.use(express.json());
  app.use('/api/canvas/deploy', canvasDeployRouter);

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

async function request(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any; raw: string }> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json, raw: text };
}

// ── Router-level auth ─────────────────────────────────────────────────

describe('router-level auth', () => {
  it('returns 401 when requireAuth rejects (no service called)', async () => {
    currentAuth = 'no-auth';
    const res = await request('POST', '/api/canvas/deploy/plan', { cardId: 'c1' });
    expect(res.status).toBe(401);
    expect(planDeploymentMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireProjectAccess rejects (no service called)', async () => {
    currentAuth = 'no-project-access';
    const res = await request('POST', '/api/canvas/deploy/plan', { cardId: 'c1' });
    expect(res.status).toBe(403);
    expect(planDeploymentMock).not.toHaveBeenCalled();
  });
});

// ── POST /plan ────────────────────────────────────────────────────────

describe('POST /api/canvas/deploy/plan', () => {
  const body = { cardId: 'c1', nodes: [{ id: 'n1' }], edges: [], options: { env: 'dev' } };

  it('returns 200 with the service result and forwards body fields + userId', async () => {
    planDeploymentMock.mockResolvedValue({ plan: 'ok', steps: 3 });
    const res = await request('POST', '/api/canvas/deploy/plan', body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ plan: 'ok', steps: 3 });
    expect(planDeploymentMock).toHaveBeenCalledWith('c1', [{ id: 'n1' }], [], { env: 'dev' }, 'user-1');
  });

  it('returns 500 with success=false envelope when the service throws', async () => {
    planDeploymentMock.mockRejectedValue(new Error('boom'));
    const res = await request('POST', '/api/canvas/deploy/plan', body);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'boom' });
  });
});

// ── POST /apply ───────────────────────────────────────────────────────

describe('POST /api/canvas/deploy/apply', () => {
  const body = { cardId: 'c1', nodes: [{ id: 'n1' }], edges: [{ from: 'a', to: 'b' }], options: { env: 'prod' } };

  it('returns 200 with the service result and forwards organisationId + userId from auth', async () => {
    applyDeploymentMock.mockResolvedValue({ applied: true, deploymentId: 'dep-1' });
    const res = await request('POST', '/api/canvas/deploy/apply', body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ applied: true, deploymentId: 'dep-1' });
    expect(applyDeploymentMock).toHaveBeenCalledWith(
      'c1',
      [{ id: 'n1' }],
      [{ from: 'a', to: 'b' }],
      { env: 'prod' },
      'org-real',
      'user-1',
    );
  });

  it('returns 500 when the service throws', async () => {
    applyDeploymentMock.mockRejectedValue(new Error('apply failed'));
    const res = await request('POST', '/api/canvas/deploy/apply', body);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'apply failed' });
  });
});

// ── POST /destroy ─────────────────────────────────────────────────────

describe('POST /api/canvas/deploy/destroy', () => {
  it('returns 200 with the service result and forwards cardId + auth context', async () => {
    destroyDeploymentMock.mockResolvedValue({ destroyed: true });
    const res = await request('POST', '/api/canvas/deploy/destroy', { cardId: 'c1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ destroyed: true });
    expect(destroyDeploymentMock).toHaveBeenCalledWith('c1', 'org-real', 'user-1');
  });

  it('returns 400 (not 500) with success=false when the service throws', async () => {
    destroyDeploymentMock.mockRejectedValue(new Error('still attached'));
    const res = await request('POST', '/api/canvas/deploy/destroy', { cardId: 'c1' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'still attached' });
  });
});

// ── POST /destroy-all ─────────────────────────────────────────────────

describe('POST /api/canvas/deploy/destroy-all', () => {
  it('returns 200 with the service result, forwarding gcpProject through options', async () => {
    destroyAllForCardMock.mockResolvedValue({ purged: 7 });
    const res = await request('POST', '/api/canvas/deploy/destroy-all', { cardId: 'c1', gcpProject: 'p1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ purged: 7 });
    expect(destroyAllForCardMock).toHaveBeenCalledWith('c1', 'org-real', 'user-1', { gcpProject: 'p1' });
  });

  it('returns 400 with success=false and details mentioning cardId when cardId is missing', async () => {
    const res = await request('POST', '/api/canvas/deploy/destroy-all', { gcpProject: 'p1' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'cardId required' });
    expect(destroyAllForCardMock).not.toHaveBeenCalled();
  });

  it('returns 400 with success=false when the service throws', async () => {
    destroyAllForCardMock.mockRejectedValue(new Error('quota'));
    const res = await request('POST', '/api/canvas/deploy/destroy-all', { cardId: 'c1' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'quota' });
  });
});

// ── POST /cleanup-orphans ─────────────────────────────────────────────

describe('POST /api/canvas/deploy/cleanup-orphans', () => {
  it('returns 200 with { success: true, report } and uses dryRun=false by default', async () => {
    cleanupOrphansMock.mockResolvedValue({ deleted: ['x', 'y'], skipped: [] });
    const res = await request('POST', '/api/canvas/deploy/cleanup-orphans', { gcpProject: 'p1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, report: { deleted: ['x', 'y'], skipped: [] } });
    expect(cleanupOrphansMock).toHaveBeenCalledWith('org-real', 'p1', { dryRun: false });
  });

  it('treats dry_run=1 query param as dryRun=true', async () => {
    cleanupOrphansMock.mockResolvedValue({ deleted: [], skipped: [] });
    const res = await request('POST', '/api/canvas/deploy/cleanup-orphans?dry_run=1', {});
    expect(res.status).toBe(200);
    expect(cleanupOrphansMock).toHaveBeenCalledWith('org-real', undefined, { dryRun: true });
  });

  it('treats dryRun=true in the body as dryRun=true', async () => {
    cleanupOrphansMock.mockResolvedValue({ deleted: [], skipped: [] });
    const res = await request('POST', '/api/canvas/deploy/cleanup-orphans', { dryRun: true });
    expect(res.status).toBe(200);
    expect(cleanupOrphansMock).toHaveBeenCalledWith('org-real', undefined, { dryRun: true });
  });

  it('returns 400 with a re-login hint when organisationId is missing', async () => {
    currentOrgId = undefined;
    const res = await request('POST', '/api/canvas/deploy/cleanup-orphans', {});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/re-login/i);
    expect(cleanupOrphansMock).not.toHaveBeenCalled();
  });

  it('returns 400 with a re-login hint when the request has no body at all', async () => {
    // Exercises the `req.body?.gcpProject` short-circuit — fetch with no
    // Content-Type leaves req.body as `{}` from express.json(); to hit the
    // optional-chaining defense we deliberately make organisationId missing.
    currentOrgId = undefined;
    const res = await fetch(`${baseUrl}/api/canvas/deploy/cleanup-orphans`, { method: 'POST' });
    expect(res.status).toBe(400);
  });

  it('returns 500 when the cleanup service throws', async () => {
    cleanupOrphansMock.mockRejectedValue(new Error('SDK boom'));
    const res = await request('POST', '/api/canvas/deploy/cleanup-orphans', {});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'SDK boom' });
  });
});

// ── POST /cancel ──────────────────────────────────────────────────────

describe('POST /api/canvas/deploy/cancel', () => {
  it('returns 200 with { success: true, cancelled } and forwards cardId', async () => {
    requestDeployCancelMock.mockReturnValue(true);
    const res = await request('POST', '/api/canvas/deploy/cancel', { cardId: 'c1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, cancelled: true });
    expect(requestDeployCancelMock).toHaveBeenCalledWith('c1');
  });

  it('returns { cancelled: false } when no deploy is in flight', async () => {
    requestDeployCancelMock.mockReturnValue(false);
    const res = await request('POST', '/api/canvas/deploy/cancel', { cardId: 'c1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, cancelled: false });
  });

  it('returns 400 when cardId is missing', async () => {
    const res = await request('POST', '/api/canvas/deploy/cancel', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'cardId is required' });
    expect(requestDeployCancelMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the service throws', async () => {
    requestDeployCancelMock.mockImplementation(() => {
      throw new Error('cancel boom');
    });
    const res = await request('POST', '/api/canvas/deploy/cancel', { cardId: 'c1' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'cancel boom' });
  });
});

// ── POST /rollback ────────────────────────────────────────────────────

describe('POST /api/canvas/deploy/rollback', () => {
  it('returns 200 with the service result and forwards both ids + auth context', async () => {
    rollbackDeploymentMock.mockResolvedValue({ rolledBack: true });
    const res = await request('POST', '/api/canvas/deploy/rollback', { deploymentId: 'd1', cardId: 'c1' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rolledBack: true });
    expect(rollbackDeploymentMock).toHaveBeenCalledWith('d1', 'c1', 'org-real', 'user-1');
  });

  it('returns 400 when deploymentId is missing', async () => {
    const res = await request('POST', '/api/canvas/deploy/rollback', { cardId: 'c1' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'deploymentId and cardId are required' });
    expect(rollbackDeploymentMock).not.toHaveBeenCalled();
  });

  it('returns 400 when cardId is missing', async () => {
    const res = await request('POST', '/api/canvas/deploy/rollback', { deploymentId: 'd1' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'deploymentId and cardId are required' });
  });

  it('returns 500 when the service throws', async () => {
    rollbackDeploymentMock.mockRejectedValue(new Error('rollback failed'));
    const res = await request('POST', '/api/canvas/deploy/rollback', { deploymentId: 'd1', cardId: 'c1' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'rollback failed' });
  });
});

// ── GET /status/:deploymentId ─────────────────────────────────────────

describe('GET /api/canvas/deploy/status/:deploymentId', () => {
  it('returns 200 with the deployment when found', async () => {
    getDeploymentStatusMock.mockResolvedValue({ id: 'd1', status: 'deploying' });
    const res = await request('GET', '/api/canvas/deploy/status/d1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'd1', status: 'deploying' });
    expect(getDeploymentStatusMock).toHaveBeenCalledWith('d1');
  });

  it('returns 404 with a message when the deployment is missing', async () => {
    getDeploymentStatusMock.mockResolvedValue(null);
    const res = await request('GET', '/api/canvas/deploy/status/missing');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Deployment not found' });
  });
});

// ── POST /requirements ────────────────────────────────────────────────

describe('POST /api/canvas/deploy/requirements', () => {
  const body = { cardId: 'c1', nodes: [{ id: 'n1' }], options: { environment: 'staging', gcpProject: 'p1' } };

  it('returns 200 with success=true spread with the service result', async () => {
    resolveForCardMock.mockResolvedValue({ requirements: [], statuses: {} });
    const res = await request('POST', '/api/canvas/deploy/requirements', body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, requirements: [], statuses: {} });
    expect(resolveForCardMock).toHaveBeenCalledWith({
      cardId: 'c1',
      nodes: [{ id: 'n1' }],
      environment: 'staging',
      orgId: 'org-real',
      gcpProject: 'p1',
    });
  });

  it('defaults environment to "development" when options.environment is missing', async () => {
    resolveForCardMock.mockResolvedValue({ requirements: [] });
    const res = await request('POST', '/api/canvas/deploy/requirements', { cardId: 'c1', nodes: [] });
    expect(res.status).toBe(200);
    expect(resolveForCardMock).toHaveBeenCalledWith({
      cardId: 'c1',
      nodes: [],
      environment: 'development',
      orgId: 'org-real',
      gcpProject: undefined,
    });
  });

  it('returns 400 with details mentioning cardId/nodes when cardId is missing', async () => {
    const res = await request('POST', '/api/canvas/deploy/requirements', { nodes: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'cardId and nodes are required' });
    expect(resolveForCardMock).not.toHaveBeenCalled();
  });

  it('returns 400 when nodes is missing', async () => {
    const res = await request('POST', '/api/canvas/deploy/requirements', { cardId: 'c1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cardId and nodes/);
  });

  it('returns 500 when the resolver throws', async () => {
    resolveForCardMock.mockRejectedValue(new Error('resolve boom'));
    const res = await request('POST', '/api/canvas/deploy/requirements', body);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'resolve boom' });
  });
});

// ── GET /requirements/:cardId ─────────────────────────────────────────

describe('GET /api/canvas/deploy/requirements/:cardId', () => {
  it('returns 200 with persisted statuses, defaulting environment to "development"', async () => {
    loadPersistedStatusesMock.mockResolvedValue([{ id: 'r1', state: 'ok' }]);
    const res = await request('GET', '/api/canvas/deploy/requirements/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, persisted: [{ id: 'r1', state: 'ok' }] });
    expect(loadPersistedStatusesMock).toHaveBeenCalledWith('c1', 'development');
  });

  it('forwards the environment query param when provided', async () => {
    loadPersistedStatusesMock.mockResolvedValue([]);
    const res = await request('GET', '/api/canvas/deploy/requirements/c1?environment=prod');
    expect(res.status).toBe(200);
    expect(loadPersistedStatusesMock).toHaveBeenCalledWith('c1', 'prod');
  });

  it('returns 500 when the loader throws', async () => {
    loadPersistedStatusesMock.mockRejectedValue(new Error('load boom'));
    const res = await request('GET', '/api/canvas/deploy/requirements/c1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'load boom' });
  });
});

// ── POST /drift-check ─────────────────────────────────────────────────

describe('POST /api/canvas/deploy/drift-check', () => {
  it('returns 200 with success=true spread with the service result', async () => {
    checkDriftMock.mockResolvedValue({ drift: false });
    const res = await request('POST', '/api/canvas/deploy/drift-check', {
      cardId: 'c1',
      nodes: [{ id: 'n1' }],
      environment: 'prod',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, drift: false });
    expect(checkDriftMock).toHaveBeenCalledWith('c1', [{ id: 'n1' }], { environment: 'prod', orgId: 'org-real' });
  });

  it('defaults environment to "development" when omitted', async () => {
    checkDriftMock.mockResolvedValue({ drift: true });
    await request('POST', '/api/canvas/deploy/drift-check', { cardId: 'c1', nodes: [] });
    expect(checkDriftMock).toHaveBeenCalledWith('c1', [], { environment: 'development', orgId: 'org-real' });
  });

  it('returns 400 when cardId is missing', async () => {
    const res = await request('POST', '/api/canvas/deploy/drift-check', { nodes: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'cardId and nodes are required' });
  });

  it('returns 400 when nodes is missing', async () => {
    const res = await request('POST', '/api/canvas/deploy/drift-check', { cardId: 'c1' });
    expect(res.status).toBe(400);
  });

  it('returns 500 when checkDrift throws', async () => {
    checkDriftMock.mockRejectedValue(new Error('drift boom'));
    const res = await request('POST', '/api/canvas/deploy/drift-check', { cardId: 'c1', nodes: [] });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'drift boom' });
  });
});

// ── GET /resources/:cardId ────────────────────────────────────────────

describe('GET /api/canvas/deploy/resources/:cardId', () => {
  it('returns 200 with the resource list', async () => {
    getDeployedResourcesMock.mockResolvedValue([{ id: 'r1' }]);
    const res = await request('GET', '/api/canvas/deploy/resources/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, resources: [{ id: 'r1' }] });
    expect(getDeployedResourcesMock).toHaveBeenCalledWith('c1');
  });
});

// ── GET /current/:cardId ──────────────────────────────────────────────

describe('GET /api/canvas/deploy/current/:cardId', () => {
  it('returns the in-memory snapshot when present (skips history lookup)', async () => {
    getCurrentDeploySnapshotMock.mockReturnValue({ status: 'deploying', deploymentId: 'd1' });
    const res = await request('GET', '/api/canvas/deploy/current/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, snapshot: { status: 'deploying', deploymentId: 'd1' } });
    expect(getDeploymentHistoryMock).not.toHaveBeenCalled();
  });

  it('falls back to the persisted snapshot column when an active row carries one', async () => {
    getCurrentDeploySnapshotMock.mockReturnValue(null);
    getDeploymentHistoryMock.mockResolvedValue([
      {
        id: 'd1',
        status: 'deploying',
        snapshot: { from: 'persisted-column', nodes: 3 },
        created_at: 'a',
        updated_at: 'b',
      },
    ]);
    const res = await request('GET', '/api/canvas/deploy/current/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, snapshot: { from: 'persisted-column', nodes: 3 } });
    expect(getDeploymentHistoryMock).toHaveBeenCalledWith('c1', { limit: 10 });
  });

  it('reconstructs a synthetic snapshot from plain columns when persisted snapshot is absent', async () => {
    getCurrentDeploySnapshotMock.mockReturnValue(null);
    getDeploymentHistoryMock.mockResolvedValue([
      { id: 'd2', status: 'planning', snapshot: null, created_at: 'C1', updated_at: 'U1' },
    ]);
    const res = await request('GET', '/api/canvas/deploy/current/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      snapshot: {
        cardId: 'c1',
        status: 'planning',
        deploymentId: 'd2',
        startedAt: 'C1',
        updatedAt: 'U1',
        nodeStatuses: {},
      },
    });
  });

  it('returns { snapshot: null } when no in-memory snapshot and no active row', async () => {
    getCurrentDeploySnapshotMock.mockReturnValue(null);
    getDeploymentHistoryMock.mockResolvedValue([
      { id: 'd9', status: 'success', snapshot: null, created_at: 'a', updated_at: 'b' },
    ]);
    const res = await request('GET', '/api/canvas/deploy/current/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, snapshot: null });
  });

  it('swallows history-lookup errors and returns { snapshot: null }', async () => {
    getCurrentDeploySnapshotMock.mockReturnValue(null);
    getDeploymentHistoryMock.mockRejectedValue(new Error('db died'));
    const res = await request('GET', '/api/canvas/deploy/current/c1');
    // The empty-catch around getDeploymentHistory means the route still
    // resolves with the null-snapshot fallback rather than 500ing.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, snapshot: null });
  });
});

// ── GET /stream/:cardId ───────────────────────────────────────────────

describe('GET /api/canvas/deploy/stream/:cardId', () => {
  it('returns an empty replay envelope when no deployment is found', async () => {
    findLatestDeploymentIdMock.mockResolvedValue(null);
    const res = await request('GET', '/api/canvas/deploy/stream/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, events: [], latestSeq: 0, deploymentId: null });
    expect(loadDeployEventsMock).not.toHaveBeenCalled();
  });

  it('uses an explicit deployment_id and forwards `since` defaulting to 0', async () => {
    loadDeployEventsMock.mockResolvedValue({ events: [{ seq: 5, type: 'plan' }], latestSeq: 5 });
    getDeploymentStatusMock.mockResolvedValue({ id: 'd-explicit' });
    const res = await request('GET', '/api/canvas/deploy/stream/c1?deployment_id=d-explicit');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      deploymentId: 'd-explicit',
      events: [{ seq: 5, type: 'plan' }],
      latestSeq: 5,
      isPruned: false,
    });
    expect(findLatestDeploymentIdMock).not.toHaveBeenCalled();
    expect(loadDeployEventsMock).toHaveBeenCalledWith('d-explicit', 0);
  });

  it('parses the `since` query param as a number', async () => {
    findLatestDeploymentIdMock.mockResolvedValue('d-latest');
    loadDeployEventsMock.mockResolvedValue({ events: [], latestSeq: 12 });
    getDeploymentStatusMock.mockResolvedValue({ id: 'd-latest' });
    await request('GET', '/api/canvas/deploy/stream/c1?since=7');
    expect(loadDeployEventsMock).toHaveBeenCalledWith('d-latest', 7);
  });

  it('coerces a non-numeric `since` to 0', async () => {
    findLatestDeploymentIdMock.mockResolvedValue('d-latest');
    loadDeployEventsMock.mockResolvedValue({ events: [], latestSeq: 0 });
    getDeploymentStatusMock.mockResolvedValue({ id: 'd-latest' });
    await request('GET', '/api/canvas/deploy/stream/c1?since=not-a-number');
    expect(loadDeployEventsMock).toHaveBeenCalledWith('d-latest', 0);
  });

  it('marks isPruned=true when the deployment row is gone and events are empty', async () => {
    findLatestDeploymentIdMock.mockResolvedValue('d-pruned');
    loadDeployEventsMock.mockResolvedValue({ events: [], latestSeq: 0 });
    getDeploymentStatusMock.mockResolvedValue(null);
    const res = await request('GET', '/api/canvas/deploy/stream/c1');
    expect(res.body.isPruned).toBe(true);
  });

  it('marks isPruned=false when events exist even if the deployment row is gone', async () => {
    findLatestDeploymentIdMock.mockResolvedValue('d-partial');
    loadDeployEventsMock.mockResolvedValue({ events: [{ seq: 1 }], latestSeq: 1 });
    getDeploymentStatusMock.mockResolvedValue(null);
    const res = await request('GET', '/api/canvas/deploy/stream/c1');
    expect(res.body.isPruned).toBe(false);
  });

  it('returns 500 when findLatestDeploymentId throws', async () => {
    findLatestDeploymentIdMock.mockRejectedValue(new Error('lookup boom'));
    const res = await request('GET', '/api/canvas/deploy/stream/c1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'lookup boom' });
  });
});

// ── GET /node-outputs/:cardId ─────────────────────────────────────────

describe('GET /api/canvas/deploy/node-outputs/:cardId', () => {
  it('returns 200 with the overlay, defaulting environment to "development"', async () => {
    getNodeDeploymentOverlayMock.mockResolvedValue({ n1: { url: 'https://x' } });
    const res = await request('GET', '/api/canvas/deploy/node-outputs/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, overlay: { n1: { url: 'https://x' } } });
    expect(getNodeDeploymentOverlayMock).toHaveBeenCalledWith('c1', 'development');
  });

  it('forwards the environment query param', async () => {
    getNodeDeploymentOverlayMock.mockResolvedValue({});
    await request('GET', '/api/canvas/deploy/node-outputs/c1?environment=prod');
    expect(getNodeDeploymentOverlayMock).toHaveBeenCalledWith('c1', 'prod');
  });

  it('returns 500 when overlay fetch throws', async () => {
    getNodeDeploymentOverlayMock.mockRejectedValue(new Error('overlay boom'));
    const res = await request('GET', '/api/canvas/deploy/node-outputs/c1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'overlay boom' });
  });
});

// ── GET /history/:cardId ──────────────────────────────────────────────

describe('GET /api/canvas/deploy/history/:cardId', () => {
  it('returns 200 with the raw deployments list (no envelope)', async () => {
    getDeploymentHistoryMock.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);
    const res = await request('GET', '/api/canvas/deploy/history/c1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'd1' }, { id: 'd2' }]);
    expect(getDeploymentHistoryMock).toHaveBeenCalledWith('c1', {
      environment: undefined,
      actionType: undefined,
      limit: undefined,
    });
  });

  it('forwards a recognised action_type', async () => {
    getDeploymentHistoryMock.mockResolvedValue([]);
    await request('GET', '/api/canvas/deploy/history/c1?action_type=apply');
    expect(getDeploymentHistoryMock).toHaveBeenCalledWith('c1', {
      environment: undefined,
      actionType: 'apply',
      limit: undefined,
    });
  });

  it.each([['plan'], ['destroy'], ['rollback']])('forwards action_type=%s', async (actionType) => {
    getDeploymentHistoryMock.mockResolvedValue([]);
    await request('GET', `/api/canvas/deploy/history/c1?action_type=${actionType}`);
    expect(getDeploymentHistoryMock).toHaveBeenCalledWith('c1', expect.objectContaining({ actionType }));
  });

  it('drops an unrecognised action_type rather than forwarding it', async () => {
    getDeploymentHistoryMock.mockResolvedValue([]);
    await request('GET', '/api/canvas/deploy/history/c1?action_type=garbage');
    expect(getDeploymentHistoryMock).toHaveBeenCalledWith('c1', expect.objectContaining({ actionType: undefined }));
  });

  it('forwards the environment query param', async () => {
    getDeploymentHistoryMock.mockResolvedValue([]);
    await request('GET', '/api/canvas/deploy/history/c1?environment=staging');
    expect(getDeploymentHistoryMock).toHaveBeenCalledWith('c1', expect.objectContaining({ environment: 'staging' }));
  });

  it('parses the limit query param as a number', async () => {
    getDeploymentHistoryMock.mockResolvedValue([]);
    await request('GET', '/api/canvas/deploy/history/c1?limit=25');
    expect(getDeploymentHistoryMock).toHaveBeenCalledWith('c1', expect.objectContaining({ limit: 25 }));
  });
});
