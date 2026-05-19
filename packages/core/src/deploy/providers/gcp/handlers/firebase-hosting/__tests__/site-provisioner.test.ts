/**
 * Tests for `firebase-hosting/site-provisioner.ts` (rf-fbh-5).
 *
 * The site provisioner owns the two idempotency dances every Firebase
 * Hosting deploy starts with: (1) ensuring the GCP project has Firebase
 * enabled, and (2) ensuring the hosting site exists (creating or
 * adopting). Both functions wrap `restRequest` from rest-client.ts and
 * handle the load-bearing 4xx-as-success branches.
 *
 * Behaviour pinned (see `state/blueprints/rf-fbh.md`):
 *
 * - RISK #5: `ensureFirebaseProject` accepts both 409 and 400 from the
 *   `:addFirebase` endpoint, then re-classifies via a message-content
 *   probe (`'already'` / `'ALREADY_EXISTS'`). A pure status-only check
 *   would mis-classify a genuine 400 validation error as success — the
 *   probe is the only way to disambiguate.
 *
 * - RISK #6: `ensureHostingSite` adopts on a three-condition check
 *   (`getRes.ok && getRes.status !== 404 && getRes.data?.name`). The
 *   POST path's 409 branch issues a follow-up GET to populate `data`
 *   before returning — without the re-fetch the caller's
 *   `site.data?.name` lookup would silently fail.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureFirebaseProject, ensureHostingSite } from '../site-provisioner';
import type { GCPHandlerContext } from '../../../types';

// Hoisted mocks: the `vi.mock` call below captures `mocks.restRequest`,
// which would otherwise hit the real implementation (and fail without a
// real GCP project). Per the rf-canv-12 learning, identity-stable mocks
// across multiple `vi.mock` calls require `vi.hoisted`; here we only
// have one mock target but the pattern keeps the test body readable.
// Note: vitest hoists both `vi.hoisted` and `vi.mock` calls above any
// import statements, so the module under test sees the mock when its
// own `import { restRequest } from './rest-client'` runs.
const mocks = vi.hoisted(() => ({
  restRequest: vi.fn(),
  FIREBASE_HOSTING_API: 'https://firebasehosting.googleapis.com/v1beta1',
  FIREBASE_MGMT_API: 'https://firebase.googleapis.com/v1beta1',
}));

vi.mock('../rest-client', () => ({
  restRequest: mocks.restRequest,
  FIREBASE_HOSTING_API: mocks.FIREBASE_HOSTING_API,
  FIREBASE_MGMT_API: mocks.FIREBASE_MGMT_API,
}));

/**
 * Build a minimal `GCPHandlerContext` for the provisioner tests.
 * `restRequest` is mocked at the module boundary so the rest_client
 * surface here is unused — but the type still requires it.
 */
function makeCtx(): GCPHandlerContext {
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
  };
}

