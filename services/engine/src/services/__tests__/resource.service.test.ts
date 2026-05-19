/**
 * Unit tests for `services/engine/src/services/resource.service.ts`.
 *
 * The service lazily dynamic-imports `@ice/core`. We mock that module per
 * test so each export's branching (category lookup, search filter, optional
 * helper missing, fallback to []) is exercised in isolation.
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
  get getHighLevelResourcesForPalette() {
    return h.coreImpl.getHighLevelResourcesForPalette;
  },
  get filterResourcesByProvider() {
    return h.coreImpl.filterResourcesByProvider;
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
  { id: 'compute.container', name: 'Container', description: 'Run images', implementations: [{ id: 'gcp.run' }, { id: 'aws.fargate' }] },
  { id: 'data.postgres', name: 'Postgres', description: 'SQL database', implementations: [{ id: 'gcp.cloudsql' }] },
  { id: 'storage.bucket', name: 'Bucket' /* no description or implementations */ },
];

const sampleCategories = [
  { id: 'compute', name: 'Compute', resources: [{ id: 'compute.container' }] },
  { id: 'data', name: 'Data', resources: [{ id: 'data.postgres' }] },
  { id: 'empty', name: 'Empty' /* missing resources */ },
];

function mockCore(impl: any) {
  h.coreImpl = impl;
}

describe('getCategories', () => {
  it('returns HIGH_LEVEL_CATEGORIES verbatim when present', async () => {
    mockCore({ HIGH_LEVEL_CATEGORIES: sampleCategories });
    const svc = await import('../resource.service');
    expect(await svc.getCategories()).toBe(sampleCategories);
  });

  it('returns [] when HIGH_LEVEL_CATEGORIES is missing', async () => {
    mockCore({});
    const svc = await import('../resource.service');
    expect(await svc.getCategories()).toEqual([]);
  });
});

describe('getAll', () => {
  it('delegates to core.getAllHighLevelResources()', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../resource.service');
    expect(await svc.getAll()).toBe(sampleResources);
  });

  it('returns [] when core.getAllHighLevelResources is undefined', async () => {
    mockCore({});
    const svc = await import('../resource.service');
    expect(await svc.getAll()).toEqual([]);
  });
});

describe('getForPalette', () => {
  it('delegates to core.getHighLevelResourcesForPalette()', async () => {
    mockCore({ getHighLevelResourcesForPalette: () => [{ id: 'p' }] });
    const svc = await import('../resource.service');
    expect(await svc.getForPalette()).toEqual([{ id: 'p' }]);
  });

  it('returns [] when core.getHighLevelResourcesForPalette is undefined', async () => {
    mockCore({});
    const svc = await import('../resource.service');
    expect(await svc.getForPalette()).toEqual([]);
  });
});

describe('getByCategory', () => {
  it('returns resources for the matching category', async () => {
    mockCore({ HIGH_LEVEL_CATEGORIES: sampleCategories });
    const svc = await import('../resource.service');
    expect(await svc.getByCategory('compute')).toEqual([{ id: 'compute.container' }]);
  });

  it('returns [] when the category id does not exist', async () => {
    mockCore({ HIGH_LEVEL_CATEGORIES: sampleCategories });
    const svc = await import('../resource.service');
    expect(await svc.getByCategory('unknown')).toEqual([]);
  });

  it('returns [] when the category exists but has no resources field', async () => {
    mockCore({ HIGH_LEVEL_CATEGORIES: sampleCategories });
    const svc = await import('../resource.service');
    expect(await svc.getByCategory('empty')).toEqual([]);
  });

  it('returns [] when HIGH_LEVEL_CATEGORIES is missing entirely', async () => {
    mockCore({});
    const svc = await import('../resource.service');
    expect(await svc.getByCategory('compute')).toEqual([]);
  });
});

describe('search', () => {
  it('finds matches by name (case-insensitive)', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../resource.service');
    expect((await svc.search('CONTAINER')).map((r: any) => r.id)).toEqual(['compute.container']);
  });

  it('finds matches by description (case-insensitive)', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../resource.service');
    expect((await svc.search('database')).map((r: any) => r.id)).toEqual(['data.postgres']);
  });

  it('returns [] when nothing matches', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../resource.service');
    expect(await svc.search('not-present')).toEqual([]);
  });

  it('handles resources missing description (does not throw)', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../resource.service');
    // 'bucket' matches by name; storage.bucket has no description but
    // the optional-chained `r.description?.toLowerCase()` must not throw.
    expect((await svc.search('bucket')).map((r: any) => r.id)).toEqual(['storage.bucket']);
  });

  it('returns [] when core.getAllHighLevelResources is missing', async () => {
    mockCore({});
    const svc = await import('../resource.service');
    expect(await svc.search('anything')).toEqual([]);
  });
});

describe('getLowLevel', () => {
  it('returns implementations for the matching high-level resource', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../resource.service');
    expect(await svc.getLowLevel('compute.container')).toEqual([{ id: 'gcp.run' }, { id: 'aws.fargate' }]);
  });

  it('returns [] when the high-level id does not exist', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../resource.service');
    expect(await svc.getLowLevel('does.not.exist')).toEqual([]);
  });

  it('returns [] when the matching resource has no implementations field', async () => {
    mockCore({ getAllHighLevelResources: () => sampleResources });
    const svc = await import('../resource.service');
    expect(await svc.getLowLevel('storage.bucket')).toEqual([]);
  });

  it('returns [] when getAllHighLevelResources is missing', async () => {
    mockCore({});
    const svc = await import('../resource.service');
    expect(await svc.getLowLevel('anything')).toEqual([]);
  });
});

describe('getByProvider', () => {
  it('delegates to core.filterResourcesByProvider(provider)', async () => {
    const filterFn = vi.fn(() => [{ id: 'compute.container' }]);
    mockCore({ filterResourcesByProvider: filterFn });
    const svc = await import('../resource.service');
    const result = await svc.getByProvider('gcp');
    expect(result).toEqual([{ id: 'compute.container' }]);
    expect(filterFn).toHaveBeenCalledWith('gcp');
  });

  it('returns [] when core.filterResourcesByProvider is missing', async () => {
    mockCore({});
    const svc = await import('../resource.service');
    expect(await svc.getByProvider('gcp')).toEqual([]);
  });
});

// Note: the SUT's catch arm (lines 14-19) — the stub core fallback when
// `await import('@ice/core')` itself rejects — is structurally unreachable
// from a vitest test that hoists `vi.mock`. A factory that throws would
// be registered before `resetModules`, leaking into every downstream test
// in the file. Coverage exception is documented in the run report.
