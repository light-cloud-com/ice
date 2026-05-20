/**
 * Unit tests for `services/credentials/src/services/provider.service.ts`.
 *
 * Service touches: Prisma, `encryptCredentials`/`decryptCredentials` from
 * `@ice/shared`, dynamic `import('google-auth-library')` for live key
 * validation, and `globalThis.fetch` for OAuth token refresh + project
 * listing. We mock prisma + crypto at the module boundary, intercept
 * `google-auth-library` via `vi.mock`, and stub fetch per-test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const findUniqueMock = vi.fn();
const upsertMock = vi.fn();
const updateManyMock = vi.fn();

vi.mock('@ice/db', () => ({
  default: {
    providerCredential: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      upsert: (...a: unknown[]) => upsertMock(...a),
      updateMany: (...a: unknown[]) => updateManyMock(...a),
    },
  },
}));

const encryptCredsMock = vi.fn((c: unknown) => `enc(${JSON.stringify(c)})`);
const decryptCredsMock = vi.fn();

vi.mock('@ice/shared', () => ({
  encryptCredentials: (c: unknown) => encryptCredsMock(c),
  decryptCredentials: (s: string) => decryptCredsMock(s),
}));

// Hoist a controllable mock for google-auth-library — start with a happy path
// and per-test swap it via the hoisted bag.
const authBag = vi.hoisted(() => ({
  impl: null as null | {
    getClient: () => Promise<{ getAccessToken: () => Promise<unknown> }>;
  },
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor(_opts: unknown) {
      // capture-only
    }
    async getClient() {
      if (!authBag.impl) {
        return { getAccessToken: async () => ({ token: 'live-tok' }) };
      }
      return authBag.impl.getClient();
    }
  },
}));

import {
  getCredentialStatus,
  getCredentials,
  getDecryptedCredentials,
  connectProvider,
  saveCredentials,
  disconnectProvider,
  listGCPProjects,
  getValidGCPAccessToken,
  getGCPAuthType,
  updateGCPOAuthTokens,
} from '../provider.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  authBag.impl = null;
  // Reset env vars used by token refresh
  process.env.GOOGLE_CLIENT_ID = 'gid';
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
});

afterEach(() => {
  vi.restoreAllMocks();
  if ((globalThis.fetch as any)?.mockReset) {
    delete (globalThis as any).fetch;
  }
});

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

// ── getCredentialStatus ────────────────────────────────────────────────

describe('getCredentialStatus', () => {
  it('returns connected:false when no row exists', async () => {
    findUniqueMock.mockResolvedValue(null);
    const result = await getCredentialStatus('org', 'gcp');
    expect(result).toEqual({ connected: false });
  });

  it('returns the metadata for a connected row', async () => {
    findUniqueMock.mockResolvedValue({
      provider: 'gcp',
      project_id: 'p1',
      is_connected: true,
    });
    const result = await getCredentialStatus('org', 'gcp');
    expect(result).toEqual({ connected: true, provider: 'gcp', project_id: 'p1' });
  });

  it('reflects is_connected:false from the row', async () => {
    findUniqueMock.mockResolvedValue({
      provider: 'gcp',
      project_id: null,
      is_connected: false,
    });
    const result = await getCredentialStatus('org', 'gcp');
    expect(result).toMatchObject({ connected: false });
  });
});

// ── getCredentials ─────────────────────────────────────────────────────

describe('getCredentials', () => {
  it('returns {} when no row exists', async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await getCredentials('org', 'gcp')).toEqual({});
  });

  it('returns metadata-only fields when a row is present', async () => {
    findUniqueMock.mockResolvedValue({
      provider: 'gcp',
      project_id: 'p1',
      is_connected: true,
      credentials: 'sensitive',
    });
    const result = await getCredentials('org', 'gcp');
    expect(result).toEqual({
      provider: 'gcp',
      project_id: 'p1',
      is_connected: true,
    });
    // Confirm we never leak the raw credentials
    expect((result as any).credentials).toBeUndefined();
  });
});

// ── getDecryptedCredentials ────────────────────────────────────────────

describe('getDecryptedCredentials', () => {
  it('returns null when there is no row', async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await getDecryptedCredentials('org', 'gcp')).toBeNull();
  });

  it('returns null when the row is disconnected', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: false, credentials: 'x' });
    expect(await getDecryptedCredentials('org', 'gcp')).toBeNull();
  });

  it('returns decrypted credentials on success', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'enc-blob' });
    decryptCredsMock.mockReturnValueOnce({ key: 'val' });
    const result = await getDecryptedCredentials('org', 'gcp');
    expect(result).toEqual({ key: 'val' });
  });

  it('falls back to JSON.parse when decryption fails on legacy plaintext', async () => {
    findUniqueMock.mockResolvedValue({
      is_connected: true,
      credentials: '{"plain":"json"}',
    });
    decryptCredsMock.mockImplementationOnce(() => {
      throw new Error('not encrypted');
    });
    const result = await getDecryptedCredentials('org', 'gcp');
    expect(result).toEqual({ plain: 'json' });
  });

  it('returns null when both decryption and JSON.parse fail', async () => {
    findUniqueMock.mockResolvedValue({
      is_connected: true,
      credentials: 'not-json-not-encrypted',
    });
    decryptCredsMock.mockImplementationOnce(() => {
      throw new Error('bad');
    });
    expect(await getDecryptedCredentials('org', 'gcp')).toBeNull();
  });
});

// ── connectProvider ────────────────────────────────────────────────────

describe('connectProvider', () => {
  it('rejects GCP service-account flow when key has no client_email', async () => {
    await expect(connectProvider('org', 'gcp', { service_account_key: '{"private_key":"k"}' })).rejects.toThrow(
      'Service account key must contain client_email and private_key',
    );
  });

  it('rejects GCP service-account flow when key has no private_key', async () => {
    await expect(
      connectProvider('org', 'gcp', {
        service_account_key: '{"client_email":"sa@p.iam.gserviceaccount.com"}',
      }),
    ).rejects.toThrow('Service account key must contain client_email and private_key');
  });

  it('rejects GCP service-account flow when key string is unparseable JSON', async () => {
    await expect(connectProvider('org', 'gcp', { service_account_key: 'not-json' })).rejects.toThrow(
      'Invalid JSON in service account key',
    );
  });

  it('rejects GCP service-account flow when no key is provided at all', async () => {
    await expect(connectProvider('org', 'gcp', {})).rejects.toThrow('No service account key provided');
  });

  it('connects GCP successfully when a well-formed service account key is provided (live auth ok)', async () => {
    upsertMock.mockResolvedValue({ id: 'cred-1' });
    const key = JSON.stringify({
      client_email: 'sa@p.iam.gserviceaccount.com',
      private_key: 'pk',
      project_id: 'proj-1',
    });

    const result = await connectProvider('org', 'gcp', { service_account_key: key });

    expect(result).toEqual({ success: true, id: 'cred-1', project_id: 'proj-1' });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0].update.project_id).toBe('proj-1');
  });

  it('still connects when live GCP auth throws (network/permissions issue)', async () => {
    authBag.impl = {
      getClient: async () => {
        throw new Error('network down');
      },
    };
    upsertMock.mockResolvedValue({ id: 'cred-1' });
    const key = JSON.stringify({
      client_email: 'sa@p.iam.gserviceaccount.com',
      private_key: 'pk',
      project_id: 'proj-fail-but-ok',
    });

    const result = await connectProvider('org', 'gcp', { service_account_key: key });

    expect(result.project_id).toBe('proj-fail-but-ok');
  });

  it('accepts pre-parsed key object (typeof !== string branch)', async () => {
    upsertMock.mockResolvedValue({ id: 'cred-1' });
    const keyObj = {
      client_email: 'sa@p.iam.gserviceaccount.com',
      private_key: 'pk',
      project_id: 'proj-obj',
    };
    const result = await connectProvider('org', 'gcp', {
      // @ts-ignore — simulate misuse where the caller passes a parsed object
      service_account_key: keyObj,
    });
    expect(result.project_id).toBe('proj-obj');
  });

  it('falls through to "key" alias when service_account_key is missing', async () => {
    upsertMock.mockResolvedValue({ id: 'cred-1' });
    const key = JSON.stringify({
      client_email: 'sa@p.iam.gserviceaccount.com',
      private_key: 'pk',
      project_id: 'proj-alias',
    });
    const result = await connectProvider('org', 'gcp', { key });
    expect(result.project_id).toBe('proj-alias');
  });

  it('uses the credentials.project_id when the key has none', async () => {
    upsertMock.mockResolvedValue({ id: 'cred-1' });
    const key = JSON.stringify({
      client_email: 'sa@p.iam.gserviceaccount.com',
      private_key: 'pk',
    });

    const result = await connectProvider('org', 'gcp', {
      service_account_key: key,
      project_id: 'caller-project',
    });

    // validateGCPCredentials returns projectId=undefined (no project_id in key)
    // — the `projectId = validation.projectId || credentials.project_id` line
    // then promotes the caller-supplied value.
    expect(result.project_id).toBe('caller-project');
    expect(upsertMock.mock.calls[0]![0].update.project_id).toBe('caller-project');
  });

  it('uses null when no project id is available anywhere', async () => {
    upsertMock.mockResolvedValue({ id: 'cred-1' });
    const key = JSON.stringify({
      client_email: 'sa@p.iam.gserviceaccount.com',
      private_key: 'pk',
    });
    await connectProvider('org', 'gcp', { service_account_key: key });
    expect(upsertMock.mock.calls[0]![0].update.project_id).toBeNull();
  });

  it('skips key validation for OAuth flow (uses caller-provided project_id)', async () => {
    upsertMock.mockResolvedValue({ id: 'cred-2' });
    const result = await connectProvider('org', 'gcp', {
      _auth_type: 'oauth',
      access_token: 'at',
      refresh_token: 'rt',
      project_id: 'oauth-proj',
    });
    expect(result).toEqual({ success: true, id: 'cred-2', project_id: 'oauth-proj' });
  });

  it('does not run validation for non-GCP providers', async () => {
    upsertMock.mockResolvedValue({ id: 'cred-aws' });
    const result = await connectProvider('org', 'aws', { access_key: 'k', secret: 's' });
    expect(result).toEqual({ success: true, id: 'cred-aws', project_id: undefined });
    // No project_id was assigned
    expect(upsertMock.mock.calls[0]![0].update.project_id).toBeNull();
  });

  it('surfaces the validation error.message when a thrown Error reaches the outer catch', async () => {
    // Force the outer catch to fire by making JSON.parse blow up on a key
    // that is non-string AND throws when accessed (Proxy with throwing handler).
    const trapKey = new Proxy(
      {},
      {
        get() {
          throw new Error('boom-from-proxy');
        },
      },
    );
    await expect(
      connectProvider('org', 'gcp', {
        // @ts-ignore — non-string deliberately to reach outer catch
        service_account_key: trapKey,
      }),
    ).rejects.toThrow('boom-from-proxy');
  });

  it('falls back to "Invalid GCP credentials" when validation throws an Error with no message', async () => {
    // The outer catch returns `{ valid: false, error: err.message }`. If
    // err.message is empty, the `validation.error || 'Invalid GCP …'`
    // fallback at the throw site fires.
    const trapKey = new Proxy(
      {},
      {
        get() {
          // Empty-message error so `err.message` is '' (falsy).

          throw new Error('');
        },
      },
    );
    await expect(
      connectProvider('org', 'gcp', {
        // @ts-ignore
        service_account_key: trapKey,
      }),
    ).rejects.toThrow('Invalid GCP credentials');
  });
});

// ── saveCredentials ────────────────────────────────────────────────────

describe('saveCredentials', () => {
  it('encrypts and upserts the credentials', async () => {
    upsertMock.mockResolvedValue({ id: 'sav-1' });
    const result = await saveCredentials('org', 'aws', { key: 'k' });
    expect(result).toEqual({ success: true, id: 'sav-1' });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0]![0].create.credentials).toContain('enc(');
  });
});

// ── disconnectProvider ─────────────────────────────────────────────────

describe('disconnectProvider', () => {
  it('marks the row disconnected and clears credentials', async () => {
    updateManyMock.mockResolvedValue({ count: 1 });
    await disconnectProvider('org', 'gcp');
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { organisation_id: 'org', provider: 'gcp' },
      data: { is_connected: false, credentials: '' },
    });
  });
});

// ── listGCPProjects ────────────────────────────────────────────────────

describe('listGCPProjects', () => {
  it('returns [] when there are no decrypted credentials', async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await listGCPProjects('org')).toEqual([]);
  });

  it('OAuth: lists projects when the resource manager call returns 200', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: 'at',
      token_expiry: String(Date.now() + 3_600_000),
      project_id: 'fallback',
    });
    mockFetchSequence([
      () =>
        jsonRes({
          projects: [
            { projectId: 'p1', name: 'Project One' },
            { projectId: 'p2', name: '' },
          ],
        }),
    ]);

    const result = await listGCPProjects('org');
    expect(result).toEqual([
      { id: 'p1', name: 'Project One' },
      { id: 'p2', name: 'p2' },
    ]);
  });

  it('OAuth: falls back to the static project when the resource manager call fails', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: 'at',
      token_expiry: String(Date.now() + 3_600_000),
      project_id: 'fallback',
    });
    mockFetchSequence([() => jsonRes({}, { status: 500 })]);
    expect(await listGCPProjects('org')).toEqual([{ id: 'fallback', name: 'fallback' }]);
  });

  it('OAuth: falls back to [] when the response is not OK and there is no static project', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: 'at',
      token_expiry: String(Date.now() + 3_600_000),
    });
    mockFetchSequence([() => jsonRes({}, { status: 500 })]);
    expect(await listGCPProjects('org')).toEqual([]);
  });

  it('OAuth: falls back to the static project when fetch throws', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: 'at',
      token_expiry: String(Date.now() + 3_600_000),
      project_id: 'thrown-fallback',
    });
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('net'));
    expect(await listGCPProjects('org')).toEqual([{ id: 'thrown-fallback', name: 'thrown-fallback' }]);
  });

  it('OAuth: returns [] when access token cannot be obtained and no static project_id exists', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      // expired token + no refresh — getValidGCPAccessToken returns null
      access_token: '',
      token_expiry: '0',
    });
    expect(await listGCPProjects('org')).toEqual([]);
  });

  it('OAuth: returns the static project when access token is null but project_id is set', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: '',
      token_expiry: '0',
      project_id: 'stub',
    });
    expect(await listGCPProjects('org')).toEqual([{ id: 'stub', name: 'stub' }]);
  });

  it('OAuth: handles missing data.projects array (defaults to empty list)', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: 'at',
      token_expiry: String(Date.now() + 3_600_000),
    });
    mockFetchSequence([() => jsonRes({})]);
    expect(await listGCPProjects('org')).toEqual([]);
  });

  it('Service-account: returns the project_id parsed from a JSON string key', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    const key = JSON.stringify({ project_id: 'sa-proj' });
    decryptCredsMock.mockReturnValue({ service_account_key: key });
    const result = await listGCPProjects('org');
    expect(result).toEqual([{ id: 'sa-proj', name: 'sa-proj' }]);
  });

  it('Service-account: returns the project_id from a pre-parsed key object', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      // @ts-ignore — purposely non-string
      key: { project_id: 'obj-proj' },
    });
    const result = await listGCPProjects('org');
    expect(result).toEqual([{ id: 'obj-proj', name: 'obj-proj' }]);
  });

  it('Service-account: returns [] when the JSON key is malformed', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({ service_account_key: 'not-json' });
    expect(await listGCPProjects('org')).toEqual([]);
  });

  it('Service-account: returns [] when the parsed key has no project_id', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      service_account_key: JSON.stringify({ client_email: 'sa@x' }),
    });
    expect(await listGCPProjects('org')).toEqual([]);
  });

  it('returns [] when neither auth_type nor a key is present', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      /* nothing useful */
    });
    expect(await listGCPProjects('org')).toEqual([]);
  });
});

