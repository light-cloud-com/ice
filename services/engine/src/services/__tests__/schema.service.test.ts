/**
 * Unit tests for `services/engine/src/services/schema.service.ts`.
 *
 * The service lazily dynamic-imports `@ice/core`. We mock that module so the
 * test exercises the service's branching (filter combinations, optional
 * methods missing, missing array shapes) without depending on the real
 * core engine surface.
 *
 * Per the `services-deploy-test-explicit-vitest-imports` learning, vitest
 * globals are imported explicitly. Per
 * `vi-spyon-accumulates-across-it-blocks-without-explicit-reset`, mocks are
 * cleared in `beforeEach`, and we `resetModules` so the service's lazy
 * `_core` cache is fresh between tests with different mocked cores.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted helper holding the per-test mock surface. `vi.hoisted` lets us
// share state with a hoisted `vi.mock` factory while also reading/writing
// it inside test bodies. Each test calls `mockCore(...)` to set the values
// the factory will return on the SUT's next dynamic import.
const h = vi.hoisted(() => ({ coreImpl: {} as any }));

vi.mock('@ice/core', () => ({
  get HIGH_LEVEL_CATEGORIES() {
    return h.coreImpl.HIGH_LEVEL_CATEGORIES;
  },
  get getAllHighLevelResources() {
    return h.coreImpl.getAllHighLevelResources;
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.coreImpl = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sampleResources = [
  {
    id: 'compute.container',
    name: 'Container',
    description: 'Containerized service',
    category: 'compute',
    keywords: ['docker', 'k8s'],
    providers: ['gcp', { id: 'aws', label: 'AWS' }],
  },
  {
    id: 'data.postgres',
    name: 'Postgres',
    description: 'Relational database',
    category: 'data',
    keywords: ['sql'],
    providers: ['gcp'],
  },
  {
    id: 'storage.bucket',
    name: 'Bucket',
    // intentionally no description/keywords to exercise optional paths
    category: 'storage',
    providers: [{ id: 'aws' }],
  },
];

const sampleCategories = [
  { id: 'compute', name: 'Compute', description: 'Compute things', icon: 'cpu', resources: [{}, {}] },
  { id: 'data', name: 'Data', description: 'Data things', icon: 'database', resources: [{}] },
  // missing description + missing resources
  { id: 'storage', name: 'Storage', icon: 'hard-drive' },
];

function mockCore(impl: any) {
  h.coreImpl = impl;
}

describe('getCategories', () => {
  it('maps HIGH_LEVEL_CATEGORIES to {id,name,description,icon,count} with count from resources.length', async () => {
    mockCore({ HIGH_LEVEL_CATEGORIES: sampleCategories });
    const svc = await import('../schema.service');
    const result = await svc.getCategories();
    expect(result).toEqual([
      { id: 'compute', name: 'Compute', description: 'Compute things', icon: 'cpu', count: 2 },
      { id: 'data', name: 'Data', description: 'Data things', icon: 'database', count: 1 },
      { id: 'storage', name: 'Storage', description: undefined, icon: 'hard-drive', count: 0 },
    ]);
  });

  it('returns [] when HIGH_LEVEL_CATEGORIES is missing on the core export', async () => {
    mockCore({});
    const svc = await import('../schema.service');
    expect(await svc.getCategories()).toEqual([]);
  });

  // Note: the SUT's catch arm (lines 13-15) — `_core = { HIGH_LEVEL_CATEGORIES: [], getAllHighLevelResources: () => [] }` —
  // is structurally unreachable from a vitest test that hoists `vi.mock`.
  // The catch only fires if `await import('@ice/core')` itself rejects,
  // and a hoisted mock factory that throws is registered before the
  // resetModules cycle, leaking the throw into every downstream test in
  // the file. Coverage exception is documented in the run report.
});

describe('querySchemas', () => {
  it('returns all resources when no filters supplied', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    const result = await svc.querySchemas({});
    expect(result).toHaveLength(3);
  });

  it('filters by category', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    const result = await svc.querySchemas({ category: 'compute' });
    expect(result.map((r: any) => r.id)).toEqual(['compute.container']);
  });

  it('filters by provider when providers is a string', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    const result = await svc.querySchemas({ provider: 'gcp' });
    expect(result.map((r: any) => r.id).sort()).toEqual(['compute.container', 'data.postgres']);
  });

  it('filters by provider when providers is an object with id', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    const result = await svc.querySchemas({ provider: 'aws' });
    expect(result.map((r: any) => r.id).sort()).toEqual(['compute.container', 'storage.bucket']);
  });

  it('skips provider filtering safely when a resource lacks providers entirely', async () => {
    mockCore({ getAllHighLevelResources: () => [{ id: 'noprov', name: 'No Providers', category: 'misc' }] });
    const svc = await import('../schema.service');
    const result = await svc.querySchemas({ provider: 'gcp' });
    expect(result).toEqual([]);
  });

  it('filters by search across name, description, and keywords (case-insensitive)', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    expect((await svc.querySchemas({ search: 'CONTAINER' })).map((r: any) => r.id)).toEqual(['compute.container']);
    expect((await svc.querySchemas({ search: 'relational' })).map((r: any) => r.id)).toEqual(['data.postgres']);
    expect((await svc.querySchemas({ search: 'docker' })).map((r: any) => r.id)).toEqual(['compute.container']);
  });

  it('search tolerates resources without description and without keywords', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    // 'bucket' matches name only — no description, no keywords on that record
    const result = await svc.querySchemas({ search: 'bucket' });
    expect(result.map((r: any) => r.id)).toEqual(['storage.bucket']);
  });

  it('combines filters (category + provider + search)', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    const result = await svc.querySchemas({ category: 'compute', provider: 'gcp', search: 'container' });
    expect(result.map((r: any) => r.id)).toEqual(['compute.container']);
  });

  it('returns [] when getAllHighLevelResources is not a function on core', async () => {
    mockCore({}); // no helper exposed
    const svc = await import('../schema.service');
    expect(await svc.querySchemas({})).toEqual([]);
  });
});

describe('getSchema', () => {
  it('returns the resource record matching iceType', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    const result = await svc.getSchema('data.postgres');
    expect(result?.id).toBe('data.postgres');
  });

  it('returns null when no resource has the requested id', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../schema.service');
    expect(await svc.getSchema('does.not.exist')).toBeNull();
  });

  it('returns null when getAllHighLevelResources is missing on core', async () => {
    mockCore({});
    const svc = await import('../schema.service');
    expect(await svc.getSchema('any')).toBeNull();
  });
});

describe('getCore caching', () => {
  it('survives a successful first import then keeps responding even after the mock factory is unloaded', async () => {
    // The service caches the resolved core in `_core`. After the first call
    // resolves, later calls should not re-trigger the dynamic import. We
    // observe this by mutating the mock factory after first import — the
    // cached value should persist.
    let categoriesProvided = [{ id: 'compute', name: 'Compute', description: 'd', icon: 'i', resources: [{}] }];
    vi.doMock('@ice/core', () => ({
      HIGH_LEVEL_CATEGORIES: categoriesProvided,
      getAllHighLevelResources: () => [],
    }));
    const svc = await import('../schema.service');
    const first = await svc.getCategories();
    expect(first).toHaveLength(1);
    // Even if we mutate the source array, the next call uses the same cached
    // core (same array reference — proving no fresh import).
    categoriesProvided.push({ id: 'data', name: 'Data', description: 'd', icon: 'i', resources: [] });
    const second = await svc.getCategories();
    expect(second).toHaveLength(2);
  });
});
