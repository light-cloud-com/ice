/**
 * HTTP tests for the Provider credentials router (`/api/providers/...`).
 *
 * In-process Express + ephemeral port + global fetch (no supertest in the
 * workspace). The provider.service module is mocked at the boundary so the
 * router's job — body validation, OAuth code exchange, error envelope shape,
 * forwarding the right service args — is what we exercise. Auth + role
 * middleware are mocked too.
 */

import http from 'node:http';
import express from 'express';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';

const getCredentialStatusMock = vi.fn();
const getCredentialsMock = vi.fn();
const connectProviderMock = vi.fn();
const saveCredentialsMock = vi.fn();
const disconnectProviderMock = vi.fn();
const listGCPProjectsMock = vi.fn();
const getGCPAuthTypeMock = vi.fn();

vi.mock('../../services/provider.service', () => ({
  getCredentialStatus: (...a: unknown[]) => getCredentialStatusMock(...a),
  getCredentials: (...a: unknown[]) => getCredentialsMock(...a),
  connectProvider: (...a: unknown[]) => connectProviderMock(...a),
  saveCredentials: (...a: unknown[]) => saveCredentialsMock(...a),
  disconnectProvider: (...a: unknown[]) => disconnectProviderMock(...a),
  listGCPProjects: (...a: unknown[]) => listGCPProjectsMock(...a),
  getGCPAuthType: (...a: unknown[]) => getGCPAuthTypeMock(...a),
}));

type AuthMode = 'allow' | 'no-auth' | 'no-role';
let currentAuth: AuthMode = 'allow';
let currentUserId: string | undefined = 'user-1';
let currentOrgId: string | undefined = 'org-1';

vi.mock('@ice/shared', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (currentAuth === 'no-auth') {
      return res.status(401).json({ message: 'Missing authorization token' });
    }
    req.userId = currentUserId;
    req.organisationId = currentOrgId;
    next();
  },
  requireOrgRole:
    (..._roles: string[]) =>
    (_req: any, res: any, next: any) => {
      if (currentAuth === 'no-role') {
        return res.status(403).json({ message: 'Insufficient role' });
      }
      next();
    },
}));