// ── getValidGCPAccessToken ─────────────────────────────────────────────

describe('getValidGCPAccessToken', () => {
  it('returns null when no credentials exist', async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await getValidGCPAccessToken('org')).toBeNull();
  });

  it('returns null for non-OAuth credentials', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      /* no _auth_type */
    });
    expect(await getValidGCPAccessToken('org')).toBeNull();
  });

  it('returns the existing token when it is not yet expired', async () => {
    const creds = {
      _auth_type: 'oauth',
      access_token: 'still-good',
      token_expiry: String(Date.now() + 3_600_000),
    };
    expect(await getValidGCPAccessToken('org', creds)).toBe('still-good');
  });

  it('returns null when token is expired and there is no refresh token', async () => {
    const creds = {
      _auth_type: 'oauth',
      access_token: 'expired',
      token_expiry: '0',
    };
    expect(await getValidGCPAccessToken('org', creds)).toBeNull();
  });

  it('refreshes the token, persists it, and returns the new value', async () => {
    const creds = {
      _auth_type: 'oauth',
      access_token: 'old',
      token_expiry: '0',
      refresh_token: 'rt',
    };
    mockFetchSequence([() => jsonRes({ access_token: 'fresh', expires_in: 3600 })]);
    updateManyMock.mockResolvedValue({ count: 1 });

    const result = await getValidGCPAccessToken('org', creds);

    expect(result).toBe('fresh');
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(encryptCredsMock).toHaveBeenCalled();
  });

  it('returns null when the refresh call fails', async () => {
    const creds = {
      _auth_type: 'oauth',
      access_token: 'old',
      token_expiry: '0',
      refresh_token: 'rt',
    };
    mockFetchSequence([() => textRes('forbidden', { status: 403 })]);
    expect(await getValidGCPAccessToken('org', creds)).toBeNull();
  });

  it('returns null when the refresh fetch throws', async () => {
    const creds = {
      _auth_type: 'oauth',
      access_token: 'old',
      token_expiry: '0',
      refresh_token: 'rt',
    };
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error('network'));
    expect(await getValidGCPAccessToken('org', creds)).toBeNull();
  });

  it('uses the freshly-loaded creds when the caller passes none', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: 'live',
      token_expiry: String(Date.now() + 3_600_000),
    });
    expect(await getValidGCPAccessToken('org')).toBe('live');
  });

  it('refreshes when the token is within the 60s buffer (almost-expired)', async () => {
    const almostExpired = String(Date.now() + 30_000); // expires in 30s, buffer triggers refresh
    const creds = {
      _auth_type: 'oauth',
      access_token: 'old',
      token_expiry: almostExpired,
      refresh_token: 'rt',
    };
    mockFetchSequence([() => jsonRes({ access_token: 'newer', expires_in: 3600 })]);
    updateManyMock.mockResolvedValue({ count: 1 });
    const result = await getValidGCPAccessToken('org', creds);
    expect(result).toBe('newer');
  });

  it('returns null when access_token is missing even if not expired', async () => {
    const creds = {
      _auth_type: 'oauth',
      access_token: '', // falsy → falls through to refresh path
      token_expiry: String(Date.now() + 3_600_000),
    };
    // No refresh token either → returns null
    expect(await getValidGCPAccessToken('org', creds)).toBeNull();
  });

  it('treats a missing token_expiry as immediately expired (defaults to 0)', async () => {
    // The `creds.token_expiry || '0'` fallback fires when token_expiry is
    // undefined — exercises the right side of the `||`.
    const creds = {
      _auth_type: 'oauth',
      access_token: 'irrelevant',
      // token_expiry omitted entirely
      refresh_token: 'rt',
    };
    mockFetchSequence([() => jsonRes({ access_token: 'refreshed', expires_in: 3600 })]);
    updateManyMock.mockResolvedValue({ count: 1 });
    expect(await getValidGCPAccessToken('org', creds)).toBe('refreshed');
  });
});

