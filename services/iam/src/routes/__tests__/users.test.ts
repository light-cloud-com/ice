/**
 * HTTP tests for the Users router (`/api/users/...`).
 *
 * No supertest — boot a tiny in-process Express app on an ephemeral port.
 * Prisma, the email service, and the auth middleware are mocked at the
 * module boundary so the router's job (role gating, role-promotion rules,
 * invite token issuance, response envelopes) is what we exercise.
 *
 * `crypto.randomBytes` is left real but its output doesn't matter — we
 * read whatever it returns from the response.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks ─────────────────────────────────────────────────────────────

const memberFindUniqueMock = vi.fn();
const memberFindManyMock = vi.fn();
const memberCountMock = vi.fn();
const memberCreateMock = vi.fn();
const memberUpdateMock = vi.fn();
const memberDeleteManyMock = vi.fn();

const userFindUniqueMock = vi.fn();
const userUpdateMock = vi.fn();

const orgFindUniqueMock = vi.fn();

const inviteFindUniqueMock = vi.fn();
const inviteFindFirstMock = vi.fn();
const inviteFindManyMock = vi.fn();
const inviteCreateMock = vi.fn();
const inviteUpdateMock = vi.fn();
const memberUpsertMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    organisationMember: {
      findUnique: (...a: unknown[]) => memberFindUniqueMock(...a),
      findMany: (...a: unknown[]) => memberFindManyMock(...a),
      count: (...a: unknown[]) => memberCountMock(...a),
      create: (...a: unknown[]) => memberCreateMock(...a),
      update: (...a: unknown[]) => memberUpdateMock(...a),
      upsert: (...a: unknown[]) => memberUpsertMock(...a),
      deleteMany: (...a: unknown[]) => memberDeleteManyMock(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUniqueMock(...a),
      update: (...a: unknown[]) => userUpdateMock(...a),
    },
    organisation: {
      findUnique: (...a: unknown[]) => orgFindUniqueMock(...a),
    },
    invitation: {
      findUnique: (...a: unknown[]) => inviteFindUniqueMock(...a),
      findFirst: (...a: unknown[]) => inviteFindFirstMock(...a),
      findMany: (...a: unknown[]) => inviteFindManyMock(...a),
      create: (...a: unknown[]) => inviteCreateMock(...a),
      update: (...a: unknown[]) => inviteUpdateMock(...a),
    },
  },
}));

const sendOrgInviteEmailMock = vi.fn();

vi.mock('../../services/email.service', () => ({
  sendOrgInviteEmail: (...a: unknown[]) => sendOrgInviteEmailMock(...a),
}));

type AuthMode = 'allow' | 'no-auth' | 'no-user-id';
let currentAuth: AuthMode = 'allow';
let currentUserId: string | undefined = 'admin-1';
let currentOrgId: string | undefined = 'org-1';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    if (currentAuth !== 'no-user-id') req.userId = currentUserId;
    req.organisationId = currentOrgId;
    next();
  },
}));

// ── Test harness ──────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  currentAuth = 'allow';
  currentUserId = 'admin-1';
  currentOrgId = 'org-1';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});

  const { default: usersRouter } = await import('../users.js');
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);

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
  method: string,
  path: string,
  body?: unknown,
) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

// Quick helper to set up an admin caller (the most-common case).
function withCallerRole(role: string | null) {
  if (role === null) {
    memberFindUniqueMock.mockResolvedValueOnce(null);
  } else {
    memberFindUniqueMock.mockResolvedValueOnce({ role });
  }
}

// ── POST / — list members ─────────────────────────────────────────────

describe('POST /api/users — list members', () => {
  it('returns paginated members when caller is org admin', async () => {
    withCallerRole('admin');
    const members = [
      {
        role: 'owner',
        user: {
          id: 'u1',
          email: 'owner@x',
          name: 'Owner',
          avatar: null,
          created_at: new Date('2025-01-01T00:00:00Z'),
        },
      },
      {
        role: 'member',
        user: {
          id: 'u2',
          email: 'm@x',
          name: 'Mem',
          avatar: 'pic.png',
          created_at: new Date('2025-02-01T00:00:00Z'),
        },
      },
    ];
    memberFindManyMock.mockResolvedValue(members);
    memberCountMock.mockResolvedValue(2);

    const res = await request('POST', '/api/users', { page: 1, limit: 50 });

    expect(res.status).toBe(200);
    expect(res.body.totalItems).toBe(2);
    expect(res.body.totalPages).toBe(1);
    expect(res.body.currentPage).toBe(1);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      id: 'u1',
      role: 'owner',
      roleName: 'Owner',
      status: 1,
    });
    expect(res.body.items[1]).toMatchObject({
      id: 'u2',
      role: 'member',
      roleName: 'Member',
    });
    // skip + take + orderBy applied via the call args
    const callArg = memberFindManyMock.mock.calls[0][0];
    expect(callArg.where).toEqual({ organisation_id: 'org-1' });
    expect(callArg.skip).toBe(0);
    expect(callArg.take).toBe(50);
    expect(callArg.orderBy).toEqual({ joined_at: 'asc' });
  });

  it('uses targetOrganisationId from body when provided', async () => {
    withCallerRole('owner');
    memberFindManyMock.mockResolvedValue([]);
    memberCountMock.mockResolvedValue(0);

    await request('POST', '/api/users', { targetOrganisationId: 'other-org' });

    expect(memberFindUniqueMock).toHaveBeenCalledWith({
      where: {
        user_id_organisation_id: { user_id: 'admin-1', organisation_id: 'other-org' },
      },
    });
    expect(memberFindManyMock.mock.calls[0][0].where.organisation_id).toBe('other-org');
  });

  it('falls back to empty string when neither targetOrganisationId nor req.organisationId is present', async () => {
    currentOrgId = undefined;
    withCallerRole(null);

    const res = await request('POST', '/api/users', {});

    expect(res.status).toBe(403);
    // The lookup uses orgId='' — confirm we passed it through
    expect(memberFindUniqueMock).toHaveBeenCalledWith({
      where: { user_id_organisation_id: { user_id: 'admin-1', organisation_id: '' } },
    });
  });

  it('applies pagination with page=2', async () => {
    withCallerRole('admin');
    memberFindManyMock.mockResolvedValue([]);
    memberCountMock.mockResolvedValue(120);

    const res = await request('POST', '/api/users', { page: 2, limit: 50 });

    expect(res.status).toBe(200);
    expect(res.body.totalPages).toBe(3);
    const callArg = memberFindManyMock.mock.calls[0][0];
    expect(callArg.skip).toBe(50);
    expect(callArg.take).toBe(50);
  });

  it('returns 403 when caller has no membership', async () => {
    withCallerRole(null);

    const res = await request('POST', '/api/users', {});

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Admin access required' });
    expect(memberFindManyMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller has non-admin role (member)', async () => {
    withCallerRole('member');

    const res = await request('POST', '/api/users', {});

    expect(res.status).toBe(403);
    expect(memberFindManyMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is a viewer', async () => {
    withCallerRole('viewer');
    const res = await request('POST', '/api/users', {});
    expect(res.status).toBe(403);
  });

  it('allows owner role to list members', async () => {
    withCallerRole('owner');
    memberFindManyMock.mockResolvedValue([]);
    memberCountMock.mockResolvedValue(0);

    const res = await request('POST', '/api/users', {});

    expect(res.status).toBe(200);
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('POST', '/api/users', {});
    expect(res.status).toBe(401);
    expect(memberFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the lookup pipeline throws', async () => {
    withCallerRole('admin');
    memberFindManyMock.mockRejectedValue(new Error('db down'));
    memberCountMock.mockResolvedValue(0);

    const res = await request('POST', '/api/users', {});

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to list users' });
  });
});

// ── POST /invite — invite user ────────────────────────────────────────

describe('POST /api/users/invite — body validation', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request('POST', '/api/users/invite', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Email is required' });
  });

  it('returns 400 when email is empty string', async () => {
    const res = await request('POST', '/api/users/invite', { email: '' });
    expect(res.status).toBe(400);
  });

  it('falls back to empty-string orgId when no org context exists', async () => {
    currentOrgId = undefined;
    withCallerRole(null);
    const res = await request('POST', '/api/users/invite', { email: 'x@y' });
    expect(res.status).toBe(403);
    // Confirm we passed orgId='' through
    expect(memberFindUniqueMock).toHaveBeenCalledWith({
      where: { user_id_organisation_id: { user_id: 'admin-1', organisation_id: '' } },
    });
  });
});

describe('POST /api/users/invite — role gate', () => {
  it('returns 403 when caller has no membership', async () => {
    withCallerRole(null);
    const res = await request('POST', '/api/users/invite', { email: 'new@x' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Only admins can invite users' });
  });

  it('returns 403 for non-admin role', async () => {
    withCallerRole('member');
    const res = await request('POST', '/api/users/invite', { email: 'new@x' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/users/invite — happy path (new email)', () => {
  it('creates an invitation, sends email, and returns the token + expiry', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce(null); // existingUser lookup
    inviteFindFirstMock.mockResolvedValue(null); // no pending invite
    const expiresAt = new Date('2025-12-31T00:00:00Z');
    inviteCreateMock.mockResolvedValue({
      id: 'invite-1',
      token: 'tok-abc',
      expires_at: expiresAt,
    });
    userFindUniqueMock.mockResolvedValueOnce({ name: 'Inviter' }); // inviter lookup
    orgFindUniqueMock.mockResolvedValueOnce({ name: 'Acme' });

    const res = await request('POST', '/api/users/invite', { email: 'new@x', role: 'Admin' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Invitation created');
    expect(res.body.token).toBe('tok-abc');
    expect(res.body.expiresAt).toBe(expiresAt.toISOString());
    expect(inviteCreateMock).toHaveBeenCalledTimes(1);
    expect(inviteCreateMock.mock.calls[0][0].data.role).toBe('admin');
    expect(sendOrgInviteEmailMock).toHaveBeenCalledWith({
      to: 'new@x',
      inviterName: 'Inviter',
      orgName: 'Acme',
      token: 'tok-abc',
    });
  });

  it('falls back to "A team member" / "your team" when inviter or org lookups return null', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce(null); // existing user
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({
      id: 'invite-1',
      token: 'tok-fb',
      expires_at: new Date(),
    });
    userFindUniqueMock.mockResolvedValueOnce(null); // inviter — null!
    orgFindUniqueMock.mockResolvedValueOnce(null); // org — null!

    const res = await request('POST', '/api/users/invite', { email: 'new@x' });

    expect(res.status).toBe(200);
    expect(sendOrgInviteEmailMock).toHaveBeenCalledWith({
      to: 'new@x',
      inviterName: 'A team member',
      orgName: 'your team',
      token: 'tok-fb',
    });
  });

  it('defaults role to "member" when role is not provided', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce(null);
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({ id: 'i', token: 't', expires_at: new Date() });
    userFindUniqueMock.mockResolvedValueOnce({ name: 'I' });
    orgFindUniqueMock.mockResolvedValueOnce({ name: 'O' });

    await request('POST', '/api/users/invite', { email: 'new@x' });

    expect(inviteCreateMock.mock.calls[0][0].data.role).toBe('member');
  });

  it('coerces unknown role values to "member"', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce(null);
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({ id: 'i', token: 't', expires_at: new Date() });
    userFindUniqueMock.mockResolvedValueOnce({ name: 'I' });
    orgFindUniqueMock.mockResolvedValueOnce({ name: 'O' });

    await request('POST', '/api/users/invite', { email: 'new@x', role: 'WizardKing' });

    expect(inviteCreateMock.mock.calls[0][0].data.role).toBe('member');
  });
});

describe('POST /api/users/invite — existing-user shortcut', () => {
  it('adds existing user immediately and marks the invitation as accepted', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce({
      id: 'u-existing',
      organisation_id: 'org-1',
    });
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({ id: 'inv-1', token: 'tok', expires_at: new Date() });
    memberCreateMock.mockResolvedValue({});
    inviteUpdateMock.mockResolvedValue({});

    const res = await request('POST', '/api/users/invite', { email: 'existing@x', role: 'Admin' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'User added to team',
      immediate: true,
    });
    expect(memberCreateMock).toHaveBeenCalledWith({
      data: { user_id: 'u-existing', organisation_id: 'org-1', role: 'admin' },
    });
    expect(inviteUpdateMock).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { accepted_at: expect.any(Date) },
    });
    // No outbound email when the user is already in our system.
    expect(sendOrgInviteEmailMock).not.toHaveBeenCalled();
  });

  it('updates existing user default org when they have none', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce({
      id: 'u-existing',
      organisation_id: null,
    });
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockResolvedValue({ id: 'inv-1', token: 't', expires_at: new Date() });
    memberCreateMock.mockResolvedValue({});
    userUpdateMock.mockResolvedValue({});
    inviteUpdateMock.mockResolvedValue({});

    const res = await request('POST', '/api/users/invite', { email: 'orphan@x' });

    expect(res.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'u-existing' },
      data: { organisation_id: 'org-1' },
    });
  });

  it('returns 409 when existing user is already a member of this org', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce({
      id: 'u-existing',
      organisation_id: 'org-1',
    });
    // existingMember check returns truthy
    memberFindUniqueMock.mockResolvedValueOnce({ role: 'member' });

    const res = await request('POST', '/api/users/invite', { email: 'existing@x' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'User is already a member of this team' });
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/users/invite — duplicate-invite gate', () => {
  it('returns 409 when a pending invitation already exists', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce(null); // no existing user
    inviteFindFirstMock.mockResolvedValue({ id: 'pending', token: 'old' });

    const res = await request('POST', '/api/users/invite', { email: 'new@x' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'An invitation has already been sent to this email' });
    expect(inviteCreateMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/users/invite — internal errors', () => {
  it('returns 500 when invite create throws', async () => {
    withCallerRole('admin');
    userFindUniqueMock.mockResolvedValueOnce(null);
    inviteFindFirstMock.mockResolvedValue(null);
    inviteCreateMock.mockRejectedValue(new Error('db down'));

    const res = await request('POST', '/api/users/invite', { email: 'new@x' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to invite user' });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('POST', '/api/users/invite', { email: 'new@x' });
    expect(res.status).toBe(401);
  });
});

// ── POST /invite/accept ───────────────────────────────────────────────

describe('POST /api/users/invite/accept', () => {
  it('returns 400 when token is missing', async () => {
    const res = await request('POST', '/api/users/invite/accept', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Token is required' });
  });

  it('returns 404 when token is unknown', async () => {
    inviteFindUniqueMock.mockResolvedValue(null);

    const res = await request('POST', '/api/users/invite/accept', { token: 'bogus' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Invalid invitation' });
  });

  it('returns 400 when invitation has already been accepted', async () => {
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'admin@x.com',
      organisation_id: 'org-1',
      role: 'member',
      accepted_at: new Date('2025-01-01'),
      expires_at: new Date(Date.now() + 100000),
    });

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invitation already accepted' });
  });

  it('returns 400 when invitation is expired', async () => {
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'admin@x.com',
      organisation_id: 'org-1',
      role: 'member',
      accepted_at: null,
      expires_at: new Date('2020-01-01'),
    });

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invitation expired' });
  });

  it('returns 403 when caller email does not match invitation email (findings #5)', async () => {
    // Anyone who learns a token (forwarded email, leaked link) used
    // to be able to accept the invitation as themselves and join a
    // team they were never invited to. The route now requires the
    // authenticated user's email to match the invitation's recipient.
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'invited@x.com',
      organisation_id: 'org-target',
      role: 'admin',
      accepted_at: null,
      expires_at: new Date(Date.now() + 100000),
    });
    userFindUniqueMock.mockResolvedValueOnce({ email: 'attacker@x.com' });

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'This invitation was sent to a different email address',
    });
    expect(memberUpsertMock).not.toHaveBeenCalled();
    expect(inviteUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller user record is missing (findings #5)', async () => {
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'invited@x.com',
      organisation_id: 'org-target',
      role: 'admin',
      accepted_at: null,
      expires_at: new Date(Date.now() + 100000),
    });
    userFindUniqueMock.mockResolvedValueOnce(null);

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(403);
    expect(memberUpsertMock).not.toHaveBeenCalled();
  });

  it('upserts membership, marks invitation accepted, and links default org when missing', async () => {
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'admin@x.com',
      organisation_id: 'org-target',
      role: 'admin',
      accepted_at: null,
      expires_at: new Date(Date.now() + 100000),
    });
    memberUpsertMock.mockResolvedValue({});
    inviteUpdateMock.mockResolvedValue({});
    // First lookup: email-match check (findings #5).
    // Second lookup: default-org linking.
    userFindUniqueMock
      .mockResolvedValueOnce({ email: 'admin@x.com' })
      .mockResolvedValueOnce({ id: 'admin-1', organisation_id: null });
    userUpdateMock.mockResolvedValue({});
    orgFindUniqueMock.mockResolvedValueOnce({ id: 'org-target', name: 'Target' });

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      organisation: { id: 'org-target', name: 'Target' },
    });
    expect(memberUpsertMock).toHaveBeenCalledTimes(1);
    expect(memberUpsertMock.mock.calls[0][0]).toMatchObject({
      where: {
        user_id_organisation_id: { user_id: 'admin-1', organisation_id: 'org-target' },
      },
      update: { role: 'admin' },
    });
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { organisation_id: 'org-target' },
    });
  });

  it('matches emails case-insensitively (findings #5)', async () => {
    // Email comparison is case-insensitive (mailbox part is locally
    // case-sensitive in spec but every real-world provider folds).
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'Admin@X.com',
      organisation_id: 'org-target',
      role: 'admin',
      accepted_at: null,
      expires_at: new Date(Date.now() + 100000),
    });
    memberUpsertMock.mockResolvedValue({});
    inviteUpdateMock.mockResolvedValue({});
    userFindUniqueMock
      .mockResolvedValueOnce({ email: 'admin@x.com' })
      .mockResolvedValueOnce({ id: 'admin-1', organisation_id: 'existing' });
    orgFindUniqueMock.mockResolvedValueOnce({ id: 'org-target', name: 'Target' });

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(200);
  });

  it('does not update default org when user already has one', async () => {
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'admin@x.com',
      organisation_id: 'org-target',
      role: 'member',
      accepted_at: null,
      expires_at: new Date(Date.now() + 100000),
    });
    memberUpsertMock.mockResolvedValue({});
    inviteUpdateMock.mockResolvedValue({});
    userFindUniqueMock
      .mockResolvedValueOnce({ email: 'admin@x.com' })
      .mockResolvedValueOnce({ id: 'admin-1', organisation_id: 'existing-default' });
    orgFindUniqueMock.mockResolvedValueOnce({ id: 'org-target', name: 'Target' });

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(200);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('handles user lookup returning null on the default-org check (still calls update because optional-chain falls through)', async () => {
    // `if (!user?.organisation_id)` — when user is null, optional-chain
    // yields undefined which is falsy, so the linking branch fires.
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'admin@x.com',
      organisation_id: 'org-target',
      role: 'member',
      accepted_at: null,
      expires_at: new Date(Date.now() + 100000),
    });
    memberUpsertMock.mockResolvedValue({});
    inviteUpdateMock.mockResolvedValue({});
    userFindUniqueMock
      .mockResolvedValueOnce({ email: 'admin@x.com' })
      .mockResolvedValueOnce(null);
    userUpdateMock.mockResolvedValue({});
    orgFindUniqueMock.mockResolvedValueOnce(null);

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, organisation: null });
    expect(userUpdateMock).toHaveBeenCalled();
  });

  it('returns 500 when upsert throws', async () => {
    inviteFindUniqueMock.mockResolvedValue({
      id: 'i1',
      email: 'admin@x.com',
      organisation_id: 'org-target',
      role: 'member',
      accepted_at: null,
      expires_at: new Date(Date.now() + 100000),
    });
    userFindUniqueMock.mockResolvedValueOnce({ email: 'admin@x.com' });
    memberUpsertMock.mockRejectedValue(new Error('FK violation'));

    const res = await request('POST', '/api/users/invite/accept', { token: 't' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to accept invitation' });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('POST', '/api/users/invite/accept', { token: 't' });
    expect(res.status).toBe(401);
  });
});

// ── GET /invitations ──────────────────────────────────────────────────

describe('GET /api/users/invitations', () => {
  it('returns pending invitations when caller is admin', async () => {
    withCallerRole('admin');
    const invitations = [
      {
        id: 'i1',
        email: 'a@x',
        role: 'admin',
        created_at: new Date(),
        expires_at: new Date(),
      },
    ];
    inviteFindManyMock.mockResolvedValue(invitations);

    const res = await fetch(`${baseUrl}/api/users/invitations?organisationId=other`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    // Confirm we use the query-param org and filter on accepted_at: null + non-expired
    const findManyArg = inviteFindManyMock.mock.calls[0][0];
    expect(findManyArg.where.organisation_id).toBe('other');
    expect(findManyArg.where.accepted_at).toBeNull();
    expect(findManyArg.where.expires_at).toEqual({ gt: expect.any(Date) });
  });

  it('falls back to req.organisationId when query is absent', async () => {
    withCallerRole('owner');
    inviteFindManyMock.mockResolvedValue([]);

    const res = await fetch(`${baseUrl}/api/users/invitations`);

    expect(res.status).toBe(200);
    expect(inviteFindManyMock.mock.calls[0][0].where.organisation_id).toBe('org-1');
  });

  it('falls back to empty string when no org context exists', async () => {
    currentOrgId = undefined;
    withCallerRole(null);

    const res = await fetch(`${baseUrl}/api/users/invitations`);
    expect(res.status).toBe(403);
  });

  it('returns 403 when caller is not admin', async () => {
    withCallerRole('member');

    const res = await fetch(`${baseUrl}/api/users/invitations`);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ message: 'Admin access required' });
  });

  it('returns 403 when caller has no membership', async () => {
    withCallerRole(null);
    const res = await fetch(`${baseUrl}/api/users/invitations`);
    expect(res.status).toBe(403);
  });

  it('returns 500 when prisma findMany throws', async () => {
    withCallerRole('admin');
    inviteFindManyMock.mockRejectedValue(new Error('db down'));

    const res = await fetch(`${baseUrl}/api/users/invitations`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ message: 'Failed to list invitations' });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await fetch(`${baseUrl}/api/users/invitations`);
    expect(res.status).toBe(401);
  });
});

// ── POST /update-role ────────────────────────────────────────────────

describe('POST /api/users/update-role', () => {
  it('returns 400 when userId is missing', async () => {
    const res = await request('POST', '/api/users/update-role', { role: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'userId and role are required' });
  });

  it('returns 400 when role is missing', async () => {
    const res = await request('POST', '/api/users/update-role', { userId: 'u' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await request('POST', '/api/users/update-role', {
      userId: 'u',
      role: 'wizardKing',
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid role' });
  });

  it('returns 403 when caller has no membership', async () => {
    withCallerRole(null);
    const res = await request('POST', '/api/users/update-role', {
      userId: 'u',
      role: 'member',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Only admins can change roles' });
  });

  it('returns 403 when caller is non-admin', async () => {
    withCallerRole('member');
    const res = await request('POST', '/api/users/update-role', {
      userId: 'u',
      role: 'member',
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when caller tries to change own role', async () => {
    withCallerRole('admin');
    const res = await request('POST', '/api/users/update-role', {
      userId: 'admin-1', // === currentUserId
      role: 'member',
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Cannot change your own role' });
  });

  it('returns 403 when admin (not owner) tries to promote to admin', async () => {
    withCallerRole('admin');
    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'admin',
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Only owners can promote to admin or owner' });
  });

  it('returns 403 when admin tries to promote to owner', async () => {
    withCallerRole('admin');
    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'owner',
    });
    expect(res.status).toBe(403);
  });

  it('allows admin to demote a user to member', async () => {
    withCallerRole('admin');
    memberUpdateMock.mockResolvedValue({});

    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'member',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Role updated' });
    expect(memberUpdateMock).toHaveBeenCalledWith({
      where: {
        user_id_organisation_id: { user_id: 'other', organisation_id: 'org-1' },
      },
      data: { role: 'member' },
    });
  });

  it('allows owner to promote to admin', async () => {
    withCallerRole('owner');
    memberUpdateMock.mockResolvedValue({});

    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'admin',
    });

    expect(res.status).toBe(200);
    expect(memberUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'admin' } }),
    );
  });

  it('allows owner to promote to owner', async () => {
    withCallerRole('owner');
    memberUpdateMock.mockResolvedValue({});

    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'OWNER', // verify case-insensitive
    });

    expect(res.status).toBe(200);
    expect(memberUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: 'owner' } }),
    );
  });

  it('uses targetOrganisationId from body when provided', async () => {
    withCallerRole('owner');
    memberUpdateMock.mockResolvedValue({});

    await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'member',
      targetOrganisationId: 'other-org',
    });

    expect(memberUpdateMock.mock.calls[0][0].where).toEqual({
      user_id_organisation_id: {
        user_id: 'other',
        organisation_id: 'other-org',
      },
    });
  });

  it('blocks demotion of the last owner (findings #6)', async () => {
    // Without this guard an owner could be demoted to member and the
    // org would lose its last owner — only owners can promote to
    // admin/owner, so the org becomes unmanageable.
    withCallerRole('owner'); // caller
    memberFindUniqueMock.mockResolvedValueOnce({ role: 'owner' }); // target's current role
    memberCountMock.mockResolvedValueOnce(1); // only one owner remaining

    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'admin',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Cannot demote the last owner' });
    expect(memberUpdateMock).not.toHaveBeenCalled();
  });

  it('allows demotion of an owner when other owners remain (findings #6)', async () => {
    withCallerRole('owner');
    memberFindUniqueMock.mockResolvedValueOnce({ role: 'owner' });
    memberCountMock.mockResolvedValueOnce(3);
    memberUpdateMock.mockResolvedValue({});

    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'admin',
    });

    expect(res.status).toBe(200);
    expect(memberUpdateMock).toHaveBeenCalled();
  });

  it('returns 500 when prisma update throws', async () => {
    withCallerRole('admin');
    memberUpdateMock.mockRejectedValue(new Error('db down'));

    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'member',
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to update role' });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'member',
    });
    expect(res.status).toBe(401);
  });

  it('falls back to empty-string orgId when no org context is available', async () => {
    currentOrgId = undefined;
    withCallerRole(null);
    const res = await request('POST', '/api/users/update-role', {
      userId: 'other',
      role: 'member',
    });
    // No targetOrganisationId, no req.organisationId → orgId='' → caller
    // has no membership in '' → 403.
    expect(res.status).toBe(403);
    expect(memberFindUniqueMock).toHaveBeenCalledWith({
      where: { user_id_organisation_id: { user_id: 'admin-1', organisation_id: '' } },
    });
  });
});

// ── POST /remove ─────────────────────────────────────────────────────

describe('POST /api/users/remove', () => {
  it('returns 400 when userId is missing', async () => {
    const res = await request('POST', '/api/users/remove', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'userId is required' });
  });

  it('returns 403 when caller has no membership', async () => {
    withCallerRole(null);
    const res = await request('POST', '/api/users/remove', { userId: 'u' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Only admins can remove members' });
  });

  it('returns 403 when caller is non-admin', async () => {
    withCallerRole('member');
    const res = await request('POST', '/api/users/remove', { userId: 'u' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when caller tries to remove themselves', async () => {
    withCallerRole('admin');
    const res = await request('POST', '/api/users/remove', { userId: 'admin-1' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Cannot remove yourself' });
  });

  it('returns 403 when admin tries to remove an owner', async () => {
    withCallerRole('admin'); // caller
    memberFindUniqueMock.mockResolvedValueOnce({ role: 'owner' }); // target
    const res = await request('POST', '/api/users/remove', { userId: 'owner-target' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Cannot remove an owner' });
    expect(memberDeleteManyMock).not.toHaveBeenCalled();
  });

  it('allows owner to remove an owner when other owners remain', async () => {
    withCallerRole('owner'); // caller
    memberFindUniqueMock.mockResolvedValueOnce({ role: 'owner' }); // target
    // findings.md #6 — 2 remaining owners means removal is safe.
    memberCountMock.mockResolvedValueOnce(2);
    memberDeleteManyMock.mockResolvedValue({ count: 1 });
    userFindUniqueMock.mockResolvedValueOnce({ organisation_id: 'other-org' });

    const res = await request('POST', '/api/users/remove', { userId: 'owner-target' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(memberDeleteManyMock).toHaveBeenCalledWith({
      where: { user_id: 'owner-target', organisation_id: 'org-1' },
    });
    // user's default org was different — leave it alone
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('blocks removal of the last owner (findings #6)', async () => {
    // Without this guard an owner could be removed and leave the org
    // unmanageable: only owners can promote other members up to admin
    // or owner, so a zero-owner org can never recover.
    withCallerRole('owner'); // caller
    memberFindUniqueMock.mockResolvedValueOnce({ role: 'owner' }); // target
    memberCountMock.mockResolvedValueOnce(1);

    const res = await request('POST', '/api/users/remove', { userId: 'owner-target' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Cannot remove the last owner' });
    expect(memberDeleteManyMock).not.toHaveBeenCalled();
  });

  it('clears default org when removed user had it set as default', async () => {
    withCallerRole('admin'); // caller
    memberFindUniqueMock.mockResolvedValueOnce({ role: 'member' }); // target
    memberDeleteManyMock.mockResolvedValue({ count: 1 });
    userFindUniqueMock.mockResolvedValueOnce({ organisation_id: 'org-1' });
    userUpdateMock.mockResolvedValue({});

    const res = await request('POST', '/api/users/remove', { userId: 'target' });

    expect(res.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'target' },
      data: { organisation_id: null },
    });
  });

  it('does not touch user.update when removed user has no record (lookup returns null)', async () => {
    withCallerRole('admin');
    memberFindUniqueMock.mockResolvedValueOnce(null); // target
    memberDeleteManyMock.mockResolvedValue({ count: 1 });
    userFindUniqueMock.mockResolvedValueOnce(null);

    const res = await request('POST', '/api/users/remove', { userId: 'gone' });

    expect(res.status).toBe(200);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 500 when delete throws', async () => {
    withCallerRole('admin');
    memberFindUniqueMock.mockResolvedValueOnce({ role: 'member' });
    memberDeleteManyMock.mockRejectedValue(new Error('db down'));

    const res = await request('POST', '/api/users/remove', { userId: 'target' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to remove user' });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('POST', '/api/users/remove', { userId: 'u' });
    expect(res.status).toBe(401);
  });

  it('falls back to empty-string orgId when no org context is available', async () => {
    currentOrgId = undefined;
    withCallerRole(null);
    const res = await request('POST', '/api/users/remove', { userId: 'u' });
    expect(res.status).toBe(403);
    expect(memberFindUniqueMock).toHaveBeenCalledWith({
      where: { user_id_organisation_id: { user_id: 'admin-1', organisation_id: '' } },
    });
  });
});
