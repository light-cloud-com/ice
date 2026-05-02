/**
 * Unit tests for `services/deploy/src/services/google-verification.service.ts` —
 * the Site Verification API wrapper and SSL cert status fetcher used by
 * the post-deploy domain verification + managed cert requirements.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 *
 * Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * console spies are torn down via `vi.restoreAllMocks()` in `beforeEach`
 * BEFORE re-spying, and globals are unstubbed in `afterEach`.
 *
 * Caveat: the SUT keeps three module-level caches (`verificationCache`,
 * `tokenCache`, `enableAttempted`) that survive across `it` blocks because
 * the module is imported once per test-file. Each test uses a unique
 * `(orgId, domain)` / `(orgId, project)` combo so cache hits from earlier
 * tests can't shadow the path under test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------- Mock factories ----------------------------------------------------

const mocks = vi.hoisted(() => ({
  getDecryptedCredentials: vi.fn(),
  getValidGCPAccessToken: vi.fn(),
  enableGcpApi: vi.fn(),
  // google-auth-library: GoogleAuth constructor + getClient + getAccessToken
  googleAuthGetAccessToken: vi.fn(),
  GoogleAuthCtor: vi.fn(),
}));

vi.mock('@ice/service-credentials', () => ({
  getDecryptedCredentials: mocks.getDecryptedCredentials,
  getValidGCPAccessToken: mocks.getValidGCPAccessToken,
}));

vi.mock('../gcp-api-enabler.js', () => ({
  enableGcpApi: mocks.enableGcpApi,
}));

vi.mock('google-auth-library', () => {
  // Constructor returns an instance whose `getClient()` resolves to a
  // client whose `getAccessToken()` resolves to whatever the test wires up.
  // NOTE: must use a regular `function` (not an arrow), because the SUT
  // invokes it with `new GoogleAuth(...)` and arrow functions cannot serve
  // as constructors — vi.fn would otherwise throw "not a constructor".
  mocks.GoogleAuthCtor.mockImplementation(function MockGoogleAuth() {
    return { getClient: async () => ({ getAccessToken: mocks.googleAuthGetAccessToken }) };
  });
  return { GoogleAuth: mocks.GoogleAuthCtor };
});

// SUT must be imported AFTER vi.mock calls so the mocked dependencies wire in.
import {
  generateVerificationToken,
  checkSearchConsoleVerification,
  fetchSslCertificateStatus,
} from '../google-verification.service.js';

// ---------- fetch helpers -----------------------------------------------------

/**
 * Build a Response-like object mimicking just the surface the SUT touches:
 * `ok`, `status`, `json()`, `text()`, `clone()`.
 */
function mockResponse(opts: { ok?: boolean; status?: number; jsonBody?: any; textBody?: string }): any {
  const status = opts.status ?? (opts.ok === false ? 500 : 200);
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.textBody ?? '';
  const obj: any = {
    ok,
    status,
    json: async () => opts.jsonBody ?? {},
    text: async () => text,
  };
  // `clone()` must return an independent reader — the SUT calls
  // `res.clone().text()` so the original `res` can still be re-read.
  obj.clone = () => ({
    json: async () => opts.jsonBody ?? {},
    text: async () => text,
  });
  return obj;
}

/** Counter for unique orgIds across `it` blocks. Avoids stale-cache hits. */
let orgCounter = 0;
function uniqueOrg(prefix = 'org'): string {
  orgCounter += 1;
  return `${prefix}-${orgCounter}`;
}

