/**
 * Unit tests for `services/deploy/src/services/pipeline/github-webhooks.ts` —
 * the GitHub auth + webhook registration helpers extracted from
 * pipeline.service.ts in rf-pipe-5.
 *
 * Per the `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`
 * learning, fetch/console spies are torn down via `vi.restoreAllMocks()`
 * in `afterEach` — re-spying alone in `beforeEach` would carry call counts
 * across `it` blocks and break `toHaveBeenCalledTimes(N)` assertions.
 *
 * The Prisma client is module-mocked at the import path; @ice/shared is
 * dynamically imported inside getGitHubToken, so we mock the dynamic-
 * import module directly per the
 * `dynamic-import-of-api-adapter-needs-a-direct-vi-mock-on-the-target-module`
 * pattern (vi resolves dynamic imports through the same registry as
 * static imports).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@ice/db', () => ({
  default: {
    gitHubToken: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@ice/shared', () => ({
  decryptString: vi.fn(),
}));

import prisma from '@ice/db';
import * as shared from '@ice/shared';
import {
  getGitHubToken,
  getWebhookCallbackUrl,
  registerGitHubWebhook,
  unregisterGitHubWebhook,
} from '../pipeline/github-webhooks';

const findUniqueMock = (prisma as any).gitHubToken.findUnique as ReturnType<typeof vi.fn>;
const decryptMock = (shared as any).decryptString as ReturnType<typeof vi.fn>;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  findUniqueMock.mockReset();
  decryptMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getGitHubToken', () => {
  it('returns null when no record is stored for the user', async () => {
    findUniqueMock.mockResolvedValue(null);
    const token = await getGitHubToken('user-1');
    expect(token).toBeNull();
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
  });

  it('decrypts the stored access_token via shared.decryptString', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc:abc' });
    decryptMock.mockReturnValue('plain-token');
    const token = await getGitHubToken('user-1');
    expect(token).toBe('plain-token');
    expect(decryptMock).toHaveBeenCalledWith('enc:abc');
  });

  it('falls back to the stored value when decryption throws', async () => {
    // Legacy plaintext rows (pre-encryption rollout) come through as
    // already-plain strings; decryptString throws and we keep going.
    findUniqueMock.mockResolvedValue({ access_token: 'legacy-plain' });
    decryptMock.mockImplementation(() => {
      throw new Error('not encrypted');
    });
    const token = await getGitHubToken('user-1');
    expect(token).toBe('legacy-plain');
  });
});

describe('getWebhookCallbackUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses WEBHOOK_BASE_URL when set', () => {
    process.env.WEBHOOK_BASE_URL = 'https://hooks.example.com';
    expect(getWebhookCallbackUrl()).toBe('https://hooks.example.com/api/webhooks/github');
  });

  it('falls back to BACKEND_URL when WEBHOOK_BASE_URL is unset', () => {
    delete process.env.WEBHOOK_BASE_URL;
    process.env.BACKEND_URL = 'https://api.example.com';
    expect(getWebhookCallbackUrl()).toBe('https://api.example.com/api/webhooks/github');
  });

  it('falls back to localhost:5001 when neither env var is set', () => {
    delete process.env.WEBHOOK_BASE_URL;
    delete process.env.BACKEND_URL;
    expect(getWebhookCallbackUrl()).toBe('http://localhost:5001/api/webhooks/github');
  });
});

describe('registerGitHubWebhook', () => {
  it("returns 'skipped' when the user has no GitHub token", async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await registerGitHubWebhook('user-1', 'owner/repo', 'sec');
    expect(result.status).toBe('skipped');
    expect(result.error).toContain('GitHub is not connected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs to /repos/:owner/:repo/hooks with the right body and returns the new id', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc' });
    decryptMock.mockReturnValue('tok');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 7777 }),
    });

    const result = await registerGitHubWebhook('user-1', 'owner/repo', 'shhh');

    expect(result).toEqual({ status: 'registered', webhookId: 7777 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/owner/repo/hooks');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.events).toEqual(['push', 'pull_request']);
    expect(body.config.secret).toBe('shhh');
    expect(body.config.insecure_ssl).toBe('0');
  });

  it("treats a 422 'already exists' as registered with no webhookId", async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'tok' });
    decryptMock.mockReturnValue('tok');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
      text: async () => '{"message":"Hook already exists on this repository"}',
    });
    const result = await registerGitHubWebhook('u', 'o/r', 's');
    expect(result).toEqual({ status: 'registered' });
  });

  it('returns a 403 remediation hint mentioning the repo and admin scope', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'tok' });
    decryptMock.mockReturnValue('tok');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => 'forbidden',
    });
    const result = await registerGitHubWebhook('u', 'acme/api', 's');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('GitHub denied webhook creation (403)');
    expect(result.error).toContain('acme/api');
    expect(result.error).toContain("'repo' scope");
  });

  it('returns a 401 reconnect hint', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'tok' });
    decryptMock.mockReturnValue('tok');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => 'bad token',
    });
    const result = await registerGitHubWebhook('u', 'o/r', 's');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Reconnect GitHub');
  });

  it('returns a 404 not-accessible hint', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'tok' });
    decryptMock.mockReturnValue('tok');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => 'not found',
    });
    const result = await registerGitHubWebhook('u', 'o/r', 's');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('o/r');
    expect(result.error).toContain('not found');
  });

  it('returns a generic GitHub-status error for other non-OK codes', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'tok' });
    decryptMock.mockReturnValue('tok');
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => 'internal',
    });
    const result = await registerGitHubWebhook('u', 'o/r', 's');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('GitHub returned 500');
  });

  it('catches network errors and returns a friendly message', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'tok' });
    decryptMock.mockReturnValue('tok');
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const result = await registerGitHubWebhook('u', 'o/r', 's');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Network error');
    expect(result.error).toContain('ECONNRESET');
  });
});

describe('unregisterGitHubWebhook', () => {
  it('no-ops when the user has no token', async () => {
    findUniqueMock.mockResolvedValue(null);
    await unregisterGitHubWebhook('u', 'o/r', 99);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('DELETEs /repos/:owner/:repo/hooks/:id with the bearer token', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'tok' });
    decryptMock.mockReturnValue('tok');
    fetchMock.mockResolvedValue({ ok: true });
    await unregisterGitHubWebhook('u', 'owner/repo', 99);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/owner/repo/hooks/99');
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });
});
