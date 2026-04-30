/**
 * Tests for `firebase-hosting/domain-registrar.ts` (rf-fbh-9).
 *
 * Highest-risk unit in the rf-fbh series. The custom-domain registrant
 * walks a three-tier fallback (GET adopt -> POST customDomains -> POST
 * legacy domains), each leg with its own 409 re-fetch. The blueprint
 * pins two load-bearing invariants:
 *
 * - RISK #13: Every URL MUST include the
 *   `projects/${ctx.project}/sites/${siteId}` prefix. The bare
 *   `sites/${siteId}` form 404s under the user's default project. Every
 *   request URL in this test set is asserted byte-for-byte against the
 *   project-scoped form. The legacy `domains` endpoint shares the same
 *   prefix.
 *
 * - RISK #14: The three-tier fallback's per-leg shapes are pinned —
 *   notably the legacy POST body's
 *   `{ domainRedirect: { type: 'TEMPORARY', domainName: '' },
 *      provisioning: { certStatus: 'CERT_PREPARING' } }`
 *   verbatim plus the `acceptStatuses: [409]` gate. Each 409 path issues
 *   a follow-up GET to refresh `domainData` before extracting records;
 *   without the re-fetch the caller would see the empty 409 body and
 *   surface zero DNS records.
 *
 * `restRequest` and `extractDnsRecords` are mocked at the module
 * boundary so the tests never hit the real Firebase Hosting REST API
 * (which would require live GCP credentials and fail in CI). The
 * `vi.hoisted` pattern keeps mock identity stable across the per-test
 * resets (see the rf-canv-12 learning).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerHostingDomain } from '../domain-registrar.js';
import type { GCPHandlerContext } from '../../../types.js';
import type { FirebaseHostingDnsRecord } from '../dns-extractor.js';

const mocks = vi.hoisted(() => ({
  restRequest: vi.fn(),
  extractDnsRecords: vi.fn(),
  FIREBASE_HOSTING_API: 'https://firebasehosting.googleapis.com/v1beta1',
}));

vi.mock('../rest-client.js', () => ({
  restRequest: mocks.restRequest,
  FIREBASE_HOSTING_API: mocks.FIREBASE_HOSTING_API,
}));

vi.mock('../dns-extractor.js', () => ({
  extractDnsRecords: mocks.extractDnsRecords,
}));

/**
 * Build a minimal `GCPHandlerContext`. `restRequest` is mocked at the
 * module boundary so the rest_client is unused; the type still requires
 * something to fill it. `on_log` is a spy so we can verify diagnostic
 * output didn't accidentally swallow the path or status.
 */
function makeCtx(overrides: Partial<GCPHandlerContext> = {}): GCPHandlerContext {
  const restClient: any = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    requestRaw: vi.fn(),
  };
  return {
    project: 'test-project',
    region: 'us-central1',
    clients: new Map(),
    rest_client: restClient,
    on_log: vi.fn(),
    ...overrides,
  };
}

const SITE_ID = 'my-site';
const DOMAIN = 'app.example.com';
const ENCODED_DOMAIN = encodeURIComponent(DOMAIN);
const PROJECT_SCOPED_PATH = `projects/test-project/sites/${SITE_ID}`;
const FH_API = 'https://firebasehosting.googleapis.com/v1beta1';

const SAMPLE_RECORDS: FirebaseHostingDnsRecord[] = [
  { type: 'A', domain: DOMAIN, value: '199.36.158.100', required_action: 'add' },
  { type: 'TXT', domain: DOMAIN, value: 'firebase-token', required_action: 'add' },
];