// ---------- Setup / teardown --------------------------------------------------

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // `vi.restoreAllMocks()` strips the GoogleAuth ctor's implementation set
  // inside the module-level factory; re-install it per test so the SUT's
  // `new GoogleAuth(...).getClient()` chain still resolves to the spy.
  // Regular `function` — arrow functions cannot be invoked with `new`.
  mocks.GoogleAuthCtor.mockImplementation(function MockGoogleAuth() {
    return { getClient: async () => ({ getAccessToken: mocks.googleAuthGetAccessToken }) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// =============================================================================
//  generateVerificationToken
// =============================================================================

describe('generateVerificationToken', () => {
  it('returns null when no credentials are stored for the org', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce(null);

    const token = await generateVerificationToken(uniqueOrg(), 'example.com');
    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the stored credentials lack a project_id', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth' });

    const token = await generateVerificationToken(uniqueOrg(), 'example.com');
    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when oauth flow has no valid access token', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-x' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce(null);

    const token = await generateVerificationToken(uniqueOrg(), 'example.com');
    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when service-account credentials lack a key field', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ project_id: 'proj-x' });

    const token = await generateVerificationToken(uniqueOrg(), 'example.com');
    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when service-account key fails to JSON-parse (catch path)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({
      project_id: 'proj-x',
      service_account_key: 'not-valid-json{{',
    });

    const token = await generateVerificationToken(uniqueOrg(), 'example.com');
    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when GoogleAuth client returns no access token', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({
      project_id: 'proj-x',
      service_account_key: { client_email: 'sa@x' },
    });
    mocks.googleAuthGetAccessToken.mockResolvedValueOnce({ token: undefined });

    const token = await generateVerificationToken(uniqueOrg(), 'example.com');
    expect(token).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the oauth access token to POST to the token endpoint and returns the token from the body', async () => {
    const orgId = uniqueOrg();
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-x' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('oauth-tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { token: 'google-token-A' } }));

    const token = await generateVerificationToken(orgId, 'example-oauth.com');

    expect(token).toBe('google-token-A');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://www.googleapis.com/siteVerification/v1/token');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer oauth-tok');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      verificationMethod: 'DNS_TXT',
      site: { type: 'INET_DOMAIN', identifier: 'example-oauth.com' },
    });
  });

  it('parses a service-account key supplied as a JSON string and returns the token', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({
      project_id: 'proj-x',
      service_account_key: JSON.stringify({ client_email: 'sa@example' }),
    });
    mocks.googleAuthGetAccessToken.mockResolvedValueOnce({ token: 'sa-tok' });
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { token: 'google-token-B' } }));

    const token = await generateVerificationToken(uniqueOrg(), 'sa-string.com');
    expect(token).toBe('google-token-B');
    expect(mocks.GoogleAuthCtor).toHaveBeenCalled();
  });

  it('uses the legacy `key` field when `service_account_key` is absent', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({
      project_id: 'proj-x',
      key: { client_email: 'sa@example' },
    });
    mocks.googleAuthGetAccessToken.mockResolvedValueOnce({ token: 'sa-tok-legacy' });
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { token: 'google-token-C' } }));

    const token = await generateVerificationToken(uniqueOrg(), 'sa-legacy.com');
    expect(token).toBe('google-token-C');
  });

  it('caches the token within the TTL — second call with the same (orgId, domain) does not re-hit fetch', async () => {
    const orgId = uniqueOrg('cache');
    const domain = 'cache-test.com';
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { token: 'cached-token' } }));

    const first = await generateVerificationToken(orgId, domain);
    expect(first).toBe('cached-token');

    const second = await generateVerificationToken(orgId, domain);
    expect(second).toBe('cached-token');
    // Only the first call hit fetch / credential resolution.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.getDecryptedCredentials).toHaveBeenCalledTimes(1);
  });

  it('does not cache an empty token (so the next call retries)', async () => {
    const orgId = uniqueOrg('empty');
    const domain = 'empty-token.com';
    mocks.getDecryptedCredentials.mockResolvedValue({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValue('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { token: '' } }));

    const first = await generateVerificationToken(orgId, domain);
    expect(first).toBe('');
    // Second call must re-fetch (not cached) — confirms the `if (value)` guard.
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { token: 'finally' } }));
    const second = await generateVerificationToken(orgId, domain);
    expect(second).toBe('finally');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null and warns when the API responds with non-200 (no SERVICE_DISABLED match)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 401, textBody: 'Unauthorized' }));

    const token = await generateVerificationToken(uniqueOrg(), 'fail-401.com');
    expect(token).toBeNull();
  });

  it('returns null when fetch itself rejects (network error path)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockRejectedValueOnce(new Error('econnreset'));

    const token = await generateVerificationToken(uniqueOrg(), 'net-err.com');
    expect(token).toBeNull();
  });

  it('detects SERVICE_DISABLED 403, auto-enables, and retries — returning the post-retry token', async () => {
    vi.useFakeTimers();
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-enable-1' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    // First attempt: 403 with SERVICE_DISABLED hint.
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 403, textBody: '{"error":{"status":"SERVICE_DISABLED"}}' }),
    );
    mocks.enableGcpApi.mockResolvedValueOnce(true);
    // Retry: success.
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { token: 'after-enable' } }));

    const promise = generateVerificationToken(uniqueOrg('en1'), 'svc-disabled.com');
    // 5s propagation sleep inside ensureSiteVerificationApiEnabled.
    await vi.runAllTimersAsync();
    const token = await promise;

    expect(token).toBe('after-enable');
    expect(mocks.enableGcpApi).toHaveBeenCalledWith('proj-enable-1', 'siteverification.googleapis.com', 'tok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns null when SERVICE_DISABLED is detected but the auto-enable attempt itself fails', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-enable-2' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 403, textBody: 'has not been used in project' }),
    );
    mocks.enableGcpApi.mockResolvedValueOnce(false);

    const token = await generateVerificationToken(uniqueOrg('en2'), 'svc-disabled-fail.com');
    expect(token).toBeNull();
    // No retry POSTed when enableGcpApi returns false.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-attempt enable when the same (orgId, project) was already tried in this process', async () => {
    // First call attempts to enable and fails (records the attempt).
    const orgId = uniqueOrg('en3');
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-enable-3' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 403, textBody: 'SERVICE_DISABLED' }),
    );
    mocks.enableGcpApi.mockResolvedValueOnce(false);
    await generateVerificationToken(orgId, 'first-call.com');
    expect(mocks.enableGcpApi).toHaveBeenCalledTimes(1);

    // Second call with same (orgId, project) — idempotent skip; no new enable.
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-enable-3' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 403, textBody: 'SERVICE_DISABLED' }),
    );
    const token = await generateVerificationToken(orgId, 'second-call.com');
    expect(token).toBeNull();
    expect(mocks.enableGcpApi).toHaveBeenCalledTimes(1); // still 1, not 2
  });
});

