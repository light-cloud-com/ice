/**
 * JWT Auth Middleware coverage.
 *
 * Three exported groups:
 * - `requireAuth`: JWT verify, desktop-mode bypass, missing/invalid token paths.
 * - `requireProjectAccess(minRole)`: prisma membership lookup, org-admin bypass,
 *   project-level role gate, projectId resolution from body/params/query/cardId,
 *   404 on unknown project.
 * - `requireOrgRole(...allowedRoles)`: org membership lookup, no-org-context reject.
 * - `generateToken` / `generateRefreshToken`: round-trip JWT verification.
 * - `setDesktopUser` / `isDesktopMode`: stateful flag.
 *
 * The middleware module reads `JWT_SECRET` once at module top-level, so we set
 * it in `beforeAll` and rely on `vi.resetModules()` per group to ensure a clean
 * desktop-flag state for each test that mutates it. Prisma is mocked at
 * `@ice/db` since `requireProjectAccess` and `requireOrgRole` lazy-import it.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-for-auth-middleware';
});

// Hoisted prisma stub the lazy `await import('@ice/db')` inside the middleware
// will receive on every call. Tests mutate `prisma.canvasProject.findUnique` /
// `prisma.organisationMember.findUnique` per case.
const h = vi.hoisted(() => ({
  prisma: {
    canvasCard: { findUnique: vi.fn() },
    canvasProject: { findUnique: vi.fn() },
    organisationMember: { findUnique: vi.fn() },
  },
}));

vi.mock('@ice/db', () => ({
  default: h.prisma,
}));

/**
 * Each `it` reimports the middleware module after `resetModules`. Without
 * this, the module-scoped desktop user / org flags leak across tests.
 */
async function freshAuth() {
  vi.resetModules();
  return import('../middleware.js');
}

function makeRes() {
  const res: { status: any; json: any; statusCode?: number; body?: unknown } = {
    status: vi.fn(function (this: any, code: number) {
      this.statusCode = code;
      return this;
    }),
    json: vi.fn(function (this: any, body: unknown) {
      this.body = body;
      return this;
    }),
  };
  return res as any;
}