let server: http.Server;
let baseUrl: string;
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  vi.clearAllMocks();
  currentAuth = 'allow';
  currentUserId = 'user-1';
  currentOrgId = 'org-1';
  process.env.GOOGLE_CLIENT_ID = 'gid';
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
  vi.spyOn(console, 'error').mockImplementation(() => {});

  const { default: providersRouter } = await import('../providers');
  const app = express();
  app.use(express.json());
  app.use('/api/providers', providersRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // Reset fetch in case a test installed a stub for the upstream Google
  // calls — server-side requests still need real fetch for the test client.
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function request(method: string, path: string, body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  // Use the original fetch so test stubs to globalThis.fetch don't shadow
  // the test client's calls.
  const res = await originalFetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function jsonRes(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function textRes(body: string, init: { status?: number } = {}): Response {
  return new Response(body, {
    status: init.status ?? 500,
    headers: { 'content-type': 'text/plain' },
  });
}

// ── POST /gcp/oauth/exchange ───────────────────────────────────────────

describe('POST /api/providers/gcp/oauth/exchange', () => {
  it('returns 400 when authorization code is missing', async () => {
    const res = await request('POST', '/api/providers/gcp/oauth/exchange', {});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Missing authorization code' });
  });

  it('returns 500 when GOOGLE_CLIENT_ID is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'Google OAuth not configured' });
  });

  it('returns 500 when GOOGLE_CLIENT_SECRET is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.status).toBe(500);
  });

  it('returns 403 when role gate rejects', async () => {
    currentAuth = 'no-role';
    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when token exchange returns non-OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(textRes('bad code', { status: 400 })) as any;

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Failed to exchange authorization code' });
  });

  it('returns 400 when no access_token is in the token response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(jsonRes({ refresh_token: 'rt' })) as any;

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'No access token received' });
  });

  it('persists OAuth credentials and returns user_email + project_id on success', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 })) // token exchange
      .mockResolvedValueOnce(jsonRes({ email: 'user@x.com' })) // userinfo
      .mockResolvedValueOnce(jsonRes({ projects: [{ projectId: 'first-proj' }] })) as any;
    connectProviderMock.mockResolvedValue({ success: true, id: 'cred-1' });

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      project_id: 'first-proj',
      user_email: 'user@x.com',
    });
    expect(connectProviderMock).toHaveBeenCalledTimes(1);
    const passed = connectProviderMock.mock.calls[0]![2];
    expect(passed._auth_type).toBe('oauth');
    expect(passed.access_token).toBe('at');
    expect(passed.refresh_token).toBe('rt');
    expect(passed.user_email).toBe('user@x.com');
    expect(passed.project_id).toBe('first-proj');
  });

  it('treats userinfo + projects sub-fetches as best-effort (proceeds when they fail)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'at', expires_in: 3600 })) // token exchange OK
      .mockResolvedValueOnce(textRes('forbidden', { status: 403 })) // userinfo non-OK
      .mockResolvedValueOnce(textRes('forbidden', { status: 403 })) as any; // projects non-OK
    connectProviderMock.mockResolvedValue({ success: true, id: 'cred-1' });

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });

    expect(res.status).toBe(200);
    expect(res.body.user_email).toBeUndefined();
    expect(res.body.project_id).toBeUndefined();
    // Stored payload still uses empty-string fallbacks for missing fields.
    const passed = connectProviderMock.mock.calls[0]![2];
    expect(passed.user_email).toBe('');
    expect(passed.project_id).toBe('');
    expect(passed.refresh_token).toBe('');
  });

  it('non-fatal try/catch swallows fetch failures during userinfo+projects', async () => {
    // Token exchange OK, but the very next fetch (userinfo) throws.
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return jsonRes({ access_token: 'at', expires_in: 3600 });
      throw new Error('network');
    }) as any;
    connectProviderMock.mockResolvedValue({ success: true, id: 'cred-1' });

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.status).toBe(200);
  });

  it('handles project list with empty projects array (project_id undefined)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'at', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonRes({ email: 'user@x.com' }))
      .mockResolvedValueOnce(jsonRes({ projects: [] })) as any;
    connectProviderMock.mockResolvedValue({ success: true, id: 'cred-1' });

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.body.project_id).toBeUndefined();
  });

  it('handles project list with no projects key at all (project_id undefined)', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'at', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonRes({ email: 'user@x.com' }))
      .mockResolvedValueOnce(jsonRes({})) as any;
    connectProviderMock.mockResolvedValue({ success: true, id: 'cred-1' });

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.body.project_id).toBeUndefined();
  });

  it('returns 500 when the connect-provider call throws', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'at', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonRes({ email: 'u@x' }))
      .mockResolvedValueOnce(jsonRes({ projects: [{ projectId: 'p' }] })) as any;
    connectProviderMock.mockRejectedValue(new Error('persist failed'));

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'persist failed' });
  });

  it('returns "OAuth failed" fallback when error has no message', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'at', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonRes({}))
      .mockResolvedValueOnce(jsonRes({})) as any;
    connectProviderMock.mockRejectedValue(new Error(''));

    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: 'OAuth failed' });
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('POST', '/api/providers/gcp/oauth/exchange', { code: 'c' });
    expect(res.status).toBe(401);
  });
});

// ── GET /:provider/credentials ─────────────────────────────────────────

describe('GET /api/providers/:provider/credentials', () => {
  it('returns the metadata-only credentials for a non-GCP provider', async () => {
    getCredentialsMock.mockResolvedValue({
      provider: 'aws',
      project_id: null,
      is_connected: true,
    });
    const res = await request('GET', '/api/providers/aws/credentials');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      provider: 'aws',
      project_id: null,
      is_connected: true,
    });
    expect(getGCPAuthTypeMock).not.toHaveBeenCalled();
  });

  it('augments GCP credentials with auth_type', async () => {
    getCredentialsMock.mockResolvedValue({
      provider: 'gcp',
      project_id: 'p',
      is_connected: true,
    });
    getGCPAuthTypeMock.mockResolvedValue('oauth');
    const res = await request('GET', '/api/providers/gcp/credentials');
    expect(res.status).toBe(200);
    expect(res.body.auth_type).toBe('oauth');
  });

  it('returns 401 when requireAuth rejects', async () => {
    currentAuth = 'no-auth';
    const res = await request('GET', '/api/providers/aws/credentials');
    expect(res.status).toBe(401);
  });
});

// ── POST /:provider/credentials ────────────────────────────────────────

