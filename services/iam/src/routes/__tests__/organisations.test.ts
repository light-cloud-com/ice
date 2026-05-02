/**
 * HTTP tests for the Organisations router (`/api/organisations/...`).
 *
 * No supertest — boot a tiny in-process Express app on an ephemeral port.
 * Prisma + auth middleware are mocked at the module boundary.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// ── Mocks ─────────────────────────────────────────────────────────────

const orgCreateMock = vi.fn();
const memberCreateMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    organisation: {
      create: (...a: unknown[]) => orgCreateMock(...a),
    },
    organisationMember: {
      create: (...a: unknown[]) => memberCreateMock(...a),
    },
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

let server: http.Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  currentAuth = 'allow';
  currentUserId = 'user-1';
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: orgRouter } = await import('../organisations.js');
  const app = express();
  app.use(express.json());
  app.use('/api/organisations', orgRouter);

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

async function post(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
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

// ── POST /create — happy path (user has no org yet) ────────────────────

describe('POST /api/organisations/create — happy path', () => {
  it('creates the org, owner membership, and links the user when they have no org', async () => {
    orgCreateMock.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    memberCreateMock.mockResolvedValue({});
    userFindUniqueMock.mockResolvedValue({ organisation_id: null });
    userUpdateMock.mockResolvedValue({});

    const res = await post('/api/organisations/create', { name: 'Acme' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'org-1', name: 'Acme', role: 'owner' });
    expect(orgCreateMock).toHaveBeenCalledWith({ data: { name: 'Acme' } });
    expect(memberCreateMock).toHaveBeenCalledWith({
      data: { user_id: 'user-1', organisation_id: 'org-1', role: 'owner' },
    });
    expect(userUpdateMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { organisation_id: 'org-1' },
    });
  });

  it('trims whitespace from the org name before creating', async () => {
    orgCreateMock.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    memberCreateMock.mockResolvedValue({});
    userFindUniqueMock.mockResolvedValue({ organisation_id: null });
    userUpdateMock.mockResolvedValue({});

    const res = await post('/api/organisations/create', { name: '  Acme  ' });

    expect(res.status).toBe(200);
    expect(orgCreateMock).toHaveBeenCalledWith({ data: { name: 'Acme' } });
  });

  it('does NOT update the default org when user already has one', async () => {
    orgCreateMock.mockResolvedValue({ id: 'org-2', name: 'Second' });
    memberCreateMock.mockResolvedValue({});
    userFindUniqueMock.mockResolvedValue({ organisation_id: 'existing-org' });

    const res = await post('/api/organisations/create', { name: 'Second' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'org-2', name: 'Second', role: 'owner' });
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it('still attempts to link when user lookup returns null (optional-chain path)', async () => {
    // The route's check is `if (!user?.organisation_id)`. When findUnique
    // returns null, the optional chain yields `undefined` which is falsy,
    // so the linking branch fires. This documents the existing behaviour;
    // a hardened version would gate on `user?.id`.
    orgCreateMock.mockResolvedValue({ id: 'org-3', name: 'Third' });
    memberCreateMock.mockResolvedValue({});
    userFindUniqueMock.mockResolvedValue(null);
    userUpdateMock.mockResolvedValue({});

    const res = await post('/api/organisations/create', { name: 'Third' });

    expect(res.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
  });
});

// ── POST /create — body validation ────────────────────────────────────

describe('POST /api/organisations/create — body validation', () => {
  it('returns 400 when name is missing', async () => {
    const res = await post('/api/organisations/create', {});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('at least 2 characters');
    expect(orgCreateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when name is empty string', async () => {
    const res = await post('/api/organisations/create', { name: '' });
    expect(res.status).toBe(400);
    expect(orgCreateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when name is only whitespace', async () => {
    const res = await post('/api/organisations/create', { name: '   ' });
    expect(res.status).toBe(400);
    expect(orgCreateMock).not.toHaveBeenCalled();
  });

  it('returns 400 when name is single character', async () => {
    const res = await post('/api/organisations/create', { name: 'A' });
    expect(res.status).toBe(400);
    expect(orgCreateMock).not.toHaveBeenCalled();
  });

  it('accepts a 2-character name (boundary)', async () => {
    orgCreateMock.mockResolvedValue({ id: 'org-1', name: 'AB' });
    memberCreateMock.mockResolvedValue({});
    userFindUniqueMock.mockResolvedValue({ organisation_id: 'foo' });

    const res = await post('/api/organisations/create', { name: 'AB' });
    expect(res.status).toBe(200);
  });
});

// ── POST /create — auth ───────────────────────────────────────────────

describe('POST /api/organisations/create — auth', () => {
  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await post('/api/organisations/create', { name: 'Acme' });
    expect(res.status).toBe(401);
    expect(orgCreateMock).not.toHaveBeenCalled();
  });
});

// ── POST /create — service errors ─────────────────────────────────────

describe('POST /api/organisations/create — service errors', () => {
  it('returns 500 when org creation fails', async () => {
    orgCreateMock.mockRejectedValue(new Error('UNIQUE constraint failed'));

    const res = await post('/api/organisations/create', { name: 'Acme' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to create team' });
  });

  it('returns 500 when membership creation fails', async () => {
    orgCreateMock.mockResolvedValue({ id: 'org-1', name: 'Acme' });
    memberCreateMock.mockRejectedValue(new Error('FK violation'));

    const res = await post('/api/organisations/create', { name: 'Acme' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Failed to create team' });
  });
});