// =============================================================================
//  checkSearchConsoleVerification
// =============================================================================

describe('checkSearchConsoleVerification', () => {
  it('returns false when there are no credentials for the org', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce(null);
    expect(await checkSearchConsoleVerification(uniqueOrg(), 'no-cred.com')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns true when the API responds 200 (verified now)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: {} }));

    expect(await checkSearchConsoleVerification(uniqueOrg('chk1'), 'verified-now.com')).toBe(true);
  });

  it('returns true when the API responds 400 (treated as already-verified)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 400, textBody: 'already verified' }));

    expect(await checkSearchConsoleVerification(uniqueOrg('chk2'), 'already-verified.com')).toBe(true);
  });

  it('returns false when the API responds 403 without SERVICE_DISABLED (TXT not present yet)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 403, textBody: 'TXT record not found' }));

    expect(await checkSearchConsoleVerification(uniqueOrg('chk3'), 'not-yet.com')).toBe(false);
  });

  it('detects SERVICE_DISABLED 403, auto-enables, retries, and returns the retry verdict', async () => {
    vi.useFakeTimers();
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-vchk-1' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 403, textBody: 'SERVICE_DISABLED message body' }),
    );
    mocks.enableGcpApi.mockResolvedValueOnce(true);
    // Retry: 200 verified.
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: {} }));

    const promise = checkSearchConsoleVerification(uniqueOrg('chk4'), 'svc-disabled-chk.com');
    await vi.runAllTimersAsync();
    expect(await promise).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when 403 SERVICE_DISABLED is detected but auto-enable returns false', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-vchk-2' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 403, textBody: 'has not been used in project' }),
    );
    mocks.enableGcpApi.mockResolvedValueOnce(false);

    expect(await checkSearchConsoleVerification(uniqueOrg('chk5'), 'svc-disabled-no-enable.com')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns false when fetch itself throws (caught)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockRejectedValueOnce(new Error('boom'));

    expect(await checkSearchConsoleVerification(uniqueOrg('chk6'), 'fetch-throws.com')).toBe(false);
  });

  it('caches verified=true for the (orgId, domain) — second call does not re-hit fetch', async () => {
    const orgId = uniqueOrg('chk7');
    const domain = 'cache-verified.com';
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: {} }));

    expect(await checkSearchConsoleVerification(orgId, domain)).toBe(true);
    // Cache hit on second call.
    expect(await checkSearchConsoleVerification(orgId, domain)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.getDecryptedCredentials).toHaveBeenCalledTimes(1);
  });

  it('falls through res.clone().text() catch path when 403 body read rejects (no SERVICE_DISABLED detected)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'p' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    // Build a 403 response whose `clone().text()` rejects, exercising the
    // `.catch(() => '')` branch — body falls through as empty string,
    // SERVICE_DISABLED check is false, no retry attempted.
    const failingResponse: any = {
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => 'not used',
      clone: () => ({ text: () => Promise.reject(new Error('clone failed')) }),
    };
    fetchMock.mockResolvedValueOnce(failingResponse);

    expect(await checkSearchConsoleVerification(uniqueOrg('chk8'), 'clone-fails.com')).toBe(false);
    expect(mocks.enableGcpApi).not.toHaveBeenCalled();
  });
});

