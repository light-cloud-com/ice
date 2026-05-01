/**
 * Unit tests for `services/deploy/src/services/pipeline/framework-detection.ts` —
 * the GitHub-Contents-API-driven framework detector extracted from
 * pipeline.service.ts in rf-pipe-6.
 *
 * The detector calls `getGitHubToken` (mocked from github-webhooks) and
 * `fetch` (the global). Per file, we make `fetch` a vi.fn() and stub a
 * sequence of responses keyed off the URL — vi.fn() default-typed
 * implementations work cleanly here because there's no callback type
 * being passed in (per the
 * `vi-fn-default-type-rejects-typed-callback-parameter` learning, that
 * gotcha only bites when fn() receives a typed callback as its first
 * argument; here the arrow's input is just a string URL).
 *
 * `detectJsFramework` and `defaultDetection` are module-private and are
 * exercised through the public `detectFramework` entry point. Each it
 * block synthesizes the package.json content the GitHub Contents API
 * would return (base64-encoded), then asserts the discriminating field
 * combinations on the FrameworkDetection result.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../pipeline/github-webhooks.js', () => ({
  getGitHubToken: vi.fn(),
}));

import * as webhooks from '../pipeline/github-webhooks.js';
import { detectFramework } from '../pipeline/framework-detection.js';

const getTokenMock = (webhooks as any).getGitHubToken as ReturnType<typeof vi.fn>;

let fetchMock: ReturnType<typeof vi.fn>;

/**
 * Build a mock-fetch that returns the matching content from the table
 * for any URL containing the marker filename, and a 404 for any
 * unknown file. The Contents API returns base64-encoded content with
 * `encoding: 'base64'`.
 */
function mockContentsApi(filesByName: Record<string, string>) {
  return vi.fn(async (url: string) => {
    for (const [filename, content] of Object.entries(filesByName)) {
      if (url.includes(`/contents/${filename}`)) {
        return {
          ok: true,
          json: async () => ({
            content: Buffer.from(content, 'utf-8').toString('base64'),
            encoding: 'base64',
          }),
        };
      }
    }
    return { ok: false, json: async () => ({}) };
  });
}