// ── getGCPAuthType ─────────────────────────────────────────────────────

describe('getGCPAuthType', () => {
  it('returns null when no credentials exist', async () => {
    findUniqueMock.mockResolvedValue(null);
    expect(await getGCPAuthType('org')).toBeNull();
  });

  it('returns "oauth" when _auth_type is "oauth"', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({ _auth_type: 'oauth' });
    expect(await getGCPAuthType('org')).toBe('oauth');
  });

  it('returns "service_account" when _auth_type is anything else', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({});
    expect(await getGCPAuthType('org')).toBe('service_account');
  });
});

// ── updateGCPOAuthTokens ───────────────────────────────────────────────

describe('updateGCPOAuthTokens', () => {
  it('does nothing when current credentials cannot be loaded', async () => {
    findUniqueMock.mockResolvedValue(null);
    await updateGCPOAuthTokens('org', { access_token: 'new' });
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('does nothing when current credentials are not OAuth', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      /* no _auth_type */
    });
    await updateGCPOAuthTokens('org', { access_token: 'new' });
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('persists the access_token and optional token_expiry when present', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: 'old',
      token_expiry: '0',
    });
    updateManyMock.mockResolvedValue({ count: 1 });

    await updateGCPOAuthTokens('org', {
      access_token: 'newer',
      token_expiry: '999',
    });

    expect(updateManyMock).toHaveBeenCalledTimes(1);
    expect(encryptCredsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        _auth_type: 'oauth',
        access_token: 'newer',
        token_expiry: '999',
      }),
    );
  });

  it('preserves prior token_expiry when the caller does not pass a new one', async () => {
    findUniqueMock.mockResolvedValue({ is_connected: true, credentials: 'blob' });
    decryptCredsMock.mockReturnValue({
      _auth_type: 'oauth',
      access_token: 'old',
      token_expiry: '12345',
    });
    updateManyMock.mockResolvedValue({ count: 1 });

    await updateGCPOAuthTokens('org', { access_token: 'newer' });

    expect(encryptCredsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: 'newer',
        token_expiry: '12345', // unchanged
      }),
    );
  });
});