describe('firebase-hosting/site-provisioner', () => {
  beforeEach(() => {
    mocks.restRequest.mockReset();
  });

  describe('ensureFirebaseProject()', () => {
    it('returns ok:true on a 200 success response', async () => {
      // The happy path: addFirebase succeeded, the project just had
      // Firebase enabled. `restRequest` returns ok:true and we forward.
      mocks.restRequest.mockResolvedValueOnce({ status: 200, ok: true, data: {} });

      const ctx = makeCtx();
      const out = await ensureFirebaseProject(ctx);

      expect(out).toEqual({ ok: true });
      // Confirm the URL + method + acceptStatuses inclusion gate.
      expect(mocks.restRequest).toHaveBeenCalledOnce();
      const args = mocks.restRequest.mock.calls[0]!;
      expect(args[0]).toBe(ctx);
      expect(args[1]).toBe('POST');
      expect(args[2]).toBe(`${mocks.FIREBASE_MGMT_API}/projects/${ctx.project}:addFirebase`);
      expect(args[3]).toEqual({});
      expect(args[4]).toEqual({ acceptStatuses: [409, 400] });
    });

    it('returns ok:true on a 409 with "already" in the message (RISK #5)', async () => {
      // 409 is in `acceptStatuses` so restRequest returns ok:true; then
      // the wrapper's `if (res.ok) return { ok: true }` short-circuits
      // before the probe ever fires. This is the typical adoption path.
      mocks.restRequest.mockResolvedValueOnce({
        status: 409,
        ok: true,
        data: { error: { message: 'Project is already a Firebase project.' } },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out).toEqual({ ok: true });
    });

    it('returns ok:true on a 409 with "ALREADY_EXISTS" code (RISK #5)', async () => {
      // Same shape but the upstream returns the canonical Google API
      // error code instead of the human message. Still ok:true.
      mocks.restRequest.mockResolvedValueOnce({
        status: 409,
        ok: true,
        data: { error: { message: 'ALREADY_EXISTS', code: 409 } },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out).toEqual({ ok: true });
    });

    it('returns ok:true on a 400 with "already" in the message (RISK #5 — message-content probe)', async () => {
      // 400 is also in `acceptStatuses`, so res.ok is true here too.
      // This pins the dual-meaning behaviour: 400 with the magic words
      // means "already a Firebase project" (the docs are inconsistent
      // across regions, sometimes returning 400 instead of 409).
      mocks.restRequest.mockResolvedValueOnce({
        status: 400,
        ok: true,
        data: { error: { message: 'GCP project already has Firebase enabled.' } },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out).toEqual({ ok: true });
    });

    it('exercises the message-content probe when restRequest returns ok:false (RISK #5)', async () => {
      // Pin the probe path explicitly: when restRequest decides the
      // call wasn't ok (e.g. the upstream wrapper changed and a 400
      // is no longer in acceptStatuses), the message-content probe
      // still rescues "already enabled" responses. This is the
      // disambiguation guard the blueprint flags as load-bearing —
      // a pure status-only check would mis-classify the same body as
      // a genuine validation error.
      mocks.restRequest.mockResolvedValueOnce({
        status: 400,
        ok: false,
        data: { error: { message: 'Resource already exists in another state.' } },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out).toEqual({ ok: true });
    });

    it('reads the message off `data.message` when `data.error.message` is missing', async () => {
      // The probe's `res.data?.error?.message || res.data?.message ||
      // JSON.stringify(res.data)` chain matters when upstream produces
      // a flat `{ message: ... }` shape. Pin so a refactor doesn't
      // accidentally drop the second arm.
      mocks.restRequest.mockResolvedValueOnce({
        status: 400,
        ok: false,
        data: { message: 'Project already has Firebase enabled' },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out).toEqual({ ok: true });
    });

    it('falls back to JSON.stringify when neither error.message nor message is present', async () => {
      // Last arm of the message-extraction chain. The stringified body
      // is what gets returned in `error` for the failure path; the
      // probe operates on the same string so an unstructured body
      // containing 'already' still passes.
      mocks.restRequest.mockResolvedValueOnce({
        status: 400,
        ok: false,
        data: { detail: 'project already enabled' },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out).toEqual({ ok: true });
    });

    it('returns ok:false on a 400 without the magic words (genuine validation error)', async () => {
      // The opposite of RISK #5: a 400 whose message does NOT contain
      // 'already' or 'ALREADY_EXISTS' is a genuine validation error
      // and must propagate as a failure. This is the "pure status
      // check would mis-classify" scenario the blueprint warns about.
      mocks.restRequest.mockResolvedValueOnce({
        status: 400,
        ok: false,
        data: { error: { message: 'Invalid project ID format.' } },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out).toEqual({ ok: false, error: 'Invalid project ID format.' });
    });

    it('returns ok:false on a 5xx server error', async () => {
      mocks.restRequest.mockResolvedValueOnce({
        status: 500,
        ok: false,
        data: { error: { message: 'Internal server error' } },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out).toEqual({ ok: false, error: 'Internal server error' });
    });

    it('returns ok:false with stringified data when the message chain is empty', async () => {
      // No error.message, no top-level message — the failure error
      // string falls through to JSON.stringify(res.data). The probe
      // checks the same stringified blob; if it doesn't contain
      // 'already'/'ALREADY_EXISTS' (which a generic structured error
      // wouldn't), the call surfaces as a failure.
      mocks.restRequest.mockResolvedValueOnce({
        status: 500,
        ok: false,
        data: { unexpected: 'shape' },
      });

      const out = await ensureFirebaseProject(makeCtx());
      expect(out.ok).toBe(false);
      expect(out.error).toBe(JSON.stringify({ unexpected: 'shape' }));
    });

    it('uses the project from ctx in the URL', async () => {
      // The URL is project-scoped — pinning so a future refactor
      // that mis-templates `ctx.project` (e.g. swaps in `ctx.region`)
      // surfaces here instead of in production logs.
      mocks.restRequest.mockResolvedValueOnce({ status: 200, ok: true, data: {} });
      const ctx = makeCtx();
      ctx.project = 'my-other-project';

      await ensureFirebaseProject(ctx);
      const args = mocks.restRequest.mock.calls[0]!;
      expect(args[2]).toBe(`${mocks.FIREBASE_MGMT_API}/projects/my-other-project:addFirebase`);
    });
  });

  describe('ensureHostingSite()', () => {
    it('adopts an existing site on GET 200 with data.name (RISK #6)', async () => {
      // The three-condition check: getRes.ok (200 is < 300) AND
      // getRes.status !== 404 (200 is not 404) AND getRes.data?.name
      // (truthy). All three must be true to short-circuit to adoption.
      const data = { name: 'projects/test-project/sites/my-site', defaultUrl: 'https://my-site.web.app' };
      mocks.restRequest.mockResolvedValueOnce({ status: 200, ok: true, data });

      const ctx = makeCtx();
      const out = await ensureHostingSite(ctx, 'my-site');
      expect(out).toEqual({ ok: true, data });
      expect(mocks.restRequest).toHaveBeenCalledOnce();

      const args = mocks.restRequest.mock.calls[0]!;
      expect(args[1]).toBe('GET');
      expect(args[2]).toBe(`${mocks.FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/my-site`);
      expect(args[3]).toBeUndefined();
      expect(args[4]).toEqual({ acceptStatuses: [404] });
    });

    it('falls through to POST when GET returns 404', async () => {
      // 404 is in acceptStatuses, so getRes.ok is true — but the
      // explicit `getRes.status !== 404` guard rejects adoption.
      // The POST then succeeds with a fresh site.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: { error: { message: 'not found' } } })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          data: { name: 'projects/test-project/sites/new-site' },
        });

      const out = await ensureHostingSite(makeCtx(), 'new-site');
      expect(out.ok).toBe(true);
      expect(out.data).toEqual({ name: 'projects/test-project/sites/new-site' });

      // Two calls: GET (404), then POST (200).
      expect(mocks.restRequest).toHaveBeenCalledTimes(2);
      const postArgs = mocks.restRequest.mock.calls[1]!;
      expect(postArgs[1]).toBe('POST');
      expect(postArgs[2]).toContain('/sites?siteId=new-site');
      expect(postArgs[3]).toEqual({});
      expect(postArgs[4]).toEqual({ acceptStatuses: [409] });
    });

    it('falls through to POST when GET returns 200 without data.name (RISK #6 — 3-condition check)', async () => {
      // ok:true and status !== 404, but `data?.name` is falsy. The
      // adoption check fails on the third axis — without this guard,
      // an empty body from a stray endpoint redirect would silently
      // be returned as a "site" with no name field, breaking
      // downstream `site.data.name` reads.
      mocks.restRequest.mockResolvedValueOnce({ status: 200, ok: true, data: {} }).mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: { name: 'projects/test-project/sites/edge-site' },
      });

      const out = await ensureHostingSite(makeCtx(), 'edge-site');
      expect(out.ok).toBe(true);
      expect(out.data).toEqual({ name: 'projects/test-project/sites/edge-site' });
      expect(mocks.restRequest).toHaveBeenCalledTimes(2);
    });

    it('returns the POST data on a successful 200 create', async () => {
      mocks.restRequest.mockResolvedValueOnce({ status: 404, ok: true, data: {} }).mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: { name: 'projects/test-project/sites/fresh', _created: true },
      });

      const out = await ensureHostingSite(makeCtx(), 'fresh');
      expect(out).toEqual({
        ok: true,
        data: { name: 'projects/test-project/sites/fresh', _created: true },
      });
    });

    it('re-fetches via GET when POST returns 409 (RISK #6 — race re-fetch)', async () => {
      // The POST path's 409 means another caller created the site
      // between our GET and POST. The wrapper issues a follow-up GET
      // to populate `data` so the caller's `site.data?.name` lookup
      // doesn't silently fail. Without the re-fetch, returning the
      // 409 body directly would not have a usable `name`.
      const refetchData = { name: 'projects/test-project/sites/raced' };
      mocks.restRequest
        // GET — site not there yet (or empty body, etc.)
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        // POST — 409, race condition
        .mockResolvedValueOnce({ status: 409, ok: true, data: { error: { message: 'ALREADY_EXISTS' } } })
        // Re-fetch GET — populates the data we want.
        .mockResolvedValueOnce({ status: 200, ok: true, data: refetchData });

      const ctx = makeCtx();
      const out = await ensureHostingSite(ctx, 'raced');
      expect(out).toEqual({ ok: true, data: refetchData });
      expect(mocks.restRequest).toHaveBeenCalledTimes(3);

      // The third call is the re-fetch GET — same URL as the initial
      // GET but WITHOUT the acceptStatuses option (any non-2xx is
      // a real failure here).
      const refetchArgs = mocks.restRequest.mock.calls[2]!;
      expect(refetchArgs[1]).toBe('GET');
      expect(refetchArgs[2]).toBe(`${mocks.FIREBASE_HOSTING_API}/projects/${ctx.project}/sites/raced`);
      expect(refetchArgs[3]).toBeUndefined();
      expect(refetchArgs[4]).toBeUndefined();
    });

    it('returns ok:false with a fixed error string when the POST 409 re-fetch fails', async () => {
      // The "site exists but could not be fetched" branch — pinning
      // the literal string so a future log-format refactor doesn't
      // silently change the user-visible error message.
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 409, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 503, ok: false, data: { error: { message: 'Service unavailable' } } });

      const out = await ensureHostingSite(makeCtx(), 'flaky');
      expect(out).toEqual({ ok: false, error: 'Site exists but could not be fetched.' });
    });

    it('returns ok:false with the error message when POST fails with a non-409 error', async () => {
      // POST with a real failure (e.g. 403, 500). The wrapper extracts
      // `res.data?.error?.message`.
      mocks.restRequest.mockResolvedValueOnce({ status: 404, ok: true, data: {} }).mockResolvedValueOnce({
        status: 403,
        ok: false,
        data: { error: { message: 'Permission denied on hosting.sites.create' } },
      });

      const out = await ensureHostingSite(makeCtx(), 'denied');
      expect(out).toEqual({ ok: false, error: 'Permission denied on hosting.sites.create' });
    });

    it('falls back to JSON.stringify when POST failure has no error.message', async () => {
      // The error-message-extraction chain on the failure path is
      // `res.data?.error?.message || JSON.stringify(res.data)` — pin
      // the fallback so a future schema change doesn't drop it.
      mocks.restRequest.mockResolvedValueOnce({ status: 404, ok: true, data: {} }).mockResolvedValueOnce({
        status: 500,
        ok: false,
        data: { unexpected: 'blob' },
      });

      const out = await ensureHostingSite(makeCtx(), 'oops');
      expect(out.ok).toBe(false);
      expect(out.error).toBe(JSON.stringify({ unexpected: 'blob' }));
    });

    it('uses ctx.project + siteId in the GET URL', async () => {
      // Pin URL templating: project from ctx, siteId from arg.
      mocks.restRequest.mockResolvedValueOnce({
        status: 200,
        ok: true,
        data: { name: 'projects/proj-xyz/sites/site-abc' },
      });

      const ctx = makeCtx();
      ctx.project = 'proj-xyz';
      await ensureHostingSite(ctx, 'site-abc');

      const getArgs = mocks.restRequest.mock.calls[0]!;
      expect(getArgs[2]).toBe(`${mocks.FIREBASE_HOSTING_API}/projects/proj-xyz/sites/site-abc`);
    });

    it('uses ctx.project + siteId in the POST URL query string', async () => {
      mocks.restRequest
        .mockResolvedValueOnce({ status: 404, ok: true, data: {} })
        .mockResolvedValueOnce({ status: 200, ok: true, data: { name: 'x' } });

      const ctx = makeCtx();
      ctx.project = 'my-proj';
      await ensureHostingSite(ctx, 'my-site');

      const postArgs = mocks.restRequest.mock.calls[1]!;
      expect(postArgs[2]).toBe(`${mocks.FIREBASE_HOSTING_API}/projects/my-proj/sites?siteId=my-site`);
    });
  });
});
