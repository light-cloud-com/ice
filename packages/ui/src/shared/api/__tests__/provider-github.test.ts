/**
 * Tests for the `provider` and `github` HTTP adapter domains
 * extracted in rf-httpapi-4. The adapter functions wrap a shared
 * axios instance; tests assert the generated request URLs / methods /
 * bodies are byte-equivalent to the pre-refactor behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).window = (globalThis as any).window || { location: { origin: 'http://localhost:3000' } };
(globalThis as any).localStorage = (globalThis as any).localStorage || {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const mockAxios = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../axios-instance', () => ({ default: mockAxios }));

beforeEach(() => {
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
});

// ─── provider adapter ───────────────────────────────────────────────────────

describe('http-api/provider', () => {
  it('getCredentials() GETs /providers/<id>/credentials', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { key: 'redacted' } });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    await a.getCredentials('aws');
    expect(mockAxios.get).toHaveBeenCalledWith('/providers/aws/credentials');
  });

  it('saveCredentials() POSTs to /providers/<id>/credentials with the body', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { ok: true } });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    await a.saveCredentials('aws', { access_key: 'AKIA...' });
    expect(mockAxios.post).toHaveBeenCalledWith('/providers/aws/credentials', {
      credentials: { access_key: 'AKIA...' },
    });
  });

  it('isConnected() returns the boolean from /providers/<id>/status', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { connected: true } });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    expect(await a.isConnected('gcp')).toBe(true);
    expect(mockAxios.get).toHaveBeenCalledWith('/providers/gcp/status');
  });

  it('connect() POSTs /providers/<id>/connect with credentials', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { connected: true } });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    await a.connect('aws', { access_key: 'AKIA...' });
    expect(mockAxios.post).toHaveBeenCalledWith('/providers/aws/connect', {
      credentials: { access_key: 'AKIA...' },
    });
  });

  it('disconnect() POSTs /providers/<id>/disconnect with no body', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    await a.disconnect('aws');
    expect(mockAxios.post).toHaveBeenCalledWith('/providers/aws/disconnect');
  });

  it('getProjects() GETs /providers/<id>/projects', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    await a.getProjects('aws');
    expect(mockAxios.get).toHaveBeenCalledWith('/providers/aws/projects');
  });

  it('import() POSTs /providers/<id>/import with the projectId', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    await a.import('aws', 'p1');
    expect(mockAxios.post).toHaveBeenCalledWith('/providers/aws/import', { projectId: 'p1' });
  });

  it('exchangeGCPCode() POSTs /providers/gcp/oauth/exchange with the auth code', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    await a.exchangeGCPCode('auth-code');
    expect(mockAxios.post).toHaveBeenCalledWith('/providers/gcp/oauth/exchange', { code: 'auth-code' });
  });

  it('connectGCPOAuth() POSTs /providers/gcp/oauth/connect with snake_case body', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createProviderAdapter } = await import('../http-api/provider');
    const a = createProviderAdapter();
    await a.connectGCPOAuth('access-token', 3600);
    expect(mockAxios.post).toHaveBeenCalledWith('/providers/gcp/oauth/connect', {
      access_token: 'access-token',
      expires_in: 3600,
    });
  });
});

// ─── github adapter ─────────────────────────────────────────────────────────

describe('http-api/github', () => {
  it('isConnected() returns the boolean from /github/status', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { connected: true } });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    expect(await a.isConnected()).toBe(true);
    expect(mockAxios.get).toHaveBeenCalledWith('/github/status');
  });

  it('getUser() returns null when the backend resolves null', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: null });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    expect(await a.getUser()).toBeNull();
  });

  it('getUser() normalizes login → username and avatar_url → avatarUrl', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { login: 'octocat', avatar_url: 'http://x' } });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    const user = await a.getUser();
    expect(user.username).toBe('octocat');
    expect(user.avatarUrl).toBe('http://x');
    // Original fields are preserved (spread)
    expect(user.login).toBe('octocat');
    expect(user.avatar_url).toBe('http://x');
  });

  it('getUser() preserves an already-normalized response (username + avatarUrl already set)', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { username: 'preset', avatarUrl: 'http://y' } });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    const user = await a.getUser();
    expect(user.username).toBe('preset');
    expect(user.avatarUrl).toBe('http://y');
  });

  it('connectPAT() POSTs /github/connect-pat with the token', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    await a.connectPAT('ghp_xxx');
    expect(mockAxios.post).toHaveBeenCalledWith('/github/connect-pat', { token: 'ghp_xxx' });
  });

  it('startDeviceFlow() POSTs /github/device-flow/start with no body', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { device_code: 'dc' } });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    await a.startDeviceFlow();
    expect(mockAxios.post).toHaveBeenCalledWith('/github/device-flow/start');
  });

  it('pollDeviceFlow() POSTs /github/device-flow/poll with deviceCode + interval', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    await a.pollDeviceFlow('dc', 5);
    expect(mockAxios.post).toHaveBeenCalledWith('/github/device-flow/poll', { deviceCode: 'dc', interval: 5 });
  });

  it('disconnect() POSTs /github/disconnect with no body', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: {} });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    await a.disconnect();
    expect(mockAxios.post).toHaveBeenCalledWith('/github/disconnect');
  });

  it('listRepos() GETs /github/repos with the page param', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    await a.listRepos(2);
    expect(mockAxios.get).toHaveBeenCalledWith('/github/repos', { params: { page: 2 } });
  });

  it('listRepos() omits the page param when undefined', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    await a.listRepos();
    expect(mockAxios.get).toHaveBeenCalledWith('/github/repos', { params: { page: undefined } });
  });

  it('listBranches() GETs /github/repos/<owner>/<repo>/branches', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: [] });
    const { createGithubAdapter } = await import('../http-api/github');
    const a = createGithubAdapter();
    await a.listBranches('octocat', 'hello-world');
    expect(mockAxios.get).toHaveBeenCalledWith('/github/repos/octocat/hello-world/branches');
  });
});
