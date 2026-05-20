/**
 * Tests for `firebase-hosting/github-downloader.ts` (rf-fbh-6).
 *
 * Behaviour pinned (see `state/blueprints/rf-fbh.md`):
 *
 * - RISK #7: silent fallback when `outputDirectory` matches no files in
 *   the tarball. Falls back to repo root with a warning instead of
 *   returning an empty list. Non-throwing by design — the orchestrator
 *   already wraps this call in try/catch and switches to a placeholder
 *   version on failure, but on a "no-files-under-dist" repo we want a
 *   real upload, not a placeholder.
 *
 * - RISK #8: dual-path codeload fetch. `globalThis.fetch` is the
 *   primary path because codeload.github.com REJECTS GCP auth headers
 *   with 401; the auth client's defaults would always leak in via
 *   `requestRaw`, so we go around it with the global fetch (which
 *   carries no auth). The `requestRaw` fallback exists for runtimes
 *   without a global fetch, and we explicitly test BOTH branches plus
 *   the auth-bypass invariant (fetch is called with no headers).
 *
 * Fixture strategy: we mock `parseTar` and `gunzipSync` to return
 * predictable entries instead of constructing real ustar archives. The
 * tar-parser already has its own dedicated test suite; this file pins
 * the downloader's transport + filtering logic, not the parser.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadGitHubRepo } from '../github-downloader';
import type { GCPHandlerContext } from '../../../types';

// Hoisted mocks: vitest hoists both `vi.hoisted` and the `vi.mock` calls
// below above ALL import statements (per the rf-fbh-5 learning on
// import-x/order), so the module under test sees the mocks when its own
// static `import` of zlib + tar-parser runs at module load.
const mocks = vi.hoisted(() => ({
  gunzipSync: vi.fn(),
  parseTar: vi.fn(),
}));

vi.mock('zlib', () => ({
  gunzipSync: mocks.gunzipSync,
}));

vi.mock('../tar-parser', () => ({
  parseTar: mocks.parseTar,
}));

/**
 * Build a minimal `GCPHandlerContext`. The downloader reads `on_log`
 * (optional) and `rest_client.requestRaw` (private — accessed via
 * `(ctx.rest_client as any).requestRaw`). The other fields are required
 * by the type but unread.
 */
function makeCtx(
  overrides: {
    on_log?: (msg: string) => void;
    requestRaw?: (opts: any) => Promise<any>;
  } = {},
): GCPHandlerContext {
  const restClient: any = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  if (overrides.requestRaw) {
    restClient.requestRaw = overrides.requestRaw;
  }
  return {
    project: 'test-project',
    region: 'us-central1',
    clients: new Map(),
    rest_client: restClient,
    on_log: overrides.on_log,
  };
}

/** Build a `Response`-shaped object that satisfies `globalThis.fetch`. */
function makeFetchResponse(opts: { ok: boolean; status?: number; statusText?: string; body?: ArrayBuffer }): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    statusText: opts.statusText ?? '',
    arrayBuffer: async () => opts.body ?? new ArrayBuffer(0),
  } as unknown as Response;
}