describe('firebase-hosting/domain-registrar', () => {
  beforeEach(() => {
    mocks.restRequest.mockReset();
    mocks.extractDnsRecords.mockReset();
    mocks.extractDnsRecords.mockReturnValue(SAMPLE_RECORDS);
  });

  describe('Tier 1: GET adopt path', () => {
    it('adopts the existing customDomain when GET returns 200 with a `name` field', async () => {
      // Happy idempotent path: a previous deploy already registered
      // this domain. The GET succeeds with the canonical resource body
      // and we extract the existing DNS records without ever issuing
      // a POST. Pins RISK #13 (project-scoped path).
      const existingDomainData = {
        name: `${PROJECT_SCOPED_PATH}/customDomains/${DOMAIN}`,
        hostState: 'HOST_ACTIVE',
        requiredDnsUpdates: { desired: [], discovered: [] },
      };
      mocks.restRequest.mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: existingDomainData,
      });

      const ctx = makeCtx();
      const out = await registerHostingDomain(ctx, SITE_ID, DOMAIN);

      expect(mocks.restRequest).toHaveBeenCalledOnce();
      const args = mocks.restRequest.mock.calls[0]!;
      expect(args[0]).toBe(ctx);
      expect(args[1]).toBe('GET');
      // RISK #13: path MUST be project-scoped, not bare sites/${siteId}.
      expect(args[2]).toBe(`${FH_API}/${PROJECT_SCOPED_PATH}/customDomains/${ENCODED_DOMAIN}`);
      expect(args[3]).toBeUndefined();
      expect(args[4]).toEqual({ acceptStatuses: [404] });

      expect(mocks.extractDnsRecords).toHaveBeenCalledOnce();
      expect(mocks.extractDnsRecords).toHaveBeenCalledWith(existingDomainData);
      expect(out).toEqual({
        ok: true,
        domainName: DOMAIN,
        status: 'HOST_ACTIVE',
        dnsRecords: SAMPLE_RECORDS,
        rawResponse: existingDomainData,
      });
      expect(ctx.on_log).toHaveBeenCalledWith(
        expect.stringContaining('Adopted existing customDomain'),
      );
    });

    it("falls back to status='pending' when adopted body has no `hostState`", async () => {
      // Older Firebase responses sometimes omit hostState while still
      // surfacing a populated `name`. The `|| 'pending'` arm of the
      // status fallback chain protects us here.
      const data = { name: `${PROJECT_SCOPED_PATH}/customDomains/${DOMAIN}` };
      mocks.restRequest.mockResolvedValueOnce({ status: 200, ok: true, data });

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(out.status).toBe('pending');
    });

    it('skips Tier 1 when GET returns 404 (no existing domain)', async () => {
      // The 404-as-success branch (acceptStatuses: [404]) means GET
      // returns ok:true with status=404 — but the `status !== 404` gate
      // forces us into the create path. Without that gate we'd return
      // a record set extracted from a 404 body (i.e. nothing).
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} }) // GET 404
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          data: { hostState: 'HOST_ACTIVE_PENDING' },
        }); // POST customDomains success

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);

      expect(mocks.restRequest).toHaveBeenCalledTimes(2);
      expect(mocks.restRequest.mock.calls[1]![1]).toBe('POST');
      expect(out.ok).toBe(true);
    });

    it('skips Tier 1 when GET returns 200 but the body lacks `name`', async () => {
      // Defense-in-depth: a 200 with an empty body shouldn't be treated
      // as "domain exists". The `data?.name` check is the third gate.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 200, ok: true, data: {} }) // GET 200 but empty
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          data: { hostState: 'PENDING' },
        });

      await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(mocks.restRequest).toHaveBeenCalledTimes(2);
      expect(mocks.restRequest.mock.calls[1]![1]).toBe('POST');
    });
  });

  describe('Tier 2: POST customDomains path', () => {
    it('creates the domain on a 200 response and returns the new records', async () => {
      const newDomainData = { hostState: 'HOST_ACTIVE_PENDING' };
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} }) // GET 404
        .mockResolvedValueOnce({ status: 200, ok: true, data: newDomainData }); // POST 200

      const ctx = makeCtx();
      const out = await registerHostingDomain(ctx, SITE_ID, DOMAIN);

      // Pin POST URL shape: project-scoped path + customDomainId query
      // (RISK #13). The query string is the only way Firebase Hosting
      // accepts the resource id on creation; switching to a body field
      // would 400.
      const postArgs = mocks.restRequest.mock.calls[1]!;
      expect(postArgs[1]).toBe('POST');
      expect(postArgs[2]).toBe(
        `${FH_API}/${PROJECT_SCOPED_PATH}/customDomains?customDomainId=${ENCODED_DOMAIN}`,
      );
      expect(postArgs[3]).toEqual({});
      expect(postArgs[4]).toEqual({ acceptStatuses: [409, 400] });

      expect(mocks.extractDnsRecords).toHaveBeenCalledWith(newDomainData);
      expect(out).toEqual({
        ok: true,
        domainName: DOMAIN,
        status: 'HOST_ACTIVE_PENDING',
        dnsRecords: SAMPLE_RECORDS,
        rawResponse: newDomainData,
      });
    });

    it('re-fetches via GET on 409 and returns the adopted records (RISK #14 first 409 path)', async () => {
      // Race-condition path: another deploy registered the same domain
      // between our GET-404 probe and our POST. The 409 body is empty,
      // so we issue a re-fetching GET (no acceptStatuses this time —
      // we expect the resource to exist) and use that body's records.
      const refetchedData = {
        name: `${PROJECT_SCOPED_PATH}/customDomains/${DOMAIN}`,
        hostState: 'HOST_ACTIVE',
      };
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} }) // GET 404
        .mockResolvedValueOnce({ status: 409, ok: true, data: {} }) // POST 409
        .mockResolvedValueOnce({ status: 200, ok: true, data: refetchedData }); // re-fetch

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);

      expect(mocks.restRequest).toHaveBeenCalledTimes(3);
      const refetchArgs = mocks.restRequest.mock.calls[2]!;
      expect(refetchArgs[1]).toBe('GET');
      expect(refetchArgs[2]).toBe(
        `${FH_API}/${PROJECT_SCOPED_PATH}/customDomains/${ENCODED_DOMAIN}`,
      );
      // No acceptStatuses on re-fetch — caller wants the canonical body.
      expect(refetchArgs[4]).toBeUndefined();
      expect(mocks.extractDnsRecords).toHaveBeenLastCalledWith(refetchedData);
      expect(out.rawResponse).toBe(refetchedData);
      expect(out.status).toBe('HOST_ACTIVE');
    });

    it('uses the original 409 body when the re-fetch also fails', async () => {
      // The re-fetch is best-effort — if it fails (e.g. transient 5xx)
      // we still return ok:true using whatever the 409 body contained.
      // Pins the `if (refetch.ok) domainData = refetch.data` guard.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} }) // GET 404
        .mockResolvedValueOnce({
          status: 409,
          ok: true,
          data: { hostState: 'HOST_PENDING' },
        }) // POST 409
        .mockResolvedValueOnce({ status: 500, ok: false, data: {} }); // re-fetch fail

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(out.ok).toBe(true);
      expect(out.status).toBe('HOST_PENDING');
    });

    it("falls back to status='pending' when the create body lacks hostState", async () => {
      // Newly-created domains can return an empty body if the resource
      // is still being initialized. The `|| 'pending'` arm protects us.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 200, ok: true, data: {} });

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(out.status).toBe('pending');
    });

    it('falls through to Tier 3 when POST customDomains fails with non-409', async () => {
      // The full failure mode: POST customDomains rejects (e.g. 400
      // "domain already managed by another project"). The wrapper
      // logs the failure and tries the legacy endpoint — pin so a
      // future refactor doesn't accidentally short-circuit here.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} }) // GET 404
        .mockResolvedValueOnce({
          status: 400,
          ok: false,
          data: { error: { message: 'customDomains API not enabled' } },
        }) // POST customDomains fail
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          data: { provisioning: { certStatus: 'CERT_ACTIVE' } },
        }); // POST legacy success

      const ctx = makeCtx();
      const out = await registerHostingDomain(ctx, SITE_ID, DOMAIN);

      expect(mocks.restRequest).toHaveBeenCalledTimes(3);
      expect(mocks.restRequest.mock.calls[2]![2]).toBe(`${FH_API}/${PROJECT_SCOPED_PATH}/domains`);
      expect(out.ok).toBe(true);
      expect(out.status).toBe('CERT_ACTIVE');
      expect(ctx.on_log).toHaveBeenCalledWith(
        expect.stringContaining('Trying legacy domains endpoint'),
      );
    });

    it('falls through to Tier 3 when POST customDomains is ok:true but with status >= 300 (non-409)', async () => {
      // The compound gate `(createRes.status < 300 || createRes.status === 409)`
      // means a 4xx that's in acceptStatuses (i.e. ok:true) but isn't
      // 409 still falls through to Tier 3. This pins that 400-ok-true
      // does NOT count as a successful create.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({
          status: 400,
          ok: true,
          data: { error: { message: 'cannot create' } },
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          data: { provisioning: { certStatus: 'CERT_ACTIVE' } },
        });

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(mocks.restRequest).toHaveBeenCalledTimes(3);
      expect(out.ok).toBe(true);
      expect(out.status).toBe('CERT_ACTIVE');
    });
  });

  describe('Tier 3: POST legacy domains path', () => {
    it('creates the domain via legacy endpoint with the verbatim body shape (RISK #14)', async () => {
      // RISK #14 body shape pin: the legacy create requires
      // `domainRedirect.type: 'TEMPORARY'`, `domainRedirect.domainName: ''`,
      // and `provisioning.certStatus: 'CERT_PREPARING'`. Drop any of
      // these and Firebase rejects with 400 "missing required fields".
      const legacyData = { provisioning: { certStatus: 'CERT_VERIFICATION' } };
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} }) // GET 404
        .mockResolvedValueOnce({ status: 400, ok: false, data: {} }) // customDomains fail
        .mockResolvedValueOnce({ status: 200, ok: true, data: legacyData }); // legacy success

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);

      const legacyArgs = mocks.restRequest.mock.calls[2]!;
      expect(legacyArgs[1]).toBe('POST');
      // RISK #13: legacy endpoint also project-scoped.
      expect(legacyArgs[2]).toBe(`${FH_API}/${PROJECT_SCOPED_PATH}/domains`);
      // RISK #14: body shape pinned exactly.
      expect(legacyArgs[3]).toEqual({
        domainName: DOMAIN,
        domainRedirect: { type: 'TEMPORARY', domainName: '' },
        provisioning: { certStatus: 'CERT_PREPARING' },
      });
      expect(legacyArgs[4]).toEqual({ acceptStatuses: [409] });

      expect(mocks.extractDnsRecords).toHaveBeenLastCalledWith(legacyData);
      expect(out).toEqual({
        ok: true,
        domainName: DOMAIN,
        status: 'CERT_VERIFICATION',
        dnsRecords: SAMPLE_RECORDS,
        rawResponse: legacyData,
      });
    });

    it('re-fetches via GET on legacy 409 and returns the adopted records', async () => {
      // Mirror of Tier 2's 409 path, but on the legacy domains
      // endpoint. The re-fetch URL pins the `domains/<encoded>` shape
      // (no `customDomainId` query — legacy uses path-style ids).
      const refetched = { provisioning: { certStatus: 'CERT_ACTIVE' } };
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} }) // GET 404
        .mockResolvedValueOnce({ status: 400, ok: false, data: {} }) // customDomains fail
        .mockResolvedValueOnce({ status: 409, ok: true, data: {} }) // legacy 409
        .mockResolvedValueOnce({ status: 200, ok: true, data: refetched }); // re-fetch

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);

      expect(mocks.restRequest).toHaveBeenCalledTimes(4);
      const refetchArgs = mocks.restRequest.mock.calls[3]!;
      expect(refetchArgs[1]).toBe('GET');
      expect(refetchArgs[2]).toBe(`${FH_API}/${PROJECT_SCOPED_PATH}/domains/${ENCODED_DOMAIN}`);
      expect(refetchArgs[4]).toBeUndefined();
      expect(mocks.extractDnsRecords).toHaveBeenLastCalledWith(refetched);
      expect(out.rawResponse).toBe(refetched);
      expect(out.status).toBe('CERT_ACTIVE');
    });

    it('uses the original 409 body when the legacy re-fetch also fails', async () => {
      // Same defense as Tier 2's "re-fetch also fails" — the original
      // 409 body provides `provisioning.certStatus` for the result.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 400, ok: false, data: {} })
        .mockResolvedValueOnce({
          status: 409,
          ok: true,
          data: { provisioning: { certStatus: 'CERT_PENDING' } },
        })
        .mockResolvedValueOnce({ status: 500, ok: false, data: {} });

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(out.ok).toBe(true);
      expect(out.status).toBe('CERT_PENDING');
    });

    it("falls back to status='pending' when the legacy body lacks provisioning.certStatus", async () => {
      // The status fallback chain on the legacy path is
      // `domainData?.provisioning?.certStatus || 'pending'` — distinct
      // from Tier 1/2's `hostState` chain. Pin so a copy-paste refactor
      // doesn't collapse the two paths.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 400, ok: false, data: {} })
        .mockResolvedValueOnce({ status: 200, ok: true, data: {} });

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(out.status).toBe('pending');
    });

    it('returns ok:false when both Tier 2 and Tier 3 fail', async () => {
      // Final failure path: every tier exhausted. The error string is
      // built from the customDomains error first, falling back to the
      // legacy error, falling back to the stringified legacy data.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} }) // GET 404
        .mockResolvedValueOnce({
          status: 400,
          ok: false,
          data: { error: { message: 'customDomains: nope' } },
        })
        .mockResolvedValueOnce({
          status: 500,
          ok: false,
          data: { error: { message: 'legacy: nope' } },
        });

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(out).toEqual({ ok: false, error: 'customDomains: nope' });
    });

    it("uses the legacy error message when customDomains' message is missing", async () => {
      // The error-message chain prefers customDomains' message but
      // falls back to legacy's when the first is empty. Pin both arms.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 400, ok: false, data: {} }) // no error.message
        .mockResolvedValueOnce({
          status: 500,
          ok: false,
          data: { error: { message: 'legacy: nope' } },
        });

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(out).toEqual({ ok: false, error: 'legacy: nope' });
    });

    it('falls through to JSON.stringify(legacy data) when neither error message is present', async () => {
      // Last arm of the message chain. The unstructured body is
      // surfaced verbatim so the operator can still grep for it.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 400, ok: false, data: {} })
        .mockResolvedValueOnce({
          status: 500,
          ok: false,
          data: { detail: 'unstructured failure' },
        });

      const out = await registerHostingDomain(makeCtx(), SITE_ID, DOMAIN);
      expect(out.ok).toBe(false);
      expect(out.error).toBe(JSON.stringify({ detail: 'unstructured failure' }));
    });
  });

  describe('URL encoding & ctx.on_log', () => {
    it('URL-encodes domain names with reserved characters', async () => {
      // Domains with subdomains use dots (which encodeURIComponent
      // leaves alone), but unusual labels (e.g. punycode-pre-converted)
      // can contain reserved chars. Pin that we always run them through
      // encodeURIComponent so a malformed URL never reaches Firebase.
      const weirdDomain = 'a/b.example.com';
      const encoded = encodeURIComponent(weirdDomain);
      mocks.restRequest.mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: { name: 'foo' },
      });

      await registerHostingDomain(makeCtx(), SITE_ID, weirdDomain);
      const args = mocks.restRequest.mock.calls[0]!;
      expect(args[2]).toBe(`${FH_API}/${PROJECT_SCOPED_PATH}/customDomains/${encoded}`);
    });

    it('logs the create URL before issuing the POST', async () => {
      // Diagnostic pin: when domain registration goes wrong, the
      // `[firebase-hosting] POST <url>` line is the first signal in
      // the operator's log. Pin so a refactor doesn't accidentally
      // drop it.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 200, ok: true, data: { hostState: 'OK' } });

      const ctx = makeCtx();
      await registerHostingDomain(ctx, SITE_ID, DOMAIN);

      expect(ctx.on_log).toHaveBeenCalledWith(
        `[firebase-hosting] POST ${FH_API}/${PROJECT_SCOPED_PATH}/customDomains?customDomainId=${ENCODED_DOMAIN}`,
      );
    });

    it('does not throw when ctx.on_log is undefined', async () => {
      // The optional-chaining `ctx.on_log?.(...)` calls must survive a
      // ctx without on_log (older callers might omit it). Pin so we
      // don't accidentally turn the logger calls into hard requires.
      mocks.restRequest.mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: { name: 'foo' },
      });

      const ctx = makeCtx({ on_log: undefined });
      await expect(registerHostingDomain(ctx, SITE_ID, DOMAIN)).resolves.toMatchObject({
        ok: true,
      });
    });
  });
});
