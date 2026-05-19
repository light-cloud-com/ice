/**
 * HTTP tests for the Environment router (`/api/environments/...`).
 *
 * In-process Express + ephemeral port + global fetch (no supertest in
 * the workspace). The environment service module is mocked at the
 * boundary so the router's job — body validation, error envelope shape,
 * forwarding the right service args — is what we exercise. The auth
 * middleware (`requireAuth`, `requireProjectAccess`) is mocked too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks (must be hoisted before the router import) ──────────────────

const listEnvsMock = vi.fn();
const createEnvMock = vi.fn();
const updateEnvMock = vi.fn();
const deleteEnvMock = vi.fn();
const compareEnvsMock = vi.fn();
const promoteEnvMock = vi.fn();
const togglePrPreviewsMock = vi.fn();

vi.mock('../../services/environment.service', () => ({
  listEnvironments: (...args: unknown[]) => listEnvsMock(...args),
  createEnvironment: (...args: unknown[]) => createEnvMock(...args),
  updateEnvironment: (...args: unknown[]) => updateEnvMock(...args),
  deleteEnvironment: (...args: unknown[]) => deleteEnvMock(...args),
  compareEnvironments: (...args: unknown[]) => compareEnvsMock(...args),
  promoteEnvironment: (...args: unknown[]) => promoteEnvMock(...args),
  togglePrPreviews: (...args: unknown[]) => togglePrPreviewsMock(...args),
}));

type AuthMode = 'allow' | 'no-auth' | 'no-project-access';
let currentAuth: AuthMode = 'allow';
let currentUserId = 'user-1';
let currentOrgId = 'org-real';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = currentUserId;
    req.organisationId = currentOrgId;
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

  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: envRouter } = await import('../environment');
  const app = express();
  app.use(express.json());
  app.use('/api/environments', envRouter);

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

// ── 1. POST /list ─────────────────────────────────────────────────────

describe('POST /api/environments/list', () => {
  it('returns environments for the project', async () => {
    listEnvsMock.mockResolvedValue([{ id: 'e1', name: 'production' }]);

    const res = await post('/api/environments/list', { projectId: 'p1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, environments: [{ id: 'e1', name: 'production' }] });
    expect(listEnvsMock).toHaveBeenCalledWith('p1');
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await post('/api/environments/list', {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'projectId required' });
    expect(listEnvsMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the service throws', async () => {
    listEnvsMock.mockRejectedValue(new Error('db down'));

    const res = await post('/api/environments/list', { projectId: 'p1' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'db down' });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/environments/list', { projectId: 'p1' });
    expect(res.status).toBe(401);
    expect(listEnvsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await post('/api/environments/list', { projectId: 'p1' });
    expect(res.status).toBe(403);
    expect(listEnvsMock).not.toHaveBeenCalled();
  });
});

// ── 2. POST /create ───────────────────────────────────────────────────

describe('POST /api/environments/create', () => {
  it('forwards projectId, userId from auth, name, type, region', async () => {
    createEnvMock.mockResolvedValue({ id: 'e2', name: 'staging' });

    const res = await post('/api/environments/create', {
      projectId: 'p1',
      name: 'Staging',
      type: 'staging',
      region: 'us-east1',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, environment: { id: 'e2', name: 'staging' } });
    expect(createEnvMock).toHaveBeenCalledWith('p1', 'user-1', 'Staging', 'staging', 'us-east1');
  });

  it('defaults type to "development" when omitted', async () => {
    createEnvMock.mockResolvedValue({ id: 'e3' });

    await post('/api/environments/create', { projectId: 'p1', name: 'Feature' });

    expect(createEnvMock).toHaveBeenCalledWith('p1', 'user-1', 'Feature', 'development', undefined);
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await post('/api/environments/create', { name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'projectId and name required' });
    expect(createEnvMock).not.toHaveBeenCalled();
  });

  it('returns 400 when name is missing', async () => {
    const res = await post('/api/environments/create', { projectId: 'p1' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'projectId and name required' });
    expect(createEnvMock).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws (max-environments cap, missing prod, etc.)', async () => {
    createEnvMock.mockRejectedValue(new Error('Maximum 20 environments per project'));

    const res = await post('/api/environments/create', { projectId: 'p1', name: 'X' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Maximum 20 environments per project' });
  });

  it('returns 403 when requireProjectAccess rejects (editor required)', async () => {
    currentAuth = 'no-project-access';
    const res = await post('/api/environments/create', { projectId: 'p1', name: 'X' });
    expect(res.status).toBe(403);
    expect(createEnvMock).not.toHaveBeenCalled();
  });
});

// ── 3. POST /update ───────────────────────────────────────────────────

describe('POST /api/environments/update', () => {
  it('forwards envId and partial { name, region }', async () => {
    updateEnvMock.mockResolvedValue({ id: 'e1', name: 'renamed' });

    const res = await post('/api/environments/update', {
      envId: 'e1',
      name: 'Renamed',
      region: 'eu-west1',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, environment: { id: 'e1', name: 'renamed' } });
    expect(updateEnvMock).toHaveBeenCalledWith('e1', { name: 'Renamed', region: 'eu-west1' });
  });

  it('returns 400 when envId is missing', async () => {
    const res = await post('/api/environments/update', { name: 'X' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'envId required' });
    expect(updateEnvMock).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws (rename of protected env, etc.)', async () => {
    updateEnvMock.mockRejectedValue(new Error('Cannot rename the production environment'));

    const res = await post('/api/environments/update', { envId: 'e-prod', name: 'evil' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot rename the production environment');
  });
});

// ── 4. POST /delete ───────────────────────────────────────────────────

describe('POST /api/environments/delete', () => {
  it('deletes the env via the service', async () => {
    deleteEnvMock.mockResolvedValue(undefined);

    const res = await post('/api/environments/delete', { envId: 'e1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(deleteEnvMock).toHaveBeenCalledWith('e1');
  });

  it('returns 400 when envId is missing', async () => {
    const res = await post('/api/environments/delete', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'envId required' });
    expect(deleteEnvMock).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws (production env, etc.)', async () => {
    deleteEnvMock.mockRejectedValue(new Error('Production environment cannot be deleted'));

    const res = await post('/api/environments/delete', { envId: 'e-prod' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Production environment cannot be deleted');
  });

  it('returns 403 when requireProjectAccess rejects (owner required)', async () => {
    currentAuth = 'no-project-access';
    const res = await post('/api/environments/delete', { envId: 'e1' });
    expect(res.status).toBe(403);
    expect(deleteEnvMock).not.toHaveBeenCalled();
  });
});

// ── 5. POST /compare ──────────────────────────────────────────────────

describe('POST /api/environments/compare', () => {
  it('returns the diff for two environments', async () => {
    compareEnvsMock.mockResolvedValue({ added: [], removed: [], modified: [], unchangedCount: 3 });

    const res = await post('/api/environments/compare', {
      sourceEnvId: 'e-src',
      targetEnvId: 'e-tgt',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.diff).toEqual({ added: [], removed: [], modified: [], unchangedCount: 3 });
    expect(compareEnvsMock).toHaveBeenCalledWith('e-src', 'e-tgt');
  });

  it('returns 400 when sourceEnvId is missing', async () => {
    const res = await post('/api/environments/compare', { targetEnvId: 'e-tgt' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('sourceEnvId and targetEnvId required');
  });

  it('returns 400 when targetEnvId is missing', async () => {
    const res = await post('/api/environments/compare', { sourceEnvId: 'e-src' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('sourceEnvId and targetEnvId required');
  });

  it('returns 400 when service throws', async () => {
    compareEnvsMock.mockRejectedValue(new Error('Environment not found'));

    const res = await post('/api/environments/compare', {
      sourceEnvId: 'a',
      targetEnvId: 'b',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Environment not found');
  });
});

// ── 6. POST /promote ──────────────────────────────────────────────────

describe('POST /api/environments/promote', () => {
  it('forwards source/target env ids and userId from auth', async () => {
    promoteEnvMock.mockResolvedValue(undefined);

    const res = await post('/api/environments/promote', {
      sourceEnvId: 'e-src',
      targetEnvId: 'e-prod',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(promoteEnvMock).toHaveBeenCalledWith('e-src', 'e-prod', 'user-1');
  });

  it('returns 400 when sourceEnvId is missing', async () => {
    const res = await post('/api/environments/promote', { targetEnvId: 'e-prod' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('sourceEnvId and targetEnvId required');
    expect(promoteEnvMock).not.toHaveBeenCalled();
  });

  it('returns 400 when targetEnvId is missing', async () => {
    const res = await post('/api/environments/promote', { sourceEnvId: 'e-src' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('sourceEnvId and targetEnvId required');
    expect(promoteEnvMock).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws (target is not production)', async () => {
    promoteEnvMock.mockRejectedValue(new Error('Can only promote to the production environment'));

    const res = await post('/api/environments/promote', {
      sourceEnvId: 'a',
      targetEnvId: 'b',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Can only promote to the production environment');
  });

  it('returns 403 when requireProjectAccess rejects (owner required)', async () => {
    currentAuth = 'no-project-access';
    const res = await post('/api/environments/promote', {
      sourceEnvId: 'a',
      targetEnvId: 'b',
    });
    expect(res.status).toBe(403);
    expect(promoteEnvMock).not.toHaveBeenCalled();
  });
});

// ── 7. POST /pr-previews ──────────────────────────────────────────────

describe('POST /api/environments/pr-previews', () => {
  it('coerces enabled to boolean true and forwards to the service', async () => {
    togglePrPreviewsMock.mockResolvedValue(undefined);

    const res = await post('/api/environments/pr-previews', { projectId: 'p1', enabled: true });

    expect(res.status).toBe(200);
    expect(togglePrPreviewsMock).toHaveBeenCalledWith('p1', true);
  });

  it('coerces a missing enabled to false', async () => {
    togglePrPreviewsMock.mockResolvedValue(undefined);

    await post('/api/environments/pr-previews', { projectId: 'p1' });

    expect(togglePrPreviewsMock).toHaveBeenCalledWith('p1', false);
  });

  it('coerces truthy non-boolean enabled values to true', async () => {
    togglePrPreviewsMock.mockResolvedValue(undefined);

    await post('/api/environments/pr-previews', { projectId: 'p1', enabled: 'yes' });

    expect(togglePrPreviewsMock).toHaveBeenCalledWith('p1', true);
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await post('/api/environments/pr-previews', { enabled: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('projectId required');
    expect(togglePrPreviewsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when service throws', async () => {
    togglePrPreviewsMock.mockRejectedValue(new Error('Project not found'));

    const res = await post('/api/environments/pr-previews', { projectId: 'p1', enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Project not found');
  });
});
