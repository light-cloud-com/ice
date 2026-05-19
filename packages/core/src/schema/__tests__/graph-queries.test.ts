/**
 * Tests for `embedded/graph-queries.ts` (rf-esp-3).
 *
 * Behaviour pinned (preserved from pre-extraction methods of
 * `EmbeddedSchemaProvider`):
 *  - All three return InternalError when registry is null.
 *  - get_dependencies / get_dependents forward `max_depth` to the registry.
 *  - Each successful result maps registry rows through `convert_resource_to_schema`.
 *  - get_equivalents takes no max_depth (signature parity).
 */
import { describe, expect, it, vi } from 'vitest';
import { get_dependencies, get_dependents, get_equivalents } from '../embedded/graph-queries';
import type { SqliteResourceType, SqliteSchemaRegistry } from '../embedded/sqlite-types';
import type { IceType } from '../schema-provider';

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

function makeRegistry(over: Partial<SqliteSchemaRegistry> = {}): SqliteSchemaRegistry {
  return {
    get_properties: vi.fn(() => []),
    get_implementations: vi.fn(() => []),
    get_dependencies: vi.fn(() => []),
    get_dependents: vi.fn(() => []),
    get_equivalents: vi.fn(() => []),
    ...over,
  } as unknown as SqliteSchemaRegistry;
}

describe('get_dependencies', () => {
  it('null registry returns InternalError', async () => {
    const r = await get_dependencies(null, 'x' as IceType, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INTERNAL_ERROR');
  });

  it('forwards max_depth and converts each row', async () => {
    const get_deps = vi.fn(() => [
      baseResource({ ice_type: 'aws.ec2.subnet' }),
      baseResource({ ice_type: 'aws.ec2.vpc' }),
    ]);
    const reg = makeRegistry({ get_dependencies: get_deps });
    const r = await get_dependencies(reg, 'aws.ec2.instance' as IceType, 5);
    expect(r.ok).toBe(true);
    expect(get_deps).toHaveBeenCalledWith('aws.ec2.instance', 5);
    if (r.ok) {
      expect(r.value.map((s) => s.ice_type)).toEqual(['aws.ec2.subnet', 'aws.ec2.vpc']);
    }
  });

  it('empty registry result returns success with empty array', async () => {
    const reg = makeRegistry({ get_dependencies: vi.fn(() => []) });
    const r = await get_dependencies(reg, 'x' as IceType, 10);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });
});

describe('get_dependents', () => {
  it('null registry returns InternalError', async () => {
    const r = await get_dependents(null, 'x' as IceType, 10);
    expect(r.ok).toBe(false);
  });

  it('forwards max_depth and converts each row', async () => {
    const get_deps = vi.fn(() => [baseResource({ ice_type: 'aws.lambda.function' })]);
    const reg = makeRegistry({ get_dependents: get_deps });
    const r = await get_dependents(reg, 'aws.iam.role' as IceType, 3);
    expect(get_deps).toHaveBeenCalledWith('aws.iam.role', 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value[0]?.ice_type).toBe('aws.lambda.function');
  });
});

describe('get_equivalents', () => {
  it('null registry returns InternalError', async () => {
    const r = await get_equivalents(null, 'x' as IceType);
    expect(r.ok).toBe(false);
  });

  it('returns the converted equivalents', async () => {
    const get_eq = vi.fn(() => [baseResource({ ice_type: 'gcp.compute.instance', display_name: 'GCE' })]);
    const reg = makeRegistry({ get_equivalents: get_eq });
    const r = await get_equivalents(reg, 'aws.ec2.instance' as IceType);
    expect(get_eq).toHaveBeenCalledWith('aws.ec2.instance');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toHaveLength(1);
      expect(r.value[0]?.ice_type).toBe('gcp.compute.instance');
      expect(r.value[0]?.display_name).toBe('GCE');
    }
  });
});
