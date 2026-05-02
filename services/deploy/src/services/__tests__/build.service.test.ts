/**
 * Unit tests for `services/deploy/src/services/build.service.ts` —
 * downloads a GitHub tarball, extracts to a temp dir, runs install + build
 * commands via spawn, streams output via callback, and cleans up.
 *
 * The SUT mixes a lot of node primitives. Each is mocked at the bare-name
 * import path (`'child_process'`, `'fs'`, `'os'`, `'path'`, `'stream/promises'`)
 * so the SUT's static `import { fn } from 'child_process'` style picks up
 * the stub. `globalThis.fetch` is stubbed via `vi.stubGlobal` per the
 * `vi-spyon-accumulates-across-it-blocks-without-explicit-reset` learning
 * — re-stubbing in `beforeEach` and `vi.unstubAllGlobals()` in `afterEach`
 * keeps call-count assertions clean across `it` blocks.
 *
 * Children of `spawn` are EventEmitter-based fakes that `setImmediate`-emit
 * stdout/stderr, then `close` with a configurable exit code. Wrapping the
 * emits in `setImmediate` (vs synchronous `child.emit('close')`) is load-
 * bearing: `runCommand` registers its `data`/`close` listeners *after*
 * spawn returns, so synchronous emits arrive before the listener and the
 * close event is lost — the promise hangs.
 *
 * `stream/promises.pipeline` is reduced to an immediate resolver so we
 * don't need a working ReadableStream/Writable pair for the tarball
 * download — the test only cares that pipeline was invoked with the
 * fetched body and the createWriteStream writable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  mkdtempSync: vi.fn(),
  rmSync: vi.fn(),
  existsSync: vi.fn(),
  createWriteStream: vi.fn(),
}));

vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}));

vi.mock('stream/promises', () => ({
  pipeline: vi.fn(async () => undefined),
}));

vi.mock('@ice/db', () => ({
  default: {
    gitHubToken: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@ice/shared', () => ({
  decryptString: vi.fn(),
}));

import { spawn, execSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync, createWriteStream } from 'fs';
import { pipeline as streamPipeline } from 'stream/promises';
import prisma from '@ice/db';
import * as shared from '@ice/shared';
import { buildFromSource, cleanupBuild } from '../build.service.js';

// ─── Spies ──────────────────────────────────────────────────────────────────

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;
const execSyncMock = execSync as unknown as ReturnType<typeof vi.fn>;
const mkdtempSyncMock = mkdtempSync as unknown as ReturnType<typeof vi.fn>;
const rmSyncMock = rmSync as unknown as ReturnType<typeof vi.fn>;
const existsSyncMock = existsSync as unknown as ReturnType<typeof vi.fn>;
const createWriteStreamMock = createWriteStream as unknown as ReturnType<typeof vi.fn>;
const pipelineMock = streamPipeline as unknown as ReturnType<typeof vi.fn>;
const findFirstMock = (prisma as any).gitHubToken.findFirst as ReturnType<typeof vi.fn>;
const decryptMock = (shared as any).decryptString as ReturnType<typeof vi.fn>;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface FakeChildOptions {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  spawnError?: Error;
}

/**
 * EventEmitter-based stand-in for the `ChildProcess` returned by spawn.
 * `setImmediate` is required: `runCommand` registers its `data`/`close`
 * listeners *after* spawn returns synchronously, so emitting in the same
 * tick would lose the events and hang the promise.
 */
function makeFakeChild({ exitCode = 0, stdout = '', stderr = '', spawnError }: FakeChildOptions = {}) {
  const child: any = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  setImmediate(() => {
    if (spawnError) {
      child.emit('error', spawnError);
      return;
    }
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', exitCode);
  });
  return child;
}

function makeWritable() {
  const w: any = new EventEmitter();
  w.write = vi.fn();
  w.end = vi.fn();
  return w;
}

