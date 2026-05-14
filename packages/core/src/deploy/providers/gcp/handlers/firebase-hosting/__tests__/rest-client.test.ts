/**
 * Tests for `firebase-hosting/rest-client.ts` (rf-fbh-4).
 *
 * The rest-client wraps `ctx.rest_client.requestRaw` (attached by
 * `sdk-loader.ts`'s `make_request_raw`) and normalizes its `{ status,
 * data, headers }` reply into the small `RestResponse` shape every
 * Firebase Hosting submodule consumes.
 *
 * The behaviour tests pin the load-bearing details from blueprint
 * RISK #4:
 *
 * - `validateStatus: () => true` is ALWAYS passed to `requestRaw`, so
 *   non-2xx responses do not throw — `res.ok` is the only error gate
 *   the wrapper produces. The fine-grained gate is `acceptStatuses`,
 *   which expands the success set beyond `< 300`.
 * - The wrapper does NOT attach auth headers itself; `requestRaw`
 *   (the auth_client wrapper from sdk-loader) does that. The only
 *   thing this layer is responsible for is forwarding the body /
 *   contentType / responseType and translating the response.
 * - A missing `requestRaw` (the rest_client doesn't have the extended
 *   interface attached) throws synchronously inside the await. Pinning
 *   this prevents a future "silently succeeds" regression if someone
 *   mistakenly uses the bare `GCPRestClient.get/post/...` interface.
 * - A thrown promise from `requestRaw` (a real network error, not a
 *   non-2xx status) is normalized into `{ ok: false, status: 0,
 *   data: { error: { message } } }`.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  FIREBASE_HOSTING_API,
  FIREBASE_MGMT_API,
  restRequest,
  type RestResponse,
} from '../rest-client';
import type { GCPHandlerContext } from '../../../types';

/**
 * Build a minimal `GCPHandlerContext` whose `rest_client.requestRaw`
 * is the supplied mock. `requestRaw` is attached as a side-channel
 * property by `sdk-loader.ts` and is not part of the `GCPRestClient`
 * interface, so we cast through `any` exactly the way production code
 * does at the call site.
 */
function makeCtx(
  requestRaw:
    | ((opts: {
        method: string;
        url: string;
        body?: unknown;
        contentType?: string;
        responseType?: 'json' | 'text' | 'arraybuffer';
        validateStatus?: (status: number) => boolean;
      }) => Promise<{ status: number; data: any; headers: Record<string, string> }>)
    | undefined,
): GCPHandlerContext {
  const restClient: any = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  if (requestRaw) restClient.requestRaw = requestRaw;
  return {
    project: 'test-project',
    region: 'us-central1',
    clients: new Map(),
    rest_client: restClient,
  };
}

