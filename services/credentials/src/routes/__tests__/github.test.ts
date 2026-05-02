/**
 * HTTP tests for the GitHub credentials router (`/api/github/...`).
 *
 * In-process Express + ephemeral port + global fetch (no supertest in the
 * workspace). The github.service module is mocked at the boundary so the
 * router's job — body validation, error envelope shape, forwarding the right
 * service args — is what we exercise. The auth middleware is mocked too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const isConnectedMock = vi.fn();
const getStoredUserMock = vi.fn();
const connectWithPATMock = vi.fn();
const startDeviceFlowMock = vi.fn();
const pollDeviceFlowMock = vi.fn();
const disconnectMock = vi.fn();
const listReposMock = vi.fn();
const listBranchesMock = vi.fn();

vi.mock('../../services/github.service', () => ({
  isConnected: (...a: unknown[]) => isConnectedMock(...a),
  getStoredUser: (...a: unknown[]) => getStoredUserMock(...a),
  connectWithPAT: (...a: unknown[]) => connectWithPATMock(...a),
  startDeviceFlow: (...a: unknown[]) => startDeviceFlowMock(...a),
  pollDeviceFlow: (...a: unknown[]) => pollDeviceFlowMock(...a),
  disconnect: (...a: unknown[]) => disconnectMock(...a),
  listRepos: (...a: unknown[]) => listReposMock(...a),
  listBranches: (...a: unknown[]) => listBranchesMock(...a),
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

  const { default: githubRouter } = await import('../github');
  const app = express();
  app.use(express.json());
  app.use('/api/github', githubRouter);

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

// ── GET /status ────────────────────────────────────────────────────────

describe('GET /api/github/status', () => {
  it('returns the connected flag from the service', async () => {
    isConnectedMock.mockResolvedValue(true);
    const res = await request('GET', '/api/github/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: true });
    expect(isConnectedMock).toHaveBeenCalledWith('user-1');
  });

  it('falls back to {connected:false} when the service throws', async () => {
    isConnectedMock.mockRejectedValue(new Error('db down'));
    const res = await request('GET', '/api/github/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: false });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('GET', '/api/github/status');
    expect(res.status).toBe(401);
  });
});

// ── GET /user ──────────────────────────────────────────────────────────

describe('GET /api/github/user', () => {
  it('returns the stored user from the service', async () => {
    const user = { login: 'octo', avatar_url: '', name: null, html_url: '' };
    getStoredUserMock.mockResolvedValue(user);
    const res = await request('GET', '/api/github/user');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(user);
  });

  it('returns null when the service throws', async () => {
    getStoredUserMock.mockRejectedValue(new Error('db down'));
    const res = await request('GET', '/api/github/user');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

// ── POST /connect-pat ──────────────────────────────────────────────────

describe('POST /api/github/connect-pat', () => {
  it('returns the user envelope on success', async () => {
    const user = { login: 'octo', avatar_url: '', name: null, html_url: '' };
    connectWithPATMock.mockResolvedValue(user);
    const res = await request('POST', '/api/github/connect-pat', { token: 'tok' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, user });
  });

  it('returns 400 when token is missing', async () => {
    const res = await request('POST', '/api/github/connect-pat', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Token is required' });
    expect(connectWithPATMock).not.toHaveBeenCalled();
  });

  it('returns 400 when token is empty string', async () => {
    const res = await request('POST', '/api/github/connect-pat', { token: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 with the service error message when connect throws', async () => {
    connectWithPATMock.mockRejectedValue(new Error('Invalid token'));
    const res = await request('POST', '/api/github/connect-pat', { token: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Invalid token' });
  });
});

// ── POST /device-flow/start ────────────────────────────────────────────

describe('POST /api/github/device-flow/start', () => {
  it('returns the device flow descriptor on success', async () => {
    const flow = {
      device_code: 'dc',
      user_code: 'AB-CD',
      verification_uri: 'http://gh',
      expires_in: 900,
      interval: 5,
    };
    startDeviceFlowMock.mockResolvedValue(flow);
    const res = await request('POST', '/api/github/device-flow/start', {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, ...flow });
  });

  it('returns 400 with the service error when start fails', async () => {
    startDeviceFlowMock.mockRejectedValue(new Error('GITHUB_CLIENT_ID not configured'));
    const res = await request('POST', '/api/github/device-flow/start', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'GITHUB_CLIENT_ID not configured' });
  });
});

// ── POST /device-flow/poll ─────────────────────────────────────────────

describe('POST /api/github/device-flow/poll', () => {
  it('returns the user envelope on success', async () => {
    const user = { login: 'octo', avatar_url: '', name: null, html_url: '' };
    pollDeviceFlowMock.mockResolvedValue(user);
    const res = await request('POST', '/api/github/device-flow/poll', {
      deviceCode: 'dc',
      interval: 5,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, user });
    expect(pollDeviceFlowMock).toHaveBeenCalledWith('user-1', 'dc', 5);
  });

  it('returns 400 with the service error when polling fails', async () => {
    pollDeviceFlowMock.mockRejectedValue(new Error('Device code expired'));
    const res = await request('POST', '/api/github/device-flow/poll', {
      deviceCode: 'dc',
      interval: 5,
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Device code expired' });
  });
});

// ── POST /disconnect ───────────────────────────────────────────────────

describe('POST /api/github/disconnect', () => {
  it('returns success on a normal disconnect', async () => {
    disconnectMock.mockResolvedValue(undefined);
    const res = await request('POST', '/api/github/disconnect', {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(disconnectMock).toHaveBeenCalledWith('user-1');
  });

  it('returns 500 with the service error when disconnect throws', async () => {
    disconnectMock.mockRejectedValue(new Error('db down'));
    const res = await request('POST', '/api/github/disconnect', {});
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'db down' });
  });
});

// ── GET /repos ─────────────────────────────────────────────────────────

describe('GET /api/github/repos', () => {
  it('forwards page=1 by default and returns the repo list', async () => {
    const repos = [{ id: 1, name: 'r1' }];
    listReposMock.mockResolvedValue(repos);
    const res = await request('GET', '/api/github/repos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, repos });
    expect(listReposMock).toHaveBeenCalledWith('user-1', 1);
  });

  it('forwards an explicit page query parameter', async () => {
    listReposMock.mockResolvedValue([]);
    const res = await fetch(`${baseUrl}/api/github/repos?page=3`);
    expect(res.status).toBe(200);
    expect(listReposMock).toHaveBeenCalledWith('user-1', 3);
  });

  it('falls back to page=1 when query is non-numeric', async () => {
    listReposMock.mockResolvedValue([]);
    const res = await fetch(`${baseUrl}/api/github/repos?page=abc`);
    expect(res.status).toBe(200);
    expect(listReposMock).toHaveBeenCalledWith('user-1', 1);
  });

  it('returns 400 with the service error message on failure', async () => {
    listReposMock.mockRejectedValue(new Error('Not connected'));
    const res = await request('GET', '/api/github/repos');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Not connected' });
  });
});

// ── GET /repos/:owner/:repo/branches ──────────────────────────────────

describe('GET /api/github/repos/:owner/:repo/branches', () => {
  it('returns the branches for a given owner+repo', async () => {
    const branches = [{ name: 'main', commit: { sha: 'abc' }, protected: true }];
    listBranchesMock.mockResolvedValue(branches);
    const res = await request('GET', '/api/github/repos/octo/repo/branches');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, branches });
    expect(listBranchesMock).toHaveBeenCalledWith('user-1', 'octo', 'repo');
  });

  it('returns 400 with the service error message on failure', async () => {
    listBranchesMock.mockRejectedValue(new Error('Not connected'));
    const res = await request('GET', '/api/github/repos/octo/repo/branches');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Not connected' });
  });
});
