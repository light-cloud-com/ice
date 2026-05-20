/**
 * Unit tests for `services/deploy/src/services/gcp-api-enabler.ts` —
 * the GCP Service Usage API enabler extracted in rf-deploy-6 from the
 * deploy.service.ts orchestrator.
 *
 * Per the `deploy-service-tests-must-import-vitest-explicitly` learning,
 * vitest globals are imported explicitly so the deploy package's
 * typecheck pass stays green.
 *
 * Per `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`,
 * console spies are torn down via `vi.restoreAllMocks()` in `beforeEach`
 * BEFORE re-spying.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ICE_TYPE_API_MAP, BASE_APIS, enableGcpApi, autoEnableGCPApis } from '../gcp-api-enabler';

// Helper to build a Response-like object that the SUT's `await fetch(...)`
// path consumes. Only the fields the SUT actually reads are populated.
function mockResponse(opts: { ok: boolean; status?: number; jsonBody?: any; textBody?: string }): any {
  const text = opts.textBody ?? '';
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    text: async () => text,
    json: async () => opts.jsonBody ?? {},
  };
}

describe('enableGcpApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when fetch resolves with ok:true', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
    const result = await enableGcpApi('my-project', 'storage.googleapis.com', 'tok-abc');
    expect(result).toBe(true);
  });

  it('returns false when fetch resolves with ok:false', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 403 }));
    const result = await enableGcpApi('my-project', 'storage.googleapis.com', 'tok-abc');
    expect(result).toBe(false);
  });

  it('returns false when fetch rejects (network error)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    const result = await enableGcpApi('my-project', 'storage.googleapis.com', 'tok-abc');
    expect(result).toBe(false);
  });

  it('POSTs to the Service Usage :enable URL with Bearer token, JSON content-type, and empty body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }));
    await enableGcpApi('proj-xyz', 'firebase.googleapis.com', 'mytoken');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://serviceusage.googleapis.com/v1/projects/proj-xyz/services/firebase.googleapis.com:enable',
    );
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer mytoken');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{}');
  });
});

describe('autoEnableGCPApis', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // `log` is the `(msg: string) => void` callback the SUT invokes. Typed
  // explicitly so the deploy package's typecheck pass stays green — the
  // bare `ReturnType<typeof vi.fn>` widens to `Procedure | Constructable`
  // which TS won't match against the SUT's parameter signature.
  let log: ((msg: string) => void) & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    log = vi.fn() as ((msg: string) => void) & ReturnType<typeof vi.fn>;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /**
   * Default listing response shape — caller can extend `enabledNames` to
   * mark certain APIs as already-on so they get filtered out of `toEnable`.
   */
  function listingResponse(enabledNames: string[]): any {
    return mockResponse({
      ok: true,
      jsonBody: { services: enabledNames.map((name) => ({ config: { name } })) },
    });
  }

  it('emits the "all enabled" log when every required API is already on', async () => {
    // No canvas nodes → required APIs is exactly BASE_APIS.
    fetchMock.mockResolvedValueOnce(listingResponse([...BASE_APIS]));

    await autoEnableGCPApis('proj-1', 'tok', [], log);

    // Listing fetch + zero enable POSTs.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('All required GCP APIs are enabled');
  });

  it('issues an enable POST per required API when none are already on, and logs the full-success path', async () => {
    vi.useFakeTimers();

    // Listing returns no enabled APIs — every BASE_API needs enabling.
    fetchMock.mockResolvedValueOnce(listingResponse([]));
    // BASE_APIS has 2 entries → 2 follow-up enable POSTs, each ok:true.
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));

    const promise = autoEnableGCPApis('proj-1', 'tok', [], log);
    // Advance the post-enable propagation sleep (5000ms) so the function resolves.
    await vi.runAllTimersAsync();
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(1 + BASE_APIS.length);

    // Each BASE_API should have been POSTed at exactly one :enable URL.
    for (const api of BASE_APIS) {
      const matched = fetchMock.mock.calls.find(([url, init]) => {
        return (
          typeof url === 'string' &&
          url === `https://serviceusage.googleapis.com/v1/projects/proj-1/services/${api}:enable` &&
          init?.method === 'POST'
        );
      });
      expect(matched, `expected an :enable POST for ${api}`).toBeTruthy();
    }

    // Logs: announce → per-API success → final propagation wait message.
    expect(log).toHaveBeenCalledWith(`Enabling ${BASE_APIS.length} required GCP API(s): ${BASE_APIS.join(', ')}`);
    for (const api of BASE_APIS) {
      expect(log).toHaveBeenCalledWith(`  Enabled ${api}`);
    }
    expect(log).toHaveBeenCalledWith('All APIs enabled. Waiting for propagation...');
  });

  it('adds APIs from each canvas resource node iceType to the required set (no duplicates)', async () => {
    vi.useFakeTimers();

    // Two nodes with the same iceType — `requiredApis` is a Set so duplicates
    // collapse. The listing fetch returns nothing as enabled, so every
    // unique required API generates one POST.
    const nodes = [
      { type: 'resource', data: { iceType: 'Storage.Bucket' } },
      { type: 'resource', data: { iceType: 'Storage.Bucket' } },
    ];

    // BASE_APIS (2) + Storage.Bucket APIs (1: storage.googleapis.com) = 3 unique.
    const expectedUnique = new Set([...BASE_APIS, ...ICE_TYPE_API_MAP['Storage.Bucket']!]);
    expect(expectedUnique.size).toBe(3);

    fetchMock.mockResolvedValueOnce(listingResponse([])); // listing — none enabled
    // 3 follow-up enable POSTs (order not guaranteed — we'll check by URL set).
    for (let i = 0; i < expectedUnique.size; i++) {
      fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));
    }

    const promise = autoEnableGCPApis('proj-2', 'tok', nodes, log);
    await vi.runAllTimersAsync();
    await promise;

    // 1 listing + 3 unique enable POSTs — NOT 4 (no duplicate `Storage.Bucket`
    // expansion) and NOT 5 (no extra base APIs from non-resource nodes).
    expect(fetchMock).toHaveBeenCalledTimes(1 + expectedUnique.size);

    const enableUrls = fetchMock.mock.calls
      .slice(1) // skip listing call
      .map((call) => call[0] as string);
    for (const api of expectedUnique) {
      expect(enableUrls).toContain(`https://serviceusage.googleapis.com/v1/projects/proj-2/services/${api}:enable`);
    }
  });

  it('skips canvas nodes whose iceType is not in ICE_TYPE_API_MAP (only BASE_APIS get enabled)', async () => {
    vi.useFakeTimers();

    // Unknown iceType → not a key in ICE_TYPE_API_MAP, so it contributes
    // nothing to `requiredApis` beyond BASE_APIS.
    const nodes = [{ type: 'resource', data: { iceType: 'Unknown.Type' } }];

    fetchMock.mockResolvedValueOnce(listingResponse([])); // none enabled
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));

    const promise = autoEnableGCPApis('proj-3', 'tok', nodes, log);
    await vi.runAllTimersAsync();
    await promise;

    // Listing + 2 BASE_APIS enable POSTs only — no extra fetch for Unknown.Type.
    expect(fetchMock).toHaveBeenCalledTimes(1 + BASE_APIS.length);
  });

  it('skips canvas nodes whose `type` !== "resource" (no APIs added even when iceType is mapped)', async () => {
    vi.useFakeTimers();

    // The node's iceType IS a key in the map, but `type` is wrong — the
    // node-type guard short-circuits before we look up the map.
    const nodes = [{ type: 'note', data: { iceType: 'Storage.Bucket' } }];

    fetchMock.mockResolvedValueOnce(listingResponse([])); // none enabled
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));

    const promise = autoEnableGCPApis('proj-4', 'tok', nodes, log);
    await vi.runAllTimersAsync();
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(1 + BASE_APIS.length);
  });

  it('logs a warning and bails when the listing fetch returns ok:false', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 503, textBody: 'unavailable' }));

    await autoEnableGCPApis('proj-5', 'tok', [], log);

    // Just the listing call — no enable POSTs follow.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Warning: Could not check enabled APIs (503). Will try deploying anyway.');
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Enabling '));
  });

  it('bails silently when the listing fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));

    await autoEnableGCPApis('proj-6', 'tok', [], log);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Function returns before any log call when the listing throws.
    expect(log).not.toHaveBeenCalled();
  });

  it('routes billing-error responses to a dedicated log message and reports partial success', async () => {
    fetchMock.mockResolvedValueOnce(listingResponse([])); // none enabled
    // Two enable calls: first succeeds, second fails with a billing-shaped error body.
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 400,
        textBody: 'Billing account is required',
      }),
    );

    await autoEnableGCPApis('proj-7', 'tok', [], log);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot enable cloudresourcemanager.googleapis.com: Billing is not enabled for this project',
      ),
    );
    expect(log).toHaveBeenCalledWith('Enabled 1/2 APIs. Some may need manual enabling.');
  });

  it('routes non-billing failures to a generic "Failed to enable" log line', async () => {
    fetchMock.mockResolvedValueOnce(listingResponse([])); // none enabled
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' })); // first succeeds
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: false, status: 403, textBody: 'permission denied' }), // second fails
    );

    await autoEnableGCPApis('proj-8', 'tok', [], log);

    expect(log).toHaveBeenCalledWith('  Failed to enable cloudresourcemanager.googleapis.com: permission denied');
  });

  it('catches per-API enable rejections and records them via the log callback', async () => {
    fetchMock.mockResolvedValueOnce(listingResponse([])); // none enabled
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' })); // first ok
    fetchMock.mockRejectedValueOnce(new Error('socket hang up')); // second throws

    await autoEnableGCPApis('proj-9', 'tok', [], log);

    expect(log).toHaveBeenCalledWith('  Failed to enable cloudresourcemanager.googleapis.com: socket hang up');
    // 1 succeeded out of 2 → partial-success summary.
    expect(log).toHaveBeenCalledWith('Enabled 1/2 APIs. Some may need manual enabling.');
  });

  it('falls through to the empty-iceType branch on resource nodes missing iceType', async () => {
    // node.type === 'resource' but no iceType → `(node.data?.iceType as string) || ''`
    // hits the `|| ''` fallback. Empty string isn't a key in the map, so no
    // extra APIs get added. This covers the branch otherwise unreachable
    // because every test above sets iceType explicitly.
    fetchMock.mockResolvedValueOnce(listingResponse([...BASE_APIS])); // all enabled
    await autoEnableGCPApis('proj-10', 'tok', [{ type: 'resource', data: {} }], log);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('All required GCP APIs are enabled');
  });

  it('handles a listing response with no `services` field (treats as empty enabled set)', async () => {
    vi.useFakeTimers();
    // `data.services || []` fallback path — listing returns 200 but with
    // an unexpected JSON body that omits `services`.
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: {} }));
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));

    const promise = autoEnableGCPApis('proj-11', 'tok', [], log);
    await vi.runAllTimersAsync();
    await promise;

    // Both BASE_APIS get enabled because the empty services list means
    // nothing is reported as already on.
    expect(fetchMock).toHaveBeenCalledTimes(1 + BASE_APIS.length);
  });

  it('handles a listing response whose service entries have no `config.name` (filtered to empty)', async () => {
    vi.useFakeTimers();
    // `s.config?.name || ''` then `.filter(Boolean)` strips the empty
    // strings, so an entry with no `config.name` contributes nothing to
    // the enabled set.
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, jsonBody: { services: [{ config: {} }, {}] } }));
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true, textBody: '{}' }));

    const promise = autoEnableGCPApis('proj-12', 'tok', [], log);
    await vi.runAllTimersAsync();
    await promise;

    expect(fetchMock).toHaveBeenCalledTimes(1 + BASE_APIS.length);
  });

  it('emits no summary log when every enable POST fails (succeeded === 0 branch)', async () => {
    // Both BASE_APIS enable POSTs fail with non-billing 4xx — succeeded === 0
    // hits neither the partial nor the all-success branch, so neither summary
    // log fires. The per-API "Failed to enable" lines DO fire.
    fetchMock.mockResolvedValueOnce(listingResponse([])); // none enabled
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 500, textBody: 'server error' }));
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: false, status: 500, textBody: 'server error' }));

    await autoEnableGCPApis('proj-13', 'tok', [], log);

    // Per-API failure lines fired, but no rolled-up summary log.
    expect(log).toHaveBeenCalledWith('  Failed to enable serviceusage.googleapis.com: server error');
    expect(log).toHaveBeenCalledWith('  Failed to enable cloudresourcemanager.googleapis.com: server error');
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Some may need manual enabling'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Waiting for propagation'));
  });
});

describe('exported constants', () => {
  it('BASE_APIS contains the two service-management APIs every GCP deploy needs', () => {
    expect(BASE_APIS).toEqual(['serviceusage.googleapis.com', 'cloudresourcemanager.googleapis.com']);
  });

  it('ICE_TYPE_API_MAP keys each map a canvas iceType to a non-empty list of googleapis.com hostnames', () => {
    const entries = Object.entries(ICE_TYPE_API_MAP);
    expect(entries.length).toBeGreaterThan(0);
    for (const [iceType, apis] of entries) {
      expect(iceType.length).toBeGreaterThan(0);
      expect(Array.isArray(apis)).toBe(true);
      expect(apis.length).toBeGreaterThan(0);
      for (const api of apis) {
        expect(api).toMatch(/\.googleapis\.com$/);
      }
    }
  });
});