beforeEach(() => {
  getTokenMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('detectFramework: token gate', () => {
  it('returns the all-null default detection when no token is configured', async () => {
    getTokenMock.mockResolvedValue(null);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await detectFramework('user-1', 'o/r');

    expect(result).toEqual({
      framework: null,
      runtime: null,
      buildCommand: null,
      installCommand: null,
      outputDirectory: null,
      packageManager: null,
      confidence: 'low',
      detectedFiles: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('detectFramework: top-level marker files', () => {
  beforeEach(() => {
    getTokenMock.mockResolvedValue('tok');
  });

  it('Dockerfile → docker / container with high confidence', async () => {
    fetchMock = mockContentsApi({ Dockerfile: 'FROM alpine' });
    vi.stubGlobal('fetch', fetchMock);

    const result = await detectFramework('u', 'o/r');

    expect(result.framework).toBe('docker');
    expect(result.runtime).toBe('container');
    expect(result.buildCommand).toBe('docker build .');
    expect(result.installCommand).toBeNull();
    expect(result.confidence).toBe('high');
    expect(result.detectedFiles).toContain('Dockerfile');
  });

  it('requirements.txt → python with medium confidence', async () => {
    fetchMock = mockContentsApi({ 'requirements.txt': 'flask==2.0' });
    vi.stubGlobal('fetch', fetchMock);
    const result = await detectFramework('u', 'o/r');
    expect(result.framework).toBe('python');
    expect(result.runtime).toBe('python');
    expect(result.installCommand).toBe('pip install -r requirements.txt');
    expect(result.packageManager).toBe('pip');
    expect(result.confidence).toBe('medium');
  });

  it('go.mod → go with medium confidence', async () => {
    fetchMock = mockContentsApi({ 'go.mod': 'module foo' });
    vi.stubGlobal('fetch', fetchMock);
    const result = await detectFramework('u', 'o/r');
    expect(result.framework).toBe('go');
    expect(result.buildCommand).toBe('go build -o app .');
  });

  it('passes the branch through as a query param to the Contents API', async () => {
    fetchMock = mockContentsApi({ Dockerfile: 'FROM x' });
    vi.stubGlobal('fetch', fetchMock);
    await detectFramework('u', 'owner/repo', 'develop');
    // Every checked file goes through with ?ref=develop
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.includes('?ref=develop'))).toBe(true);
    expect(urls[0]).toContain('/repos/owner/repo/contents/');
  });

  it('returns the default detection when no marker file is found', async () => {
    fetchMock = mockContentsApi({});
    vi.stubGlobal('fetch', fetchMock);
    const result = await detectFramework('u', 'o/r');
    expect(result.framework).toBeNull();
    expect(result.confidence).toBe('low');
  });
});

describe('detectFramework: package.json (JS ecosystem)', () => {
  beforeEach(() => {
    getTokenMock.mockResolvedValue('tok');
  });

  function withPackageJson(pkg: Record<string, unknown>) {
    fetchMock = mockContentsApi({ 'package.json': JSON.stringify(pkg) });
    vi.stubGlobal('fetch', fetchMock);
  }

  it('next dependency → nextjs / .next', async () => {
    withPackageJson({ dependencies: { next: '13.0.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('nextjs');
    expect(r.runtime).toBe('node');
    expect(r.outputDirectory).toBe('.next');
    expect(r.confidence).toBe('high');
  });

  it('nuxt dependency → nuxt / .output', async () => {
    withPackageJson({ dependencies: { nuxt: '3.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('nuxt');
    expect(r.outputDirectory).toBe('.output');
  });

  it('@sveltejs/kit dependency → sveltekit / build', async () => {
    withPackageJson({ dependencies: { '@sveltejs/kit': '1.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('sveltekit');
    expect(r.outputDirectory).toBe('build');
  });

  it('react + vite → react with dist outputDirectory', async () => {
    withPackageJson({ dependencies: { react: '18.0.0' }, devDependencies: { vite: '5.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('react');
    expect(r.runtime).toBe('static');
    expect(r.outputDirectory).toBe('dist');
  });

  it('react without vite → react with build outputDirectory (CRA fallback)', async () => {
    withPackageJson({ dependencies: { react: '18.0.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('react');
    expect(r.outputDirectory).toBe('build');
  });

  it('vue → vue / dist', async () => {
    withPackageJson({ dependencies: { vue: '3.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('vue');
    expect(r.outputDirectory).toBe('dist');
  });

  it('@angular/core → angular / dist', async () => {
    withPackageJson({ dependencies: { '@angular/core': '17.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('angular');
  });

  it('express → express with medium confidence and null outputDirectory', async () => {
    withPackageJson({ dependencies: { express: '4.0' }, scripts: { build: 'tsc' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('express');
    expect(r.runtime).toBe('node');
    expect(r.buildCommand).toBe('npm run build');
    expect(r.outputDirectory).toBeNull();
    expect(r.confidence).toBe('medium');
  });

  it('fastify → fastify (priority order: express → fastify → koa)', async () => {
    withPackageJson({ dependencies: { fastify: '4.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('fastify');
    expect(r.buildCommand).toBeNull();
  });

  it('koa → koa', async () => {
    withPackageJson({ dependencies: { koa: '2.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('koa');
  });

  it('generic Node with build + start scripts → node / static', async () => {
    withPackageJson({ scripts: { build: 'tsc', start: 'node dist/index.js' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('node');
    expect(r.runtime).toBe('node');
    expect(r.buildCommand).toBe('npm run build');
  });

  it('generic JS without start script → node / static fallback', async () => {
    withPackageJson({ scripts: { build: 'webpack' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBe('node');
    expect(r.runtime).toBe('static');
  });

  it('detects pnpm from pnpm-lock.yaml (bugfix-4)', async () => {
    // Pre-fix: filesToCheck excluded lockfiles, so
    // detectedFiles.includes('pnpm-lock.yaml') always returned
    // false and the package-manager guess fell through to npm.
    // Post-fix: filesToCheck contains pnpm-lock.yaml.
    fetchMock = mockContentsApi({
      'package.json': JSON.stringify({ dependencies: { next: '13.0' } }),
      'pnpm-lock.yaml': 'lockfileVersion: 6.0',
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await detectFramework('u', 'o/r');
    expect(r.packageManager).toBe('pnpm');
    expect(r.installCommand).toBe('pnpm install --frozen-lockfile');
    expect(r.detectedFiles).toContain('pnpm-lock.yaml');
  });

  it('detects yarn from yarn.lock (bugfix-4)', async () => {
    fetchMock = mockContentsApi({
      'package.json': JSON.stringify({ dependencies: { next: '13.0' } }),
      'yarn.lock': '# yarn lockfile v1',
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await detectFramework('u', 'o/r');
    expect(r.packageManager).toBe('yarn');
    expect(r.installCommand).toBe('yarn install --frozen-lockfile');
    expect(r.detectedFiles).toContain('yarn.lock');
  });

  it('detects npm from package-lock.json (default install command)', async () => {
    // package-lock.json is now in filesToCheck and shows up in
    // detectedFiles, but `detectJsFramework`'s ladder doesn't have
    // an explicit branch for it (npm is the default fall-through),
    // so packageManager stays 'npm' and installCommand stays 'npm ci'.
    fetchMock = mockContentsApi({
      'package.json': JSON.stringify({ dependencies: { next: '13.0' } }),
      'package-lock.json': '{}',
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await detectFramework('u', 'o/r');
    expect(r.packageManager).toBe('npm');
    expect(r.installCommand).toBe('npm ci');
    expect(r.detectedFiles).toContain('package-lock.json');
  });

  it('falls back to npm when no lockfile is present', async () => {
    withPackageJson({ dependencies: { next: '13.0' } });
    const r = await detectFramework('u', 'o/r');
    expect(r.packageManager).toBe('npm');
    expect(r.installCommand).toBe('npm ci');
    expect(r.detectedFiles).not.toContain('pnpm-lock.yaml');
    expect(r.detectedFiles).not.toContain('yarn.lock');
    expect(r.detectedFiles).not.toContain('package-lock.json');
  });

  it('prefers pnpm over yarn when both lockfiles are present', async () => {
    // The ladder in detectJsFramework checks pnpm-lock.yaml first,
    // then yarn.lock. Pin that order.
    fetchMock = mockContentsApi({
      'package.json': JSON.stringify({ dependencies: { next: '13.0' } }),
      'pnpm-lock.yaml': 'lockfileVersion: 6.0',
      'yarn.lock': '# yarn lockfile v1',
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await detectFramework('u', 'o/r');
    expect(r.packageManager).toBe('pnpm');
    expect(r.installCommand).toBe('pnpm install --frozen-lockfile');
  });

  it('returns the default detection when package.json is malformed JSON', async () => {
    fetchMock = mockContentsApi({ 'package.json': '{not-json' });
    vi.stubGlobal('fetch', fetchMock);
    const r = await detectFramework('u', 'o/r');
    expect(r.framework).toBeNull();
    expect(r.confidence).toBe('low');
    expect(r.detectedFiles).toEqual([]);
  });
});

describe('detectFramework: fetchFileContent edge cases', () => {
  beforeEach(() => {
    getTokenMock.mockResolvedValue('tok');
  });

  it('treats non-base64 content as missing (returns null from fetchFileContent)', async () => {
    // GitHub returns content as base64-encoded; if the API ever sent
    // back a different encoding, the helper returns null and the file
    // is treated as not-present.
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/Dockerfile')) {
        return {
          ok: true,
          json: async () => ({ content: 'plain text', encoding: 'utf-8' }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await detectFramework('u', 'o/r');
    expect(result.detectedFiles).not.toContain('Dockerfile');
    expect(result.framework).toBeNull();
  });

  it('catches fetch network errors and continues to the next marker file', async () => {
    fetchMock = vi.fn(async (url: string) => {
      if (url.includes('Dockerfile')) {
        throw new Error('network');
      }
      if (url.includes('/contents/go.mod')) {
        return {
          ok: true,
          json: async () => ({
            content: Buffer.from('module foo').toString('base64'),
            encoding: 'base64',
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await detectFramework('u', 'o/r');
    // Dockerfile threw → not in detectedFiles. go.mod still resolved.
    expect(result.detectedFiles).not.toContain('Dockerfile');
    expect(result.framework).toBe('go');
  });
});