describe('firebase-hosting/rest-client', () => {
  describe('FIREBASE_HOSTING_API', () => {
    it('equals the v1beta1 base URL for the Firebase Hosting REST API', () => {
      // The constant is concatenated against `/projects/${project}/sites/...`
      // and `/sites/${path}/versions/...` style paths throughout the
      // handler — its exact value is part of the contract with Firebase.
      expect(FIREBASE_HOSTING_API).toBe('https://firebasehosting.googleapis.com/v1beta1');
    });
  });

  describe('FIREBASE_MGMT_API', () => {
    it('equals the v1beta1 base URL for the Firebase project-management API', () => {
      // Used only by `ensureFirebaseProject` (`/projects/${project}:addFirebase`).
      // Pinned because the management endpoint lives on a different
      // hostname (`firebase` vs `firebasehosting`) and a single-letter
      // typo would silently disable Firebase project provisioning.
      expect(FIREBASE_MGMT_API).toBe('https://firebase.googleapis.com/v1beta1');
    });
  });

  describe('restRequest()', () => {
    it('forwards a GET request to requestRaw with no body and json responseType', async () => {
      const requestRaw = vi.fn().mockResolvedValue({ status: 200, data: { ok: 1 }, headers: {} });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/api');

      expect(requestRaw).toHaveBeenCalledOnce();
      const opts = requestRaw.mock.calls[0]![0] as any;
      expect(opts.method).toBe('GET');
      expect(opts.url).toBe('https://example/api');
      expect(opts.body).toBeUndefined();
      expect(opts.responseType).toBe('json');
      expect(out).toEqual({ ok: true, status: 200, data: { ok: 1 } });
    });

    it('forwards a POST request with the body verbatim', async () => {
      const requestRaw = vi.fn().mockResolvedValue({ status: 201, data: { id: 'abc' }, headers: {} });
      const ctx = makeCtx(requestRaw);
      const body = { siteId: 'my-site', config: { trailingSlashBehavior: 'ADD' } };

      const out = await restRequest(ctx, 'POST', 'https://example/api', body);

      const opts = requestRaw.mock.calls[0]![0] as any;
      expect(opts.method).toBe('POST');
      expect(opts.body).toBe(body);
      expect(out).toEqual({ ok: true, status: 201, data: { id: 'abc' } });
    });

    it('forwards a PATCH request with the body verbatim', async () => {
      const requestRaw = vi.fn().mockResolvedValue({ status: 200, data: { name: 'v1' }, headers: {} });
      const ctx = makeCtx(requestRaw);
      const body = { status: 'FINALIZED' };

      const out = await restRequest(ctx, 'PATCH', 'https://example/versions/1', body);

      const opts = requestRaw.mock.calls[0]![0] as any;
      expect(opts.method).toBe('PATCH');
      expect(opts.body).toBe(body);
      expect(out).toEqual({ ok: true, status: 200, data: { name: 'v1' } });
    });

    it('forwards a DELETE request with no body', async () => {
      const requestRaw = vi.fn().mockResolvedValue({ status: 204, data: null, headers: {} });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'DELETE', 'https://example/api/1');

      const opts = requestRaw.mock.calls[0]![0] as any;
      expect(opts.method).toBe('DELETE');
      expect(opts.body).toBeUndefined();
      expect(out).toEqual({ ok: true, status: 204, data: null });
    });

    it('always passes a `validateStatus: () => true` to requestRaw (RISK #4)', async () => {
      // The load-bearing axios option. If we ever swap to a partial
      // validator, non-2xx statuses would throw inside requestRaw and
      // bypass the `acceptStatuses` inclusion gate downstream — the
      // entire 409-as-adoption pattern would silently break.
      const requestRaw = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} });
      const ctx = makeCtx(requestRaw);
      await restRequest(ctx, 'GET', 'https://example/api');

      const opts = requestRaw.mock.calls[0]![0] as any;
      expect(typeof opts.validateStatus).toBe('function');
      // Probe a sample of statuses: 100, 199, 200, 299, 300, 400, 404, 409, 500.
      for (const s of [100, 199, 200, 299, 300, 400, 404, 409, 500]) {
        expect(opts.validateStatus(s)).toBe(true);
      }
    });

    it('forwards `contentType` (used by binary uploads) into requestRaw', async () => {
      const requestRaw = vi.fn().mockResolvedValue({ status: 200, data: {}, headers: {} });
      const ctx = makeCtx(requestRaw);
      await restRequest(
        ctx,
        'POST',
        'https://upload',
        Buffer.from([0x1f, 0x8b]),
        { contentType: 'application/octet-stream' },
      );

      const opts = requestRaw.mock.calls[0]![0] as any;
      expect(opts.contentType).toBe('application/octet-stream');
    });

    it('returns ok:false for a 4xx status when no acceptStatuses provided', async () => {
      // `acceptStatuses` defaults to undefined, so the inclusion gate
      // is just `< 300`. A 404 is a real error.
      const requestRaw = vi.fn().mockResolvedValue({
        status: 404,
        data: { error: { message: 'not found' } },
        headers: {},
      });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/missing');
      expect(out.ok).toBe(false);
      expect(out.status).toBe(404);
      expect(out.data).toEqual({ error: { message: 'not found' } });
    });

    it('returns ok:true for a 4xx status that is in `acceptStatuses` (RISK #4 — inclusion gate)', async () => {
      // The 409-as-adoption pattern: `ensureFirebaseProject` and
      // `ensureHostingSite` pass `acceptStatuses: [409, 400]` to opt
      // those statuses into the success set without losing the raw
      // status code (the caller still inspects res.data for the
      // ALREADY_EXISTS message-content probe).
      const requestRaw = vi.fn().mockResolvedValue({
        status: 409,
        data: { error: { message: 'ALREADY_EXISTS' } },
        headers: {},
      });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'POST', 'https://example/sites', {}, { acceptStatuses: [409, 400] });
      expect(out.ok).toBe(true);
      expect(out.status).toBe(409);
      expect(out.data).toEqual({ error: { message: 'ALREADY_EXISTS' } });
    });

    it('returns ok:false for a 4xx status not in `acceptStatuses` (RISK #4 — inclusion gate, miss)', async () => {
      // 403 is not in the accepted set even though [409, 400] is
      // provided. Confirms the gate is exact-membership, not "any 4xx".
      const requestRaw = vi.fn().mockResolvedValue({
        status: 403,
        data: { error: { message: 'forbidden' } },
        headers: {},
      });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'POST', 'https://example/sites', {}, { acceptStatuses: [409, 400] });
      expect(out.ok).toBe(false);
      expect(out.status).toBe(403);
    });

    it('returns ok:false for a 5xx status (typically not in acceptStatuses)', async () => {
      const requestRaw = vi.fn().mockResolvedValue({
        status: 500,
        data: { error: { message: 'internal' } },
        headers: {},
      });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/api');
      expect(out.ok).toBe(false);
      expect(out.status).toBe(500);
    });

    it('treats status === 300 as not-ok (boundary check on `< 300`)', async () => {
      const requestRaw = vi.fn().mockResolvedValue({ status: 300, data: { redirect: true }, headers: {} });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/api');
      expect(out.ok).toBe(false);
      expect(out.status).toBe(300);
    });

    it('treats status === 299 as ok (boundary check on `< 300`)', async () => {
      const requestRaw = vi.fn().mockResolvedValue({ status: 299, data: {}, headers: {} });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/api');
      expect(out.ok).toBe(true);
      expect(out.status).toBe(299);
    });

    it('normalizes a thrown network error into { ok:false, status:0, data:{error:{message}} }', async () => {
      // `requestRaw` throws on real network failures (DNS, TCP reset).
      // The wrapper catches and produces a structured response so
      // callers don't have to wrap each call in try/catch.
      const requestRaw = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/api');
      expect(out.ok).toBe(false);
      expect(out.status).toBe(0);
      expect(out.data).toEqual({ error: { message: 'ECONNREFUSED' } });
    });

    it('preserves a thrown error with `err.response` (axios-style) in the normalized result', async () => {
      // axios attaches the full response to `err.response` when it
      // throws. The wrapper threads that through so the caller sees
      // both the real status code and the real error body — useful
      // when validateStatus did NOT swallow the throw (e.g. an
      // explicit handler that override the wrapper's `() => true`
      // semantics, or a future change in the auth_client).
      const err: any = new Error('Request failed with status code 502');
      err.response = { status: 502, data: { error: { message: 'bad gateway' } } };
      const requestRaw = vi.fn().mockRejectedValue(err);
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/api');
      expect(out.ok).toBe(false);
      expect(out.status).toBe(502);
      expect(out.data).toEqual({ error: { message: 'bad gateway' } });
    });

    it('falls back to String(err) when err.message is missing', async () => {
      // Some throws (e.g. `throw 'oops'`) don't carry .message — the
      // wrapper's `err?.message || String(err)` fallback ensures the
      // returned data.error.message is always a string.
      const requestRaw = vi.fn().mockRejectedValue('plain-string-throw');
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/api');
      expect(out.ok).toBe(false);
      expect(out.status).toBe(0);
      expect(out.data).toEqual({ error: { message: 'plain-string-throw' } });
    });

    it('throws synchronously when ctx.rest_client.requestRaw is missing', async () => {
      // The bare `GCPRestClient` interface (get/post/patch/delete only)
      // doesn't include `requestRaw` — that's attached by sdk-loader's
      // `make_request_raw`. Handlers that depend on rest-client must
      // fail loud rather than silently fall back to a different code
      // path.
      const ctx = makeCtx(undefined);
      await expect(restRequest(ctx, 'GET', 'https://example/api')).rejects.toThrow(
        /requires the extended rest_client/,
      );
    });

    it('handles an empty acceptStatuses array as no-extra-allowed (still gates on < 300)', async () => {
      // Empty array means literally no accepted statuses beyond the
      // base `< 300` check — pinning so a future "empty array means
      // all" misread doesn't slip through.
      const requestRaw = vi.fn().mockResolvedValue({ status: 409, data: {}, headers: {} });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'POST', 'https://example/api', {}, { acceptStatuses: [] });
      expect(out.ok).toBe(false);
      expect(out.status).toBe(409);
    });

    it('returns the raw `data` payload unchanged (no JSON re-parse / object copy)', async () => {
      // Callers like `extractDnsRecords` walk deep nested fields off
      // `res.data`. The wrapper must not stringify-and-reparse or
      // shallow-clone the payload — same reference identity is fine
      // and avoids hidden cost on large bodies.
      const data = { deep: { array: [{ x: 1 }, { x: 2 }] } };
      const requestRaw = vi.fn().mockResolvedValue({ status: 200, data, headers: {} });
      const ctx = makeCtx(requestRaw);

      const out = await restRequest(ctx, 'GET', 'https://example/api');
      expect(out.data).toBe(data);
    });
  });

  describe('RestResponse interface', () => {
    it('has the documented {ok, status, data} shape (compile-time pin)', () => {
      // Compile-only: assert the exported type is constructible with
      // exactly the three fields. If a fourth field is added the
      // submodules that destructure RestResponse must be revisited.
      const r: RestResponse = { ok: true, status: 200, data: { name: 'x' } };
      expect(r.ok).toBe(true);
      expect(r.status).toBe(200);
      expect(r.data).toEqual({ name: 'x' });
    });
  });
});
