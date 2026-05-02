/**
 * HTTP tests for the Onboarding router (`/api/onboarding/...`).
 *
 * No supertest — boot a tiny in-process Express app on an ephemeral port.
 * Prisma + auth middleware are mocked at the module boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks ─────────────────────────────────────────────────────────────

const userFindUniqueMock = vi.fn();
const userUpdateMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    user: {
      findUnique: (...a: unknown[]) => userFindUniqueMock(...a),
      update: (...a: unknown[]) => userUpdateMock(...a),
    },
  },
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
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: onboardingRouter } = await import('../onboarding.js');
  const app = express();
  app.use(express.json());
  app.use('/api/onboarding', onboardingRouter);

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

// ── GET /status — happy path ──────────────────────────────────────────

describe('GET /api/onboarding/status — happy path', () => {
  it('returns the four onboarding fields for the current user', async () => {
    const user = {
      onboarding_completed: false,
      onboarding_step: 2,
      default_provider: 'gcp',
      default_region: 'us-central1',
    };
    userFindUniqueMock.mockResolvedValue(user);

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(user);
    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        onboarding_completed: true,
        onboarding_step: true,
        default_provider: true,
        default_region: true,
      },
    });
  });
});

// ── GET /status — not found ───────────────────────────────────────────

describe('GET /api/onboarding/status — user not found', () => {
  it('returns 404 when the user record does not exist', async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found' });
  });
});

// ── GET /status — auth + errors ───────────────────────────────────────

describe('GET /api/onboarding/status — error paths', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(401);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma throws', async () => {
    userFindUniqueMock.mockRejectedValue(new Error('db down'));

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to get onboarding status' });
  });
});

// ── PUT /step — happy paths ───────────────────────────────────────────

describe('PUT /api/onboarding/step — happy paths', () => {
  it('updates onboarding_step within range [1..6]', async () => {
    const updatedUser = {
      onboarding_completed: false,
      onboarding_step: 3,
      default_provider: null,
      default_region: null,
    };
    userUpdateMock.mockResolvedValue(updatedUser);

    const res = await request('PUT', '/api/onboarding/step', { step: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updatedUser);
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    const callArg = userUpdateMock.mock.calls[0][0];
    expect(callArg.where).toEqual({ id: 'user-1' });
    expect(callArg.data).toEqual({ onboarding_step: 3 });
  });

  it('accepts step=1 (lower boundary)', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', { step: 1 });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({ onboarding_step: 1 });
  });

  it('accepts step=6 (upper boundary)', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', { step: 6 });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({ onboarding_step: 6 });
  });

  it('omits onboarding_step when step is out of range (>6)', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', { step: 7 });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({});
  });

  it('omits onboarding_step when step is out of range (<1)', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', { step: 0 });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({});
  });

  it('omits onboarding_step when step is not a number', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', { step: '3' });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({});
  });

  it('saves defaultProvider when provided', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', { defaultProvider: 'gcp' });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({ default_provider: 'gcp' });
  });

  it('saves defaultRegion when provided', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', { defaultRegion: 'us-east1' });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({ default_region: 'us-east1' });
  });

  it('saves all three fields when all are provided', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', {
      step: 4,
      defaultProvider: 'gcp',
      defaultRegion: 'us-central1',
    });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({
      onboarding_step: 4,
      default_provider: 'gcp',
      default_region: 'us-central1',
    });
  });

  it('preserves explicit null values for defaultProvider/defaultRegion', async () => {
    // The route uses `!== undefined`, so explicit null reaches the data.
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', {
      defaultProvider: null,
      defaultRegion: null,
    });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({
      default_provider: null,
      default_region: null,
    });
  });

  it('passes empty data when no recognised fields are present', async () => {
    userUpdateMock.mockResolvedValue({});
    await request('PUT', '/api/onboarding/step', { unrelated: 'value' });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({});
  });
});

// ── PUT /step — auth + errors ─────────────────────────────────────────

describe('PUT /api/onboarding/step — error paths', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';

    const res = await request('PUT', '/api/onboarding/step', { step: 1 });

    expect(res.status).toBe(401);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma throws', async () => {
    userUpdateMock.mockRejectedValue(new Error('db down'));

    const res = await request('PUT', '/api/onboarding/step', { step: 2 });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to update onboarding step' });
  });
});

// ── PUT /complete ─────────────────────────────────────────────────────

describe('PUT /api/onboarding/complete', () => {
  it('marks onboarding_completed = true', async () => {
    const updated = {
      onboarding_completed: true,
      onboarding_step: 6,
      default_provider: 'gcp',
      default_region: 'us-east1',
    };
    userUpdateMock.mockResolvedValue(updated);

    const res = await request('PUT', '/api/onboarding/complete');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { onboarding_completed: true },
      select: {
        onboarding_completed: true,
        onboarding_step: true,
        default_provider: true,
        default_region: true,
      },
    });
  });

  it('is idempotent — calling complete twice still returns the same shape', async () => {
    userUpdateMock.mockResolvedValue({
      onboarding_completed: true,
      onboarding_step: 6,
      default_provider: null,
      default_region: null,
    });

    await request('PUT', '/api/onboarding/complete');
    const res = await request('PUT', '/api/onboarding/complete');

    expect(res.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledTimes(2);
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('PUT', '/api/onboarding/complete');
    expect(res.status).toBe(401);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma throws', async () => {
    userUpdateMock.mockRejectedValue(new Error('db down'));
    const res = await request('PUT', '/api/onboarding/complete');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to complete onboarding' });
  });
});

// ── PUT /skip ─────────────────────────────────────────────────────────

describe('PUT /api/onboarding/skip', () => {
  it('marks onboarding_completed = true and step = 6', async () => {
    const updated = {
      onboarding_completed: true,
      onboarding_step: 6,
      default_provider: null,
      default_region: null,
    };
    userUpdateMock.mockResolvedValue(updated);

    const res = await request('PUT', '/api/onboarding/skip');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { onboarding_completed: true, onboarding_step: 6 },
      select: {
        onboarding_completed: true,
        onboarding_step: true,
        default_provider: true,
        default_region: true,
      },
    });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('PUT', '/api/onboarding/skip');
    expect(res.status).toBe(401);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma throws', async () => {
    userUpdateMock.mockRejectedValue(new Error('db down'));
    const res = await request('PUT', '/api/onboarding/skip');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to skip onboarding' });
  });
});
