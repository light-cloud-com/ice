/**
 * Unit tests for `services/deploy/src/services/orphan-cleanup.service.ts` —
 * the GCP orphan sweeper that scans ICE-managed resources (label
 * `ice-managed=true`, or legacy `ice-` name prefix) and deletes any not
 * referenced by an active `DeployedResourceMapping` row.
 *
 * Per `deploy-service-tests-must-import-vitest-explicitly`, vitest globals
 * are imported explicitly so the deploy package's typecheck stays green.
 *
 * Patterns reused here:
 *   - `vi.stubGlobal('fetch', fetchMock)` per gcp-api-enabler.test.ts
 *   - `or-chain-default-fallback-needs-its-own-test-for-100pct-branch-coverage`
 *     forces explicit tests for the `service_account_key || key`,
 *     `gcpProject || credentials.project_id`, `tokenRes?.token || null`,
 *     `item.labels || {}`, and `list?.items || []` OR-chain tails.
 *   - `vi.mock('google-auth-library', ...)` covers the dynamic
 *     `await import('google-auth-library')` inside `buildGcpContext`'s
 *     service-account branch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// All `vi.mock` factories are co-hoisted with `vi.hoisted` to the top of the
// file by vitest's pre-execution pass — the SUT runs after these are wired.
const mocks = vi.hoisted(() => ({
  getClientMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
}));

vi.mock('@ice/db', () => ({
  default: {
    deployedResourceMapping: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@ice/service-credentials', () => ({
  getDecryptedCredentials: vi.fn(),
  getValidGCPAccessToken: vi.fn(),
}));

// The `GoogleAuth` constructor is a plain (non-vi.fn) class so that
// `vi.clearAllMocks()` between tests does NOT reset its
// `.mockImplementation`. The `getClient` callable inside is the vi.fn we
// drive per-test; clearing only zeroes its call list, not its replacement
// implementation set inside the test body itself.
vi.mock('google-auth-library', () => ({
  GoogleAuth: class GoogleAuth {
    getClient = mocks.getClientMock;
  },
}));

import { cleanupOrphanedIceResources } from '../orphan-cleanup.service';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above.
import prismaModule from '@ice/db';
// @ts-ignore — resolved at runtime via pnpm workspace; mocked above.
import * as credentialsModule from '@ice/service-credentials';

const findManyMock = (prismaModule as any).deployedResourceMapping.findMany as ReturnType<typeof vi.fn>;
const getDecryptedCredentialsMock = (credentialsModule as any).getDecryptedCredentials as ReturnType<
  typeof vi.fn
>;
const getValidGCPAccessTokenMock = (credentialsModule as any).getValidGCPAccessToken as ReturnType<
  typeof vi.fn
>;

/**
 * Build a Response-like that the SUT's `gcpFetch` consumes. Only the
 * fields actually read by the SUT are populated.
 */
function mockResponse(opts: { ok: boolean; status?: number; jsonBody?: any; textBody?: string }): any {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    text: async () => opts.textBody ?? '',
    json: async () => opts.jsonBody ?? {},
  };
}

/**
 * Build an empty `{ items: [] }` listing response — used to short-circuit
 * the resource-type scans we don't care about in a given test, since the
 * SUT calls scanAndClean for 7 distinct types in sequence.
 */
function emptyListing(): any {
  return mockResponse({ ok: true, jsonBody: { items: [] } });
}

/** Wire seven empty listings so the seven scanAndClean calls each see no items. */
function mockSevenEmptyListings(fetchMock: ReturnType<typeof vi.fn>) {
  for (let i = 0; i < 7; i++) {
    fetchMock.mockResolvedValueOnce(emptyListing());
  }
}

