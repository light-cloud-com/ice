/**
 * Tests for `embedded/queries.ts` (rf-esp-2).
 *
 * Behaviour pinned (preserved from pre-extraction methods of
 * `EmbeddedSchemaProvider`):
 *  - get_schema: null registry -> InternalError; missing resource -> NOT_IMPLEMENTED.
 *  - query_schemas: forwards SchemaQuery via to_sqlite_query, maps result.
 *  - has_schema/get_categories/get_native_type: null-safe defaults.
 *  - get_providers/get_stats: lazy cache; null registry returns [] / EMPTY_STATS.
 *  - get_implementation: null impl -> undefined; null docs_url -> undefined.
 *  - get_property_schema: null registry -> undefined; missing prop -> undefined.
 *  - get_required_properties/get_computed_properties: null registry -> [].
 */
import { describe, expect, it, vi } from 'vitest';
import {
  get_categories,
  get_computed_properties,
  get_implementation,
  get_native_type,
  get_property_schema,
  get_providers,
  get_required_properties,
  get_schema,
  get_stats,
  has_schema,
  make_query_cache,
  query_schemas,
} from '../embedded/queries.js';
import type {
  SqliteImplementation,
  SqliteProperty,
  SqliteResourceType,
  SqliteSchemaRegistry,
} from '../embedded/sqlite-types.js';
import type { IceType } from '../schema-provider.js';

function baseProp(over: Partial<SqliteProperty> = {}): SqliteProperty {
  return {
    id: 1,
    resource_type_id: 1,
    name: 'p',
    type: 'string',
    description: null,
    required: false,
    computed: false,
    sensitive: false,
    deprecated: false,
    default_value: null,
    parent_property_id: null,
    element_type: null,
    ...over,
  };
}
function baseResource(over: Partial<SqliteResourceType> = {}): SqliteResourceType {
  return {
    id: 1,
    ice_type: 'aws.ec2.instance',
    display_name: 'EC2',
    description: null,
    category: 'compute',
    icon: null,
    source: 'terraform',
    deprecated: false,
    deprecation_message: null,
    ...over,
  };
}

function baseImpl(over: Partial<SqliteImplementation> = {}): SqliteImplementation {
  return {
    id: 1,
    resource_type_id: 1,
    source: 'terraform',
    provider_name: 'aws',
    native_type: 'aws_instance',
    docs_url: null,
    provider_version: null,
    ...over,
  };
}

function makeRegistry(over: Partial<SqliteSchemaRegistry> = {}): SqliteSchemaRegistry {
  return {
    get: vi.fn(() => null),
    has: vi.fn(() => false),
    query: vi.fn(() => ({ resources: [], total: 0, has_more: false })),
    get_properties: vi.fn(() => []),
    get_implementations: vi.fn(() => []),
    get_categories: vi.fn(() => []),
    get_providers: vi.fn(() => []),
    get_implementation: vi.fn(() => null),
    get_native_type: vi.fn(() => null),
    get_property: vi.fn(() => null),
    get_required_properties: vi.fn(() => []),
    get_computed_properties: vi.fn(() => []),
    get_stats: vi.fn(() => ({
      total_resources: 0,
      total_implementations: 0,
      total_relationships: 0,
      total_properties: 0,
      categories: {},
      providers: {},
      sources: {},
    })),
    ...over,
  } as unknown as SqliteSchemaRegistry;
}

describe('get_schema', () => {
  it('null registry returns InternalError', async () => {
    const r = await get_schema(null, 'x' as IceType);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INTERNAL_ERROR');
  });

  it('missing resource returns NOT_IMPLEMENTED', async () => {
    const reg = makeRegistry({ get: vi.fn(() => null) });
    const r = await get_schema(reg, 'aws.unknown' as IceType);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('returns the schema converted from the row', async () => {
    const reg = makeRegistry({ get: vi.fn(() => baseResource({ ice_type: 'aws.ec2.instance' })) });
    const r = await get_schema(reg, 'aws.ec2.instance' as IceType);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ice_type).toBe('aws.ec2.instance');
  });
});

describe('has_schema', () => {
  it('null registry returns false', () => {
    expect(has_schema(null, 'x' as IceType)).toBe(false);
  });
  it('delegates to registry.has', () => {
    const has = vi.fn(() => true);
    expect(has_schema(makeRegistry({ has }) as SqliteSchemaRegistry, 'x' as IceType)).toBe(true);
    expect(has).toHaveBeenCalledWith('x');
  });
});

describe('query_schemas', () => {
  it('null registry returns InternalError', async () => {
    const r = await query_schemas(null, {});
    expect(r.ok).toBe(false);
  });

  it('forwards SchemaQuery fields and maps result', async () => {
    const query = vi.fn(() => ({
      resources: [baseResource({ ice_type: 'a' }), baseResource({ ice_type: 'b' })],
      total: 2,
      has_more: false,
    }));
    const reg = makeRegistry({ query });
    const r = await query_schemas(reg, { search: 'foo', limit: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.total).toBe(2);
      expect(r.value.has_more).toBe(false);
      expect(r.value.schemas).toHaveLength(2);
    }
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ search: 'foo', limit: 10 }));
  });
});

describe('get_categories', () => {
  it('null registry returns empty array', () => {
    expect(get_categories(null)).toEqual([]);
  });
  it('forwards from registry', () => {
    const reg = makeRegistry({ get_categories: vi.fn(() => ['compute', 'storage']) });
    expect(get_categories(reg)).toEqual(['compute', 'storage']);
  });
});