const baseConfig = {
  repository: 'octocat/hello',
  branch: 'main',
  commitSha: 'HEAD',
  installCommand: null as string | null,
  buildCommand: null as string | null,
  outputDir: null as string | null,
  framework: null as string | null,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path stubs — individual tests override as needed.
  mkdtempSyncMock.mockReturnValue('/tmp/ice-build-abc123');
  existsSyncMock.mockReturnValue(false);
  createWriteStreamMock.mockReturnValue(makeWritable());
  pipelineMock.mockResolvedValue(undefined);
  execSyncMock.mockReturnValue(Buffer.from(''));
  findFirstMock.mockResolvedValue({ access_token: 'enc:tok', connected_at: new Date() });
  decryptMock.mockReturnValue('plain-tok');
  spawnMock.mockImplementation(() => makeFakeChild());

  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    body: { pipe: () => undefined } as any,
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── buildFromSource: token gate ────────────────────────────────────────────

describe('buildFromSource: GitHub token resolution', () => {
  it('fails fast when no GitHub token is configured', async () => {
    findFirstMock.mockResolvedValue(null);
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'user-1', onLog);

    expect(result.success).toBe(false);
    expect(result.error).toContain('GitHub not connected');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    // The error step is reported via onLog with status 'failed'.
    expect(onLog).toHaveBeenCalledWith('error', 'failed', expect.stringContaining('GitHub not connected'));
  });

  it('falls back to the raw access_token when decryption throws', async () => {
    decryptMock.mockImplementation(() => {
      throw new Error('not encrypted');
    });
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'user-1', onLog);

    // The plaintext token should have been used in the fetch Authorization header.
    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer enc:tok');
  });
});

// ─── buildFromSource: download/extract ──────────────────────────────────────

describe('buildFromSource: source download', () => {
  it('downloads the branch tarball when commitSha is HEAD', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource({ ...baseConfig, commitSha: 'HEAD', branch: 'main' }, 'user-1', onLog);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/hello/tarball/main',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer plain-tok',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }),
        redirect: 'follow',
      }),
    );
  });

  it('downloads the pinned commit tarball when commitSha is not HEAD', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource({ ...baseConfig, commitSha: 'abc1234' }, 'user-1', onLog);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/octocat/hello/tarball/abc1234',
      expect.any(Object),
    );
  });

  it('returns an error when GitHub responds 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'u', onLog);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to download source: 404');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns an error when fetch itself rejects (network failure)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'u', onLog);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ECONNRESET');
  });

  it('wraps tar-extract failures with a descriptive error message', async () => {
    // Make execSync throw on the tar extract call (the only execSync invocation
    // along the no-cache path before runCommand).
    execSyncMock.mockImplementationOnce(() => {
      throw new Error('tar: corrupt archive');
    });
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'u', onLog);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to extract source');
    expect(result.error).toContain('tar: corrupt archive');
  });

  it('tolerates rmSync failure on the downloaded tarball', async () => {
    // tar extract succeeds (1st execSync call returns OK), then rmSync throws
    // when removing _source.tar.gz — the SUT swallows that error.
    rmSyncMock.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'u', onLog);

    expect(result.success).toBe(true);
  });

  it('streams the fetched response body into the temp tarball file via pipeline', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'u', onLog);

    expect(createWriteStreamMock).toHaveBeenCalledWith('/tmp/ice-build-abc123/_source.tar.gz');
    expect(pipelineMock).toHaveBeenCalled();
  });
});

// ─── buildFromSource: install step ──────────────────────────────────────────

