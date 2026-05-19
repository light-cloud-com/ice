/**
 * HTTP tests for the Auth router (`/api/auth/...`).
 *
 * No supertest — boot a tiny in-process Express app on an ephemeral port.
 * `@ice/db`, `@ice/shared` (auth middleware), `jsonwebtoken`, and
 * `../services/auth.service` are mocked at the module boundary so the
 * router's job (token issuance, AuthError → status mapping) is exercised
 * without touching the real DB or signing real JWTs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks ─────────────────────────────────────────────────────────────

const memberFindUniqueMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    organisationMember: {
      findUnique: (...a: unknown[]) => memberFindUniqueMock(...a),
    },
  },
}));

const jwtSignMock = vi.fn();

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: (...a: unknown[]) => jwtSignMock(...a),
  },
}));

const getProfileMock = vi.fn();

// AuthError class — must mirror the real shape for `instanceof` checks.
class FakeAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

vi.mock('../../services/auth.service', () => ({
  getProfile: (...a: unknown[]) => getProfileMock(...a),
  AuthError: FakeAuthError,
}));

type AuthMode = 'allow' | 'no-auth';
let currentAuth: AuthMode = 'allow';
let currentUserId: string | undefined = 'user-1';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = currentUserId;
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
  // Force the test branch of the JWT_SECRET fallback.
  process.env.VITEST = 'true';
  delete process.env.JWT_SECRET;
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: authRouter } = await import('../auth');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

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

async function request(method: string, path: string, body?: unknown) {
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

// ── POST /switch-org — happy path ─────────────────────────────────────

describe('POST /api/auth/switch-org — happy path', () => {
  it('returns 200 with a freshly-issued token bound to the new org', async () => {
    memberFindUniqueMock.mockResolvedValue({
      user_id: 'user-1',
      organisation_id: 'org-2',
      role: 'member',
    });
    jwtSignMock.mockReturnValue('signed.jwt.token');

    const res = await request('POST', '/api/auth/switch-org', {
      organisationId: 'org-2',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'signed.jwt.token' });
    expect(memberFindUniqueMock).toHaveBeenCalledWith({
      where: {
        user_id_organisation_id: { user_id: 'user-1', organisation_id: 'org-2' },
      },
    });
    expect(jwtSignMock).toHaveBeenCalledWith(
      { userId: 'user-1', organisationId: 'org-2' },
      'test-secret',
      { expiresIn: '1h' },
    );
  });
});

// ── POST /switch-org — body validation ────────────────────────────────

describe('POST /api/auth/switch-org — body validation', () => {
  it('returns 400 when organisationId is missing', async () => {
    const res = await request('POST', '/api/auth/switch-org', {});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'organisationId is required' });
    expect(memberFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 400 when organisationId is empty string', async () => {
    const res = await request('POST', '/api/auth/switch-org', {
      organisationId: '',
    });

    expect(res.status).toBe(400);
    expect(memberFindUniqueMock).not.toHaveBeenCalled();
  });
});

// ── POST /switch-org — membership check ───────────────────────────────

describe('POST /api/auth/switch-org — membership', () => {
  it('returns 403 when caller is not a member of the target org', async () => {
    memberFindUniqueMock.mockResolvedValue(null);

    const res = await request('POST', '/api/auth/switch-org', {
      organisationId: 'org-not-mine',
    });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Not a member of this organisation' });
    expect(jwtSignMock).not.toHaveBeenCalled();
  });
});

// ── POST /switch-org — auth ───────────────────────────────────────────

describe('POST /api/auth/switch-org — auth', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';

    const res = await request('POST', '/api/auth/switch-org', {
      organisationId: 'org-2',
    });

    expect(res.status).toBe(401);
    expect(memberFindUniqueMock).not.toHaveBeenCalled();
  });
});

// ── POST /switch-org — internal errors ────────────────────────────────

describe('POST /api/auth/switch-org — internal errors', () => {
  it('returns 500 when the membership lookup throws', async () => {
    memberFindUniqueMock.mockRejectedValue(new Error('db down'));

    const res = await request('POST', '/api/auth/switch-org', {
      organisationId: 'org-2',
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to switch organisation' });
  });

  it('returns 500 when jwt.sign throws (e.g. missing secret in non-test env)', async () => {
    memberFindUniqueMock.mockResolvedValue({ role: 'member' });
    jwtSignMock.mockImplementation(() => {
      throw new Error('secretOrPrivateKey must have a value');
    });

    const res = await request('POST', '/api/auth/switch-org', {
      organisationId: 'org-2',
    });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to switch organisation' });
  });
});

// ── GET /me — happy path ──────────────────────────────────────────────

describe('GET /api/auth/me — happy path', () => {
  it('returns the profile from the auth service', async () => {
    const profile = {
      id: 'user-1',
      email: 'a@b.com',
      name: 'Ada',
      organisations: [{ id: 'org-1', name: 'Acme', role: 'owner' }],
    };
    getProfileMock.mockResolvedValue(profile);

    const res = await request('GET', '/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(profile);
    expect(getProfileMock).toHaveBeenCalledWith('user-1');
  });
});

// ── GET /me — error mapping ───────────────────────────────────────────

describe('GET /api/auth/me — service errors', () => {
  it('maps AuthError 404 to a 404 with the original message', async () => {
    getProfileMock.mockRejectedValue(new FakeAuthError('User not found', 404));

    const res = await request('GET', '/api/auth/me');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found' });
  });

  it('maps AuthError 401 to a 401 with the original message', async () => {
    getProfileMock.mockRejectedValue(new FakeAuthError('Token expired', 401));

    const res = await request('GET', '/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token expired' });
  });

  it('returns 500 with a generic message for non-AuthError exceptions', async () => {
    getProfileMock.mockRejectedValue(new Error('database connection lost: secret=xyz'));

    const res = await request('GET', '/api/auth/me');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to get profile' });
    // Make sure raw error text doesn't leak.
    expect(JSON.stringify(res.body)).not.toContain('secret=xyz');
  });
});

// ── GET /me — auth ────────────────────────────────────────────────────

describe('GET /api/auth/me — auth', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';

    const res = await request('GET', '/api/auth/me');

    expect(res.status).toBe(401);
    expect(getProfileMock).not.toHaveBeenCalled();
  });
});

// ── JWT_SECRET resolution ─────────────────────────────────────────────

describe('JWT_SECRET resolution', () => {
  it('uses JWT_SECRET from env when present', async () => {
    // Reset module cache so the new env value is picked up at import time.
    process.env.JWT_SECRET = 'real-prod-secret';
    process.env.NODE_ENV = 'test';
    vi.resetModules();

    const { default: routerWithRealSecret } = await import('../auth');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', routerWithRealSecret);

    const localServer = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const localBase = `http://127.0.0.1:${(localServer.address() as AddressInfo).port}`;

    memberFindUniqueMock.mockResolvedValue({ role: 'member' });
    jwtSignMock.mockReturnValue('signed.with.prod');

    await fetch(`${localBase}/api/auth/switch-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organisationId: 'org-2' }),
    });

    expect(jwtSignMock).toHaveBeenCalledWith(
      expect.any(Object),
      'real-prod-secret',
      expect.any(Object),
    );

    await new Promise<void>((resolve) => localServer.close(() => resolve()));
  });

  it('throws at module load when JWT_SECRET is missing and VITEST flag is unset', async () => {
    delete process.env.JWT_SECRET;
    const previousVitest = process.env.VITEST;
    delete process.env.VITEST;
    vi.resetModules();

    await expect(import('../auth')).rejects.toThrow('JWT_SECRET is required');

    // Restore for subsequent tests in case the suite uses ordered execution.
    if (previousVitest !== undefined) process.env.VITEST = previousVitest;
  });
});
