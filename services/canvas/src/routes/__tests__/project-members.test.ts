/**
 * HTTP tests for the Project Members router (`/api/project-members/...`).
 *
 * In-process Express + ephemeral port + global fetch (no supertest in
 * the workspace). The IAM service module and `@ice/db` are mocked at
 * the boundary so the router's job — body validation, owner-gating,
 * self-action prevention, role normalisation, error envelope shape — is
 * what we exercise.
 *
 * Note: project-members.ts pulls `@ice/service-iam` BOTH as
 * `import * as projectAccess` and as a named `sendProjectInviteEmail`
 * import. The mock factory must expose every symbol the source touches
 * by both access patterns.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks (must be hoisted before the router import) ──────────────────

const listProjectMembersMock = vi.fn();
const hasProjectAccessMock = vi.fn();
const addProjectMemberMock = vi.fn();
const updateProjectMemberRoleMock = vi.fn();
const removeProjectMemberMock = vi.fn();
const sendProjectInviteEmailMock = vi.fn();

vi.mock('@ice/service-iam', () => ({
  listProjectMembers: (...args: unknown[]) => listProjectMembersMock(...args),
  hasProjectAccess: (...args: unknown[]) => hasProjectAccessMock(...args),
  addProjectMember: (...args: unknown[]) => addProjectMemberMock(...args),
  updateProjectMemberRole: (...args: unknown[]) => updateProjectMemberRoleMock(...args),
  removeProjectMember: (...args: unknown[]) => removeProjectMemberMock(...args),
  sendProjectInviteEmail: (...args: unknown[]) => sendProjectInviteEmailMock(...args),
}));

const userFindUniqueMock = vi.fn();
const projectFindUniqueMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    user: { findUnique: (...args: unknown[]) => userFindUniqueMock(...args) },
    canvasProject: { findUnique: (...args: unknown[]) => projectFindUniqueMock(...args) },
  },
}));

type AuthMode = 'allow' | 'no-auth' | 'no-project-access';
let currentAuth: AuthMode = 'allow';
let currentUserId = 'user-caller';
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
  currentUserId = 'user-caller';
  currentOrgId = 'org-real';

  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: pmRouter } = await import('../project-members');
  const app = express();
  app.use(express.json());
  app.use('/api/project-members', pmRouter);

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

describe('POST /api/project-members/list', () => {
  it('shapes the IAM service rows into the wire schema', async () => {
    listProjectMembersMock.mockResolvedValue([
      {
        user: { id: 'u1', email: 'a@b.c', name: 'Alice', avatar: 'avatar.png' },
        role: 'owner',
        granted_at: new Date('2025-01-01T00:00:00Z'),
      },
    ]);

    const res = await post('/api/project-members/list', { projectId: 'p1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        userId: 'u1',
        email: 'a@b.c',
        name: 'Alice',
        avatar: 'avatar.png',
        role: 'owner',
        grantedAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
    expect(listProjectMembersMock).toHaveBeenCalledWith('p1');
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await post('/api/project-members/list', {});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('projectId is required');
    expect(listProjectMembersMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the IAM service throws', async () => {
    listProjectMembersMock.mockRejectedValue(new Error('db unreachable'));

    const res = await post('/api/project-members/list', { projectId: 'p1' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to list project members');
    // Underlying error message must NOT leak to the client.
    expect(JSON.stringify(res.body)).not.toContain('db unreachable');
  });

  it('returns 403 when requireProjectAccess rejects', async () => {
    currentAuth = 'no-project-access';
    const res = await post('/api/project-members/list', { projectId: 'p1' });
    expect(res.status).toBe(403);
    expect(listProjectMembersMock).not.toHaveBeenCalled();
  });
});

// ── 2. POST /add ──────────────────────────────────────────────────────

describe('POST /api/project-members/add', () => {
  it('adds a member with default role=editor and sends an invite email', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    addProjectMemberMock.mockResolvedValue(undefined);
    userFindUniqueMock
      .mockResolvedValueOnce({ email: 'invitee@example.com' }) // target user
      .mockResolvedValueOnce({ name: 'Inviter Bob' }); // inviter
    projectFindUniqueMock.mockResolvedValue({ name: 'Project X' });

    const res = await post('/api/project-members/add', {
      projectId: 'p1',
      userId: 'u-target',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(hasProjectAccessMock).toHaveBeenCalledWith('user-caller', 'p1', 'owner');
    expect(addProjectMemberMock).toHaveBeenCalledWith('p1', 'u-target', 'editor', 'user-caller');
    expect(sendProjectInviteEmailMock).toHaveBeenCalledWith({
      to: 'invitee@example.com',
      inviterName: 'Inviter Bob',
      projectName: 'Project X',
      role: 'editor',
    });
  });

  it('normalises uppercase role to lowercase before persisting', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    addProjectMemberMock.mockResolvedValue(undefined);
    userFindUniqueMock.mockResolvedValue(null); // skip email branch
    projectFindUniqueMock.mockResolvedValue(null);

    await post('/api/project-members/add', {
      projectId: 'p1',
      userId: 'u-target',
      role: 'OWNER',
    });

    expect(addProjectMemberMock).toHaveBeenCalledWith('p1', 'u-target', 'owner', 'user-caller');
    expect(sendProjectInviteEmailMock).not.toHaveBeenCalled();
  });

  it('falls back to "A team member" when inviter has no name', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    addProjectMemberMock.mockResolvedValue(undefined);
    userFindUniqueMock
      .mockResolvedValueOnce({ email: 'invitee@example.com' })
      .mockResolvedValueOnce({ name: null });
    projectFindUniqueMock.mockResolvedValue({ name: 'Project X' });

    await post('/api/project-members/add', {
      projectId: 'p1',
      userId: 'u-target',
    });

    expect(sendProjectInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ inviterName: 'A team member' }),
    );
  });

  it('falls back to "A team member" when the inviter user record is missing', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    addProjectMemberMock.mockResolvedValue(undefined);
    userFindUniqueMock
      .mockResolvedValueOnce({ email: 'invitee@example.com' })
      .mockResolvedValueOnce(null); // inviter missing
    projectFindUniqueMock.mockResolvedValue({ name: 'Project X' });

    await post('/api/project-members/add', { projectId: 'p1', userId: 'u-target' });

    expect(sendProjectInviteEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ inviterName: 'A team member' }),
    );
  });

  it('skips email notification when target user does not exist', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    addProjectMemberMock.mockResolvedValue(undefined);
    userFindUniqueMock.mockResolvedValueOnce(null); // target user missing
    projectFindUniqueMock.mockResolvedValue({ name: 'Project X' });

    const res = await post('/api/project-members/add', {
      projectId: 'p1',
      userId: 'u-target',
    });

    expect(res.status).toBe(200);
    expect(sendProjectInviteEmailMock).not.toHaveBeenCalled();
  });

  it('skips email notification when project does not exist', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    addProjectMemberMock.mockResolvedValue(undefined);
    userFindUniqueMock.mockResolvedValueOnce({ email: 'invitee@example.com' });
    projectFindUniqueMock.mockResolvedValue(null);

    const res = await post('/api/project-members/add', {
      projectId: 'p1',
      userId: 'u-target',
    });

    expect(res.status).toBe(200);
    expect(sendProjectInviteEmailMock).not.toHaveBeenCalled();
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await post('/api/project-members/add', { userId: 'u' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('projectId and userId are required');
    expect(hasProjectAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 when userId is missing', async () => {
    const res = await post('/api/project-members/add', { projectId: 'p1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('projectId and userId are required');
  });

  it('returns 403 when caller is not a project owner', async () => {
    hasProjectAccessMock.mockResolvedValue(false);

    const res = await post('/api/project-members/add', { projectId: 'p1', userId: 'u' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Only project owners can add members');
    expect(addProjectMemberMock).not.toHaveBeenCalled();
  });

  it('returns 400 when role is not one of owner/editor/viewer', async () => {
    hasProjectAccessMock.mockResolvedValue(true);

    const res = await post('/api/project-members/add', {
      projectId: 'p1',
      userId: 'u',
      role: 'admin',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid role. Use: owner, editor, viewer');
    expect(addProjectMemberMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the IAM service throws', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    addProjectMemberMock.mockRejectedValue(new Error('duplicate membership'));

    const res = await post('/api/project-members/add', { projectId: 'p1', userId: 'u' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('duplicate membership');
  });

  it('returns a default 500 message when the error has no message', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    addProjectMemberMock.mockRejectedValue({}); // truthy but no .message

    const res = await post('/api/project-members/add', { projectId: 'p1', userId: 'u' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to add project member');
  });
});

// ── 3. POST /update-role ──────────────────────────────────────────────

describe('POST /api/project-members/update-role', () => {
  it('updates the role after owner check + role normalisation', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    updateProjectMemberRoleMock.mockResolvedValue(undefined);

    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      userId: 'u-target',
      role: 'EDITOR',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(updateProjectMemberRoleMock).toHaveBeenCalledWith('p1', 'u-target', 'editor');
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await post('/api/project-members/update-role', {
      userId: 'u',
      role: 'editor',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('projectId, userId, and role are required');
  });

  it('returns 400 when userId is missing', async () => {
    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      role: 'editor',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('projectId, userId, and role are required');
  });

  it('returns 400 when role is missing', async () => {
    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      userId: 'u',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('projectId, userId, and role are required');
  });

  it('returns 403 when caller is not a project owner', async () => {
    hasProjectAccessMock.mockResolvedValue(false);

    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      userId: 'u',
      role: 'editor',
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Only project owners can change roles');
    expect(updateProjectMemberRoleMock).not.toHaveBeenCalled();
  });

  it('returns 400 when caller targets themselves', async () => {
    hasProjectAccessMock.mockResolvedValue(true);

    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      userId: 'user-caller', // === currentUserId
      role: 'viewer',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Cannot change your own project role');
    expect(updateProjectMemberRoleMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown role value', async () => {
    hasProjectAccessMock.mockResolvedValue(true);

    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      userId: 'u',
      role: 'admin',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid role');
    expect(updateProjectMemberRoleMock).not.toHaveBeenCalled();
  });

  it('returns 500 with service message when IAM service throws', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    updateProjectMemberRoleMock.mockRejectedValue(new Error('db connection lost'));

    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      userId: 'u',
      role: 'viewer',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('db connection lost');
  });

  it('returns a default 500 message when error has no .message', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    updateProjectMemberRoleMock.mockRejectedValue({});

    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      userId: 'u',
      role: 'viewer',
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to update role');
  });
});

// ── 4. POST /remove ───────────────────────────────────────────────────

describe('POST /api/project-members/remove', () => {
  it('removes the member after owner check', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    removeProjectMemberMock.mockResolvedValue(undefined);

    const res = await post('/api/project-members/remove', {
      projectId: 'p1',
      userId: 'u-target',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(removeProjectMemberMock).toHaveBeenCalledWith('p1', 'u-target');
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await post('/api/project-members/remove', { userId: 'u' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('projectId and userId are required');
  });

  it('returns 400 when userId is missing', async () => {
    const res = await post('/api/project-members/remove', { projectId: 'p1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('projectId and userId are required');
  });

  it('returns 403 when caller is not a project owner', async () => {
    hasProjectAccessMock.mockResolvedValue(false);

    const res = await post('/api/project-members/remove', { projectId: 'p1', userId: 'u' });

    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Only project owners can remove members');
    expect(removeProjectMemberMock).not.toHaveBeenCalled();
  });

  it('returns 400 when caller tries to remove themselves', async () => {
    hasProjectAccessMock.mockResolvedValue(true);

    const res = await post('/api/project-members/remove', {
      projectId: 'p1',
      userId: 'user-caller',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Cannot remove yourself from the project');
    expect(removeProjectMemberMock).not.toHaveBeenCalled();
  });

  it('returns 500 with service message when IAM service throws', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    removeProjectMemberMock.mockRejectedValue(new Error('FK violation'));

    const res = await post('/api/project-members/remove', { projectId: 'p1', userId: 'u' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('FK violation');
  });

  it('returns a default 500 message when error has no .message', async () => {
    hasProjectAccessMock.mockResolvedValue(true);
    removeProjectMemberMock.mockRejectedValue({});

    const res = await post('/api/project-members/remove', { projectId: 'p1', userId: 'u' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to remove project member');
  });
});

// ── 5. Auth (top-level) ───────────────────────────────────────────────

describe('Auth — requireAuth applies to all routes', () => {
  it('returns 401 on /add when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/project-members/add', { projectId: 'p1', userId: 'u' });
    expect(res.status).toBe(401);
    expect(hasProjectAccessMock).not.toHaveBeenCalled();
  });

  it('returns 401 on /update-role when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/project-members/update-role', {
      projectId: 'p1',
      userId: 'u',
      role: 'viewer',
    });
    expect(res.status).toBe(401);
    expect(hasProjectAccessMock).not.toHaveBeenCalled();
  });

  it('returns 401 on /remove when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/project-members/remove', { projectId: 'p1', userId: 'u' });
    expect(res.status).toBe(401);
    expect(hasProjectAccessMock).not.toHaveBeenCalled();
  });
});
