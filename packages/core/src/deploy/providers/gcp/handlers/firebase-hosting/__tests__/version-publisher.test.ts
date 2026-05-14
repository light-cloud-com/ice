/**
 * Tests for `firebase-hosting/version-publisher.ts` (rf-fbh-7).
 *
 * The version publisher owns the 5-step Firebase Hosting upload protocol
 * plus the `parseRepository` URL/slug parser used by the orchestrator
 * to translate Source.Repository properties into `{ owner, repo }`.
 *
 * Behaviour pinned (see `state/blueprints/rf-fbh.md`):
 *
 * - RISK #9: SHA256 input is the GZIPPED payload — Firebase rejects
 *   uploads whose declared hash doesn't match what it computes after
 *   server-side decompression. Pinning this via a spy on
 *   `createHash().update(...)` so a refactor that swapped to hashing
 *   `f.bytes` directly fails here instead of in production.
 *
 * - RISK #10: 5-step sequence — create version → populateFiles → upload
 *   blobs → PATCH FINALIZED → POST release. The server enforces this
 *   state machine; reordering breaks the deploy with confusing 400s.
 *   Pinned by tracking the call sequence on the `restRequest` mock.
 *
 * Mock surface: `restRequest`, `gzipSync`, and `createHash` are mocked
 * at the module boundary so the protocol logic is tested in isolation
 * without hitting real Firebase or recomputing real hashes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  publishVersion,
  publishPlaceholderVersion,
  parseRepository,
} from '../version-publisher';
import type { GCPHandlerContext } from '../../../types';

// Hoisted mocks: vitest hoists `vi.hoisted` and the `vi.mock` blocks
// below ABOVE all import statements (per the rf-fbh-5 import-x/order
// learning), so the module under test sees the mocks at module-load
// time. We mock three modules: `crypto` (for `createHash`), `zlib`
// (for `gzipSync`), and `./rest-client.js` (for `restRequest` +
// `FIREBASE_HOSTING_API`).
//
// Note: vitest hoists both vi.hoisted and vi.mock calls above any
// import statement, so the SUT sees the mocks when its own static
// imports run.
const mocks = vi.hoisted(() => ({
  restRequest: vi.fn(),
  gzipSync: vi.fn(),
  createHash: vi.fn(),
  hashUpdate: vi.fn(),
  hashDigest: vi.fn(),
  FIREBASE_HOSTING_API: 'https://firebasehosting.googleapis.com/v1beta1',
}));

vi.mock('crypto', () => ({
  createHash: mocks.createHash,
}));

vi.mock('zlib', () => ({
  gzipSync: mocks.gzipSync,
}));

vi.mock('../rest-client', () => ({
  restRequest: mocks.restRequest,
  FIREBASE_HOSTING_API: mocks.FIREBASE_HOSTING_API,
}));

/**
 * Minimal `GCPHandlerContext` stub. The publisher only reads `on_log`
 * (optional) — the rest of the surface is required by the type but
 * never touched because `restRequest` is mocked at the module boundary.
 */
function makeCtx(overrides: { on_log?: (msg: string) => void } = {}): GCPHandlerContext {
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
    on_log: overrides.on_log,
  };
}

/**
 * Wire up the `createHash().update().digest()` chain so each call
 * produces a unique stable hex hash derived from the gzipped buffer.
 * The chain is rebuilt on every `createHash` call so we can spy on
 * the per-call `update(...)` argument (RISK #9).
 *
 * The returned spy lets each test assert what was passed to `update`
 * — that's the key invariant: `update` MUST receive the gzipped
 * buffer, not the raw bytes.
 */
function setupHashChain(hashByInput: (input: Buffer) => string = (b) => `sha-${b.toString('hex')}`) {
  // The shared spy across all hash creations — every test gets the
  // same instance so we can inspect every call's argument.
  mocks.hashUpdate.mockReset();
  mocks.hashDigest.mockReset();
  mocks.createHash.mockReset();

  let lastInput: Buffer;
  mocks.hashUpdate.mockImplementation((input: Buffer) => {
    lastInput = input;
    return { digest: () => mocks.hashDigest(lastInput) };
  });
  mocks.hashDigest.mockImplementation((input: Buffer) => hashByInput(input));
  mocks.createHash.mockImplementation((alg: string) => {
    expect(alg).toBe('sha256');
    return { update: mocks.hashUpdate };
  });
}

