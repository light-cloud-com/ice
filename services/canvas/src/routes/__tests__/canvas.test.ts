/**
 * HTTP tests for the Canvas router (`/api/canvas/...`).
 *
 * No supertest in the workspace, so we boot a tiny in-process Express app
 * on an ephemeral port and hit it with `fetch`. The canvas service module
 * and `@ice/service-iam` are mocked at the module boundary so the router's
 * job — body validation, organisationId provenance, error envelope
 * shape — is what we actually exercise.
 *
 * The auth middleware (`requireAuth`, `requireProjectAccess`) is also
 * mocked: we install a deterministic auth shim so each test can dial in
 * the auth outcome it cares about.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks (must be hoisted before the router import) ──────────────────

const listProjectsMock = vi.fn();
const createProjectMock = vi.fn();
const getProjectMock = vi.fn();
const updateProjectMock = vi.fn();
const deleteProjectMock = vi.fn();
const moveProjectMock = vi.fn();
const createCardMock = vi.fn();
const getCardMock = vi.fn();
const updateCardMock = vi.fn();
const deleteCardMock = vi.fn();

vi.mock('../../services/canvas.service', () => ({
  listProjects: (...args: unknown[]) => listProjectsMock(...args),
  createProject: (...args: unknown[]) => createProjectMock(...args),
  getProject: (...args: unknown[]) => getProjectMock(...args),
  updateProject: (...args: unknown[]) => updateProjectMock(...args),
  deleteProject: (...args: unknown[]) => deleteProjectMock(...args),
  moveProject: (...args: unknown[]) => moveProjectMock(...args),
  createCard: (...args: unknown[]) => createCardMock(...args),
  getCard: (...args: unknown[]) => getCardMock(...args),
  updateCard: (...args: unknown[]) => updateCardMock(...args),
  deleteCard: (...args: unknown[]) => deleteCardMock(...args),
}));

const grantCreatorAccessMock = vi.fn();
vi.mock('@ice/service-iam', () => ({
  grantCreatorAccess: (...args: unknown[]) => grantCreatorAccessMock(...args),
}));

// Auth middleware shim: each test sets `currentAuth` to control outcome.
type AuthMode = 'allow' | 'no-auth' | 'no-project-access' | 'no-org';
let currentAuth: AuthMode = 'allow';
let currentUserId: string | undefined = 'user-1';
let currentOrgId: string | undefined = 'org-real';

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

  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: canvasRouter } = await import('../canvas');
  const app = express();
  app.use(express.json());
  app.use('/api/canvas', canvasRouter);

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

// ── 1. POST /projects — list ──────────────────────────────────────────

describe('POST /api/canvas/projects', () => {
  it('returns the list of projects from the service with auth-derived orgId', async () => {
    listProjectsMock.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);

    const res = await post('/api/canvas/projects', { parentId: 'folder-1', search: 'hello' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'p1' }, { id: 'p2' }]);
    expect(listProjectsMock).toHaveBeenCalledWith('org-real', 'folder-1', 'hello');
  });

  it('falls back to body.organisationId when JWT carries none (org-switch)', async () => {
    currentAuth = 'no-org';
    listProjectsMock.mockResolvedValue([]);

    const res = await post('/api/canvas/projects', {
      parentId: null,
      organisationId: 'org-from-body',
    });

    expect(res.status).toBe(200);
    expect(listProjectsMock).toHaveBeenCalledWith('org-from-body', null, undefined);
  });

  it('passes empty string when no orgId is available from any source', async () => {
    currentAuth = 'no-org';
    listProjectsMock.mockResolvedValue([]);

    const res = await post('/api/canvas/projects', {});

    expect(res.status).toBe(200);
    expect(listProjectsMock).toHaveBeenCalledWith('', undefined, undefined);
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/canvas/projects', {});
    expect(res.status).toBe(401);
    expect(listProjectsMock).not.toHaveBeenCalled();
  });
});

// ── 2. POST /projects/create ──────────────────────────────────────────

describe('POST /api/canvas/projects/create', () => {
  it('creates a project and grants creator access for type=project', async () => {
    createProjectMock.mockResolvedValue({ id: 'p-new', type: 'project' });
    grantCreatorAccessMock.mockResolvedValue(undefined);

    const res = await post('/api/canvas/projects/create', {
      name: 'My Project',
      description: 'desc',
      type: 'project',
      parentId: 'folder-1',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'p-new', type: 'project' });
    expect(createProjectMock).toHaveBeenCalledWith(
      'org-real',
      'user-1',
      'My Project',
      'project',
      'folder-1',
      'desc',
    );
    expect(grantCreatorAccessMock).toHaveBeenCalledWith('p-new', 'user-1');
  });

  it('does NOT grant creator access when type=folder', async () => {
    createProjectMock.mockResolvedValue({ id: 'f-new', type: 'folder' });

    const res = await post('/api/canvas/projects/create', { name: 'Folder', type: 'folder' });

    expect(res.status).toBe(200);
    expect(grantCreatorAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the service throws', async () => {
    createProjectMock.mockRejectedValue(new Error('Parent folder not found'));

    const res = await post('/api/canvas/projects/create', {
      name: 'X',
      type: 'project',
      parentId: 'bad',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Parent folder not found');
    expect(grantCreatorAccessMock).not.toHaveBeenCalled();
  });
});

// ── 3. POST /projects/get ─────────────────────────────────────────────

describe('POST /api/canvas/projects/get', () => {
  it('returns the project from the service', async () => {
    getProjectMock.mockResolvedValue({ id: 'p1', name: 'Proj' });

    const res = await post('/api/canvas/projects/get', { projectId: 'p1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'p1', name: 'Proj' });
    expect(getProjectMock).toHaveBeenCalledWith('p1');
  });

  it('returns 404 when the service throws (project not found)', async () => {
    getProjectMock.mockRejectedValue(new Error('Project not found'));

    const res = await post('/api/canvas/projects/get', { projectId: 'missing' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Project not found');
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';

    const res = await post('/api/canvas/projects/get', { projectId: 'p1' });

    expect(res.status).toBe(403);
    expect(getProjectMock).not.toHaveBeenCalled();
  });
});

// ── 4. POST /projects/update ──────────────────────────────────────────

describe('POST /api/canvas/projects/update', () => {
  it('forwards name/description/provider/region to the service', async () => {
    updateProjectMock.mockResolvedValue({ success: true });

    const res = await post('/api/canvas/projects/update', {
      projectId: 'p1',
      name: 'New Name',
      description: 'new desc',
      provider: 'gcp',
      region: 'us-central1',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(updateProjectMock).toHaveBeenCalledWith('p1', {
      name: 'New Name',
      description: 'new desc',
      provider: 'gcp',
      region: 'us-central1',
    });
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';

    const res = await post('/api/canvas/projects/update', { projectId: 'p1', name: 'x' });

    expect(res.status).toBe(403);
    expect(updateProjectMock).not.toHaveBeenCalled();
  });
});

// ── 5. POST /projects/delete ──────────────────────────────────────────

describe('POST /api/canvas/projects/delete', () => {
  it('forwards projectId + auth-derived orgId to the service', async () => {
    deleteProjectMock.mockResolvedValue(undefined);

    const res = await post('/api/canvas/projects/delete', { projectId: 'p1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(deleteProjectMock).toHaveBeenCalledWith('p1', 'org-real');
  });

  it('returns 500 with the underlying error message when service throws', async () => {
    deleteProjectMock.mockRejectedValue(new Error('FK violation: DeployEvent'));

    const res = await post('/api/canvas/projects/delete', { projectId: 'p1' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('FK violation: DeployEvent');
  });

  it('coerces non-Error throws to a string message', async () => {
    deleteProjectMock.mockRejectedValue('boom');

    const res = await post('/api/canvas/projects/delete', { projectId: 'p1' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to delete: boom');
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';

    const res = await post('/api/canvas/projects/delete', { projectId: 'p1' });

    expect(res.status).toBe(403);
    expect(deleteProjectMock).not.toHaveBeenCalled();
  });
});

// ── 6. POST /projects/move ────────────────────────────────────────────

describe('POST /api/canvas/projects/move', () => {
  it('forwards projectId + parentId + auth-derived orgId', async () => {
    moveProjectMock.mockResolvedValue(undefined);

    const res = await post('/api/canvas/projects/move', {
      projectId: 'p1',
      parentId: 'folder-2',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(moveProjectMock).toHaveBeenCalledWith('p1', 'folder-2', 'org-real');
  });

  it('returns 400 when service throws (descendant cycle, etc.)', async () => {
    moveProjectMock.mockRejectedValue(new Error('Cannot move folder into its own descendant'));

    const res = await post('/api/canvas/projects/move', {
      projectId: 'p1',
      parentId: 'descendant',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Cannot move folder into its own descendant');
  });
});

// ── 7. POST /cards/create ─────────────────────────────────────────────

describe('POST /api/canvas/cards/create', () => {
  it('uses orgId from auth, never from the body', async () => {
    createCardMock.mockResolvedValue({ id: 'c1' });

    const res = await post('/api/canvas/cards/create', {
      name: 'My Card',
      projectId: 'p1',
      organisationId: 'evil', // attacker-controlled — must be ignored
    });

    expect(res.status).toBe(200);
    expect(createCardMock).toHaveBeenCalledTimes(1);
    expect(createCardMock).toHaveBeenCalledWith('p1', 'org-real', 'user-1', 'My Card');
    const callArg = createCardMock.mock.calls[0];
    expect(callArg[1]).not.toBe('evil');
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await post('/api/canvas/cards/create', { projectId: 'p1', name: 'X' });
    expect(res.status).toBe(403);
    expect(createCardMock).not.toHaveBeenCalled();
  });
});

// ── 8. POST /cards/get ────────────────────────────────────────────────

describe('POST /api/canvas/cards/get', () => {
  it('returns the card from the service', async () => {
    getCardMock.mockResolvedValue({ id: 'c1', name: 'Card' });

    const res = await post('/api/canvas/cards/get', { cardId: 'c1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'c1', name: 'Card' });
    expect(getCardMock).toHaveBeenCalledWith('c1');
  });

  it('returns 404 when service throws (card not found)', async () => {
    getCardMock.mockRejectedValue(new Error('Card not found'));

    const res = await post('/api/canvas/cards/get', { cardId: 'missing' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Card not found');
  });
});

// ── 9. POST /cards/update ─────────────────────────────────────────────

describe('POST /api/canvas/cards/update', () => {
  it('forwards name, nodes, edges, viewport to the service', async () => {
    updateCardMock.mockResolvedValue({ id: 'c1' });

    const res = await post('/api/canvas/cards/update', {
      cardId: 'c1',
      name: 'New',
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(res.status).toBe(200);
    expect(updateCardMock).toHaveBeenCalledWith('c1', {
      name: 'New',
      nodes: [{ id: 'n1' }],
      edges: [{ id: 'e1' }],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  it('returns 404 when prisma throws P2025', async () => {
    const err: any = new Error('Record not found');
    err.code = 'P2025';
    updateCardMock.mockRejectedValue(err);

    const res = await post('/api/canvas/cards/update', { cardId: 'missing' });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Card not found');
  });

  it('returns 500 with service message on generic errors', async () => {
    updateCardMock.mockRejectedValue(new Error('boom'));

    const res = await post('/api/canvas/cards/update', { cardId: 'c1' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('boom');
  });

  it('returns 500 with default message when error has no message', async () => {
    updateCardMock.mockRejectedValue({ code: 'OTHER' }); // truthy but no .message

    const res = await post('/api/canvas/cards/update', { cardId: 'c1' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Update failed');
  });
});

// ── 10. POST /cards/delete ────────────────────────────────────────────

describe('POST /api/canvas/cards/delete', () => {
  it('forwards cardId to the service and returns success', async () => {
    deleteCardMock.mockResolvedValue(undefined);

    const res = await post('/api/canvas/cards/delete', { cardId: 'c1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(deleteCardMock).toHaveBeenCalledWith('c1');
  });

  it('returns 403 when requireProjectAccess rejects (owner role required)', async () => {
    currentAuth = 'no-project-access';

    const res = await post('/api/canvas/cards/delete', { cardId: 'c1' });

    expect(res.status).toBe(403);
    expect(deleteCardMock).not.toHaveBeenCalled();
  });
});
