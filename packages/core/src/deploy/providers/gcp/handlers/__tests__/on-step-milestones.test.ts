/**
 * Tests for pdl-3 — `ctx.on_step` milestone wiring across the slow GCP
 * handlers. Each test mocks `rest_client` (and SDK clients where used)
 * to make the handler resolve quickly without real GCP calls, captures
 * every `on_step` call, and asserts the milestones fire in 1-based
 * monotonic order with the expected total.
 *
 * The tests exercise the create() path only — that's the slow path the
 * brief targets. Update/delete paths are not instrumented for milestones.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { api_gateway_handler } from '../api-gateway';
import { build_from_source, ensure_artifact_registry } from '../cloud-build-helper';
import { cloud_functions_handler } from '../cloud-functions';
import { cloud_run_handler } from '../cloud-run';
import { cloud_sql_handler } from '../cloud-sql';
import { gke_handler } from '../gke';
import { memorystore_handler } from '../memorystore';
import type { GCPHandlerContext } from '../../types';

interface CapturedStep {
  resource: string;
  label: string;
  index: number;
  total: number;
}

/**
 * Build a minimal GCPHandlerContext whose rest_client returns whatever
 * the per-test response map says, captures `on_step` calls, and never
 * actually polls.
 */
function build_ctx(
  rest_responses: Map<string, unknown>,
  sdk_clients: Map<string, unknown> = new Map(),
): { ctx: GCPHandlerContext; steps: CapturedStep[] } {
  const steps: CapturedStep[] = [];
  const ctx: GCPHandlerContext = {
    project: 'test-project',
    region: 'us-central1',
    clients: sdk_clients,
    rest_client: {
      get: async (url: string) => {
        const resp = rest_responses.get(`GET ${url}`);
        if (resp !== undefined) return resp;
        // Default for any GET (operation polls, etc): return a DONE
        // response. Test-supplied responses override this.
        return { done: true, status: 'DONE' };
      },
      post: async (url: string) => {
        const resp = rest_responses.get(`POST ${url}`);
        if (resp !== undefined) return resp;
        return { name: 'op-default', done: true };
      },
      patch: async () => ({ name: 'op-default', done: true }),
      delete: async () => ({ name: 'op-default', done: true }),
    },
    on_step: (resource, step) => {
      steps.push({ resource, ...step });
    },
  };
  return { ctx, steps };
}

/**
 * Assert milestones are 1-based, strictly monotonic-non-decreasing in
 * `index`, and never exceed `total`. (Sub-state refreshes at the same
 * index are allowed — see cloud-build-helper's BUILD_STEP_INDEX comment.)
 */
function assert_monotonic(steps: CapturedStep[], expected_total: number): void {
  expect(steps.length).toBeGreaterThan(0);
  let last_index = 0;
  for (const step of steps) {
    expect(step.index).toBeGreaterThanOrEqual(1);
    expect(step.index).toBeLessThanOrEqual(expected_total);
    expect(step.total).toBe(expected_total);
    expect(step.index).toBeGreaterThanOrEqual(last_index);
    last_index = step.index;
  }
}

describe('cloud-sql handler — on_step milestones', () => {
  it('emits 2 milestones during create (submit + wait)', async () => {
    const responses = new Map<string, unknown>([
      ['POST https://sqladmin.googleapis.com/v1/projects/test-project/instances', { name: 'op-1' }],
      ['GET https://sqladmin.googleapis.com/v1/projects/test-project/operations/op-1', { status: 'DONE' }],
    ]);
    const { ctx, steps } = build_ctx(responses);
    const result = await cloud_sql_handler.create('my-db', { tier: 'db-f1-micro' }, ctx);

    expect(result.success).toBe(true);
    assert_monotonic(steps, 2);
    expect(steps.map((s) => s.label)).toEqual(['Creating Cloud SQL instance', 'Waiting for instance to become ready']);
    expect(steps.every((s) => s.resource === 'my-db')).toBe(true);
  });
});

describe('memorystore handler — on_step milestones', () => {
  it('emits 2 milestones during create (submit + wait)', async () => {
    const responses = new Map<string, unknown>([
      [
        'POST https://redis.googleapis.com/v1/projects/test-project/locations/us-central1/instances?instanceId=my-redis',
        { name: 'projects/test-project/locations/us-central1/operations/op-1' },
      ],
      [
        'GET https://redis.googleapis.com/v1/projects/test-project/locations/us-central1/operations/op-1',
        { done: true },
      ],
    ]);
    const { ctx, steps } = build_ctx(responses);
    const result = await memorystore_handler.create('my-redis', {}, ctx);

    expect(result.success).toBe(true);
    assert_monotonic(steps, 2);
    expect(steps.map((s) => s.label)).toEqual(['Creating Redis instance', 'Waiting for instance to become ready']);
  });
});

