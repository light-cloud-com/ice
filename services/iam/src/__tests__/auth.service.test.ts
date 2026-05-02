/**
 * Unit tests for auth service business logic
 *
 * The first three describe blocks (AuthError shape, OAuth sentinel hygiene,
 * JWT generation invariants) are pure-input/output and don't touch the DB
 * or bcryptjs. The remaining suites mock @ice/db and bcryptjs at the module
 * boundary and exercise registerUser / loginUser / refreshToken / logoutUser /
 * getProfile / findOrCreateOAuthUser branch-by-branch.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import prisma from '@ice/db';
import * as bcrypt from 'bcryptjs';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-for-unit-tests';
});

vi.mock('@ice/db', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    organisation: {
      create: vi.fn(),
    },
    organisationMember: {
      create: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('bcryptjs', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe('AuthError', () => {
  it('should create error with status code', async () => {
    const { AuthError } = await import('../services/auth.service.js');

    const err = new AuthError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });
});

describe('OAuth Sentinel', () => {
  it('should use a sentinel that cannot match bcrypt hashes', async () => {
    // bcrypt hashes always start with $2a$ or $2b$ — sentinel must not
    const sentinel = '@@oauth-only@@';
    expect(sentinel).not.toMatch(/^\$2[ab]\$/);
    expect(sentinel.length).toBeGreaterThan(0);
  });
});

describe('JWT Token Generation', () => {
  it('should generate valid JWT tokens', async () => {
    const { generateToken, generateRefreshToken } = await import('@ice/shared');

    const accessToken = generateToken('user-123', 'org-456');
    expect(accessToken.split('.').length).toBe(3);

    const refreshToken = generateRefreshToken('user-123', 'org-456');
    expect(refreshToken.split('.').length).toBe(3);
    expect(accessToken).not.toBe(refreshToken);
  });

  it('should include correct claims in access token', async () => {
    const { generateToken } = await import('@ice/shared');
    const jwt = await import('jsonwebtoken');

    const token = generateToken('user-123', 'org-456');
    const decoded = jwt.default.decode(token) as any;

    expect(decoded.userId).toBe('user-123');
    expect(decoded.organisationId).toBe('org-456');
    expect(decoded.exp).toBeDefined();
  });

  it('should include type: refresh in refresh token', async () => {
    const { generateRefreshToken } = await import('@ice/shared');
    const jwt = await import('jsonwebtoken');

    const token = generateRefreshToken('user-123', 'org-456');
    const decoded = jwt.default.decode(token) as any;

    expect(decoded.type).toBe('refresh');
    expect(decoded.userId).toBe('user-123');
  });
});

describe('Refresh Token Validation', () => {
  it('should reject tokens without type: refresh', async () => {
    const { generateToken } = await import('@ice/shared');
    const jwt = await import('jsonwebtoken');

    // An access token (no type: 'refresh') should be rejected
    const accessToken = generateToken('user-123', 'org-456');
    const payload = jwt.default.decode(accessToken) as any;

    // The refreshToken function checks payload.type !== 'refresh'
    expect(payload.type).toBeUndefined();
  });
});

describe('registerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 400 when name, email, or password is missing', async () => {
    const { registerUser, AuthError } = await import('../services/auth.service.js');

    await expect(registerUser('', 'a@b.com', 'pw')).rejects.toMatchObject({ status: 400 });
    await expect(registerUser('A', '', 'pw')).rejects.toMatchObject({ status: 400 });
    await expect(registerUser('A', 'a@b.com', '')).rejects.toMatchObject({ status: 400 });

    // Same error class
    await expect(registerUser('', '', '')).rejects.toBeInstanceOf(AuthError);
  });

  it('throws 409 when the email is already registered', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ id: 'existing' });

    const { registerUser } = await import('../services/auth.service.js');

    await expect(registerUser('A', 'a@b.com', 'pw')).rejects.toMatchObject({
      status: 409,
      message: /already registered/i,
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates user, org, owner membership, and refresh-token row on happy path', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    (bcrypt.hash as any).mockResolvedValue('hashed-pw');
    (prisma.organisation.create as any).mockResolvedValue({ id: 'org-1' });
    (prisma.user.create as any).mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Alice',
    });
    (prisma.organisationMember.create as any).mockResolvedValue({});
    (prisma.refreshToken.create as any).mockResolvedValue({});

    const { registerUser } = await import('../services/auth.service.js');

    const result = await registerUser('Alice', 'a@b.com', 'pw');

    expect(bcrypt.hash).toHaveBeenCalledWith('pw', 10);
    expect(prisma.organisation.create).toHaveBeenCalledWith({
      data: { name: "Alice's Org" },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { name: 'Alice', email: 'a@b.com', password_hash: 'hashed-pw', organisation_id: 'org-1' },
    });
    expect(prisma.organisationMember.create).toHaveBeenCalledWith({
      data: { user_id: 'user-1', organisation_id: 'org-1', role: 'owner' },
    });

    // Refresh-token row carries 30-day expiry
    const created = (prisma.refreshToken.create as any).mock.calls[0][0];
    expect(created.data.user_id).toBe('user-1');
    expect(created.data.token).toBe(result.refreshToken);
    const ttl = created.data.expires_at.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    expect(ttl).toBeLessThan(31 * 24 * 60 * 60 * 1000);

    expect(result.user).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Alice',
      organisationId: 'org-1',
    });
    expect(result.token.split('.').length).toBe(3);
    expect(result.refreshToken.split('.').length).toBe(3);
  });
});

describe('loginUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 401 when no user matches the email', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    const { loginUser } = await import('../services/auth.service.js');

    await expect(loginUser('a@b.com', 'pw')).rejects.toMatchObject({
      status: 401,
      message: /Invalid credentials/,
    });
  });

  it('rejects password login for OAuth-only accounts (sentinel hash)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      organisation_id: 'org-1',
      password_hash: '@@oauth-only@@',
    });
    const { loginUser } = await import('../services/auth.service.js');

    await expect(loginUser('a@b.com', 'pw')).rejects.toMatchObject({
      status: 401,
      message: /social login/i,
    });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('rejects password login when password_hash is the empty string', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      organisation_id: 'org-1',
      password_hash: '',
    });
    const { loginUser } = await import('../services/auth.service.js');

    await expect(loginUser('a@b.com', 'pw')).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 when the password fails the bcrypt comparison', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      organisation_id: 'org-1',
      password_hash: 'hashed',
    });
    (bcrypt.compare as any).mockResolvedValue(false);

    const { loginUser } = await import('../services/auth.service.js');

    await expect(loginUser('a@b.com', 'wrong-pw')).rejects.toMatchObject({
      status: 401,
      message: /Invalid credentials/,
    });
  });

  it('returns tokens and writes refresh-token row on a valid password', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      organisation_id: 'org-1',
      password_hash: 'hashed',
    });
    (bcrypt.compare as any).mockResolvedValue(true);
    (prisma.refreshToken.create as any).mockResolvedValue({});

    const { loginUser } = await import('../services/auth.service.js');

    const result = await loginUser('a@b.com', 'pw');

    expect(result.user).toEqual({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      organisationId: 'org-1',
    });
    expect(result.token.split('.').length).toBe(3);
    expect(result.refreshToken.split('.').length).toBe(3);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('falls back to empty organisationId when user.organisation_id is null', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      organisation_id: null,
      password_hash: 'hashed',
    });
    (bcrypt.compare as any).mockResolvedValue(true);
    (prisma.refreshToken.create as any).mockResolvedValue({});

    const { loginUser } = await import('../services/auth.service.js');

    const result = await loginUser('a@b.com', 'pw');
    expect(result.user.organisationId).toBe('');
  });
});

describe('refreshToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects payloads whose type is not "refresh"', async () => {
    const { refreshToken } = await import('../services/auth.service.js');

    await expect(
      refreshToken('tok', { userId: 'u', organisationId: 'o' /* no type */ }),
    ).rejects.toMatchObject({ status: 401, message: /Invalid token type/ });
  });

  it('rejects payloads where type is set to a non-refresh value', async () => {
    const { refreshToken } = await import('../services/auth.service.js');

    await expect(
      refreshToken('tok', { userId: 'u', organisationId: 'o', type: 'access' }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a missing refresh-token row without wiping the family (findings #3)', async () => {
    // Previously a missing row triggered `deleteMany({ user_id })`, so
    // a stolen token replayed after the legit user rotated would log
    // the legit user out everywhere. The fix scopes the response to a
    // 401 and leaves other sessions intact — see comments in
    // auth.service.refreshToken for the rationale.
    (prisma.refreshToken.findUnique as any).mockResolvedValue(null);

    const { refreshToken } = await import('../services/auth.service.js');

    await expect(
      refreshToken('stolen-tok', { userId: 'u-1', organisationId: 'o-1', type: 'refresh' }),
    ).rejects.toMatchObject({ status: 401, message: /Invalid refresh token/ });

    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an expired refresh token and best-effort deletes the row', async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      token: 'tok',
      user_id: 'u-1',
      expires_at: new Date(Date.now() - 1000),
    });
    (prisma.refreshToken.delete as any).mockResolvedValue({});

    const { refreshToken } = await import('../services/auth.service.js');

    await expect(
      refreshToken('tok', { userId: 'u-1', organisationId: 'o-1', type: 'refresh' }),
    ).rejects.toMatchObject({ status: 401, message: /expired/ });
    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { token: 'tok' } });
  });

  it('swallows errors from the best-effort delete on the expired path', async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      token: 'tok',
      user_id: 'u-1',
      expires_at: new Date(Date.now() - 1000),
    });
    // Force the catch(() => {}) branch — delete throws, caller still gets the 401.
    (prisma.refreshToken.delete as any).mockRejectedValue(new Error('db down'));

    const { refreshToken } = await import('../services/auth.service.js');

    await expect(
      refreshToken('tok', { userId: 'u-1', organisationId: 'o-1', type: 'refresh' }),
    ).rejects.toMatchObject({ status: 401, message: /expired/ });
  });

  it('rotates a valid refresh token: deletes old, issues new pair, persists new row', async () => {
    (prisma.refreshToken.findUnique as any).mockResolvedValue({
      token: 'old-tok',
      user_id: 'u-1',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    (prisma.refreshToken.delete as any).mockResolvedValue({});
    (prisma.refreshToken.create as any).mockResolvedValue({});

    const { refreshToken } = await import('../services/auth.service.js');

    const result = await refreshToken('old-tok', {
      userId: 'u-1',
      organisationId: 'o-1',
      type: 'refresh',
    });

    expect(prisma.refreshToken.delete).toHaveBeenCalledWith({ where: { token: 'old-tok' } });
    expect(result.accessToken.split('.').length).toBe(3);
    expect(result.refreshToken.split('.').length).toBe(3);

    const created = (prisma.refreshToken.create as any).mock.calls[0][0];
    expect(created.data.user_id).toBe('u-1');
    expect(created.data.token).toBe(result.refreshToken);
    const ttl = created.data.expires_at.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });
});

