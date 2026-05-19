/**
 * Unit tests for `services/ai/src/services/ai-schema-context.service.ts`.
 *
 * The service lazily dynamic-imports `@ice/core` and caches the result
 * for 5 minutes. We mock `@ice/core` with property getters reading from a
 * `vi.hoisted` bag (per `vitest-4-strict-mock-surface-and-throwing-
 * factory-needs-isolated-file`) so each test can swap the surface and
 * `vi.resetModules()` clears the in-module cache.
 *
 * The catch branch in `getCachedSchemas` (lines 45-49) requires the
 * mocked `import('@ice/core')` to REJECT — a hoisted throwing factory
 * poisons every downstream test, so that one branch lives in a sibling
 * file: `ai-schema-context.service.import-failure.test.ts`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  h.coreImpl = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockCore(impl: any) {
  h.coreImpl = impl;
}

async function load() {
  return await import('../ai-schema-context.service');
}

describe('buildSchemaContext — empty / fall-through cases', () => {
  it('returns "" when @ice/core exposes no resources or categories', async () => {
    mockCore({});
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({ existingIceTypes: [], dominantProvider: 'gcp' });
    expect(out).toBe('');
  });

  it('returns "" when sections come up empty (no iceTypes match, no provider matches)', async () => {
    // Resources exist but none match the dominant provider AND maxExtra is 0.
    mockCore({
      getAllHighLevelResources: () => [{ id: 'r1', name: 'R1', implementations: [{ provider: 'aws' }] }],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: [],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toBe('');
  });
});

describe('buildSchemaContext — existing iceTypes', () => {
  it('emits a section for each iceType already on the canvas', async () => {
    mockCore({
      getAllHighLevelResources: () => [
        { id: 'postgres', name: 'Postgres' },
        { id: 'redis', name: 'Redis' },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['postgres', 'redis'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('### Postgres');
    expect(out).toContain('### Redis');
  });

  it('skips an iceType the catalogue does not know about', async () => {
    mockCore({
      getAllHighLevelResources: () => [{ id: 'postgres', name: 'Postgres' }],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['unknown'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toBe('');
  });
});

describe('buildSchemaContext — provider filter / maxExtra', () => {
  it('includes resources whose implementations contain the dominant provider', async () => {
    mockCore({
      getAllHighLevelResources: () => [
        { id: 'a', name: 'A', implementations: [{ provider: 'gcp' }, { provider: 'aws' }] },
        { id: 'b', name: 'B', implementations: [{ provider: 'aws' }] },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: [],
      dominantProvider: 'gcp',
    });
    expect(out).toContain('### A');
    expect(out).not.toContain('### B');
  });

  it('still includes a resource that has NO implementations array (provider-agnostic)', async () => {
    mockCore({
      getAllHighLevelResources: () => [
        { id: 'a', name: 'A' /* no implementations */ },
        { id: 'b', name: 'B', implementations: [] },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: [],
      dominantProvider: 'gcp',
    });
    expect(out).toContain('### A');
    expect(out).toContain('### B');
  });

  it('honours maxExtra — stops after that many additional resources', async () => {
    mockCore({
      getAllHighLevelResources: () => Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, name: `R${i}` })),
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: [],
      dominantProvider: 'gcp',
      maxExtra: 2,
    });
    expect(out).toContain('### R0');
    expect(out).toContain('### R1');
    expect(out).not.toContain('### R2');
  });

  it('defaults maxExtra to 10 when omitted', async () => {
    mockCore({
      getAllHighLevelResources: () => Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, name: `R${i}` })),
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({ existingIceTypes: [], dominantProvider: 'gcp' });
    // First 10 resources (default cap) appear; the 11th does not.
    for (let i = 0; i < 10; i++) {
      expect(out).toContain(`### R${i}`);
    }
    expect(out).not.toContain('### R10');
  });

  it('does not double-count an iceType already included by the existingIceTypes pass', async () => {
    mockCore({
      getAllHighLevelResources: () => [
        { id: 'shared', name: 'Shared' },
        { id: 'extra', name: 'Extra' },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['shared'],
      dominantProvider: 'gcp',
      maxExtra: 1,
    });
    // Shared appears once (the `### Shared` header), Extra is the 1 maxExtra slot.
    expect(out.match(/### Shared/g)?.length).toBe(1);
    expect(out).toContain('### Extra');
  });
});

describe('buildSchemaContext — categories supplement allResources', () => {
  it('adds resources from HIGH_LEVEL_CATEGORIES that are not already in allResources', async () => {
    mockCore({
      getAllHighLevelResources: () => [{ id: 'a', name: 'A' }],
      HIGH_LEVEL_CATEGORIES: [
        {
          resources: [
            { id: 'a', name: 'A-from-cat' },
            { id: 'b', name: 'B' },
          ],
        },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['a', 'b'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    // The first-add wins: `a` is from allResources, `b` from categories.
    expect(out).toContain('### A');
    expect(out).not.toContain('### A-from-cat');
    expect(out).toContain('### B');
  });

  it('treats a category with no `resources` field as empty (no crash)', async () => {
    mockCore({
      getAllHighLevelResources: () => [{ id: 'a', name: 'A' }],
      HIGH_LEVEL_CATEGORIES: [{}],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['a'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('### A');
  });
});

describe('buildSchemaContext — formatResource', () => {
  it('falls back from name to id when name is missing', async () => {
    mockCore({
      getAllHighLevelResources: () => [{ id: 'fallback-id' /* no name */ }],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['fallback-id'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('### fallback-id');
  });

  it('emits a Properties line listing each property name, type, and required-flag', async () => {
    mockCore({
      getAllHighLevelResources: () => [
        {
          id: 'r',
          name: 'R',
          properties: [
            { id: 'host', type: 'string', required: true },
            { name: 'port', inputType: 'number' /* not required */ },
          ],
        },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['r'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('Properties: host (string, required), port (number, optional)');
  });

  it('appends "|" separated option values (string options and {value|id} objects)', async () => {
    mockCore({
      getAllHighLevelResources: () => [
        {
          id: 'r',
          name: 'R',
          properties: [
            {
              id: 'tier',
              type: 'enum',
              required: false,
              options: ['free', { value: 'pro' }, { id: 'ent' }],
            },
          ],
        },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['r'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('tier (enum, optional): "free"|"pro"|"ent"');
  });

  it('appends a [default: ...] suffix when prop.default is set (incl. falsy values like 0/false)', async () => {
    mockCore({
      getAllHighLevelResources: () => [
        {
          id: 'r',
          name: 'R',
          properties: [
            { id: 'count', type: 'number', default: 0 },
            { id: 'active', type: 'boolean', default: false },
          ],
        },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['r'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('count (number, optional) [default: 0]');
    expect(out).toContain('active (boolean, optional) [default: false]');
  });

  it('falls back to "string" when neither type nor inputType is present', async () => {
    mockCore({
      getAllHighLevelResources: () => [{ id: 'r', name: 'R', properties: [{ id: 'naked' /* no type */ }] }],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['r'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('naked (string, optional)');
  });

  it('emits a Providers line listing "<provider> → <name|id>" pairs', async () => {
    mockCore({
      getAllHighLevelResources: () => [
        {
          id: 'r',
          name: 'R',
          implementations: [
            { provider: 'gcp', name: 'cloud-run' },
            { provider: 'aws', id: 'fargate' /* no name */ },
          ],
        },
      ],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['r'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('Providers: gcp → cloud-run, aws → fargate');
  });

  it('omits empty Properties / Providers lines when the arrays are absent', async () => {
    mockCore({
      getAllHighLevelResources: () => [{ id: 'r', name: 'R' /* nothing else */ }],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['r'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out).toContain('### R');
    expect(out).not.toContain('Properties:');
    expect(out).not.toContain('Providers:');
  });
});

describe('buildSchemaContext — top-level shape', () => {
  it('wraps the sections in the "## Available Resource Schemas" header', async () => {
    mockCore({
      getAllHighLevelResources: () => [{ id: 'a', name: 'A' }],
    });
    const { buildSchemaContext } = await load();
    const out = await buildSchemaContext({
      existingIceTypes: ['a'],
      dominantProvider: 'gcp',
      maxExtra: 0,
    });
    expect(out.startsWith('\n## Available Resource Schemas')).toBe(true);
    expect(out).toContain('Use these exact property names');
    expect(out).toContain('### A');
  });
});

describe('buildSchemaContext — caching', () => {
  it('reuses the previous import result on a subsequent call within the TTL', async () => {
    const spy = vi.fn(() => [{ id: 'a', name: 'A' }]);
    mockCore({ getAllHighLevelResources: spy });
    const { buildSchemaContext } = await load();
    await buildSchemaContext({ existingIceTypes: ['a'], dominantProvider: 'gcp', maxExtra: 0 });
    await buildSchemaContext({ existingIceTypes: ['a'], dominantProvider: 'gcp', maxExtra: 0 });
    // The cached result is hit on the second call; getAllHighLevelResources is
    // only called once (during the first cache miss).
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('repopulates the cache after the TTL window elapses', async () => {
    const spy = vi.fn(() => [{ id: 'a', name: 'A' }]);
    mockCore({ getAllHighLevelResources: spy });
    const { buildSchemaContext } = await load();
    await buildSchemaContext({ existingIceTypes: ['a'], dominantProvider: 'gcp', maxExtra: 0 });

    const past = Date.now() + 6 * 60 * 1000; // > 5 min TTL
    const realNow = Date.now;
    Date.now = () => past;
    try {
      await buildSchemaContext({ existingIceTypes: ['a'], dominantProvider: 'gcp', maxExtra: 0 });
    } finally {
      Date.now = realNow;
    }
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