// =============================================================================
//  fetchSslCertificateStatus
// =============================================================================

describe('fetchSslCertificateStatus', () => {
  it('returns { status: "UNKNOWN" } when no credentials are stored', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce(null);

    const out = await fetchSslCertificateStatus(uniqueOrg(), 'proj-x', 'cert-name');
    expect(out).toEqual({ status: 'UNKNOWN' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the managed status + per-domain map when the compute API responds 200', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-x' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: true,
        jsonBody: {
          managed: {
            status: 'ACTIVE',
            domainStatus: { 'a.com': 'ACTIVE', 'b.com': 'PROVISIONING' },
          },
        },
      }),
    );

    const out = await fetchSslCertificateStatus(uniqueOrg('ssl1'), 'proj-x', 'cert-1');
    expect(out).toEqual({
      status: 'ACTIVE',
      domain_statuses: { 'a.com': 'ACTIVE', 'b.com': 'PROVISIONING' },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://compute.googleapis.com/compute/v1/projects/proj-x/global/sslCertificates/cert-1');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('falls back to status="UNKNOWN" when the body has no managed.status', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-x' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { managed: {} } }));

    const out = await fetchSslCertificateStatus(uniqueOrg('ssl2'), 'proj-x', 'cert-2');
    expect(out).toEqual({ status: 'UNKNOWN', domain_statuses: undefined });
  });

  it('falls back to status="UNKNOWN" when body has no managed at all', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-x' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: {} }));

    const out = await fetchSslCertificateStatus(uniqueOrg('ssl3'), 'proj-x', 'cert-3');
    expect(out).toEqual({ status: 'UNKNOWN', domain_statuses: undefined });
  });

  it('returns { status: "UNKNOWN" } when the API responds non-2xx', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-x' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 404, textBody: 'not found' }));

    const out = await fetchSslCertificateStatus(uniqueOrg('ssl4'), 'proj-x', 'cert-missing');
    expect(out).toEqual({ status: 'UNKNOWN' });
  });

  it('returns { status: "UNKNOWN" } when fetch rejects (caught)', async () => {
    mocks.getDecryptedCredentials.mockResolvedValueOnce({ _auth_type: 'oauth', project_id: 'proj-x' });
    mocks.getValidGCPAccessToken.mockResolvedValueOnce('tok');
    fetchMock.mockRejectedValueOnce(new Error('econnreset'));

    const out = await fetchSslCertificateStatus(uniqueOrg('ssl5'), 'proj-x', 'cert-net');
    expect(out).toEqual({ status: 'UNKNOWN' });
  });
});
