/**
 * Unit tests for `services/credentials/src/services/github.service.ts`.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest globals are
 * imported explicitly. Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * mocks are cleared in `beforeEach`.
 *
 * The SUT calls into:
 *   - `prisma.gitHubToken.findUnique / upsert / deleteMany` for persistence.
 *   - `encryptString / decryptString` from `@ice/shared` for at-rest encryption.
 *   - `globalThis.fetch` for GitHub API + OAuth.
 *   - `setTimeout` (wrapped in `new Promise(...)`) for device-flow polling.
 *
 * `setTimeout` is replaced with a synchronous shim so the polling loop runs to
 * completion within a single tick — this lets us drive the loop deterministically
 * across the access_token / authorization_pending / slow_down / expired_token /
 * access_denied / unknown-error branches. `GITHUB_CLIENT_ID` is set in env before
 * importing the SUT so `startDeviceFlow` doesn't throw early.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const findUniqueMock = vi.fn();
const upsertMock = vi.fn();
const deleteManyMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    gitHubToken: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      upsert: (...a: unknown[]) => upsertMock(...a),
      deleteMany: (...a: unknown[]) => deleteManyMock(...a),
    },
  },
}));

vi.mock('@ice/shared', () => ({
  encryptString: (s: string) => `enc(${s})`,
  decryptString: (s: string) => {
    if (s.startsWith('enc(') && s.endsWith(')')) return s.slice(4, -1);
    throw new Error('not encrypted');
  },
}));

// Set client ID *before* the SUT import resolves. `vi.hoisted` runs at the
// top of the module-load sequence, before any `import` statement — putting
// `process.env.GITHUB_CLIENT_ID = 'test-client'` here ensures the SUT sees a
// non-empty value when its module-level constant initialises.
vi.hoisted(() => {
  process.env.GITHUB_CLIENT_ID = 'test-client';
});

import {
  connectWithPAT,
  startDeviceFlow,
  pollDeviceFlow,
  disconnect,
  isConnected,
  getStoredUser,
  listRepos,
  listBranches,
} from '../github.service.js';

// Replace setTimeout used by polling with a synchronous shim so tests are fast
// and deterministic. Restore in afterAll.
const originalSetTimeout = globalThis.setTimeout;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // @ts-ignore — synchronous immediate shim
  globalThis.setTimeout = (fn: () => void) => {
    fn();
    return 0 as any;
  };
});

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
  vi.restoreAllMocks();
  // Also restore any fetch stubs the tests installed.
  if ((globalThis.fetch as any)?.mockReset) {
    delete (globalThis as any).fetch;
  }
});

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  const fetchMock = vi.fn().mockImplementation(impl);
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

function mockFetchSequence(impls: Array<() => Promise<Response> | Response>) {
  const fetchMock = vi.fn();
  let idx = 0;
  fetchMock.mockImplementation(() => {
    const fn = impls[Math.min(idx, impls.length - 1)];
    idx += 1;
    return fn();
  });
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

function jsonRes(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
  const status = init.status ?? 200;
  return new Response(JSON.stringify(body), {
    status,
    statusText: init.statusText ?? 'OK',
    headers: { 'content-type': 'application/json' },
  });
}

function textRes(body: string, init: { status?: number; statusText?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 500,
    statusText: init.statusText ?? 'Server Error',
    headers: { 'content-type': 'text/plain' },
  });
}

// ── connectWithPAT ─────────────────────────────────────────────────────

describe('connectWithPAT', () => {
  it('fetches the user with the given token, persists encrypted, and returns the user', async () => {
    mockFetchOnce(() =>
      jsonRes({ login: 'octocat', avatar_url: 'http://a', name: 'Octo', html_url: 'http://o' }),
    );
    upsertMock.mockResolvedValue({});

    const user = await connectWithPAT('user-1', 'tok-secret');

    expect(user).toEqual({
      login: 'octocat',
      avatar_url: 'http://a',
      name: 'Octo',
      html_url: 'http://o',
    });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0]![0];
    expect(arg.where).toEqual({ user_id: 'user-1' });
    expect(arg.update).toMatchObject({
      access_token: 'enc(tok-secret)',
      username: 'octocat',
      avatar_url: 'http://a',
      name: 'Octo',
      scope: 'repo read:user',
    });
    expect(arg.create).toMatchObject({
      user_id: 'user-1',
      access_token: 'enc(tok-secret)',
      username: 'octocat',
    });
  });

  it('throws "Invalid or expired GitHub token" when GitHub returns 401', async () => {
    mockFetchOnce(() => jsonRes({ message: 'Bad credentials' }, { status: 401 }));

    await expect(connectWithPAT('user-1', 'bad')).rejects.toThrow('Invalid or expired GitHub token');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('throws a generic GitHub error for non-401 failures', async () => {
    mockFetchOnce(() => jsonRes({}, { status: 500 }));

    await expect(connectWithPAT('user-1', 'tok')).rejects.toThrow('GitHub API error: 500');
  });
});

// ── startDeviceFlow ────────────────────────────────────────────────────

describe('startDeviceFlow', () => {
  it('returns the device flow descriptor when GitHub responds 200', async () => {
    const payload = {
      device_code: 'dc',
      user_code: 'AB-CD',
      verification_uri: 'http://gh',
      expires_in: 900,
      interval: 5,
    };
    mockFetchOnce(() => jsonRes(payload));

    const result = await startDeviceFlow();
    expect(result).toEqual(payload);
  });

  it('throws with the response body when GitHub fails the request', async () => {
    mockFetchOnce(() => textRes('Internal', { status: 500 }));
    await expect(startDeviceFlow()).rejects.toThrow('Device flow failed: 500 Internal');
  });
});

// ── pollDeviceFlow ─────────────────────────────────────────────────────

describe('pollDeviceFlow', () => {
  it('returns the user once the access_token arrives, after intermediate authorization_pending', async () => {
    // First poll: pending. Second poll: token. Then fetchGitHubUser succeeds.
    mockFetchSequence([
      () => jsonRes({ error: 'authorization_pending' }),
      () => jsonRes({ access_token: 'tok-issued' }),
      () =>
        jsonRes({
          login: 'octo',
          avatar_url: 'http://a',
          name: 'O',
          html_url: 'http://gh/octo',
        }),
    ]);
    upsertMock.mockResolvedValue({});

    const user = await pollDeviceFlow('user-1', 'dc', 5);

    expect(user.login).toBe('octo');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0].update.access_token).toBe('enc(tok-issued)');
  });

  it('keeps polling on slow_down (additional 5s wait, no error)', async () => {
    // slow_down → access_token → user.
    mockFetchSequence([
      () => jsonRes({ error: 'slow_down' }),
      () => jsonRes({ access_token: 'tok' }),
      () =>
        jsonRes({
          login: 'a',
          avatar_url: '',
          name: null,
          html_url: 'http://x',
        }),
    ]);
    upsertMock.mockResolvedValue({});

    const user = await pollDeviceFlow('user-1', 'dc', 5);
    expect(user.login).toBe('a');
  });

  it('throws "Device code expired" on expired_token', async () => {
    mockFetchOnce(() => jsonRes({ error: 'expired_token' }));
    await expect(pollDeviceFlow('user-1', 'dc', 5)).rejects.toThrow('Device code expired');
  });

  it('throws "Authorization was denied" on access_denied', async () => {
    mockFetchOnce(() => jsonRes({ error: 'access_denied' }));
    await expect(pollDeviceFlow('user-1', 'dc', 5)).rejects.toThrow('Authorization was denied');
  });

  it('throws the upstream error_description for unknown errors', async () => {
    mockFetchOnce(() => jsonRes({ error_description: 'thing broke' }));
    await expect(pollDeviceFlow('user-1', 'dc', 5)).rejects.toThrow('thing broke');
  });

  it('falls back to error code when error_description is missing', async () => {
    mockFetchOnce(() => jsonRes({ error: 'weird_state' }));
    await expect(pollDeviceFlow('user-1', 'dc', 5)).rejects.toThrow('weird_state');
  });

  it('falls back to "Unknown device flow error" when neither field is present', async () => {
    mockFetchOnce(() => jsonRes({}));
    await expect(pollDeviceFlow('user-1', 'dc', 5)).rejects.toThrow('Unknown device flow error');
  });

  it('floors interval to 5 seconds even when caller passes a smaller value', async () => {
    // We can't directly observe the wait duration with our shim, but we can
    // confirm the function still completes in the success branch when the
    // caller passes interval < 5 (interval=1 → ceiling at 5 internally).
    mockFetchSequence([
      () => jsonRes({ access_token: 'tok' }),
      () =>
        jsonRes({
          login: 'a',
          avatar_url: '',
          name: null,
          html_url: 'http://x',
        }),
    ]);
    upsertMock.mockResolvedValue({});
    const user = await pollDeviceFlow('user-1', 'dc', 1);
    expect(user.login).toBe('a');
  });
});

// ── disconnect / isConnected / getStoredUser ───────────────────────────

describe('disconnect', () => {
  it('deletes all token rows for the user', async () => {
    deleteManyMock.mockResolvedValue({ count: 1 });
    await disconnect('user-1');
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
  });
});

describe('isConnected', () => {
  it('returns true when a stored token exists', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    expect(await isConnected('user-1')).toBe(true);
  });

  it('returns false when no row is stored', async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await isConnected('user-1')).toBe(false);
  });
});

describe('getStoredUser', () => {
  it('returns the user descriptor synthesised from the stored row', async () => {
    findUniqueMock.mockResolvedValue({
      username: 'octo',
      avatar_url: 'http://a',
      name: 'Octo',
      access_token: 'enc(t)',
    });
    expect(await getStoredUser('user-1')).toEqual({
      login: 'octo',
      avatar_url: 'http://a',
      name: 'Octo',
      html_url: 'https://github.com/octo',
    });
  });

  it('returns null when no row exists', async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await getStoredUser('user-1')).toBeNull();
  });

  it('falls back to empty avatar string when avatar_url is null on the row', async () => {
    // Hits the `record.avatar_url || ''` branch.
    findUniqueMock.mockResolvedValue({
      username: 'octo',
      avatar_url: null,
      name: null,
      access_token: 'enc(t)',
    });
    const user = await getStoredUser('user-1');
    expect(user?.avatar_url).toBe('');
  });
});

// ── listRepos ──────────────────────────────────────────────────────────

describe('listRepos', () => {
  it('throws when no token is stored', async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(listRepos('user-1')).rejects.toThrow('Not connected to GitHub');
  });

  it('returns a single page when the caller passes an explicit page > 1', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    const repos = [{ id: 1, name: 'r1' }];
    mockFetchOnce(() => jsonRes(repos));

    const result = await listRepos('user-1', 2);
    expect(result).toEqual(repos);
  });

  it('returns single page when first page is short (less than perPage)', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    // Only 3 repos returned with perPage=100 — short, so no pagination walk.
    const repos = [{ id: 1 }, { id: 2 }, { id: 3 }];
    mockFetchOnce(() => jsonRes(repos));

    const result = await listRepos('user-1');
    expect(result).toHaveLength(3);
  });

  it('walks pages until it finds a page shorter than perPage', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    const tail = [{ id: 999 }];
    mockFetchSequence([
      () => jsonRes(fullPage), // page 1: 100 entries — keep walking
      () => jsonRes(tail),     // page 2: 1 entry — last page
    ]);
    const result = await listRepos('user-1');
    expect(result).toHaveLength(101);
  });

  it('walks pages until it finds an empty page', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    mockFetchSequence([
      () => jsonRes(fullPage),
      () => jsonRes([]),
    ]);
    const result = await listRepos('user-1');
    expect(result).toHaveLength(100);
  });

  it('walks until MAX_PAGES (10) when every page is full', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i }));
    // 10 successive full pages — loop terminates by hitting `p > MAX_PAGES`,
    // not by an empty/short response. Each call gets a fresh Response so
    // body streams are not double-consumed.
    const fetchMock = vi.fn().mockImplementation(() => jsonRes(fullPage));
    (globalThis as any).fetch = fetchMock;
    const result = await listRepos('user-1');
    expect(result).toHaveLength(1000);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('throws a scope-hint error when GitHub returns 401', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    mockFetchOnce(() => jsonRes({}, { status: 401 }));
    await expect(listRepos('user-1')).rejects.toThrow(
      "GitHub rejected the request (401). Your token may be expired or missing the 'repo' scope.",
    );
  });

  it('throws a scope-hint error when GitHub returns 403', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    mockFetchOnce(() => jsonRes({}, { status: 403 }));
    await expect(listRepos('user-1')).rejects.toThrow('GitHub rejected the request (403)');
  });

  it('throws "Failed to list repos" for other non-OK statuses', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    mockFetchOnce(() => jsonRes({}, { status: 502 }));
    await expect(listRepos('user-1')).rejects.toThrow('Failed to list repos: 502');
  });

  it('falls back to plaintext token when decryptString throws', async () => {
    // Stored row's access_token does NOT match the encryption envelope, so
    // decryptString throws inside getToken and the fallback returns the raw
    // value. We verify by inspecting the Authorization header sent.
    findUniqueMock.mockResolvedValue({ access_token: 'plaintext-legacy' });
    let capturedAuth = '';
    mockFetchOnce((...args: any[]) => {
      capturedAuth = args[1]?.headers?.Authorization ?? '';
      return jsonRes([]);
    });
    await listRepos('user-1', 5);
    expect(capturedAuth).toBe('Bearer plaintext-legacy');
  });
});

// ── listBranches ───────────────────────────────────────────────────────

describe('listBranches', () => {
  it('throws when no token is stored', async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(listBranches('user-1', 'o', 'r')).rejects.toThrow('Not connected to GitHub');
  });

  it('returns the branch list on success', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    const branches = [{ name: 'main', commit: { sha: 'abc' }, protected: true }];
    mockFetchOnce(() => jsonRes(branches));

    const result = await listBranches('user-1', 'octo', 'repo');
    expect(result).toEqual(branches);
  });

  it('throws a generic error for non-OK responses', async () => {
    findUniqueMock.mockResolvedValue({ access_token: 'enc(tok)' });
    mockFetchOnce(() => jsonRes({}, { status: 404 }));
    await expect(listBranches('user-1', 'octo', 'repo')).rejects.toThrow('Failed to list branches: 404');
  });
});