beforeEach(() => {
  h.prisma.canvasCard.findUnique.mockReset();
  h.prisma.canvasProject.findUnique.mockReset();
  h.prisma.organisationMember.findUnique.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requireAuth — JWT path', () => {
  it('rejects when Authorization header is missing', async () => {
    const { requireAuth } = await freshAuth();
    const req: any = { headers: {} };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing authorization token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when Authorization header is malformed (no Bearer prefix)', async () => {
    const { requireAuth } = await freshAuth();
    const req: any = { headers: { authorization: 'Basic abc' } };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing authorization token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid JWT and writes userId/organisationId onto the request', async () => {
    const { requireAuth, generateToken } = await freshAuth();
    const token = generateToken('user-1', 'org-1');
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.userId).toBe('user-1');
    expect(req.organisationId).toBe('org-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects an expired JWT', async () => {
    const { requireAuth } = await freshAuth();
    const token = jwt.sign({ userId: 'u', organisationId: 'o' }, 'test-secret-for-auth-middleware', {
      expiresIn: '-1s',
    });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the wrong secret', async () => {
    const { requireAuth } = await freshAuth();
    const token = jwt.sign({ userId: 'u', organisationId: 'o' }, 'WRONG-SECRET');
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAuth — desktop mode bypass', () => {
  it('skips JWT validation and writes desktop userId/orgId on every request', async () => {
    const { requireAuth, setDesktopUser } = await freshAuth();
    setDesktopUser('desktop-user', 'desktop-org');

    const req: any = { headers: {} };
    const res = makeRes();
    const next = vi.fn();
    requireAuth(req, res, next);

    expect(req.userId).toBe('desktop-user');
    expect(req.organisationId).toBe('desktop-org');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('writes empty string for organisationId when desktop org is empty', async () => {
    const { requireAuth, setDesktopUser } = await freshAuth();
    setDesktopUser('desktop-user', '');

    const req: any = { headers: {} };
    const res = makeRes();
    const next = vi.fn();
    requireAuth(req, res, next);

    expect(req.userId).toBe('desktop-user');
    expect(req.organisationId).toBe('');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('isDesktopMode / setDesktopUser', () => {
  it('returns null when no desktop user has been set', async () => {
    const { isDesktopMode } = await freshAuth();
    expect(isDesktopMode()).toBeNull();
  });

  it('returns the desktop userId/orgId after setDesktopUser', async () => {
    const { isDesktopMode, setDesktopUser } = await freshAuth();
    setDesktopUser('u', 'o');
    expect(isDesktopMode()).toEqual({ userId: 'u', orgId: 'o' });
  });

  it('returns userId with empty orgId when only userId was set', async () => {
    const { isDesktopMode, setDesktopUser } = await freshAuth();
    setDesktopUser('u', '');
    expect(isDesktopMode()).toEqual({ userId: 'u', orgId: '' });
  });
});

describe('requireProjectAccess', () => {
  it('returns 400 when projectId cannot be resolved (no body, params, query, or cardId)', async () => {
    const { requireProjectAccess } = await freshAuth();
    const handler = requireProjectAccess('viewer');

    const req: any = { headers: {}, body: {}, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'projectId is required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('reads projectId from req.body', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'editor' }],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('editor');
    const req: any = { headers: {}, body: { projectId: 'p-body' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(h.prisma.canvasProject.findUnique).toHaveBeenCalledWith({
      where: { id: 'p-body' },
      select: expect.any(Object),
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reads projectId from req.params when body is empty', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'owner' }],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: {}, params: { projectId: 'p-param' }, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(h.prisma.canvasProject.findUnique).toHaveBeenCalledWith({
      where: { id: 'p-param' },
      select: expect.any(Object),
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reads projectId from req.query when neither body nor params have it', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'owner' }],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: {}, params: {}, query: { projectId: 'p-query' }, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(h.prisma.canvasProject.findUnique).toHaveBeenCalledWith({
      where: { id: 'p-query' },
      select: expect.any(Object),
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('resolves projectId from cardId when body/params/query lack projectId', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p-from-card' });
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'owner' }],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: { cardId: 'card-1' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(h.prisma.canvasCard.findUnique).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      select: { project_id: true },
    });
    expect(h.prisma.canvasProject.findUnique).toHaveBeenCalledWith({
      where: { id: 'p-from-card' },
      select: expect.any(Object),
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reads cardId from req.params when missing from body', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p-from-card-param' });
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'owner' }],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: {}, params: { cardId: 'card-2' }, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(h.prisma.canvasCard.findUnique).toHaveBeenCalledWith({
      where: { id: 'card-2' },
      select: { project_id: true },
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reads cardId from req.query when missing from body and params', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasCard.findUnique.mockResolvedValue({ project_id: 'p-from-card-query' });
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'owner' }],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: {}, params: {}, query: { cardId: 'card-3' }, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(h.prisma.canvasCard.findUnique).toHaveBeenCalledWith({
      where: { id: 'card-3' },
      select: { project_id: true },
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when cardId resolves to a card that has no project_id', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasCard.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: { cardId: 'unknown' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 404 when the project does not exist', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: { projectId: 'p-missing' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
    expect(next).not.toHaveBeenCalled();
  });

  it('admins bypass the project-level role check', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [], // no project membership
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue({ role: 'admin' });

    const handler = requireProjectAccess('owner');
    const req: any = { headers: {}, body: { projectId: 'p1' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('owners bypass the project-level role check (org admins set)', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue({ role: 'owner' });

    const handler = requireProjectAccess('owner');
    const req: any = { headers: {}, body: { projectId: 'p1' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects with 403 when project member role is below required level', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'viewer' }], // viewer
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue({ role: 'member' }); // not admin

    const handler = requireProjectAccess('editor');
    const req: any = { headers: {}, body: { projectId: 'p1' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient project permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when there is no project membership at all', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: { projectId: 'p1' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when an unknown role is on the project membership row', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'spectator' }], // unknown role string
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: { projectId: 'p1' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('admits a viewer-level member to a viewer-required route', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'viewer' }],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue({ role: 'member' });

    const handler = requireProjectAccess('viewer');
    const req: any = { headers: {}, body: { projectId: 'p1' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('admits an editor to an editor-required route', async () => {
    const { requireProjectAccess } = await freshAuth();
    h.prisma.canvasProject.findUnique.mockResolvedValue({
      organisation_id: 'org-x',
      members: [{ role: 'editor' }],
    });
    h.prisma.organisationMember.findUnique.mockResolvedValue({ role: 'member' });

    const handler = requireProjectAccess('editor');
    const req: any = { headers: {}, body: { projectId: 'p1' }, params: {}, query: {}, userId: 'u' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws at handler-build time when minRole is unknown (closes the fail-open gap)', async () => {
    const { requireProjectAccess } = await freshAuth();
    // Unknown minRole used to collapse to 0 via the `|| 0` fallback in
    // the per-request check, making `(role >= 0)` always true and the
    // gate effectively auth-required-only. The current code throws at
    // handler-build time so a misconfigured route can never silently
    // admit unauthorized callers. See findings.md #2.
    expect(() => requireProjectAccess('non-existent-role' as any)).toThrow(
      /unknown minRole 'non-existent-role'/,
    );
  });
});

describe('requireOrgRole', () => {
  it('returns 401 when no organisationId is on the request', async () => {
    const { requireOrgRole } = await freshAuth();
    const handler = requireOrgRole('owner', 'admin');

    const req: any = {};
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'No organisation context' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user has no membership in the org', async () => {
    const { requireOrgRole } = await freshAuth();
    h.prisma.organisationMember.findUnique.mockResolvedValue(null);
    const handler = requireOrgRole('owner');

    const req: any = { userId: 'u', organisationId: 'o' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Insufficient organisation permissions' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when the user has a role not in the allowed list', async () => {
    const { requireOrgRole } = await freshAuth();
    h.prisma.organisationMember.findUnique.mockResolvedValue({ role: 'viewer' });
    const handler = requireOrgRole('owner', 'admin');

    const req: any = { userId: 'u', organisationId: 'o' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('admits a user whose role appears in the allowed list', async () => {
    const { requireOrgRole } = await freshAuth();
    h.prisma.organisationMember.findUnique.mockResolvedValue({ role: 'admin' });
    const handler = requireOrgRole('owner', 'admin');

    const req: any = { userId: 'u', organisationId: 'o' };
    const res = makeRes();
    const next = vi.fn();
    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('generateToken / generateRefreshToken', () => {
  it('generateToken issues a JWT verifiable with the same secret', async () => {
    const { generateToken } = await freshAuth();
    const token = generateToken('user-1', 'org-1');
    const payload = jwt.verify(token, 'test-secret-for-auth-middleware') as {
      userId: string;
      organisationId: string;
    };
    expect(payload.userId).toBe('user-1');
    expect(payload.organisationId).toBe('org-1');
  });

  it('generateRefreshToken includes refresh discriminator and unique jti', async () => {
    const { generateRefreshToken } = await freshAuth();
    const t1 = generateRefreshToken('user-1', 'org-1');
    const t2 = generateRefreshToken('user-1', 'org-1');
    const p1 = jwt.verify(t1, 'test-secret-for-auth-middleware') as {
      type: string;
      jti: string;
    };
    const p2 = jwt.verify(t2, 'test-secret-for-auth-middleware') as {
      type: string;
      jti: string;
    };
    expect(p1.type).toBe('refresh');
    expect(p1.jti).not.toBe(p2.jti);
  });
});