describe('POST /api/providers/:provider/credentials', () => {
  it('forwards to saveCredentials and returns the result', async () => {
    saveCredentialsMock.mockResolvedValue({ success: true, id: 'sav-1' });
    const res = await request('POST', '/api/providers/aws/credentials', {
      credentials: { key: 'k' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, id: 'sav-1' });
    expect(saveCredentialsMock).toHaveBeenCalledWith('org-1', 'aws', { key: 'k' });
  });

  it('returns 500 with the service error message on failure', async () => {
    saveCredentialsMock.mockRejectedValue(new Error('persist down'));
    const res = await request('POST', '/api/providers/aws/credentials', {
      credentials: { key: 'k' },
    });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'persist down' });
  });

  it('returns 403 when role gate rejects', async () => {
    currentAuth = 'no-role';
    const res = await request('POST', '/api/providers/aws/credentials', {
      credentials: {},
    });
    expect(res.status).toBe(403);
  });
});

// ── GET /:provider/status ──────────────────────────────────────────────

describe('GET /api/providers/:provider/status', () => {
  it('returns the basic status for a non-GCP provider', async () => {
    getCredentialStatusMock.mockResolvedValue({ connected: false });
    const res = await request('GET', '/api/providers/aws/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: false });
    expect(getGCPAuthTypeMock).not.toHaveBeenCalled();
  });

  it('augments GCP status with auth_type', async () => {
    getCredentialStatusMock.mockResolvedValue({ connected: true, provider: 'gcp', project_id: 'p' });
    getGCPAuthTypeMock.mockResolvedValue('service_account');
    const res = await request('GET', '/api/providers/gcp/status');
    expect(res.status).toBe(200);
    expect(res.body.auth_type).toBe('service_account');
  });
});

// ── POST /:provider/connect ────────────────────────────────────────────

describe('POST /api/providers/:provider/connect', () => {
  it('forwards to connectProvider and returns the result', async () => {
    connectProviderMock.mockResolvedValue({ success: true, id: 'cred-1', project_id: 'p' });
    const res = await request('POST', '/api/providers/gcp/connect', {
      credentials: { service_account_key: 'k' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, id: 'cred-1', project_id: 'p' });
    expect(connectProviderMock).toHaveBeenCalledWith('org-1', 'gcp', { service_account_key: 'k' });
  });

  it('returns 400 with the service error on failure', async () => {
    connectProviderMock.mockRejectedValue(new Error('Invalid GCP credentials'));
    const res = await request('POST', '/api/providers/gcp/connect', {
      credentials: {},
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: 'Invalid GCP credentials' });
  });

  it('returns 403 when role gate rejects', async () => {
    currentAuth = 'no-role';
    const res = await request('POST', '/api/providers/gcp/connect', {});
    expect(res.status).toBe(403);
  });
});

// ── POST /:provider/disconnect ─────────────────────────────────────────

describe('POST /api/providers/:provider/disconnect', () => {
  it('forwards to disconnectProvider and returns success', async () => {
    disconnectProviderMock.mockResolvedValue(undefined);
    const res = await request('POST', '/api/providers/gcp/disconnect', {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(disconnectProviderMock).toHaveBeenCalledWith('org-1', 'gcp');
  });

  it('returns 403 when role gate rejects', async () => {
    currentAuth = 'no-role';
    const res = await request('POST', '/api/providers/gcp/disconnect', {});
    expect(res.status).toBe(403);
  });
});

// ── GET /:provider/projects ────────────────────────────────────────────

describe('GET /api/providers/:provider/projects', () => {
  it('returns the project list from the service', async () => {
    listGCPProjectsMock.mockResolvedValue([{ id: 'p1', name: 'Project One' }]);
    const res = await request('GET', '/api/providers/gcp/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'p1', name: 'Project One' }]);
  });

  it('falls back to [] when listGCPProjects throws', async () => {
    listGCPProjectsMock.mockRejectedValue(new Error('upstream blew up'));
    const res = await request('GET', '/api/providers/gcp/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ── POST /:provider/import ─────────────────────────────────────────────

describe('POST /api/providers/:provider/import', () => {
  it('returns the not-implemented placeholder envelope', async () => {
    const res = await request('POST', '/api/providers/gcp/import', {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: false,
      error: 'Import not yet implemented for web version',
    });
  });
});