describe('buildFromSource: install step', () => {
  it('skips install entirely when no installCommand is configured AND no lockfile is present', async () => {
    existsSyncMock.mockReturnValue(false);
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'u', onLog);

    expect(result.success).toBe(true);
    expect(spawnMock).not.toHaveBeenCalled();
    // No step labelled 'install' should have been emitted.
    const steps = onLog.mock.calls.map((call) => call[0]);
    expect(steps).not.toContain('install');
  });

  it('runs the explicit installCommand and streams stdout per line', async () => {
    spawnMock.mockImplementation(() => makeFakeChild({ stdout: 'added 42 packages\nready\n' }));
    const onLog = vi.fn().mockResolvedValue(undefined);
    const onLine = vi.fn();

    const result = await buildFromSource(
      { ...baseConfig, installCommand: 'npm ci' },
      'u',
      onLog,
      onLine,
    );

    expect(result.success).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith('npm', ['ci'], expect.objectContaining({ shell: false }));
    expect(onLine).toHaveBeenCalledWith('[install] added 42 packages');
    expect(onLine).toHaveBeenCalledWith('[install] ready');
    expect(onLog).toHaveBeenCalledWith('install', 'started', expect.stringContaining('npm ci'));
    expect(onLog).toHaveBeenCalledWith('install', 'completed', 'Dependencies installed');
  });

  it('detects pnpm install when pnpm-lock.yaml is present', async () => {
    existsSyncMock.mockImplementation((p: any) => String(p).endsWith('pnpm-lock.yaml'));
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'u', onLog);

    expect(spawnMock).toHaveBeenCalledWith('pnpm', ['install', '--frozen-lockfile'], expect.any(Object));
  });

  it('detects yarn install when yarn.lock is present', async () => {
    existsSyncMock.mockImplementation((p: any) => String(p).endsWith('yarn.lock'));
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'u', onLog);

    expect(spawnMock).toHaveBeenCalledWith('yarn', ['install', '--frozen-lockfile'], expect.any(Object));
  });

  it('detects npm ci when package-lock.json is present', async () => {
    existsSyncMock.mockImplementation((p: any) => String(p).endsWith('package-lock.json'));
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'u', onLog);

    expect(spawnMock).toHaveBeenCalledWith('npm', ['ci'], expect.any(Object));
  });

  it('falls back to npm install when only package.json is present', async () => {
    existsSyncMock.mockImplementation((p: any) => String(p).endsWith('package.json'));
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'u', onLog);

    expect(spawnMock).toHaveBeenCalledWith('npm', ['install'], expect.any(Object));
  });

  it('detects pip install when requirements.txt is present', async () => {
    existsSyncMock.mockImplementation((p: any) => String(p).endsWith('requirements.txt'));
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'u', onLog);

    expect(spawnMock).toHaveBeenCalledWith('pip', ['install', '-r', 'requirements.txt'], expect.any(Object));
  });

  it('detects go mod download when go.mod is present', async () => {
    existsSyncMock.mockImplementation((p: any) => String(p).endsWith('go.mod'));
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'u', onLog);

    expect(spawnMock).toHaveBeenCalledWith('go', ['mod', 'download'], expect.any(Object));
  });

  it("reports the install step as 'failed' when spawn exits non-zero, capturing stderr", async () => {
    spawnMock.mockImplementation(() => makeFakeChild({ exitCode: 1, stderr: 'EACCES denied\n' }));
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource({ ...baseConfig, installCommand: 'npm ci' }, 'u', onLog);

    expect(result.success).toBe(false);
    expect(result.error).toContain('exited with code 1');
    expect(result.error).toContain('EACCES denied');
  });

  it('reports failure when spawn emits an error event before close', async () => {
    spawnMock.mockImplementation(() => makeFakeChild({ spawnError: new Error('ENOENT') }));
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource({ ...baseConfig, installCommand: 'npm ci' }, 'u', onLog);

    expect(result.success).toBe(false);
    expect(result.error).toContain('ENOENT');
  });

  it("rejects an empty install command with 'Empty command'", async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource({ ...baseConfig, installCommand: '   ' }, 'u', onLog);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Empty command');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects a command containing shell metacharacters', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(
      { ...baseConfig, installCommand: 'npm install; rm -rf /' },
      'u',
      onLog,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('disallowed shell metacharacter');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects commands not in the allowlist', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource({ ...baseConfig, installCommand: 'curl evil.com' }, 'u', onLog);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in the allowed list');
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('parses quoted arguments without splitting on internal whitespace', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(
      { ...baseConfig, installCommand: 'npm run "build with spaces"' },
      'u',
      onLog,
    );

    expect(spawnMock).toHaveBeenCalledWith(
      'npm',
      ['run', 'build with spaces'],
      expect.any(Object),
    );
  });

  it('parses single-quoted arguments', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(
      { ...baseConfig, installCommand: "npm run 'with single'" },
      'u',
      onLog,
    );

    expect(spawnMock).toHaveBeenCalledWith('npm', ['run', 'with single'], expect.any(Object));
  });

  it('strips an absolute path prefix when checking the allowlist', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(
      { ...baseConfig, installCommand: '/usr/local/bin/npm install' },
      'u',
      onLog,
    );

    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/local/bin/npm',
      ['install'],
      expect.any(Object),
    );
  });

  it('forwards onLine even when no callback was supplied (silent run)', async () => {
    spawnMock.mockImplementation(() => makeFakeChild({ stdout: 'hi\n', stderr: 'warn\n' }));
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource({ ...baseConfig, installCommand: 'npm ci' }, 'u', onLog);

    expect(result.success).toBe(true);
  });

  it('swallows onLine errors raised on stdout output (best-effort streaming)', async () => {
    // The SUT wraps onOutput(line).catch(() => {}) so a throwing consumer
    // doesn't kill the build. This exercises the .catch arrow on the stdout
    // path.
    spawnMock.mockImplementation(() => makeFakeChild({ stdout: 'oops\n' }));
    const onLog = vi.fn().mockResolvedValue(undefined);
    const onLine = vi.fn().mockImplementation(() => {
      throw new Error('consumer blew up');
    });

    const result = await buildFromSource(
      { ...baseConfig, installCommand: 'npm ci' },
      'u',
      onLog,
      onLine,
    );

    expect(result.success).toBe(true);
    expect(onLine).toHaveBeenCalled();
  });

  it('swallows onLine errors raised on stderr output (best-effort streaming)', async () => {
    spawnMock.mockImplementation(() => makeFakeChild({ stderr: 'warning\n' }));
    const onLog = vi.fn().mockResolvedValue(undefined);
    const onLine = vi.fn().mockImplementation(() => {
      throw new Error('consumer blew up');
    });

    const result = await buildFromSource(
      { ...baseConfig, installCommand: 'npm ci' },
      'u',
      onLog,
      onLine,
    );

    expect(result.success).toBe(true);
    expect(onLine).toHaveBeenCalled();
  });
});