describe('cloud-run handler — on_step milestones', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits 4 milestones during create with a repository (build + deploy + wait)', async () => {
    // The cloud-build helper polls every 10s — fake timers + manual
    // promise-tick advance let us clear the wait without burning real
    // wall-clock time.
    vi.useFakeTimers();
    // Build returns SUCCESS on the first poll so the helper exits cleanly.
    const responses = new Map<string, unknown>([
      [
        'POST https://artifactregistry.googleapis.com/v1/projects/test-project/locations/us-central1/repositories?repositoryId=ice-images',
        {},
      ],
      [
        'POST https://cloudbuild.googleapis.com/v1/projects/test-project/builds',
        { metadata: { build: { id: 'build-1' } } },
      ],
      ['GET https://cloudbuild.googleapis.com/v1/projects/test-project/builds/build-1', { status: 'SUCCESS' }],
    ]);
    const sdk_clients = new Map<string, unknown>([
      [
        'run.services',
        {
          createService: async () => [{ promise: async () => undefined }],
          getService: async () => [{ uri: 'https://my-svc.run.app' }],
        },
      ],
    ]);
    const { ctx, steps } = build_ctx(responses, sdk_clients);

    const promise = cloud_run_handler.create('my-svc', { repository: 'foo/bar' }, ctx);
    // Drain microtasks + advance fake timers a few times so the build poll
    // sleep clears.
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
    }
    const result = await promise;

    expect(result.success).toBe(true);
    assert_monotonic(steps, 4);
    // Should see at least: Ensuring AR (idx 1), Building from source (idx 2),
    // possibly sub-state refreshes at idx 2, then Deploying (idx 3),
    // Waiting (idx 4).
    const indices = steps.map((s) => s.index);
    expect(indices).toContain(1);
    expect(indices).toContain(2);
    expect(indices).toContain(3);
    expect(indices).toContain(4);
    expect(steps.find((s) => s.label === 'Ensuring artifact registry')).toBeDefined();
    expect(steps.find((s) => s.label === 'Building from source')).toBeDefined();
    expect(steps.find((s) => s.label === 'Deploying revision')).toBeDefined();
    expect(steps.find((s) => s.label === 'Waiting for revision to serve traffic')).toBeDefined();
  });

  it('emits step 3 + 4 only when image is provided directly (no build path)', async () => {
    const sdk_clients = new Map<string, unknown>([
      [
        'run.services',
        {
          createService: async () => [{ promise: async () => undefined }],
          getService: async () => [{ uri: 'https://my-svc.run.app' }],
        },
      ],
    ]);
    const { ctx, steps } = build_ctx(new Map(), sdk_clients);
    const result = await cloud_run_handler.create('my-svc', { image: 'gcr.io/foo/bar:latest' }, ctx);

    expect(result.success).toBe(true);
    // total stays 4 even when AR + build are skipped — the consumer's bar
    // jumps ahead but never goes backward.
    assert_monotonic(steps, 4);
    const labels = steps.map((s) => s.label);
    expect(labels).toContain('Deploying revision');
    expect(labels).toContain('Waiting for revision to serve traffic');
    expect(labels).not.toContain('Ensuring artifact registry');
    expect(labels).not.toContain('Building from source');
  });
});

describe('cloud-functions handler — on_step milestones', () => {
  it('emits 2 milestones during create via SDK (submit + wait)', async () => {
    const sdk_clients = new Map<string, unknown>([
      [
        'functions',
        {
          createFunction: async () => [{ promise: async () => undefined }],
        },
      ],
    ]);
    const { ctx, steps } = build_ctx(new Map(), sdk_clients);
    const result = await cloud_functions_handler.create('my-fn', { runtime: 'nodejs20' }, ctx);

    expect(result.success).toBe(true);
    assert_monotonic(steps, 2);
    expect(steps.map((s) => s.label)).toEqual(['Submitting function build', 'Waiting for function to be ready']);
  });

  it('emits 2 milestones during create via REST fallback', async () => {
    const responses = new Map<string, unknown>([
      [
        'POST https://cloudfunctions.googleapis.com/v2/projects/test-project/locations/us-central1/functions?functionId=my-fn',
        { name: 'projects/test-project/locations/us-central1/operations/op-1' },
      ],
      [
        'GET https://cloudfunctions.googleapis.com/v2/projects/test-project/locations/us-central1/operations/op-1',
        { done: true },
      ],
    ]);
    const { ctx, steps } = build_ctx(responses);
    const result = await cloud_functions_handler.create('my-fn', { runtime: 'nodejs20' }, ctx);

    expect(result.success).toBe(true);
    assert_monotonic(steps, 2);
  });
});