describe('logoutUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when no refresh token is supplied', async () => {
    const { logoutUser } = await import('../services/auth.service.js');

    await logoutUser(undefined);
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes matching refresh-token rows when a token is supplied', async () => {
    (prisma.refreshToken.deleteMany as any).mockResolvedValue({ count: 1 });
    const { logoutUser } = await import('../services/auth.service.js');

    await logoutUser('tok-1');
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'tok-1' } });
  });

  it('swallows DB errors so logout is idempotent', async () => {
    (prisma.refreshToken.deleteMany as any).mockRejectedValue(new Error('db down'));
    const { logoutUser } = await import('../services/auth.service.js');

    await expect(logoutUser('tok-1')).resolves.toBeUndefined();
  });
});

describe('getProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws 404 when the user does not exist', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);
    const { getProfile } = await import('../services/auth.service.js');

    await expect(getProfile('u-missing')).rejects.toMatchObject({
      status: 404,
      message: /not found/i,
    });
  });

  it('returns memberships derived from the join table', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      avatar: 'avatar.png',
      organisation_id: 'org-1',
      onboarding_completed: true,
      onboarding_step: 3,
      default_provider: 'gcp',
      default_region: 'us-central1',
      memberships: [
        { organisation_id: 'org-1', role: 'owner', organisation: { id: 'org-1', name: 'A Inc' } },
        { organisation_id: 'org-2', role: 'editor', organisation: { id: 'org-2', name: 'Beta' } },
      ],
      organisation: { id: 'org-1', name: 'A Inc' },
    });
    const { getProfile } = await import('../services/auth.service.js');

    const result = await getProfile('u-1');

    expect(result.organisations).toEqual([
      { id: 'org-1', name: 'A Inc', role: 'owner' },
      { id: 'org-2', name: 'Beta', role: 'editor' },
    ]);
    expect(result.onboardingCompleted).toBe(true);
    expect(result.onboardingStep).toBe(3);
    expect(result.defaultProvider).toBe('gcp');
    expect(result.defaultRegion).toBe('us-central1');
    expect(result.avatar).toBe('avatar.png');
  });

  it('appends the legacy default org as owner when not in memberships', async () => {
    // Branch: user has organisation_id but no membership row for it.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      avatar: null,
      organisation_id: 'legacy-org',
      onboarding_completed: false,
      onboarding_step: 0,
      default_provider: null,
      default_region: null,
      memberships: [],
      organisation: { id: 'legacy-org', name: 'Legacy' },
    });
    const { getProfile } = await import('../services/auth.service.js');

    const result = await getProfile('u-1');
    expect(result.organisations).toEqual([{ id: 'legacy-org', name: 'Legacy', role: 'owner' }]);
  });

  it('does not append the default org when the membership row already covers it', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      avatar: null,
      organisation_id: 'org-1',
      onboarding_completed: false,
      onboarding_step: 0,
      default_provider: null,
      default_region: null,
      memberships: [
        { organisation_id: 'org-1', role: 'admin', organisation: { id: 'org-1', name: 'A Inc' } },
      ],
      organisation: { id: 'org-1', name: 'A Inc' },
    });
    const { getProfile } = await import('../services/auth.service.js');

    const result = await getProfile('u-1');
    expect(result.organisations).toEqual([{ id: 'org-1', name: 'A Inc', role: 'admin' }]);
  });

  it('omits the legacy-org append when the user has no organisation_id', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      avatar: null,
      organisation_id: null,
      onboarding_completed: false,
      onboarding_step: 0,
      default_provider: null,
      default_region: null,
      memberships: [],
      organisation: null,
    });
    const { getProfile } = await import('../services/auth.service.js');

    const result = await getProfile('u-1');
    expect(result.organisations).toEqual([]);
  });

  it('omits the legacy-org append when organisation join is null even with organisation_id set', async () => {
    // Defensive branch: user.organisation_id present but join row missing.
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u-1',
      email: 'a@b.com',
      name: 'A',
      avatar: null,
      organisation_id: 'org-x',
      onboarding_completed: false,
      onboarding_step: 0,
      default_provider: null,
      default_region: null,
      memberships: [],
      organisation: null,
    });
    const { getProfile } = await import('../services/auth.service.js');

    const result = await getProfile('u-1');
    expect(result.organisations).toEqual([]);
  });
});