// ─── buildFromSource: install cache (hardlink + rsync) ─────────────────────

describe('buildFromSource: node_modules cache', () => {
  it('uses cached node_modules via hardlinks when the cache directory exists', async () => {
    // First existsSync (cachedNodeModules) → true; subsequent calls also true so
    // the post-install rsync save path runs.
    existsSyncMock.mockReturnValue(true);
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource({ ...baseConfig, installCommand: 'npm ci' }, 'u', onLog);

    expect(onLog).toHaveBeenCalledWith('install', 'started', expect.stringContaining('cached via hardlinks'));
    // execSync should have been called for: tar extract, cp -al, mkdir -p, rsync.
    const calls = execSyncMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes('cp -al'))).toBe(true);
    expect(calls.some((c) => c.startsWith('rsync -a'))).toBe(true);
  });

  it('falls back to plain cp -r when the hardlink copy fails (cross-device)', async () => {
    existsSyncMock.mockReturnValue(true);
    let execCallCount = 0;
    execSyncMock.mockImplementation((cmd: string) => {
      execCallCount++;
      // First call: tar xzf → success.
      // Second call: cp -al → fail (simulate cross-device link).
      if (execCallCount === 2) throw new Error('EXDEV');
      return Buffer.from('');
    });
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource({ ...baseConfig, installCommand: 'npm ci' }, 'u', onLog);

    expect(onLog).toHaveBeenCalledWith('install', 'started', expect.stringMatching(/\(cached\)$/));
    const calls = execSyncMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.startsWith('cp -r'))).toBe(true);
  });

  it('falls through to a non-cached install when both copy strategies fail', async () => {
    existsSyncMock.mockReturnValue(true);
    let execCallCount = 0;
    execSyncMock.mockImplementation((cmd: string) => {
      execCallCount++;
      // tar succeeds, both cache copies fail, rsync save will also see cmd === mkdir/rsync.
      if (execCallCount === 2 || execCallCount === 3) throw new Error('boom');
      return Buffer.from('');
    });
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource({ ...baseConfig, installCommand: 'npm ci' }, 'u', onLog);

    // The install-started message in this branch is "Running: npm ci" with no
    // suffix.
    const startedCalls = onLog.mock.calls.filter(
      (c) => c[0] === 'install' && c[1] === 'started',
    );
    expect(startedCalls.length).toBe(1);
    expect(startedCalls[0]![2]).toBe('Running: npm ci');
  });

  it('swallows rsync save failures (best-effort cache update)', async () => {
    existsSyncMock.mockReturnValue(true);
    let execCallCount = 0;
    execSyncMock.mockImplementation((cmd: string) => {
      execCallCount++;
      // tar (1) ok, cp -al (2) ok, mkdir -p (3) ok, rsync (4) throws.
      if (execCallCount === 4) throw new Error('rsync: connection refused');
      return Buffer.from('');
    });
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource({ ...baseConfig, installCommand: 'npm ci' }, 'u', onLog);

    expect(result.success).toBe(true);
  });

  it('skips the rsync save step when the build did not produce a node_modules directory', async () => {
    // existsSync returns true for cache lookup but false for buildNodeModules check.
    let existsCallCount = 0;
    existsSyncMock.mockImplementation(() => {
      existsCallCount++;
      // 1st call: cachedNodeModules → true. 2nd call: buildNodeModules check → false.
      // Subsequent: outputPath → false (returns buildDir as fallback).
      return existsCallCount === 1;
    });
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource({ ...baseConfig, installCommand: 'npm ci' }, 'u', onLog);

    // No rsync command should have been issued.
    const calls = execSyncMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.startsWith('rsync'))).toBe(false);
  });
});

