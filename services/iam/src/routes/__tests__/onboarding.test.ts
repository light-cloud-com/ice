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

  const { default: onboardingRouter } = await import('../onboarding');
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
  it('returns the onboarding fields + completedTours for the current user', async () => {
    const user = {
      onboarding_completed: false,
      onboarding_step: 2,
      default_provider: 'gcp',
      default_region: 'us-central1',
      completed_tours: null,
    };
    userFindUniqueMock.mockResolvedValue(user);

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      onboarding_completed: false,
      onboarding_step: 2,
      default_provider: 'gcp',
      default_region: 'us-central1',
      completedTours: [],
    });
    expect(userFindUniqueMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: {
        onboarding_completed: true,
        onboarding_step: true,
        default_provider: true,
        default_region: true,
        completed_tours: true,
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

// ── GET /status — completedTours parsing ──────────────────────────────

describe('GET /api/onboarding/status — completedTours', () => {
  it('returns completedTours: [] for fresh user with null DB value', async () => {
    userFindUniqueMock.mockResolvedValue({
      onboarding_completed: false,
      onboarding_step: 1,
      default_provider: null,
      default_region: null,
      completed_tours: null,
    });

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(200);
    expect(res.body.completedTours).toEqual([]);
  });

  it('returns the parsed array when DB has a JSON-encoded array', async () => {
    userFindUniqueMock.mockResolvedValue({
      onboarding_completed: true,
      onboarding_step: 6,
      default_provider: 'gcp',
      default_region: 'us-central1',
      completed_tours: JSON.stringify(['canvas-tour', 'palette-tour']),
    });

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(200);
    expect(res.body.completedTours).toEqual(['canvas-tour', 'palette-tour']);
  });

  it('treats malformed JSON in the column as []', async () => {
    userFindUniqueMock.mockResolvedValue({
      onboarding_completed: false,
      onboarding_step: 1,
      default_provider: null,
      default_region: null,
      completed_tours: '{not valid json',
    });

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(200);
    expect(res.body.completedTours).toEqual([]);
  });

  it('treats a non-array JSON value as []', async () => {
    userFindUniqueMock.mockResolvedValue({
      onboarding_completed: false,
      onboarding_step: 1,
      default_provider: null,
      default_region: null,
      completed_tours: '"canvas-tour"',
    });

    const res = await request('GET', '/api/onboarding/status');

    expect(res.status).toBe(200);
    expect(res.body.completedTours).toEqual([]);
  });
});

// ── PUT /completed-tours/:id — happy paths ────────────────────────────

describe('PUT /api/onboarding/completed-tours/:id — append', () => {
  it('appends id to a null completed_tours and returns the updated array', async () => {
    userFindUniqueMock.mockResolvedValue({ completed_tours: null });
    userUpdateMock.mockResolvedValue({});

    const res = await request('PUT', '/api/onboarding/completed-tours/canvas-tour');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ completedTours: ['canvas-tour'] });
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    const callArg = userUpdateMock.mock.calls[0][0];
    expect(callArg.where).toEqual({ id: 'user-1' });
    expect(callArg.data).toEqual({ completed_tours: JSON.stringify(['canvas-tour']) });
  });

  it('appends to an existing array', async () => {
    userFindUniqueMock.mockResolvedValue({
      completed_tours: JSON.stringify(['canvas-tour']),
    });
    userUpdateMock.mockResolvedValue({});

    const res = await request('PUT', '/api/onboarding/completed-tours/palette-tour');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ completedTours: ['canvas-tour', 'palette-tour'] });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({
      completed_tours: JSON.stringify(['canvas-tour', 'palette-tour']),
    });
  });

  it('is idempotent — second PUT with the same id is a no-op write', async () => {
    // First call: column is null, write happens.
    userFindUniqueMock.mockResolvedValueOnce({ completed_tours: null });
    userUpdateMock.mockResolvedValueOnce({});

    const first = await request('PUT', '/api/onboarding/completed-tours/canvas-tour');
    expect(first.body).toEqual({ completedTours: ['canvas-tour'] });

    // Second call: column already contains the id, no write.
    userFindUniqueMock.mockResolvedValueOnce({
      completed_tours: JSON.stringify(['canvas-tour']),
    });

    const second = await request('PUT', '/api/onboarding/completed-tours/canvas-tour');
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ completedTours: ['canvas-tour'] });
    // Only one update across both calls.
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('treats malformed JSON as [] then writes valid JSON on PUT', async () => {
    userFindUniqueMock.mockResolvedValue({ completed_tours: 'not json' });
    userUpdateMock.mockResolvedValue({});

    const res = await request('PUT', '/api/onboarding/completed-tours/canvas-tour');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ completedTours: ['canvas-tour'] });
    expect(userUpdateMock.mock.calls[0][0].data).toEqual({
      completed_tours: JSON.stringify(['canvas-tour']),
    });
  });

  it('two parallel PUTs of different ids both land in the final array', async () => {
    // Simulate the simplest "no contention" case where both PUTs see the
    // empty starting state but each writes its own id. The route's read
    // followed by write is naturally race-prone; this asserts the
    // route's local logic produces the right per-call result. The
    // production fix for true concurrency would be a transaction, which
    // is documented as a follow-up consideration.
    userFindUniqueMock.mockResolvedValue({ completed_tours: null });
    userUpdateMock.mockResolvedValue({});

    const [a, b] = await Promise.all([
      request('PUT', '/api/onboarding/completed-tours/canvas-tour'),
      request('PUT', '/api/onboarding/completed-tours/palette-tour'),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const all = new Set<string>([
      ...(a.body.completedTours as string[]),
      ...(b.body.completedTours as string[]),
    ]);
    expect(all.has('canvas-tour')).toBe(true);
    expect(all.has('palette-tour')).toBe(true);
    // Both PUTs trigger a write because each sees an empty state.
    expect(userUpdateMock).toHaveBeenCalledTimes(2);
  });

  it('accepts uppercase + dashes within the regex bounds', async () => {
    userFindUniqueMock.mockResolvedValue({ completed_tours: null });
    userUpdateMock.mockResolvedValue({});

    const res = await request('PUT', '/api/onboarding/completed-tours/Canvas-Tour-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ completedTours: ['Canvas-Tour-1'] });
  });
});

// ── PUT /completed-tours/:id — validation + error paths ───────────────

describe('PUT /api/onboarding/completed-tours/:id — invalid id', () => {
  it('returns 400 when id starts with a dash', async () => {
    const res = await request('PUT', '/api/onboarding/completed-tours/-bad');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Invalid tour id' });
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id contains an underscore', async () => {
    const res = await request('PUT', '/api/onboarding/completed-tours/canvas_tour');

    expect(res.status).toBe(400);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id is over 64 chars', async () => {
    const tooLong = 'a'.repeat(65);
    const res = await request('PUT', `/api/onboarding/completed-tours/${tooLong}`);

    expect(res.status).toBe(400);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('accepts an id of exactly 64 chars', async () => {
    const justRight = 'a'.repeat(64);
    userFindUniqueMock.mockResolvedValue({ completed_tours: null });
    userUpdateMock.mockResolvedValue({});

    const res = await request('PUT', `/api/onboarding/completed-tours/${justRight}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ completedTours: [justRight] });
  });
});

describe('PUT /api/onboarding/completed-tours/:id — auth + errors', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';

    const res = await request('PUT', '/api/onboarding/completed-tours/canvas-tour');

    expect(res.status).toBe(401);
    expect(userFindUniqueMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the user record does not exist', async () => {
    userFindUniqueMock.mockResolvedValue(null);

    const res = await request('PUT', '/api/onboarding/completed-tours/canvas-tour');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'User not found' });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 500 when prisma throws', async () => {
    userFindUniqueMock.mockRejectedValue(new Error('db down'));

    const res = await request('PUT', '/api/onboarding/completed-tours/canvas-tour');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to update completed tours' });
  });
});