describe('api-gateway handler — on_step milestones', () => {
  it('emits 3 milestones with openapi_spec (api + config + gateway)', async () => {
    const { ctx, steps } = build_ctx(new Map());
    const result = await api_gateway_handler.create('my-api', { openapi_spec: 'openapi: 3.0' }, ctx);

    expect(result.success).toBe(true);
    assert_monotonic(steps, 3);
    expect(steps.map((s) => s.label)).toEqual(['Creating API', 'Creating API config', 'Creating gateway']);
  });

  it('emits 1 milestone without openapi_spec (api only)', async () => {
    const { ctx, steps } = build_ctx(new Map());
    const result = await api_gateway_handler.create('my-api', {}, ctx);

    expect(result.success).toBe(true);
    assert_monotonic(steps, 1);
    expect(steps.map((s) => s.label)).toEqual(['Creating API']);
  });
});

describe('gke handler — on_step milestones', () => {
  it('emits 2 milestones during create (submit + wait)', async () => {
    const sdk_clients = new Map<string, unknown>([
      [
        'container',
        {
          createCluster: async () => [{ name: 'op-1' }],
          getOperation: async () => [{ status: 'DONE' }],
        },
      ],
    ]);
    const { ctx, steps } = build_ctx(new Map(), sdk_clients);
    const result = await gke_handler.create('my-cluster', {}, ctx);

    expect(result.success).toBe(true);
    assert_monotonic(steps, 2);
    expect(steps.map((s) => s.label)).toEqual(['Creating cluster', 'Waiting for cluster to become ready']);
  });
});

describe('cloud-build-helper — reportStep callback', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards build sub-state milestones at a fixed index', async () => {
    vi.useFakeTimers();
    // The helper polls Cloud Build status: simulate WORKING then SUCCESS so
    // it emits both labels before exiting.
    const calls = { count: 0 };
    const ctx: GCPHandlerContext = {
      project: 'test-project',
      region: 'us-central1',
      clients: new Map(),
      rest_client: {
        get: async (url: string) => {
          if (url.includes('/builds/')) {
            calls.count += 1;
            // First poll → WORKING; second poll → SUCCESS.
            return { status: calls.count === 1 ? 'WORKING' : 'SUCCESS' };
          }
          return {};
        },
        post: async (url: string) => {
          if (url.includes('/builds')) {
            return { metadata: { build: { id: 'build-1' } } };
          }
          return {};
        },
        patch: async () => ({}),
        delete: async () => ({}),
      },
    };
    const reported: Array<{ index: number; label: string }> = [];
    const promise = build_from_source(
      ctx,
      'us-central1',
      'foo/bar',
      'main',
      'us-central1-docker.pkg.dev/test-project/ice-images/my-svc:latest',
      undefined,
      (i, label) => reported.push({ index: i, label }),
    );
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
    }
    const result = await promise;

    expect(result).toBe('us-central1-docker.pkg.dev/test-project/ice-images/my-svc:latest');
    // Should have at least the submit and the WORKING label, both at the
    // same fixed index.
    expect(reported.length).toBeGreaterThanOrEqual(2);
    const submit = reported.find((r) => r.label === 'Submitting Cloud Build');
    const working = reported.find((r) => r.label === 'Cloud Build running');
    expect(submit).toBeDefined();
    expect(working).toBeDefined();
    // Index stays fixed across all sub-state refreshes.
    const indices = new Set(reported.map((r) => r.index));
    expect(indices.size).toBe(1);
  });

  it('does not throw if reportStep is undefined', async () => {
    vi.useFakeTimers();
    const ctx: GCPHandlerContext = {
      project: 'test-project',
      region: 'us-central1',
      clients: new Map(),
      rest_client: {
        get: async () => ({ status: 'SUCCESS' }),
        post: async () => ({ metadata: { build: { id: 'build-1' } } }),
        patch: async () => ({}),
        delete: async () => ({}),
      },
    };
    // No reportStep — should still complete.
    const promise = build_from_source(ctx, 'us-central1', 'foo/bar', 'main', 'image:latest');
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
    }
    const result = await promise;
    expect(result).toBe('image:latest');
  });

  it('ensure_artifact_registry tolerates 409 ALREADY_EXISTS', async () => {
    const ctx: GCPHandlerContext = {
      project: 'test-project',
      region: 'us-central1',
      clients: new Map(),
      rest_client: {
        get: async () => ({}),
        post: async () => {
          const err = new Error('ALREADY_EXISTS');
          (err as any).status = 409;
          throw err;
        },
        patch: async () => ({}),
        delete: async () => ({}),
      },
    };
    // Should not throw.
    await ensure_artifact_registry(ctx, 'us-central1', 'ice-images');
  });
});