describe('firebase-hosting/version-publisher', () => {
  beforeEach(() => {
    mocks.restRequest.mockReset();
    mocks.gzipSync.mockReset();
    // Default: gzip returns a deterministic transformed buffer so the
    // input ≠ output invariant (RISK #9) is observable in tests.
    mocks.gzipSync.mockImplementation((b: Buffer) => Buffer.concat([Buffer.from('GZ:'), b]));
    setupHashChain();
  });

  // ──────────────────────────────────────────────────────────────────
  // parseRepository
  // ──────────────────────────────────────────────────────────────────
  describe('parseRepository()', () => {
    it('parses bare "owner/repo" form', () => {
      // The shortest accepted form — what the user types into the
      // GitHub Repo block when they paste a slug instead of a URL.
      expect(parseRepository('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('parses HTTPS GitHub URL with no .git suffix', () => {
      // Standard browser-bar URL.
      expect(parseRepository('https://github.com/owner/repo')).toEqual({
        owner: 'owner',
        repo: 'repo',
      });
    });

    it('parses HTTPS GitHub URL and strips the .git suffix', () => {
      // Clone URLs include `.git`. The regex's `(?:\.git)?$` group
      // strips it so `https://github.com/owner/repo.git` and
      // `https://github.com/owner/repo` both resolve identically.
      expect(parseRepository('https://github.com/owner/repo.git')).toEqual({
        owner: 'owner',
        repo: 'repo',
      });
    });

    it('parses SSH-form GitHub URL "git@github.com:owner/repo.git"', () => {
      // The `[/:]` character class in the regex makes the SSH separator
      // (`:`) interchangeable with the URL separator (`/`). Pin so a
      // refactor that swapped the class for `/` breaks here.
      expect(parseRepository('git@github.com:owner/repo.git')).toEqual({
        owner: 'owner',
        repo: 'repo',
      });
    });

    it('preserves dots and dashes in owner and repo names', () => {
      // The `[\w.-]+` character class allows dots/dashes — common in
      // org names ("my-org") and repo names ("my.app", "my-thing-v2").
      expect(parseRepository('my-org/my.app-v2')).toEqual({
        owner: 'my-org',
        repo: 'my.app-v2',
      });
      expect(parseRepository('https://github.com/my-org/my.app-v2.git')).toEqual({
        owner: 'my-org',
        repo: 'my.app-v2',
      });
    });

    it('returns null for an empty string', () => {
      expect(parseRepository('')).toBeNull();
    });

    it('returns null for whitespace-only input', () => {
      // The slug branch trims first, so '   ' becomes '' and split('/')
      // yields [''] (length 1) — no match.
      expect(parseRepository('   ')).toBeNull();
    });

    it('returns null for a single-segment input (no slash)', () => {
      // 'just-a-name' splits into a single-element array; the slug
      // branch requires exactly 2 non-empty parts.
      expect(parseRepository('just-a-name')).toBeNull();
    });

    it('returns null when the slash form has an empty owner segment', () => {
      // '/repo' splits into ['', 'repo'] — both parts must be truthy.
      expect(parseRepository('/repo')).toBeNull();
    });

    it('returns null when the slash form has an empty repo segment', () => {
      // 'owner/' splits into ['owner', ''] — both parts must be truthy.
      expect(parseRepository('owner/')).toBeNull();
    });

    it('returns null for a non-GitHub URL with no slash structure that fits the slug rule', () => {
      // The URL regex anchors on `github.com` — anything else falls
      // through to the slug branch, which requires exactly 2 segments.
      // 'https://example.com/x/y/z' splits into ≥4 parts → no match.
      expect(parseRepository('https://example.com/x/y/z')).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // publishVersion (5-step protocol)
  // ──────────────────────────────────────────────────────────────────
  describe('publishVersion()', () => {
    /**
     * Helper to wire up the standard happy-path mock sequence for the
     * 5-step protocol. Each step's mock can be overridden by the caller
     * before the test runs; this just sets up sane defaults so most
     * tests don't have to repeat them.
     */
    // The hash mock chain produces `sha-${gzip-output-as-hex}`. With
    // the default `gzipSync` mock prepending the bytes 'GZ:' (=
    // 0x47, 0x5a, 0x3a) to the raw input, two-byte raw inputs
    // [0x01, 0x01] / [0x01, 0x02] hash to:
    //
    //   gzip([0x01, 0x01]) = 0x47 0x5a 0x3a 0x01 0x01 → hex '475a3a0101'
    //   gzip([0x01, 0x02]) = 0x47 0x5a 0x3a 0x01 0x02 → hex '475a3a0102'
    //
    // Pinning these as `HASH_A` / `HASH_B` keeps the populateFiles
    // mock's `uploadRequiredHashes` array in sync with the hashes
    // the publisher will derive from the gzipped buffers — without
    // matching hashes the publisher would skip the upload step
    // (server-side-dedup branch) and the test wouldn't actually
    // exercise the full 5-step protocol.
    const HASH_A = 'sha-475a3a0101';
    const HASH_B = 'sha-475a3a0102';

    function happyPath() {
      mocks.restRequest
        // Step 1: create version → returns version name
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/my-site/versions/v1' },
        })
        // Step 2: populateFiles → returns uploadUrl + required hashes
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: {
            uploadUrl: 'https://upload.firebase/v1',
            uploadRequiredHashes: [HASH_A, HASH_B],
          },
        })
        // Step 3a: upload first blob
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        // Step 3b: upload second blob
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        // Step 4: PATCH FINALIZED
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        // Step 5: POST release
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    }

    it('returns ok:true with the default URL on a happy path', async () => {
      // The simplest end-to-end test: 2 files, both required, all 5
      // steps succeed. Pin the return shape (defaultUrl format).
      happyPath();
      const ctx = makeCtx();
      const files = [
        { hostingPath: '/index.html', bytes: Buffer.from([0x01, 0x01]) },
        { hostingPath: '/style.css', bytes: Buffer.from([0x01, 0x02]) },
      ];

      const out = await publishVersion(ctx, 'my-site', files);

      expect(out).toEqual({ ok: true, defaultUrl: 'https://my-site.web.app' });
    });

    it('issues exactly 5 (+N upload) restRequest calls in the documented order (RISK #10)', async () => {
      // The reorder pin: assert the URL + method of each call to lock
      // down the protocol sequence. Steps:
      //   1. POST {API}/sites/<site>/versions
      //   2. POST {API}/<versionName>:populateFiles
      //   3. POST {uploadUrl}/<sha256>      [per required blob]
      //   4. PATCH {API}/<versionName>?update_mask=status
      //   5. POST {API}/sites/<site>/releases?versionName=<versionName>
      happyPath();
      const ctx = makeCtx();
      const files = [
        { hostingPath: '/a.html', bytes: Buffer.from([0x01, 0x01]) },
        { hostingPath: '/b.html', bytes: Buffer.from([0x01, 0x02]) },
      ];

      await publishVersion(ctx, 'my-site', files);

      const calls = mocks.restRequest.mock.calls;
      // 6 total: create + populate + 2 uploads + finalize + release.
      expect(calls).toHaveLength(6);

      // Step 1: create version
      expect(calls[0]![1]).toBe('POST');
      expect(calls[0]![2]).toBe(`${mocks.FIREBASE_HOSTING_API}/sites/my-site/versions`);
      // Cache-Control header preserved verbatim — placeholder/CI
      // uploads must always replace live content; CDN must not cache.
      expect(calls[0]![3]).toEqual({
        config: {
          headers: [
            {
              glob: '**',
              headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
            },
          ],
        },
      });

      // Step 2: populateFiles
      expect(calls[1]![1]).toBe('POST');
      expect(calls[1]![2]).toBe(
        `${mocks.FIREBASE_HOSTING_API}/sites/my-site/versions/v1:populateFiles`,
      );
      expect(calls[1]![3]).toEqual({
        files: { '/a.html': HASH_A, '/b.html': HASH_B },
      });

      // Step 3: uploads — one per required hash, with the gzipped
      // buffer as the body and the octet-stream content type.
      expect(calls[2]![1]).toBe('POST');
      expect(calls[2]![2]).toBe(`https://upload.firebase/v1/${HASH_A}`);
      expect(calls[2]![4]).toEqual({ contentType: 'application/octet-stream' });
      expect(calls[3]![1]).toBe('POST');
      expect(calls[3]![2]).toBe(`https://upload.firebase/v1/${HASH_B}`);

      // Step 4: PATCH FINALIZED
      expect(calls[4]![1]).toBe('PATCH');
      expect(calls[4]![2]).toBe(
        `${mocks.FIREBASE_HOSTING_API}/sites/my-site/versions/v1?update_mask=status`,
      );
      expect(calls[4]![3]).toEqual({ status: 'FINALIZED' });

      // Step 5: POST release
      expect(calls[5]![1]).toBe('POST');
      expect(calls[5]![2]).toBe(
        `${mocks.FIREBASE_HOSTING_API}/sites/my-site/releases?versionName=sites/my-site/versions/v1`,
      );
      expect(calls[5]![3]).toEqual({});
    });

    it('hashes the GZIPPED bytes, not the raw bytes (RISK #9)', async () => {
      // The load-bearing pin: SHA256 input MUST be the gzipped buffer.
      // Hashing `f.bytes` directly fails uploads because Firebase
      // recomputes the hash post-decompression and rejects mismatches.
      //
      // We assert by inspecting every call to `createHash().update(...)`
      // — each invocation should have been given the OUTPUT of `gzipSync`,
      // never the file's raw bytes.
      happyPath();
      const rawA = Buffer.from('hello world raw');
      const rawB = Buffer.from('another raw file');
      const files = [
        { hostingPath: '/a.html', bytes: rawA },
        { hostingPath: '/b.html', bytes: rawB },
      ];

      await publishVersion(makeCtx(), 'my-site', files);

      // gzipSync was called once per file with the raw bytes.
      expect(mocks.gzipSync).toHaveBeenCalledTimes(2);
      expect(mocks.gzipSync.mock.calls[0]![0]).toBe(rawA);
      expect(mocks.gzipSync.mock.calls[1]![0]).toBe(rawB);

      // createHash was called once per file with the 'sha256' algorithm.
      expect(mocks.createHash).toHaveBeenCalledTimes(2);
      expect(mocks.createHash.mock.calls[0]![0]).toBe('sha256');
      expect(mocks.createHash.mock.calls[1]![0]).toBe('sha256');

      // ── The pin: each `update(...)` argument MUST equal the gzip
      //    output (which is `Buffer.concat([Buffer.from('GZ:'), raw])`)
      //    and MUST NOT equal the raw input.
      expect(mocks.hashUpdate).toHaveBeenCalledTimes(2);
      const updateA = mocks.hashUpdate.mock.calls[0]![0] as Buffer;
      const updateB = mocks.hashUpdate.mock.calls[1]![0] as Buffer;

      // Equality with the gzipped output.
      expect(updateA).toEqual(Buffer.concat([Buffer.from('GZ:'), rawA]));
      expect(updateB).toEqual(Buffer.concat([Buffer.from('GZ:'), rawB]));

      // Inequality with the raw bytes — defends against a refactor
      // that calls `createHash('sha256').update(f.bytes)` directly.
      expect(updateA.equals(rawA)).toBe(false);
      expect(updateB.equals(rawB)).toBe(false);
    });

    it('uploads the gzipped buffer (not the raw bytes) as the body to the upload URL', async () => {
      // Companion pin to RISK #9: not only does the HASH cover the
      // gzipped bytes, but the BODY uploaded MUST be the gzipped
      // payload too. Otherwise the server-side hash check fails.
      //
      // We pass raw inputs `[0x01, 0x01]` / `[0x01, 0x02]` so they
      // hash to HASH_A / HASH_B (the pre-computed values declared
      // above) — `happyPath()` returns those in `uploadRequiredHashes`
      // so the upload step actually fires (not skipped by the
      // server-side-dedup branch).
      happyPath();
      const rawA = Buffer.from([0x01, 0x01]);
      const rawB = Buffer.from([0x01, 0x02]);
      const files = [
        { hostingPath: '/a.html', bytes: rawA },
        { hostingPath: '/b.html', bytes: rawB },
      ];

      await publishVersion(makeCtx(), 'my-site', files);

      // Step 3a body — the gzipped output of file A.
      const uploadABody = mocks.restRequest.mock.calls[2]![3] as Buffer;
      expect(uploadABody).toEqual(Buffer.concat([Buffer.from('GZ:'), rawA]));
      expect(uploadABody.equals(rawA)).toBe(false);

      // Step 3b body — the gzipped output of file B.
      const uploadBBody = mocks.restRequest.mock.calls[3]![3] as Buffer;
      expect(uploadBBody).toEqual(Buffer.concat([Buffer.from('GZ:'), rawB]));
      expect(uploadBBody.equals(rawB)).toBe(false);
    });

    it('skips uploading a blob whose hash is not in uploadRequiredHashes (server-side dedup)', async () => {
      // Firebase de-dupes blobs server-side: if a hash is already on
      // disk, it's omitted from `uploadRequiredHashes` and we skip the
      // upload. Pin the dedup so a refactor that uploaded every file
      // unconditionally would fail here.
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: {
            uploadUrl: 'https://upload.firebase/v1',
            // Only the second file's hash needs upload.
            uploadRequiredHashes: [HASH_B],
          },
        })
        // Step 3: only one upload (the second file).
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} });

      const files = [
        { hostingPath: '/a.html', bytes: Buffer.from([0x01, 0x01]) },
        { hostingPath: '/b.html', bytes: Buffer.from([0x01, 0x02]) },
      ];

      await publishVersion(makeCtx(), 's', files);

      // 5 total: create + populate + 1 upload + finalize + release.
      expect(mocks.restRequest).toHaveBeenCalledTimes(5);
      // Confirm the third call is the upload of file B (not A).
      expect(mocks.restRequest.mock.calls[2]![2]).toBe(
        `https://upload.firebase/v1/${HASH_B}`,
      );
    });

    it('handles an empty uploadRequiredHashes (everything cached)', async () => {
      // The deploy-with-no-changes case: server says it has every blob.
      // The publisher should still finalize and release — without
      // calling any upload.
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'https://upload', uploadRequiredHashes: [] },
        })
        // No uploads — straight to finalize and release.
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out).toEqual({ ok: true, defaultUrl: 'https://s.web.app' });
      // 4 total: create + populate + finalize + release. No uploads.
      expect(mocks.restRequest).toHaveBeenCalledTimes(4);
    });

    it('treats missing uploadRequiredHashes (undefined) as no uploads needed', async () => {
      // Defensive: the `|| []` fallback covers the case where the
      // server omits the field entirely (older API or a regression).
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'https://upload' },
        })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out.ok).toBe(true);
      expect(mocks.restRequest).toHaveBeenCalledTimes(4);
    });

    it('logs the version name and file count after step 1 (create)', async () => {
      // The "Created version X for Y with N file(s)" log is the
      // user's first signal that the deploy is in flight. Pin it so
      // a quiet-mode refactor doesn't drop it.
      happyPath();
      const onLog = vi.fn();
      const ctx = makeCtx({ on_log: onLog });

      await publishVersion(ctx, 'my-site', [
        { hostingPath: '/a.html', bytes: Buffer.from([0x01, 0x01]) },
        { hostingPath: '/b.html', bytes: Buffer.from([0x01, 0x02]) },
      ]);

      const messages = onLog.mock.calls.map((c) => String(c[0]));
      expect(
        messages.find((m) =>
          m.includes('Created version sites/my-site/versions/v1 for my-site with 2 file(s)'),
        ),
      ).toBeDefined();
    });

    it('logs the upload progress (required + cached counts) after step 2 (populate)', async () => {
      // The "N file(s) need upload (M cached server-side)" log surfaces
      // the dedup behaviour to the user. Pin both numbers so an
      // off-by-one refactor (e.g. swapped the operands) breaks here.
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: ['sha-475a3a0101'] },
        })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} });

      const onLog = vi.fn();
      await publishVersion(makeCtx({ on_log: onLog }), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from([0x01, 0x01]) },
        { hostingPath: '/b.html', bytes: Buffer.from([0x01, 0x02]) },
        { hostingPath: '/c.html', bytes: Buffer.from([0x01, 0x03]) },
      ]);

      const messages = onLog.mock.calls.map((c) => String(c[0]));
      // 1 required, 2 cached.
      expect(
        messages.find((m) => m.includes('1 file(s) need upload (2 cached server-side)')),
      ).toBeDefined();
    });

    it('does not throw when ctx.on_log is undefined', async () => {
      // The publisher uses `ctx.on_log?.(...)` so a missing logger
      // shouldn't crash. Pin so a future refactor that drops the
      // optional chaining surfaces here.
      happyPath();
      const ctx = makeCtx();
      delete ctx.on_log;

      await expect(
        publishVersion(ctx, 'my-site', [
          { hostingPath: '/a.html', bytes: Buffer.from([0x01]) },
          { hostingPath: '/b.html', bytes: Buffer.from([0x02]) },
        ]),
      ).resolves.toEqual({ ok: true, defaultUrl: 'https://my-site.web.app' });
    });

    // ── Failure branches: each step should surface as a structured ok:false
    it('returns ok:false when step 1 (create version) fails', async () => {
      mocks.restRequest.mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: { error: { message: 'Quota exceeded' } },
      });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out).toEqual({
        ok: false,
        error: 'Failed to create version: Quota exceeded',
      });
      // No further calls — bail at step 1.
      expect(mocks.restRequest).toHaveBeenCalledTimes(1);
    });

    it('falls back to JSON.stringify when step 1 has no error.message', async () => {
      // The error-message-extraction chain on every failure branch is
      // `res.data?.error?.message || JSON.stringify(res.data)` — pin
      // the fallback so a future schema change doesn't drop it.
      mocks.restRequest.mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: { unexpected: 'shape' },
      });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out.ok).toBe(false);
      expect(out.error).toBe(
        `Failed to create version: ${JSON.stringify({ unexpected: 'shape' })}`,
      );
    });

    it('returns ok:false when step 2 (populateFiles) fails', async () => {
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          data: { error: { message: 'Invalid files map' } },
        });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out).toEqual({
        ok: false,
        error: 'Failed to populate files: Invalid files map',
      });
      expect(mocks.restRequest).toHaveBeenCalledTimes(2);
    });

    it('falls back to JSON.stringify when step 2 has no error.message', async () => {
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          data: { weird: true },
        });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out.ok).toBe(false);
      expect(out.error).toBe(`Failed to populate files: ${JSON.stringify({ weird: true })}`);
    });

    it('returns ok:false when an upload (step 3) fails — error includes the hosting path', async () => {
      // Pin the failure-message format: `Failed to upload <path>: <msg>`.
      // The path matters for diagnostics — without it the user can't
      // tell which file blew up.
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: ['sha-475a3a0101'] },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          data: { error: { message: 'Bad gateway' } },
        });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/index.html', bytes: Buffer.from([0x01, 0x01]) },
      ]);

      expect(out).toEqual({
        ok: false,
        error: 'Failed to upload /index.html: Bad gateway',
      });
      expect(mocks.restRequest).toHaveBeenCalledTimes(3);
    });

    it('falls back to JSON.stringify when an upload failure has no error.message', async () => {
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: ['sha-475a3a0101'] },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          data: { transient: true },
        });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/x.html', bytes: Buffer.from([0x01, 0x01]) },
      ]);

      expect(out.ok).toBe(false);
      expect(out.error).toBe(`Failed to upload /x.html: ${JSON.stringify({ transient: true })}`);
    });

    it('returns ok:false when step 4 (finalize) fails', async () => {
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: [] },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          data: { error: { message: 'Cannot finalize empty version' } },
        });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out).toEqual({
        ok: false,
        error: 'Failed to finalize version: Cannot finalize empty version',
      });
      // create + populate + finalize. No release.
      expect(mocks.restRequest).toHaveBeenCalledTimes(3);
    });

    it('falls back to JSON.stringify when step 4 has no error.message', async () => {
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: [] },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          data: { code: 'X' },
        });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out.ok).toBe(false);
      expect(out.error).toBe(`Failed to finalize version: ${JSON.stringify({ code: 'X' })}`);
    });

    it('returns ok:false when step 5 (release) fails', async () => {
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: [] },
        })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          data: { error: { message: 'Release service unavailable' } },
        });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out).toEqual({
        ok: false,
        error: 'Failed to release version: Release service unavailable',
      });
      // create + populate + finalize + release.
      expect(mocks.restRequest).toHaveBeenCalledTimes(4);
    });

    it('falls back to JSON.stringify when step 5 has no error.message', async () => {
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: [] },
        })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          data: { transient: 'failure' },
        });

      const out = await publishVersion(makeCtx(), 's', [
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
      ]);

      expect(out.ok).toBe(false);
      expect(out.error).toBe(
        `Failed to release version: ${JSON.stringify({ transient: 'failure' })}`,
      );
    });

    it('returns the siteId in the defaultUrl (lowercase as-passed)', async () => {
      // The defaultUrl template is `https://${siteId}.web.app`. Pin
      // so a refactor that lowercased / re-derived the URL doesn't
      // silently break the value.
      happyPath();
      const out = await publishVersion(makeCtx(), 'my-site', [
        { hostingPath: '/a.html', bytes: Buffer.from([0x01]) },
        { hostingPath: '/b.html', bytes: Buffer.from([0x02]) },
      ]);

      expect(out.defaultUrl).toBe('https://my-site.web.app');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // publishPlaceholderVersion
  // ──────────────────────────────────────────────────────────────────
  describe('publishPlaceholderVersion()', () => {
    it('delegates to publishVersion with a single /index.html FileEntry', async () => {
      // The placeholder helper is a thin wrapper: build one FileEntry
      // from the HTML string (utf8 bytes) and call publishVersion.
      // Pin both the path and the body shape so a refactor that
      // changed either silently breaks the live-URL invariant.
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/my-site/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: ['sha-475a3a3c3a646f63747970653e'] },
        })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} });

      const out = await publishPlaceholderVersion(
        makeCtx(),
        'my-site',
        '<!doctype>',
      );

      expect(out).toEqual({ ok: true, defaultUrl: 'https://my-site.web.app' });

      // Step 2's body (populateFiles) holds the files map. The
      // placeholder MUST land at exactly `/index.html` — Firebase
      // requires an index.html at the root for the URL to render.
      const populateBody = mocks.restRequest.mock.calls[1]![3];
      expect(populateBody.files).toHaveProperty('/index.html');
      // Exactly one entry — the placeholder is a single file.
      expect(Object.keys(populateBody.files)).toEqual(['/index.html']);
    });

    it('encodes the html argument as utf8 bytes', async () => {
      // The placeholder helper uses `Buffer.from(html, 'utf8')` to
      // turn the string into bytes. Pin the encoding so a refactor
      // that swapped to ascii (or default Buffer.from(string)) breaks
      // multi-byte chars (the placeholder has a U+2713 glyph and
      // a UTF-8-encoded ISO timestamp).
      mocks.restRequest
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { name: 'sites/s/versions/v1' },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          data: { uploadUrl: 'u', uploadRequiredHashes: ['needs-upload'] },
        })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} })
        .mockResolvedValueOnce({ ok: true, status: 200, data: {} });

      // Hash chain: any input → 'needs-upload' so the upload fires.
      mocks.hashUpdate.mockReset();
      mocks.hashDigest.mockReset();
      mocks.createHash.mockReset();
      const updateSpy = mocks.hashUpdate.mockImplementation(() => ({
        digest: () => 'needs-upload',
      }));
      mocks.createHash.mockImplementation(() => ({ update: updateSpy }));

      // String with a multi-byte glyph (U+2713 ✓) — utf8 encoding
      // produces 3 bytes for it; ascii would produce a question mark
      // or a single-byte encoding.
      const placeholder = '<!doctype>✓<!--ok-->';
      await publishPlaceholderVersion(makeCtx(), 's', placeholder);

      // gzipSync receives the utf8-encoded bytes of the placeholder.
      const gzipInput = mocks.gzipSync.mock.calls[0]![0] as Buffer;
      expect(Buffer.isBuffer(gzipInput)).toBe(true);
      expect(gzipInput.equals(Buffer.from(placeholder, 'utf8'))).toBe(true);
      // Sanity-check that utf8 is materially different from ascii
      // for this specific input — if they were equal we couldn't
      // make the encoding pin meaningful.
      expect(gzipInput.length).toBeGreaterThan(placeholder.length);
    });
  });
});
