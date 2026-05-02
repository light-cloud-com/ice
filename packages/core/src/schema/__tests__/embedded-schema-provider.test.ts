/**
 * Tests for `embedded-schema-provider.ts`.
 *
 * The orchestrator class delegates almost every method to a helper
 * extracted into `embedded/*`. We mock the helper modules so we can
 * assert dispatch behaviour and exercise:
 *  - constructor (with + without explicit db_path)
 *  - initialize: lazy single-shot, success path, registry-null InternalError,
 *    helper throws -> InternalError, and emit_event('initialized')
 *  - delegation of every getter to its helper, with the registry/cache
 *    arguments forwarded
 *  - graph methods forward registry + ice_type + max_depth (default 10)
 *  - on/off forward to add_listener/remove_listener with the correct map
 *  - factory functions
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initialize_registry: vi.fn(),
  resolve_db_path: vi.fn(() => undefined),
  add_listener: vi.fn(),
  remove_listener: vi.fn(),
  emit_event: vi.fn(),
  q_get_schema: vi.fn(async () => ({ ok: true, value: 'schema' })),
  q_has_schema: vi.fn(() => true),
  q_query_schemas: vi.fn(async () => ({ ok: true, value: { schemas: [], total: 0, has_more: false } })),
  q_get_categories: vi.fn(() => ['compute']),
  q_get_providers: vi.fn(() => [{ name: 'aws', source: 'terraform', resource_count: 100 }]),
  q_get_implementation: vi.fn(() => ({ source: 'terraform', provider: 'aws', native_type: 'aws_instance' })),
  q_get_native_type: vi.fn(() => 'aws_instance'),
  q_get_property_schema: vi.fn(() => ({ name: 'p' })),
  q_get_required_properties: vi.fn(() => [{ name: 'p' }]),
  q_get_computed_properties: vi.fn(() => [{ name: 'arn' }]),
  q_get_stats: vi.fn(() => ({ total_schemas: 1 })),
  make_query_cache: vi.fn(() => ({ providers: null, stats: null })),
  g_get_dependencies: vi.fn(async () => ({ ok: true, value: [] })),
  g_get_dependents: vi.fn(async () => ({ ok: true, value: [] })),
  g_get_equivalents: vi.fn(async () => ({ ok: true, value: [] })),
}));

vi.mock('../embedded/initialization.js', () => ({
  initialize_registry: mocks.initialize_registry,
  resolve_db_path: mocks.resolve_db_path,
}));

vi.mock('../embedded/events.js', () => ({
  add_listener: mocks.add_listener,
  remove_listener: mocks.remove_listener,
  emit_event: mocks.emit_event,
}));

vi.mock('../embedded/queries.js', () => ({
  get_schema: mocks.q_get_schema,
  has_schema: mocks.q_has_schema,
  query_schemas: mocks.q_query_schemas,
  get_categories: mocks.q_get_categories,
  get_providers: mocks.q_get_providers,
  get_implementation: mocks.q_get_implementation,
  get_native_type: mocks.q_get_native_type,
  get_property_schema: mocks.q_get_property_schema,
  get_required_properties: mocks.q_get_required_properties,
  get_computed_properties: mocks.q_get_computed_properties,
  get_stats: mocks.q_get_stats,
  make_query_cache: mocks.make_query_cache,
}));

vi.mock('../embedded/graph-queries.js', () => ({
  get_dependencies: mocks.g_get_dependencies,
  get_dependents: mocks.g_get_dependents,
  get_equivalents: mocks.g_get_equivalents,
}));

import {
  EmbeddedSchemaProvider,
  create_embedded_schema_provider,
  create_embedded_schema_provider_with_registry,
} from '../embedded-schema-provider.js';
import type { IceType } from '../schema-provider.js';

const FAKE_REGISTRY = { __id: 'fake-registry' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initialize_registry.mockResolvedValue(FAKE_REGISTRY);
  mocks.resolve_db_path.mockReturnValue(undefined);
  mocks.make_query_cache.mockReturnValue({ providers: null, stats: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EmbeddedSchemaProvider.initialize', () => {
  it('uses resolve_db_path() when no db_path is passed to the constructor', async () => {
    mocks.resolve_db_path.mockReturnValue('/resolved/path.db');
    const provider = new EmbeddedSchemaProvider();
    const r = await provider.initialize();
    expect(r.ok).toBe(true);
    expect(mocks.resolve_db_path).toHaveBeenCalled();
    expect(mocks.initialize_registry).toHaveBeenCalledWith('/resolved/path.db');
  });

  it('uses the explicit db_path when provided', async () => {
    const provider = new EmbeddedSchemaProvider('/explicit/path.db');
    await provider.initialize();
    expect(mocks.resolve_db_path).not.toHaveBeenCalled();
    expect(mocks.initialize_registry).toHaveBeenCalledWith('/explicit/path.db');
  });

  it('emits an initialized event on success', async () => {
    const provider = new EmbeddedSchemaProvider('/x');
    await provider.initialize();
    expect(mocks.emit_event).toHaveBeenCalledWith(expect.any(Map), 'initialized', undefined, undefined);
  });

  it('returns InternalError when initialize_registry resolves to null', async () => {
    mocks.initialize_registry.mockResolvedValue(null);
    const provider = new EmbeddedSchemaProvider('/x');
    const r = await provider.initialize();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INTERNAL_ERROR');
      expect(r.error.message).toContain('@ice-engine/schemas/db not available');
    }
  });

  it('wraps a thrown Error in InternalError', async () => {
    mocks.initialize_registry.mockRejectedValue(new Error('boom'));
    const provider = new EmbeddedSchemaProvider('/x');
    const r = await provider.initialize();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INTERNAL_ERROR');
      expect(r.error.message).toContain('boom');
    }
  });

  it('coerces a non-Error rejection (e.g. a string) into an InternalError', async () => {
    mocks.initialize_registry.mockRejectedValue('plain-string');
    const provider = new EmbeddedSchemaProvider('/x');
    const r = await provider.initialize();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('INTERNAL_ERROR');
      expect(r.error.message).toContain('plain-string');
    }
  });

  it('is idempotent — second initialize() short-circuits on the cached state', async () => {
    const provider = new EmbeddedSchemaProvider('/x');
    await provider.initialize();
    mocks.initialize_registry.mockClear();
    const r = await provider.initialize();
    expect(r.ok).toBe(true);
    expect(mocks.initialize_registry).not.toHaveBeenCalled();
  });
});

describe('query delegation', () => {
  let provider: EmbeddedSchemaProvider;

  beforeEach(async () => {
    provider = new EmbeddedSchemaProvider('/x');
    await provider.initialize();
  });

  it('get_schema forwards (registry, ice_type)', async () => {
    await provider.get_schema('aws.ec2.instance' as IceType);
    expect(mocks.q_get_schema).toHaveBeenCalledWith(FAKE_REGISTRY, 'aws.ec2.instance');
  });

  it('has_schema forwards (registry, ice_type)', () => {
    provider.has_schema('aws.ec2.instance' as IceType);
    expect(mocks.q_has_schema).toHaveBeenCalledWith(FAKE_REGISTRY, 'aws.ec2.instance');
  });

  it('query forwards (registry, query)', async () => {
    await provider.query({ search: 'foo' });
    expect(mocks.q_query_schemas).toHaveBeenCalledWith(FAKE_REGISTRY, { search: 'foo' });
  });

  it('get_categories forwards the registry', () => {
    provider.get_categories();
    expect(mocks.q_get_categories).toHaveBeenCalledWith(FAKE_REGISTRY);
  });

  it('get_providers forwards (registry, query_cache)', () => {
    provider.get_providers();
    expect(mocks.q_get_providers).toHaveBeenCalledWith(FAKE_REGISTRY, expect.objectContaining({ providers: null }));
  });

  it('get_implementation forwards (registry, ice_type, source, provider)', () => {
    provider.get_implementation('x' as IceType, 'terraform', 'aws');
    expect(mocks.q_get_implementation).toHaveBeenCalledWith(FAKE_REGISTRY, 'x', 'terraform', 'aws');
  });

  it('get_native_type forwards (registry, ice_type, source, provider)', () => {
    provider.get_native_type('x' as IceType, 'terraform', 'aws');
    expect(mocks.q_get_native_type).toHaveBeenCalledWith(FAKE_REGISTRY, 'x', 'terraform', 'aws');
  });

  it('get_property_schema forwards (registry, ice_type, path)', () => {
    provider.get_property_schema('x' as IceType, 'name');
    expect(mocks.q_get_property_schema).toHaveBeenCalledWith(FAKE_REGISTRY, 'x', 'name');
  });

  it('get_required_properties forwards (registry, ice_type)', () => {
    provider.get_required_properties('x' as IceType);
    expect(mocks.q_get_required_properties).toHaveBeenCalledWith(FAKE_REGISTRY, 'x');
  });

  it('get_computed_properties forwards (registry, ice_type)', () => {
    provider.get_computed_properties('x' as IceType);
    expect(mocks.q_get_computed_properties).toHaveBeenCalledWith(FAKE_REGISTRY, 'x');
  });

  it('get_stats forwards (registry, query_cache)', () => {
    provider.get_stats();
    expect(mocks.q_get_stats).toHaveBeenCalledWith(FAKE_REGISTRY, expect.objectContaining({ providers: null }));
  });
});

describe('graph delegation', () => {
  let provider: EmbeddedSchemaProvider;

  beforeEach(async () => {
    provider = new EmbeddedSchemaProvider('/x');
    await provider.initialize();
  });

  it('get_dependencies defaults max_depth to 10', async () => {
    await provider.get_dependencies('x' as IceType);
    expect(mocks.g_get_dependencies).toHaveBeenCalledWith(FAKE_REGISTRY, 'x', 10);
  });

  it('get_dependencies forwards explicit max_depth', async () => {
    await provider.get_dependencies('x' as IceType, 3);
    expect(mocks.g_get_dependencies).toHaveBeenCalledWith(FAKE_REGISTRY, 'x', 3);
  });

  it('get_dependents defaults max_depth to 10', async () => {
    await provider.get_dependents('x' as IceType);
    expect(mocks.g_get_dependents).toHaveBeenCalledWith(FAKE_REGISTRY, 'x', 10);
  });

  it('get_dependents forwards explicit max_depth', async () => {
    await provider.get_dependents('x' as IceType, 5);
    expect(mocks.g_get_dependents).toHaveBeenCalledWith(FAKE_REGISTRY, 'x', 5);
  });

  it('get_equivalents forwards (registry, ice_type)', async () => {
    await provider.get_equivalents('x' as IceType);
    expect(mocks.g_get_equivalents).toHaveBeenCalledWith(FAKE_REGISTRY, 'x');
  });
});

describe('event subscription', () => {
  it('on(...) forwards to add_listener with the listener map', () => {
    const provider = new EmbeddedSchemaProvider('/x');
    const listener = vi.fn();
    provider.on('initialized', listener);
    expect(mocks.add_listener).toHaveBeenCalledWith(expect.any(Map), 'initialized', listener);
  });

  it('off(...) forwards to remove_listener with the listener map', () => {
    const provider = new EmbeddedSchemaProvider('/x');
    const listener = vi.fn();
    provider.off('initialized', listener);
    expect(mocks.remove_listener).toHaveBeenCalledWith(expect.any(Map), 'initialized', listener);
  });
});

describe('factory functions', () => {
  it('create_embedded_schema_provider returns an EmbeddedSchemaProvider', () => {
    expect(create_embedded_schema_provider('/db')).toBeInstanceOf(EmbeddedSchemaProvider);
  });

  it('create_embedded_schema_provider_with_registry returns an EmbeddedSchemaProvider (compat shim)', () => {
    const provider = create_embedded_schema_provider_with_registry(async () => ({}));
    expect(provider).toBeInstanceOf(EmbeddedSchemaProvider);
  });
});
