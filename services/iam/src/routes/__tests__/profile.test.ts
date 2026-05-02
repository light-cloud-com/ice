/**
 * HTTP tests for the Profile router (`/api/profile/...`).
 *
 * No supertest — boot a tiny in-process Express app on an ephemeral port
 * and hit it with `fetch`. Prisma + auth middleware are mocked at the
 * module boundary so the router's job (body normalization, error envelope)
 * is what we actually exercise.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks (must be hoisted before the router import) ──────────────────

const userUpdateMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    user: {
      update: (...args: unknown[]) => userUpdateMock(...args),
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

  const { default: profileRouter } = await import('../profile.js');
  const app = express();
  app.use(express.json());
  app.use('/api/profile', profileRouter);

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

async function put(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

// ── PUT /name — happy path ─────────────────────────────────────────────

describe('PUT /api/profile/name — happy path', () => {
  it('updates the user with first + last name joined', async () => {
    userUpdateMock.mockResolvedValue({ id: 'user-1', name: 'Ada Lovelace' });

    const res = await put('/api/profile/name', { firstName: 'Ada', lastName: 'Lovelace' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Name updated successfully' });
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Ada Lovelace' },
    });
  });

  it('trims whitespace when only one name field is provided', async () => {
    userUpdateMock.mockResolvedValue({});

    const res = await put('/api/profile/name', { firstName: 'Solo' });

    expect(res.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Solo' },
    });
  });

  it('handles only lastName provided', async () => {
    userUpdateMock.mockResolvedValue({});

    const res = await put('/api/profile/name', { lastName: 'Last' });

    expect(res.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Last' },
    });
  });

  it('joins the empty values to a trimmed empty string when both are missing', async () => {
    // Note: the route does NOT validate that name is non-empty. We test this
    // documented behaviour — empty body produces empty name.
    userUpdateMock.mockResolvedValue({});

    const res = await put('/api/profile/name', {});

    expect(res.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: '' },
    });
  });
});

// ── PUT /name — auth ──────────────────────────────────────────────────

describe('PUT /api/profile/name — auth', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';

    const res = await put('/api/profile/name', { firstName: 'Ada' });

    expect(res.status).toBe(401);
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});

// ── PUT /name — service error ─────────────────────────────────────────

describe('PUT /api/profile/name — service errors', () => {
  it('returns 500 with generic message when prisma throws', async () => {
    userUpdateMock.mockRejectedValue(new Error('DB connection lost: db_password=hunter2'));

    const res = await put('/api/profile/name', { firstName: 'Ada' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to update name' });
    // Make sure the actual error message doesn't leak.
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });
});