// ─── buildFromSource: build step ────────────────────────────────────────────

describe('buildFromSource: build step', () => {
  it('runs the buildCommand and streams output with a [build] prefix', async () => {
    spawnMock.mockImplementation(() => makeFakeChild({ stdout: 'compiled\n' }));
    const onLog = vi.fn().mockResolvedValue(undefined);
    const onLine = vi.fn();

    const result = await buildFromSource(
      { ...baseConfig, buildCommand: 'npm run build' },
      'u',
      onLog,
      onLine,
    );

    expect(result.success).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith('npm', ['run', 'build'], expect.any(Object));
    expect(onLine).toHaveBeenCalledWith('[build] compiled');
    expect(onLog).toHaveBeenCalledWith('build', 'started', 'Running: npm run build');
    expect(onLog).toHaveBeenCalledWith('build', 'completed', 'Build successful');
  });

  it('emits a no-op build-completed step when no buildCommand is configured', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    await buildFromSource(baseConfig, 'u', onLog);

    expect(onLog).toHaveBeenCalledWith('build', 'completed', 'No build command — skipping');
    // spawn must NOT have been called for build (and there's no install either).
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('returns failure with the error message when the build command exits non-zero', async () => {
    spawnMock.mockImplementation(() => makeFakeChild({ exitCode: 2, stderr: 'TS2304\n' }));
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(
      { ...baseConfig, buildCommand: 'npm run build' },
      'u',
      onLog,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('exited with code 2');
  });
});

// ─── buildFromSource: outputPath resolution & duration ─────────────────────

describe('buildFromSource: result shape', () => {
  it('returns the absolute outputDir under buildDir when it exists', async () => {
    existsSyncMock.mockImplementation((p: any) => String(p).endsWith('dist'));
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource({ ...baseConfig, outputDir: 'dist' }, 'u', onLog);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/tmp/ice-build-abc123/dist');
  });

  it('falls back to buildDir when the configured outputDir does not exist', async () => {
    existsSyncMock.mockReturnValue(false);
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource({ ...baseConfig, outputDir: 'missing' }, 'u', onLog);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/tmp/ice-build-abc123');
  });

  it('uses buildDir as outputPath when no outputDir is configured', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'u', onLog);

    expect(result.outputPath).toBe('/tmp/ice-build-abc123');
  });

  it('reports a non-negative duration_ms', async () => {
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'u', onLog);

    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('always returns the buildDir even on failure (so the caller can clean up)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, statusText: 'Boom' });
    const onLog = vi.fn().mockResolvedValue(undefined);

    const result = await buildFromSource(baseConfig, 'u', onLog);

    expect(result.success).toBe(false);
    expect(result.buildDir).toBe('/tmp/ice-build-abc123');
    expect(result.outputPath).toBeNull();
  });
});

// ─── cleanupBuild ───────────────────────────────────────────────────────────

describe('cleanupBuild', () => {
  it('removes a buildDir under tmpdir() when it exists', () => {
    existsSyncMock.mockReturnValue(true);

    cleanupBuild('/tmp/ice-build-xyz');

    expect(rmSyncMock).toHaveBeenCalledWith('/tmp/ice-build-xyz', { recursive: true, force: true });
  });

  it('refuses to remove a directory outside tmpdir() (defence in depth)', () => {
    existsSyncMock.mockReturnValue(true);

    cleanupBuild('/etc');

    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it('skips removal when the directory does not exist', () => {
    existsSyncMock.mockReturnValue(false);

    cleanupBuild('/tmp/ice-build-missing');

    expect(rmSyncMock).not.toHaveBeenCalled();
  });

  it('swallows rmSync failures silently (best-effort cleanup)', () => {
    existsSyncMock.mockReturnValue(true);
    rmSyncMock.mockImplementation(() => {
      throw new Error('EBUSY');
    });

    expect(() => cleanupBuild('/tmp/ice-build-xyz')).not.toThrow();
  });
});