describe('cleanupOrphanedIceResources', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Default oauth happy path: avoids accidentally reaching the SA branch.
    getDecryptedCredentialsMock.mockResolvedValue({
      _auth_type: 'oauth',
      project_id: 'test-project',
    });
    getValidGCPAccessTokenMock.mockResolvedValue('access-token');
    findManyMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('credential context construction', () => {
    it('throws when getDecryptedCredentials returns null', async () => {
      getDecryptedCredentialsMock.mockResolvedValueOnce(null);

      await expect(cleanupOrphanedIceResources('org-1')).rejects.toThrow(
        /GCP credentials not found/,
      );
    });

    it('uses oauth path and token from getValidGCPAccessToken', async () => {
      mockSevenEmptyListings(fetchMock);

      const report = await cleanupOrphanedIceResources('org-1');

      expect(getValidGCPAccessTokenMock).toHaveBeenCalledWith('org-1', expect.any(Object));
      expect(report.scanned).toEqual({
        backendBuckets: 0,
        sslCertificates: 0,
        urlMaps: 0,
        targetHttpsProxies: 0,
        targetHttpProxies: 0,
        backendServices: 0,
        forwardingRules: 0,
      });
      // Every fetch should carry the bearer token and target the test-project URL.
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain('/projects/test-project/global');
      expect(init.headers.Authorization).toBe('Bearer access-token');
    });

    it('throws when oauth token resolution returns null', async () => {
      getValidGCPAccessTokenMock.mockResolvedValueOnce(null);

      await expect(cleanupOrphanedIceResources('org-1')).rejects.toThrow(
        /GCP credentials not found/,
      );
    });

    it('falls through to service-account branch when _auth_type is not oauth (string key parsed via JSON)', async () => {
      getDecryptedCredentialsMock.mockResolvedValueOnce({
        _auth_type: 'service_account',
        service_account_key: JSON.stringify({ client_email: 'sa@x', private_key: 'k' }),
        project_id: 'sa-project',
      });
      mocks.getClientMock.mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: 'sa-token' }),
      });
      mockSevenEmptyListings(fetchMock);

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.scanned.backendBuckets).toBe(0);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain('/projects/sa-project/global');
      expect(init.headers.Authorization).toBe('Bearer sa-token');
    });

    it('uses the already-parsed object when service_account_key is not a string', async () => {
      getDecryptedCredentialsMock.mockResolvedValueOnce({
        _auth_type: 'service_account',
        service_account_key: { client_email: 'sa@x', private_key: 'k' },
        project_id: 'sa-project',
      });
      mocks.getClientMock.mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: 'sa-token-2' }),
      });
      mockSevenEmptyListings(fetchMock);

      await cleanupOrphanedIceResources('org-1');

      const [, init] = fetchMock.mock.calls[0]!;
      expect(init.headers.Authorization).toBe('Bearer sa-token-2');
    });

    it('falls back to credentials.key when service_account_key is absent', async () => {
      getDecryptedCredentialsMock.mockResolvedValueOnce({
        _auth_type: 'service_account',
        key: { client_email: 'sa@x', private_key: 'k' },
        project_id: 'sa-project',
      });
      mocks.getClientMock.mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue({ token: 'sa-token-fallback' }),
      });
      mockSevenEmptyListings(fetchMock);

      await cleanupOrphanedIceResources('org-1');

      const [, init] = fetchMock.mock.calls[0]!;
      expect(init.headers.Authorization).toBe('Bearer sa-token-fallback');
    });

    it('throws when neither service_account_key nor key is present (no token resolved)', async () => {
      getDecryptedCredentialsMock.mockResolvedValueOnce({
        _auth_type: 'service_account',
        project_id: 'sa-project',
      });

      await expect(cleanupOrphanedIceResources('org-1')).rejects.toThrow(
        /GCP credentials not found/,
      );
    });

    it('throws when GoogleAuth.getClient throws (caught + null returned)', async () => {
      getDecryptedCredentialsMock.mockResolvedValueOnce({
        _auth_type: 'service_account',
        service_account_key: '{"bad":"json"',
        project_id: 'sa-project',
      });

      await expect(cleanupOrphanedIceResources('org-1')).rejects.toThrow(
        /GCP credentials not found/,
      );
    });

    it('throws when getAccessToken returns no token (tokenRes?.token || null falls to null)', async () => {
      getDecryptedCredentialsMock.mockResolvedValueOnce({
        _auth_type: 'service_account',
        service_account_key: { client_email: 'sa@x' },
        project_id: 'sa-project',
      });
      mocks.getClientMock.mockResolvedValue({
        getAccessToken: vi.fn().mockResolvedValue(null),
      });

      await expect(cleanupOrphanedIceResources('org-1')).rejects.toThrow(
        /GCP credentials not found/,
      );
    });

    it('throws when project_id is missing on credentials AND no gcpProject argument given', async () => {
      getDecryptedCredentialsMock.mockResolvedValueOnce({
        _auth_type: 'oauth',
        // No project_id field.
      });

      await expect(cleanupOrphanedIceResources('org-1')).rejects.toThrow(
        /GCP credentials not found/,
      );
    });

    it('uses the gcpProject argument when supplied (overrides credentials.project_id)', async () => {
      mockSevenEmptyListings(fetchMock);

      await cleanupOrphanedIceResources('org-1', 'override-proj');

      const [url] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain('/projects/override-proj/global');
    });
  });

  describe('mapping cross-reference + scan happy path', () => {
    it('returns empty report when GCP project has no items in any resource type', async () => {
      mockSevenEmptyListings(fetchMock);

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([]);
      expect(report.skipped).toEqual([]);
      expect(report.errors).toEqual([]);
      // Seven listing requests, no DELETEs.
      expect(fetchMock).toHaveBeenCalledTimes(7);
      expect(fetchMock.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
    });

    it('queries DeployedResourceMapping scoped to the org', async () => {
      mockSevenEmptyListings(fetchMock);

      await cleanupOrphanedIceResources('org-1');

      expect(findManyMock).toHaveBeenCalledTimes(1);
      const arg = findManyMock.mock.calls[0]![0] as any;
      expect(arg.where.card.project.organisation_id).toBe('org-1');
      expect(arg.select).toEqual({ resource_name: true, resource_type: true });
    });
  });

  describe('per-resource-type orphan deletion', () => {
    it('deletes a backend bucket carrying the ice-managed=true label that is not in active mappings', async () => {
      // First listing: one orphan with the canonical label.
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [{ name: 'ice-orphan-bucket', labels: { 'ice-managed': 'true' } }],
          },
        }),
      );
      // Delete succeeds.
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));
      // Six remaining empty listings (sslCertificates, urlMaps, targetHttpsProxies, ...).
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([{ type: 'backendBuckets', name: 'ice-orphan-bucket' }]);
      expect(report.scanned.backendBuckets).toBe(1);
      const deleteCall = fetchMock.mock.calls.find(([, init]) => init.method === 'DELETE')!;
      expect(String(deleteCall[0])).toContain('/backendBuckets/ice-orphan-bucket');
    });

    it('detects ICE resources via legacy ice- name prefix when the label is missing', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: { items: [{ name: 'ice-legacy-bucket', labels: {} }] },
        }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([{ type: 'backendBuckets', name: 'ice-legacy-bucket' }]);
    });

    it('skips resources that are neither labeled nor named with the ice prefix', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [
              { name: 'user-other-bucket', labels: { other: 'tag' } },
              { name: 'ice-keep', labels: { 'ice-managed': 'true' } },
            ],
          },
        }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.scanned.backendBuckets).toBe(2);
      expect(report.deleted).toEqual([{ type: 'backendBuckets', name: 'ice-keep' }]);
    });

    it('skips items with no name field', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: { items: [{ labels: { 'ice-managed': 'true' } }] }, // no name
        }),
      );
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.scanned.backendBuckets).toBe(1);
      expect(report.deleted).toEqual([]);
      expect(report.skipped).toEqual([]);
    });

    it('skips an ICE resource that is still referenced by an active mapping row', async () => {
      findManyMock.mockResolvedValueOnce([
        { resource_type: 'gcp.compute.backendBucket', resource_name: 'ice-active-bucket' },
      ]);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [{ name: 'ice-active-bucket', labels: { 'ice-managed': 'true' } }],
          },
        }),
      );
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([]);
      expect(report.skipped).toEqual([
        {
          type: 'backendBuckets',
          name: 'ice-active-bucket',
          reason: 'still referenced by an active card',
        },
      ]);
    });

    it('mixed: deletes orphans and skips active references in one scan', async () => {
      findManyMock.mockResolvedValueOnce([
        { resource_type: 'gcp.compute.backendBucket', resource_name: 'ice-active' },
      ]);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [
              { name: 'ice-active', labels: { 'ice-managed': 'true' } },
              { name: 'ice-orphan', labels: { 'ice-managed': 'true' } },
            ],
          },
        }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.skipped.map((s) => s.name)).toEqual(['ice-active']);
      expect(report.deleted.map((d) => d.name)).toEqual(['ice-orphan']);
    });

    it('exercises the SSL-certificate scan branch independently of buckets', async () => {
      // Empty backend buckets.
      fetchMock.mockResolvedValueOnce(emptyListing());
      // SSL cert with orphan + active.
      findManyMock.mockResolvedValueOnce([
        { resource_type: 'gcp.compute.managedSslCertificate', resource_name: 'ice-cert-keep' },
      ]);
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [
              { name: 'ice-cert-keep', labels: { 'ice-managed': 'true' } },
              { name: 'ice-cert-drop', labels: { 'ice-managed': 'true' } },
            ],
          },
        }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));
      for (let i = 0; i < 5; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([
        { type: 'sslCertificates', name: 'ice-cert-drop' },
      ]);
      expect(report.skipped.map((s) => s.name)).toEqual(['ice-cert-keep']);
      const deleteCall = fetchMock.mock.calls.find(([, init]) => init.method === 'DELETE')!;
      expect(String(deleteCall[0])).toContain('/sslCertificates/ice-cert-drop');
    });

    it.each([
      { typeLabel: 'urlMaps', skipBefore: 2, skipAfter: 4, urlSegment: '/urlMaps/' },
      { typeLabel: 'targetHttpsProxies', skipBefore: 3, skipAfter: 3, urlSegment: '/targetHttpsProxies/' },
      { typeLabel: 'targetHttpProxies', skipBefore: 4, skipAfter: 2, urlSegment: '/targetHttpProxies/' },
      { typeLabel: 'backendServices', skipBefore: 5, skipAfter: 1, urlSegment: '/backendServices/' },
    ])(
      'exercises the $typeLabel scan branch (mid-chain deleteUrlFor closure)',
      async ({ typeLabel, skipBefore, skipAfter, urlSegment }) => {
        for (let i = 0; i < skipBefore; i++) fetchMock.mockResolvedValueOnce(emptyListing());
        fetchMock.mockResolvedValueOnce(
          mockResponse({
            ok: true,
            jsonBody: {
              items: [{ name: `ice-${typeLabel}-orphan`, labels: { 'ice-managed': 'true' } }],
            },
          }),
        );
        fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));
        for (let i = 0; i < skipAfter; i++) fetchMock.mockResolvedValueOnce(emptyListing());

        const report = await cleanupOrphanedIceResources('org-1');

        expect(report.deleted).toEqual([{ type: typeLabel, name: `ice-${typeLabel}-orphan` }]);
        const deleteCall = fetchMock.mock.calls.find(([, init]) => init.method === 'DELETE')!;
        expect(String(deleteCall[0])).toContain(urlSegment);
      },
    );

    it('exercises the forwardingRules scan branch (last in the chain)', async () => {
      // Six empties before forwardingRules.
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [{ name: 'ice-fr-orphan', labels: { 'ice-managed': 'true' } }],
          },
        }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([{ type: 'forwardingRules', name: 'ice-fr-orphan' }]);
      const deleteCall = fetchMock.mock.calls.find(([, init]) => init.method === 'DELETE')!;
      expect(String(deleteCall[0])).toContain('/forwardingRules/ice-fr-orphan');
    });
  });

  describe('dry-run mode', () => {
    it('records orphans in deleted[] but issues no DELETE calls when dryRun:true', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [{ name: 'ice-dry-bucket', labels: { 'ice-managed': 'true' } }],
          },
        }),
      );
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1', undefined, { dryRun: true });

      expect(report.deleted).toEqual([{ type: 'backendBuckets', name: 'ice-dry-bucket' }]);
      // Only the seven GET listings — no DELETE.
      expect(fetchMock).toHaveBeenCalledTimes(7);
      expect(fetchMock.mock.calls.every(([, init]) => init.method === 'GET')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('records a list-side error and continues to the next resource type', async () => {
      // backendBuckets list fails.
      fetchMock.mockRejectedValueOnce(new Error('list-fail'));
      // Remaining six types empty.
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.errors).toContainEqual({
        type: 'backendBuckets',
        name: '(list)',
        error: 'list-fail',
      });
      // Remaining six listings still happen.
      expect(report.scanned.sslCertificates).toBe(0);
      expect(report.scanned.forwardingRules).toBe(0);
    });

    it('records a list-side error using String(err) when the rejection has no message', async () => {
      // The SUT does `err?.message || String(err)` — passing a string shape with
      // no message hits the String() fallback branch.
      fetchMock.mockRejectedValueOnce('plain-string-error');
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.errors).toContainEqual({
        type: 'backendBuckets',
        name: '(list)',
        error: 'plain-string-error',
      });
    });

    it('records a delete-side error and continues to the next item', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [
              { name: 'ice-fail', labels: { 'ice-managed': 'true' } },
              { name: 'ice-ok', labels: { 'ice-managed': 'true' } },
            ],
          },
        }),
      );
      // First DELETE fails with a 500.
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 500, textBody: 'boom' }));
      // Second DELETE succeeds.
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([{ type: 'backendBuckets', name: 'ice-ok' }]);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]!.name).toBe('ice-fail');
      expect(report.errors[0]!.error).toContain('500');
    });

    it('treats a 404 on DELETE as idempotent success (resource already gone)', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: { items: [{ name: 'ice-gone', labels: { 'ice-managed': 'true' } }] },
        }),
      );
      // 404 propagates up via the gcpFetch error path (status code is in the
      // thrown message), then the SUT classifies it as success.
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 404, textBody: 'not found' }));
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([{ type: 'backendBuckets', name: 'ice-gone' }]);
      expect(report.errors).toEqual([]);
    });

    it('records a delete-side error using String(err) when the rejection has no .message', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: { items: [{ name: 'ice-bad', labels: { 'ice-managed': 'true' } }] },
        }),
      );
      // Reject with a plain string so `err?.message` is undefined.
      fetchMock.mockRejectedValueOnce('rejected-string');
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.errors).toContainEqual({
        type: 'backendBuckets',
        name: 'ice-bad',
        error: 'rejected-string',
      });
    });

    it('captures the response text in the error message when text() reads succeed', async () => {
      // A non-404, non-204 failure: text() body should appear in error message.
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: { items: [{ name: 'ice-bad', labels: { 'ice-managed': 'true' } }] },
        }),
      );
      fetchMock.mockResolvedValueOnce(
        mockResponse({ ok: false, status: 500, textBody: 'internal' }),
      );
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.errors[0]!.error).toContain('500');
      expect(report.errors[0]!.error).toContain('internal');
    });

    it('still records an error when text() throws (text-catch fallback to empty string)', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: { items: [{ name: 'ice-bad', labels: { 'ice-managed': 'true' } }] },
        }),
      );
      // Failing response whose `text()` rejects — exercises the
      // `.catch(() => '')` branch inside gcpFetch.
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error('text-read-fail');
        },
        json: async () => ({}),
      } as any);
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.errors[0]!.name).toBe('ice-bad');
      expect(report.errors[0]!.error).toContain('500');
    });
  });

  describe('listing edge cases (OR-chain default fallbacks)', () => {
    it('treats a listing with no items field as zero items', async () => {
      // `(list?.items || [])` — passing { } reaches the [] default.
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: {} }));
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.scanned.backendBuckets).toBe(0);
      expect(report.deleted).toEqual([]);
    });

    it('treats an item with no labels as having an empty label bag (defaults to name-prefix detection)', async () => {
      // `(item.labels || {})` — passing item without labels reaches the {} default.
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: { items: [{ name: 'ice-by-prefix-only' }] },
        }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 }));
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.deleted).toEqual([{ type: 'backendBuckets', name: 'ice-by-prefix-only' }]);
    });

    it('walks pagination via nextPageToken until the listing returns no more pages', async () => {
      // Page 1: orphan + nextPageToken.
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [{ name: 'ice-page1', labels: { 'ice-managed': 'true' } }],
            nextPageToken: 'tok-2',
          },
        }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 })); // delete page1
      // Page 2: orphan + no nextPageToken (terminate).
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          ok: true,
          jsonBody: {
            items: [{ name: 'ice-page2', labels: { 'ice-managed': 'true' } }],
          },
        }),
      );
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, status: 204 })); // delete page2
      for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(emptyListing());

      const report = await cleanupOrphanedIceResources('org-1');

      expect(report.scanned.backendBuckets).toBe(2);
      expect(report.deleted.map((d) => d.name)).toEqual(['ice-page1', 'ice-page2']);
      // The second listing fetch should carry pageToken=tok-2.
      const listCalls = fetchMock.mock.calls.filter(([, init]) => init.method === 'GET');
      expect(String(listCalls[1]![0])).toContain('pageToken=tok-2');
    });
  });
});