describe('get_providers', () => {
  it('null registry returns empty array (does not cache)', () => {
    const cache = make_query_cache();
    expect(get_providers(null, cache)).toEqual([]);
    expect(cache.providers).toBeNull();
  });

  it('caches the result and re-uses on subsequent calls', () => {
    const get_provs = vi.fn(() => [
      { name: 'aws', namespace: 'hashicorp', source: 'terraform' as const, resource_count: 100 },
    ]);
    const reg = makeRegistry({ get_providers: get_provs });
    const cache = make_query_cache();
    const a = get_providers(reg, cache);
    const b = get_providers(reg, cache);
    expect(a).toBe(b);
    expect(get_provs).toHaveBeenCalledTimes(1);
    expect(a[0]).toEqual({ name: 'aws', source: 'terraform', resource_count: 100 });
  });
});

describe('get_implementation', () => {
  it('null impl returns undefined', () => {
    const reg = makeRegistry({ get_implementation: vi.fn(() => null) });
    expect(get_implementation(reg, 'x' as IceType, 'terraform', 'aws')).toBeUndefined();
  });
  it('maps impl with null docs_url to undefined', () => {
    const reg = makeRegistry({ get_implementation: vi.fn(() => baseImpl({ docs_url: null })) });
    const out = get_implementation(reg, 'x' as IceType, 'terraform', 'aws');
    expect(out?.docs_url).toBeUndefined();
    expect(out?.provider).toBe('aws');
    expect(out?.native_type).toBe('aws_instance');
  });
});

describe('get_native_type', () => {
  it('null registry returns undefined', () => {
    expect(get_native_type(null, 'x' as IceType, 'terraform', 'aws')).toBeUndefined();
  });
  it('maps null from registry to undefined', () => {
    const reg = makeRegistry({ get_native_type: vi.fn(() => null) });
    expect(get_native_type(reg, 'x' as IceType, 'terraform', 'aws')).toBeUndefined();
  });
  it('forwards string value', () => {
    const reg = makeRegistry({ get_native_type: vi.fn(() => 'aws_instance') });
    expect(get_native_type(reg, 'x' as IceType, 'terraform', 'aws')).toBe('aws_instance');
  });
});

describe('get_property_schema', () => {
  it('null registry returns undefined', () => {
    expect(get_property_schema(null, 'x' as IceType, 'p')).toBeUndefined();
  });
  it('missing property returns undefined', () => {
    const reg = makeRegistry({ get_property: vi.fn(() => null) });
    expect(get_property_schema(reg, 'x' as IceType, 'p')).toBeUndefined();
  });
  it('converts the property when present', () => {
    const reg = makeRegistry({ get_property: vi.fn(() => baseProp({ name: 'instance_type' })) });
    expect(get_property_schema(reg, 'x' as IceType, 'instance_type')?.name).toBe('instance_type');
  });
});

describe('get_required_properties / get_computed_properties', () => {
  it('null registry returns empty arrays for both', () => {
    expect(get_required_properties(null, 'x' as IceType)).toEqual([]);
    expect(get_computed_properties(null, 'x' as IceType)).toEqual([]);
  });
  it('maps each row through convert_property', () => {
    const reg = makeRegistry({
      get_required_properties: vi.fn(() => [baseProp({ name: 'a' }), baseProp({ name: 'b' })]),
      get_computed_properties: vi.fn(() => [baseProp({ name: 'c' })]),
    });
    expect(get_required_properties(reg, 'x' as IceType).map((p) => p.name)).toEqual(['a', 'b']);
    expect(get_computed_properties(reg, 'x' as IceType).map((p) => p.name)).toEqual(['c']);
  });
});

describe('get_stats', () => {
  it('null registry returns empty stats default', () => {
    const cache = make_query_cache();
    const s = get_stats(null, cache);
    expect(s.total_schemas).toBe(0);
    expect(s.total_categories).toBe(0);
    expect(s.total_providers).toBe(0);
    expect(s.by_source).toEqual({ terraform: 0, pulumi: 0 });
    expect(s.by_category).toEqual({});
    expect(cache.stats).toBeNull();
  });

  it('counts categories/providers from object keys and caches', () => {
    const get_st = vi.fn(() => ({
      total_resources: 42,
      total_implementations: 0,
      total_relationships: 0,
      total_properties: 0,
      categories: { compute: 10, storage: 5 },
      providers: { aws: 1, gcp: 1, azure: 1 },
      sources: { terraform: 30, pulumi: 12 },
    }));
    const reg = makeRegistry({ get_stats: get_st });
    const cache = make_query_cache();
    const a = get_stats(reg, cache);
    const b = get_stats(reg, cache);
    expect(a).toBe(b);
    expect(get_st).toHaveBeenCalledTimes(1);
    expect(a.total_schemas).toBe(42);
    expect(a.total_categories).toBe(2);
    expect(a.total_providers).toBe(3);
    expect(a.by_source).toEqual({ terraform: 30, pulumi: 12 });
    expect(a.by_category).toEqual({ compute: 10, storage: 5 });
  });

  it('missing terraform/pulumi sources default to 0', () => {
    const reg = makeRegistry({
      get_stats: vi.fn(() => ({
        total_resources: 0,
        total_implementations: 0,
        total_relationships: 0,
        total_properties: 0,
        categories: {},
        providers: {},
        sources: {},
      })),
    });
    const cache = make_query_cache();
    const s = get_stats(reg, cache);
    expect(s.by_source).toEqual({ terraform: 0, pulumi: 0 });
  });
});