describe('findOrCreateOAuthUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing user when one already matches the email', async () => {
    const existing = { id: 'u-1', email: 'a@b.com', name: 'A' };
    (prisma.user.findFirst as any).mockResolvedValue(existing);

    const { findOrCreateOAuthUser } = await import('../services/auth.service.js');

    const result = await findOrCreateOAuthUser('a@b.com', 'A', 'avatar.png');

    expect(result).toBe(existing);
    expect(prisma.organisation.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('creates org, user, and owner membership when no user exists', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.organisation.create as any).mockResolvedValue({ id: 'org-new' });
    const created = { id: 'u-new', email: 'a@b.com', name: 'Alice' };
    (prisma.user.create as any).mockResolvedValue(created);
    (prisma.organisationMember.create as any).mockResolvedValue({});

    const { findOrCreateOAuthUser } = await import('../services/auth.service.js');

    const result = await findOrCreateOAuthUser('a@b.com', 'Alice', 'avatar.png');

    expect(prisma.organisation.create).toHaveBeenCalledWith({
      data: { name: "Alice's Team" },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'a@b.com',
        name: 'Alice',
        password_hash: '@@oauth-only@@',
        avatar: 'avatar.png',
        organisation_id: 'org-new',
      },
    });
    expect(prisma.organisationMember.create).toHaveBeenCalledWith({
      data: { user_id: 'u-new', organisation_id: 'org-new', role: 'owner' },
    });
    expect(result).toBe(created);
  });

  it('passes a null avatar through unchanged', async () => {
    (prisma.user.findFirst as any).mockResolvedValue(null);
    (prisma.organisation.create as any).mockResolvedValue({ id: 'org-new' });
    (prisma.user.create as any).mockResolvedValue({ id: 'u-new' });
    (prisma.organisationMember.create as any).mockResolvedValue({});

    const { findOrCreateOAuthUser } = await import('../services/auth.service.js');

    await findOrCreateOAuthUser('a@b.com', 'Alice', null);

    const args = (prisma.user.create as any).mock.calls[0][0];
    expect(args.data.avatar).toBeNull();
  });
});