describe('firebase-hosting/github-downloader', () => {
  beforeEach(() => {
    mocks.gunzipSync.mockReset();
    mocks.parseTar.mockReset();
    // Sane defaults: gunzip returns the input unchanged; parseTar returns
    // an empty array. Each test overrides as needed.
    mocks.gunzipSync.mockImplementation((b: Buffer) => b);
    mocks.parseTar.mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('successful download via globalThis.fetch (RISK #8 — primary path)', () => {
    it('returns FileEntry[] when fetch succeeds and parseTar yields files', async () => {
      // Arrange: stub the global fetch to return a 200 with a fake
      // gzipped body, and mock parseTar to return two files under the
      // standard `<repo>-<branch>/` prefix that codeload tarballs use.
      const fetchSpy = vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(8) }));
      vi.stubGlobal('fetch', fetchSpy);
      mocks.parseTar.mockReturnValue([
        { name: 'my-repo-main/index.html', data: Buffer.from('<!doctype html>') },
        { name: 'my-repo-main/style.css', data: Buffer.from('body{}') },
      ]);

      // Act
      const ctx = makeCtx();
      const out = await downloadGitHubRepo(ctx, 'me', 'my-repo', 'main', '');

      // Assert: two files, with `/` prefix added and the
      // `<repo>-<branch>/` slash-prefix stripped.
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual({
        hostingPath: '/index.html',
        bytes: Buffer.from('<!doctype html>'),
      });
      expect(out[1]).toEqual({
        hostingPath: '/style.css',
        bytes: Buffer.from('body{}'),
      });

      // Fetch was the path taken — requestRaw was not even attached.
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('builds the codeload URL from owner/repo/branch', async () => {
      // Pin the URL template — a future refactor that swaps the order
      // of segments would silently 404 for every public repo.
      const fetchSpy = vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) }));
      vi.stubGlobal('fetch', fetchSpy);

      await downloadGitHubRepo(makeCtx(), 'octocat', 'hello-world', 'develop', '');

      const args = fetchSpy.mock.calls[0]!;
      expect(args[0]).toBe('https://codeload.github.com/octocat/hello-world/tar.gz/refs/heads/develop');
    });

    it('passes redirect:"follow" so codeload\'s 302 to the CDN works', async () => {
      // The codeload endpoint 302s to a CDN host; without
      // `redirect: 'follow'` the fetch would return the redirect
      // response itself instead of the bytes.
      const fetchSpy = vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) }));
      vi.stubGlobal('fetch', fetchSpy);

      await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', '');

      const init = fetchSpy.mock.calls[0]![1] as RequestInit | undefined;
      expect(init?.redirect).toBe('follow');
    });

    it('throws when fetch returns a non-ok response', async () => {
      // 404 / 5xx / etc. Surfaces as a thrown Error so the orchestrator's
      // try/catch can fall back to a placeholder version.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: false, status: 404, statusText: 'Not Found' })),
      );

      await expect(downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', '')).rejects.toThrow(
        'GitHub tarball download failed: 404 Not Found',
      );
    });
  });

  describe('auth-header bypass (RISK #8)', () => {
    it('calls fetch WITHOUT any auth headers — codeload rejects them with 401', async () => {
      // The whole reason the global-fetch branch exists. The fetch init
      // object must NOT include an `Authorization` (or any other) header
      // — codeload is a public CDN that 401s on bearer tokens.
      const fetchSpy = vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) }));
      vi.stubGlobal('fetch', fetchSpy);

      await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', '');

      const init = fetchSpy.mock.calls[0]![1] as RequestInit | undefined;
      // The init object should ONLY carry redirect: 'follow'. No
      // headers at all — not even an empty Headers map. If a refactor
      // adds default headers via the auth client, this test fails and
      // the regression is caught before any deploy.
      expect(init).toEqual({ redirect: 'follow' });
      expect((init as any)?.headers).toBeUndefined();
    });
  });

  describe('requestRaw fallback when global fetch is missing', () => {
    it('uses ctx.rest_client.requestRaw when globalThis.fetch is undefined', async () => {
      // Pin the fallback path: a runtime without a global fetch (older
      // Node, embedded VM) drops to the auth-client transport. Auth
      // headers leak in here but codeload usually ignores them.
      const requestRawSpy = vi.fn(async () => ({
        status: 200,
        data: new ArrayBuffer(8),
      }));
      vi.stubGlobal('fetch', undefined);

      mocks.parseTar.mockReturnValue([{ name: 'r-main/a.txt', data: Buffer.from('a') }]);

      const ctx = makeCtx({ requestRaw: requestRawSpy });
      const out = await downloadGitHubRepo(ctx, 'me', 'r', 'main', '');

      expect(out).toEqual([{ hostingPath: '/a.txt', bytes: Buffer.from('a') }]);
      expect(requestRawSpy).toHaveBeenCalledOnce();

      // Pin the requestRaw call shape — method GET, arraybuffer, and
      // the `< 400` validator (so 3xx don't throw, mirroring the fetch
      // branch's ok-check).
      const opts = requestRawSpy.mock.calls[0]![0];
      expect(opts.method).toBe('GET');
      expect(opts.url).toBe('https://codeload.github.com/me/r/tar.gz/refs/heads/main');
      expect(opts.responseType).toBe('arraybuffer');
      expect(typeof opts.validateStatus).toBe('function');
      expect(opts.validateStatus(200)).toBe(true);
      expect(opts.validateStatus(302)).toBe(true);
      expect(opts.validateStatus(400)).toBe(false);
      expect(opts.validateStatus(500)).toBe(false);
    });
  });

  describe('outputDirectory filtering', () => {
    it('returns the filtered subset with the prefix stripped (matches files)', async () => {
      // The most common case: a build step puts all output in `dist/`.
      // The downloader must (a) keep only `dist/*` files and (b) strip
      // the `dist/` prefix so files land at hosting root.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        { name: 'r-main/dist/index.html', data: Buffer.from('<html>') },
        { name: 'r-main/dist/app.js', data: Buffer.from('console.log(1)') },
        { name: 'r-main/dist/sub/page.html', data: Buffer.from('<sub>') },
        { name: 'r-main/src/index.ts', data: Buffer.from('source') },
        { name: 'r-main/package.json', data: Buffer.from('{}') },
      ]);

      const out = await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', 'dist');

      expect(out).toEqual([
        { hostingPath: '/index.html', bytes: Buffer.from('<html>') },
        { hostingPath: '/app.js', bytes: Buffer.from('console.log(1)') },
        { hostingPath: '/sub/page.html', bytes: Buffer.from('<sub>') },
      ]);
    });

    it('strips leading/trailing slashes on outputDirectory before matching', async () => {
      // Users frequently pass `'/dist'` or `'dist/'`. The downloader
      // normalizes via `replace(/^\/+|\/+$/g, '')` so all three forms
      // resolve to the same filter prefix.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([{ name: 'r-main/dist/index.html', data: Buffer.from('<html>') }]);

      const out = await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', '/dist/');
      expect(out).toEqual([{ hostingPath: '/index.html', bytes: Buffer.from('<html>') }]);
    });

    it('returns all files at hosting root when outputDirectory is empty', async () => {
      // Empty outputDirectory means "deploy the whole repo". Files keep
      // their tarball-relative path (with the `<repo>-<branch>/` prefix
      // stripped).
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        { name: 'r-main/index.html', data: Buffer.from('<html>') },
        { name: 'r-main/sub/page.html', data: Buffer.from('<sub>') },
      ]);

      const out = await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', '');

      expect(out).toEqual([
        { hostingPath: '/index.html', bytes: Buffer.from('<html>') },
        { hostingPath: '/sub/page.html', bytes: Buffer.from('<sub>') },
      ]);
    });
  });

  describe('outputDirectory matches NO files (RISK #7 — silent fallback)', () => {
    it('falls back to the repo root and warns when outputDirectory matches nothing', async () => {
      // The classic mis-config: user wired `outputDirectory: 'dist'`
      // but the repo doesn't have a build step — HTML ships at the
      // root. Without the fallback we'd upload zero files and get a
      // blank site; with the fallback we deploy something useful.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        // Nothing under `dist/` — only root-level files.
        { name: 'r-main/index.html', data: Buffer.from('<html>') },
        { name: 'r-main/about.html', data: Buffer.from('<about>') },
      ]);

      const onLog = vi.fn();
      const ctx = makeCtx({ on_log: onLog });

      // Act
      const out = await downloadGitHubRepo(ctx, 'me', 'r', 'main', 'dist');

      // Assert: fell back to root, did NOT throw.
      expect(out).toEqual([
        { hostingPath: '/index.html', bytes: Buffer.from('<html>') },
        { hostingPath: '/about.html', bytes: Buffer.from('<about>') },
      ]);

      // The warning log MUST mention the configured directory and the
      // file count — that's the diagnostic surface the user will see
      // in the deploy log when they wonder why their `dist/` build
      // didn't deploy.
      const fallbackWarning = onLog.mock.calls.find((c) =>
        String(c[0]).includes("outputDirectory='dist' matched no files"),
      );
      expect(fallbackWarning).toBeDefined();
      expect(String(fallbackWarning![0])).toContain('Falling back to repo root');
      expect(String(fallbackWarning![0])).toContain('uploading 2 file(s)');
    });

    it('does NOT log "(under <dir>/)" in the final summary when fallback was used', async () => {
      // The summary log appends `(under outputDirectory/)` only when
      // the configured directory was actually used. If we fell back,
      // the summary should read like the no-outputDirectory case.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([{ name: 'r-main/index.html', data: Buffer.from('<html>') }]);

      const onLog = vi.fn();
      await downloadGitHubRepo(makeCtx({ on_log: onLog }), 'me', 'r', 'main', 'dist');

      const summary = onLog.mock.calls
        .map((c) => String(c[0]))
        .find((m) => m.includes('Extracted ') && m.includes(' file(s) from repo'));
      expect(summary).toBeDefined();
      expect(summary).not.toContain('(under dist/)');
    });

    it('returns empty array when both outputDirectory and root yield zero files', async () => {
      // If `dist/` matches nothing AND the root is also empty (only
      // ignored files like .git/, README), we return empty without
      // throwing. The caller (orchestrator) detects empty-result and
      // switches to a placeholder version.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        { name: 'r-main/.git/HEAD', data: Buffer.from('ref') },
        { name: 'r-main/.gitignore', data: Buffer.from('node_modules') },
        { name: 'r-main/.gitattributes', data: Buffer.from('* text') },
        { name: 'r-main/README.md', data: Buffer.from('hi') },
        { name: 'r-main/LICENSE', data: Buffer.from('MIT') },
      ]);

      const out = await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', 'dist');

      // No fallback log fired (because the fallback also produced
      // zero files), but no throw either.
      expect(out).toEqual([]);
    });

    it('does NOT fall back when outputDirectory is empty (zero-files-at-root is genuine)', async () => {
      // Without an outputDirectory there's nothing to fall back to —
      // the `if (out.length === 0 && outputDirectory)` guard short-
      // circuits. An empty repo legitimately produces an empty list
      // and the caller switches to a placeholder.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        { name: 'r-main/.gitignore', data: Buffer.from('node_modules') },
        { name: 'r-main/README.md', data: Buffer.from('hi') },
      ]);

      const onLog = vi.fn();
      const out = await downloadGitHubRepo(makeCtx({ on_log: onLog }), 'me', 'r', 'main', '');

      expect(out).toEqual([]);
      // No fallback warning was emitted.
      const fallbackWarning = onLog.mock.calls.find((c) => String(c[0]).includes('matched no files'));
      expect(fallbackWarning).toBeUndefined();
    });
  });

  describe('ignored paths', () => {
    it('skips .git/ entries, .gitignore, .gitattributes, README.md, and LICENSE', async () => {
      // The `collect` filter is the same shape the GitHub web UI uses
      // for "what files belong to a repo deploy". We always strip:
      //   - everything under .git/ (binary refs / packs)
      //   - .gitignore + .gitattributes (config the user didn't intend
      //     to publish at the root)
      //   - README.md + LICENSE (informational, not a site asset)
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        { name: 'r-main/.git/HEAD', data: Buffer.from('ref') },
        { name: 'r-main/.git/objects/pack/pack-1.idx', data: Buffer.from('p') },
        { name: 'r-main/.gitignore', data: Buffer.from('n') },
        { name: 'r-main/.gitattributes', data: Buffer.from('a') },
        { name: 'r-main/README.md', data: Buffer.from('h') },
        { name: 'r-main/LICENSE', data: Buffer.from('M') },
        { name: 'r-main/index.html', data: Buffer.from('html') },
      ]);

      const out = await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', '');
      expect(out).toEqual([{ hostingPath: '/index.html', bytes: Buffer.from('html') }]);
    });

    it('skips entries whose path is empty after stripping the repo prefix', async () => {
      // The tarball's first entry is often the bare `<repo>-<branch>/`
      // directory — after stripping the prefix the path is `''` and
      // we drop it. Without this guard we'd push a hostingPath of `/`
      // which Firebase rejects.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        { name: 'r-main/', data: Buffer.from('') },
        { name: 'r-main/index.html', data: Buffer.from('html') },
      ]);

      const out = await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', '');
      expect(out).toEqual([{ hostingPath: '/index.html', bytes: Buffer.from('html') }]);
    });

    it('skips an outputDirectory entry whose path is the bare directory', async () => {
      // A tarball with `r-main/dist/` (empty bare-dir entry) should
      // not produce a `hostingPath: '/'` after the dir-prefix is
      // sliced off. The `if (!path) continue;` guard inside the
      // outDir branch handles this.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        { name: 'r-main/dist/', data: Buffer.from('') },
        { name: 'r-main/dist/index.html', data: Buffer.from('html') },
      ]);

      const out = await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', 'dist');
      expect(out).toEqual([{ hostingPath: '/index.html', bytes: Buffer.from('html') }]);
    });
  });

  describe('parameter defaults', () => {
    it('defaults branch to "main" when not provided', async () => {
      // The signature accepts `branch?` so tests / future callers can
      // omit it. The default 'main' goes into the URL.
      const fetchSpy = vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) }));
      vi.stubGlobal('fetch', fetchSpy);

      await downloadGitHubRepo(makeCtx(), 'me', 'r');

      const args = fetchSpy.mock.calls[0]!;
      expect(args[0]).toBe('https://codeload.github.com/me/r/tar.gz/refs/heads/main');
    });

    it('defaults outputDirectory to "" (whole repo) when not provided', async () => {
      // Empty outputDirectory means "deploy the whole repo" — same
      // behaviour as passing '' explicitly.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([
        { name: 'r-main/a.html', data: Buffer.from('a') },
        { name: 'r-main/b.html', data: Buffer.from('b') },
      ]);

      const out = await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main');

      expect(out).toEqual([
        { hostingPath: '/a.html', bytes: Buffer.from('a') },
        { hostingPath: '/b.html', bytes: Buffer.from('b') },
      ]);
    });
  });

  describe('logging', () => {
    it('logs the download URL and byte count via ctx.on_log', async () => {
      // The two pre-extraction logs are the user's only window into
      // the codeload step — pin them so a future quiet-mode refactor
      // doesn't accidentally drop them.
      const body = new Uint8Array(123).buffer;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body })),
      );
      mocks.gunzipSync.mockReturnValue(Buffer.from('decompressed'));
      mocks.parseTar.mockReturnValue([]);

      const onLog = vi.fn();
      await downloadGitHubRepo(makeCtx({ on_log: onLog }), 'me', 'r', 'main', '');

      const messages = onLog.mock.calls.map((c) => String(c[0]));
      expect(messages.some((m) => m.includes('Downloading me/r#main from'))).toBe(true);
      expect(messages.some((m) => m.includes('Downloaded 123 bytes'))).toBe(true);
    });

    it('appends "(under <outputDirectory>/)" to the summary when files matched the configured dir', async () => {
      // Pin the conditional summary suffix — only when files matched
      // the configured outputDirectory (not when we fell back).
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([{ name: 'r-main/dist/index.html', data: Buffer.from('html') }]);

      const onLog = vi.fn();
      await downloadGitHubRepo(makeCtx({ on_log: onLog }), 'me', 'r', 'main', 'dist');

      const summary = onLog.mock.calls
        .map((c) => String(c[0]))
        .find((m) => m.includes('Extracted 1 file(s) from repo'));
      expect(summary).toBeDefined();
      expect(summary).toContain('(under dist/)');
    });

    it('does not throw when ctx.on_log is undefined', async () => {
      // The downloader uses `ctx.on_log?.(...)` so a missing logger
      // shouldn't crash. Pin it so a future refactor that drops the
      // optional chaining surfaces here.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body: new ArrayBuffer(0) })),
      );
      mocks.parseTar.mockReturnValue([]);

      const ctx = makeCtx();
      delete ctx.on_log;

      await expect(downloadGitHubRepo(ctx, 'me', 'r', 'main', '')).resolves.toEqual([]);
    });
  });

  describe('decompression pipeline', () => {
    it('passes the downloaded body buffer to gunzipSync and the result to parseTar', async () => {
      // Pin the pipeline order: fetch bytes → gunzipSync → parseTar.
      // A refactor that swapped the order or fed the raw gzipped bytes
      // to parseTar would silently produce zero entries.
      const body = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => makeFetchResponse({ ok: true, body })),
      );
      const decompressed = Buffer.from('fake-tar-content');
      mocks.gunzipSync.mockReturnValue(decompressed);
      mocks.parseTar.mockReturnValue([]);

      await downloadGitHubRepo(makeCtx(), 'me', 'r', 'main', '');

      // gunzipSync was called once with a Buffer wrapping the fetched
      // ArrayBuffer.
      expect(mocks.gunzipSync).toHaveBeenCalledOnce();
      const gunzipArg = mocks.gunzipSync.mock.calls[0]![0];
      expect(Buffer.isBuffer(gunzipArg)).toBe(true);
      expect((gunzipArg as Buffer).length).toBe(8);

      // parseTar was called with the decompressed buffer.
      expect(mocks.parseTar).toHaveBeenCalledOnce();
      expect(mocks.parseTar.mock.calls[0]![0]).toBe(decompressed);
    });
  });
});
