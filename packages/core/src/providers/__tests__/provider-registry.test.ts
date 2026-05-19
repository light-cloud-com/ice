/**
 * Tests for the provider registry and provider manager.
 *
 * Covers:
 *  - DefaultProviderRegistry: register/has/list/get caching, missing-provider
 *    error, capabilities lookup, unregister cache eviction, health-check rollup.
 *  - ProviderManager: factory wiring, get_provider Result wrapping, type
 *    capability lookup, discovery (with import miss), periodic health checks,
 *    dispose tear-down.
 *  - Singleton helpers: get_global_registry / set_global_registry.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DefaultProviderRegistry,
  ProviderManager,
  create_provider_registry,
  create_provider_manager,
  get_global_registry,
  set_global_registry,
} from '../provider-registry';
import { ProviderError, InternalError } from '../../types/errors';
import type {
  ProviderClient,
  ProviderConfig,
  ProviderFactory,
  ProviderCapabilities,
  HealthCheckResult,
} from '../../types/providers';

// Stub one of the auto-discovered provider packages so discover_providers
// reaches the success branch (lines 300-304 of provider-registry.ts).
vi.mock('@ice-engine/provider-aws', () => ({
  create_provider_factory: vi.fn(() => async (config: ProviderConfig): Promise<ProviderClient> => {
    return {
      provider: config.provider,
      region: config.region,
      health_check: vi.fn(async () => ({ healthy: true })),
      deploy: vi.fn(),
      update: vi.fn(),
      destroy: vi.fn(),
      get_state: vi.fn(),
      refresh_state: vi.fn(),
      supports_type: vi.fn(() => true),
      get_native_type: vi.fn((t: string) => t),
    } as unknown as ProviderClient;
  }),
  get_capabilities: vi.fn(() => ({
    provider: 'aws',
    supported_types: ['Ec2.Vpc'],
    regions: ['us-east-1'],
    max_parallel_operations: 5,
    supports_preview: true,
    supports_import: true,
    supports_tags: true,
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────

function make_config(
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  return {
    provider: 'test',
    region: 'us-east-1',
    credentials: { provider: 'test', type: 'environment' },
    ...overrides,
  };
}

function make_client(
  provider: string,
  health: HealthCheckResult | (() => Promise<HealthCheckResult>) = {
    healthy: true,
  },
): ProviderClient {
  return {
    provider,
    region: 'us-east-1',
    health_check: vi.fn(async () =>
      typeof health === 'function' ? await health() : health,
    ),
    deploy: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    get_state: vi.fn(),
    refresh_state: vi.fn(),
    supports_type: vi.fn(() => true),
    get_native_type: vi.fn((t) => t),
  } as unknown as ProviderClient;
}

function make_factory(client?: ProviderClient): ProviderFactory {
  return vi.fn(async (config: ProviderConfig) =>
    client ?? make_client(config.provider),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset singleton between tests so set_global_registry behaviour is observable.
  set_global_registry(null as unknown as DefaultProviderRegistry);
});

// ─── Pre-existing core.test.ts cases (moved verbatim) ───────────────

describe('Provider Registry', () => {
  it('should create empty registry', () => {
    const registry = create_provider_registry();
    expect(registry.list()).toHaveLength(0);
  });

  it('should register provider factory', () => {
    const registry = create_provider_registry();

    registry.register('test', async () => ({
      provider: 'test',
      create: async () => ({ success: true, resource_id: 'test-1', outputs: {} }),
      read: async () => ({ exists: true, properties: {}, outputs: {} }),
      update: async () => ({ success: true, resource_id: 'test-1', outputs: {} }),
      delete: async () => ({ success: true }),
      health_check: async () => ({ healthy: true }),
    }) as unknown as ProviderClient);

    expect(registry.has('test')).toBe(true);
    expect(registry.list()).toContain('test');
  });

  it('should create provider manager', () => {
    const manager = create_provider_manager();
    expect(manager).toBeDefined();
    expect(manager.get_registry()).toBeDefined();
    manager.dispose();
  });

  it('warns when register is called twice for the same name (findings #41)', () => {
    // Last-write-wins behaviour is preserved — a future plugin host
    // may legitimately replace a built-in — but the silent override
    // used to mask typo'd / accidental double-registers in plugin
    // discovery. The warning surfaces them.
    const registry = create_provider_registry();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const make_factory = (id: string) => async () => ({ provider: id }) as unknown as ProviderClient;
    registry.register('dup', make_factory('first'));
    expect(warnSpy).not.toHaveBeenCalled();

    registry.register('dup', make_factory('second'));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/register\("dup"\) replacing an existing factory/),
    );
    warnSpy.mockRestore();
  });
});

// ─── DefaultProviderRegistry ────────────────────────────────────────

describe('DefaultProviderRegistry.get', () => {
  it('returns a freshly constructed client when no cached entry exists', async () => {
    const registry = new DefaultProviderRegistry();
    const client = make_client('aws');
    const factory = make_factory(client);
    registry.register('aws', factory);

    const got = await registry.get(make_config({ provider: 'aws' }));

    expect(got).toBe(client);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('caches clients by provider/region/profile composite key', async () => {
    const registry = new DefaultProviderRegistry();
    const factory = make_factory();
    registry.register('aws', factory);

    const config = make_config({ provider: 'aws' });
    const first = await registry.get(config);
    const second = await registry.get(config);

    expect(second).toBe(first);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('builds distinct cache keys when only the region differs', async () => {
    const registry = new DefaultProviderRegistry();
    const factory = make_factory();
    registry.register('aws', factory);

    await registry.get(make_config({ provider: 'aws', region: 'us-east-1' }));
    await registry.get(make_config({ provider: 'aws', region: 'eu-west-2' }));

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('uses provider-only cache key when region is omitted', async () => {
    const registry = new DefaultProviderRegistry();
    const factory = make_factory();
    registry.register('aws', factory);

    const config: ProviderConfig = {
      provider: 'aws',
      credentials: { provider: 'aws', type: 'environment' },
    };

    await registry.get(config);
    await registry.get(config);

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('appends profile to the cache key for environment credentials', async () => {
    const registry = new DefaultProviderRegistry();
    const factory = make_factory();
    registry.register('aws', factory);

    await registry.get(
      make_config({
        provider: 'aws',
        credentials: { provider: 'aws', type: 'environment', profile: 'dev' },
      }),
    );
    await registry.get(
      make_config({
        provider: 'aws',
        credentials: { provider: 'aws', type: 'environment', profile: 'prod' },
      }),
    );

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('does not append profile when env credentials omit it', async () => {
    const registry = new DefaultProviderRegistry();
    const factory = make_factory();
    registry.register('aws', factory);

    await registry.get(
      make_config({
        provider: 'aws',
        credentials: { provider: 'aws', type: 'environment' },
      }),
    );
    await registry.get(
      make_config({
        provider: 'aws',
        credentials: { provider: 'aws', type: 'environment' },
      }),
    );

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('ignores profile for non-environment credential types', async () => {
    const registry = new DefaultProviderRegistry();
    const factory = make_factory();
    registry.register('aws', factory);

    await registry.get(
      make_config({
        provider: 'aws',
        credentials: { provider: 'aws', type: 'access_key' } as unknown as ProviderConfig['credentials'],
      }),
    );
    await registry.get(
      make_config({
        provider: 'aws',
        credentials: { provider: 'aws', type: 'access_key' } as unknown as ProviderConfig['credentials'],
      }),
    );

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('throws ProviderError tagged PROVIDER_NOT_FOUND when no factory is registered', async () => {
    const registry = new DefaultProviderRegistry();

    await expect(registry.get(make_config({ provider: 'azure' }))).rejects.toMatchObject({
      code: 'PROVIDER_NOT_FOUND',
      provider: 'azure',
    });
  });

  it('rethrows the registry-level ProviderError as a ProviderError instance', async () => {
    const registry = new DefaultProviderRegistry();
    let caught: unknown;
    try {
      await registry.get(make_config({ provider: 'gcp' }));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProviderError);
  });
});

describe('DefaultProviderRegistry register/has/list', () => {
  it('overrides the prior factory when register is called twice', async () => {
    const registry = new DefaultProviderRegistry();
    const first_client = make_client('aws');
    const second_client = make_client('aws');

    registry.register('aws', async () => first_client);
    registry.register('aws', async () => second_client);

    const got = await registry.get(make_config({ provider: 'aws' }));
    expect(got).toBe(second_client);
  });

  it('reports has() correctly for registered and unregistered providers', () => {
    const registry = new DefaultProviderRegistry();
    registry.register('aws', make_factory());
    expect(registry.has('aws')).toBe(true);
    expect(registry.has('gcp')).toBe(false);
  });

  it('lists every registered provider name', () => {
    const registry = new DefaultProviderRegistry();
    registry.register('aws', make_factory());
    registry.register('gcp', make_factory());
    registry.register('azure', make_factory());

    expect(registry.list().sort()).toEqual(['aws', 'azure', 'gcp']);
  });
});

describe('DefaultProviderRegistry capabilities', () => {
  const caps: ProviderCapabilities = {
    provider: 'aws',
    supported_types: ['Ec2.Vpc', 'S3.Bucket'],
    regions: ['us-east-1'],
    max_parallel_operations: 5,
    supports_preview: true,
    supports_import: true,
    supports_tags: true,
  };

  it('returns undefined for an unknown provider', () => {
    const registry = new DefaultProviderRegistry();
    expect(registry.get_capabilities('aws')).toBeUndefined();
  });

  it('round-trips capabilities via set/get', () => {
    const registry = new DefaultProviderRegistry();
    registry.set_capabilities('aws', caps);
    expect(registry.get_capabilities('aws')).toBe(caps);
  });
});

describe('DefaultProviderRegistry unregister & clear_cache', () => {
  it('removes the factory, capabilities, and any cached clients for the provider', async () => {
    const registry = new DefaultProviderRegistry();
    const aws_client = make_client('aws');
    registry.register('aws', async () => aws_client);
    registry.set_capabilities('aws', {
      provider: 'aws',
      supported_types: ['x'],
      regions: [],
      max_parallel_operations: 1,
      supports_preview: false,
      supports_import: false,
      supports_tags: false,
    });
    await registry.get(make_config({ provider: 'aws' }));

    registry.unregister('aws');

    expect(registry.has('aws')).toBe(false);
    expect(registry.get_capabilities('aws')).toBeUndefined();
    await expect(registry.get(make_config({ provider: 'aws' }))).rejects.toBeInstanceOf(ProviderError);
  });

  it('leaves cached clients from other providers untouched', async () => {
    const registry = new DefaultProviderRegistry();
    const aws_factory = make_factory();
    const gcp_factory = make_factory();
    registry.register('aws', aws_factory);
    registry.register('gcp', gcp_factory);

    await registry.get(make_config({ provider: 'aws' }));
    await registry.get(make_config({ provider: 'gcp' }));

    registry.unregister('aws');

    // gcp client should still be cached — second get must not re-invoke factory.
    await registry.get(make_config({ provider: 'gcp' }));
    expect(gcp_factory).toHaveBeenCalledTimes(1);
  });

  it('clears every cached client when clear_cache is called', async () => {
    const registry = new DefaultProviderRegistry();
    const factory = make_factory();
    registry.register('aws', factory);

    await registry.get(make_config({ provider: 'aws' }));
    registry.clear_cache();
    await registry.get(make_config({ provider: 'aws' }));

    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('DefaultProviderRegistry.health_check_all', () => {
  it('returns an empty map when no clients have been instantiated', async () => {
    const registry = new DefaultProviderRegistry();
    registry.register('aws', make_factory());

    const results = await registry.health_check_all();
    expect(results.size).toBe(0);
  });

  it('aggregates health results keyed by provider name', async () => {
    const registry = new DefaultProviderRegistry();
    registry.register(
      'aws',
      async () => make_client('aws', { healthy: true, latency_ms: 1 }),
    );
    await registry.get(make_config({ provider: 'aws' }));

    const results = await registry.health_check_all();
    expect(results.get('aws')).toEqual({ healthy: true, latency_ms: 1 });
  });

  it('records a non-Error throw as an unhealthy result with the stringified message', async () => {
    const registry = new DefaultProviderRegistry();
    registry.register('aws', async () =>
      make_client('aws', async () => {
        throw 'boom-string';
      }),
    );
    await registry.get(make_config({ provider: 'aws' }));

    const results = await registry.health_check_all();
    expect(results.get('aws')).toEqual({
      healthy: false,
      message: 'boom-string',
    });
  });

  it('records an Error throw with its native message', async () => {
    const registry = new DefaultProviderRegistry();
    registry.register('aws', async () =>
      make_client('aws', async () => {
        throw new Error('network down');
      }),
    );
    await registry.get(make_config({ provider: 'aws' }));

    const results = await registry.health_check_all();
    expect(results.get('aws')).toEqual({
      healthy: false,
      message: 'network down',
    });
  });
});

// ─── ProviderManager ─────────────────────────────────────────────────

describe('ProviderManager construction & defaults', () => {
  it('applies documented defaults when no options are passed', async () => {
    const manager = new ProviderManager();
    let captured: ProviderConfig | null = null;
    manager.register_provider('aws', async (config) => {
      captured = config;
      return make_client('aws');
    });

    await manager.get_provider(make_config({ provider: 'aws' }));

    expect(captured).not.toBeNull();
    expect(captured!.timeout_ms).toBe(30000);
    expect(captured!.max_retries).toBe(3);
    manager.dispose();
  });

  it('respects caller-supplied timeout_ms / max_retries over manager defaults', async () => {
    const manager = new ProviderManager({ default_timeout_ms: 1000, default_retries: 1 });
    let captured: ProviderConfig | null = null;
    manager.register_provider('aws', async (config) => {
      captured = config;
      return make_client('aws');
    });

    await manager.get_provider(
      make_config({ provider: 'aws', timeout_ms: 9999, max_retries: 7 }),
    );

    expect(captured!.timeout_ms).toBe(9999);
    expect(captured!.max_retries).toBe(7);
    manager.dispose();
  });
});

describe('ProviderManager.register_provider', () => {
  it('registers without capabilities by default', () => {
    const manager = new ProviderManager();
    manager.register_provider('aws', make_factory());
    expect(manager.get_registry().has('aws')).toBe(true);
    expect(manager.get_registry().get_capabilities('aws')).toBeUndefined();
    manager.dispose();
  });

  it('also stores capabilities when the third argument is supplied', () => {
    const manager = new ProviderManager();
    const caps: ProviderCapabilities = {
      provider: 'aws',
      supported_types: ['S3.Bucket'],
      regions: [],
      max_parallel_operations: 1,
      supports_preview: false,
      supports_import: false,
      supports_tags: false,
    };
    manager.register_provider('aws', make_factory(), caps);
    expect(manager.get_registry().get_capabilities('aws')).toBe(caps);
    manager.dispose();
  });
});

describe('ProviderManager.get_provider', () => {
  it('returns success Result with the client', async () => {
    const manager = new ProviderManager();
    const client = make_client('aws');
    manager.register_provider('aws', async () => client);

    const result = await manager.get_provider(make_config({ provider: 'aws' }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(client);
    }
    manager.dispose();
  });

  it('passes ProviderError through as a failure Result', async () => {
    const manager = new ProviderManager();

    const result = await manager.get_provider(make_config({ provider: 'aws' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ProviderError);
      expect(result.error.code).toBe('PROVIDER_NOT_FOUND');
    }
    manager.dispose();
  });

  it('wraps non-ProviderError throws in InternalError', async () => {
    const manager = new ProviderManager();
    manager.register_provider('aws', async () => {
      throw new Error('factory exploded');
    });

    const result = await manager.get_provider(make_config({ provider: 'aws' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InternalError);
      expect(result.error.code).toBe('INTERNAL_ERROR');
      expect(result.error.message).toContain('factory exploded');
    }
    manager.dispose();
  });

  it('stringifies non-Error throws when wrapping into InternalError', async () => {
    const manager = new ProviderManager();
    manager.register_provider('aws', async () => {
      throw 'plain string failure';
    });

    const result = await manager.get_provider(make_config({ provider: 'aws' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InternalError);
      expect(result.error.message).toContain('plain string failure');
    }
    manager.dispose();
  });
});

describe('ProviderManager type-capability helpers', () => {
  function build_manager_with_caps(): ProviderManager {
    const manager = new ProviderManager();
    manager.register_provider('aws', make_factory(), {
      provider: 'aws',
      supported_types: ['Ec2.Vpc', 'S3.Bucket'],
      regions: [],
      max_parallel_operations: 1,
      supports_preview: false,
      supports_import: false,
      supports_tags: false,
    });
    manager.register_provider('gcp', make_factory(), {
      provider: 'gcp',
      supported_types: ['S3.Bucket'],
      regions: [],
      max_parallel_operations: 1,
      supports_preview: false,
      supports_import: false,
      supports_tags: false,
    });
    // Provider with no capabilities recorded
    manager.register_provider('azure', make_factory());
    return manager;
  }

  it('supports_type returns false for providers with no capabilities', () => {
    const manager = build_manager_with_caps();
    expect(manager.supports_type('azure', 'S3.Bucket')).toBe(false);
    manager.dispose();
  });

  it('supports_type returns true when the type is in supported_types', () => {
    const manager = build_manager_with_caps();
    expect(manager.supports_type('aws', 'S3.Bucket')).toBe(true);
    manager.dispose();
  });

  it('supports_type returns false when the type is not in supported_types', () => {
    const manager = build_manager_with_caps();
    expect(manager.supports_type('aws', 'unknown.type')).toBe(false);
    manager.dispose();
  });

  it('get_providers_for_type returns every provider whose capabilities cover the type', () => {
    const manager = build_manager_with_caps();
    expect(manager.get_providers_for_type('S3.Bucket').sort()).toEqual(['aws', 'gcp']);
    expect(manager.get_providers_for_type('Ec2.Vpc')).toEqual(['aws']);
    manager.dispose();
  });

  it('get_providers_for_type returns empty when no providers cover the type', () => {
    const manager = build_manager_with_caps();
    expect(manager.get_providers_for_type('nothing')).toEqual([]);
    manager.dispose();
  });

  it('get_all_capabilities skips providers that have none registered', () => {
    const manager = build_manager_with_caps();
    const all = manager.get_all_capabilities();
    expect([...all.keys()].sort()).toEqual(['aws', 'gcp']);
    manager.dispose();
  });
});

describe('ProviderManager.discover_providers', () => {
  it('registers any provider package whose import resolves and exposes create_provider_factory', async () => {
    const manager = new ProviderManager();
    const discovered = await manager.discover_providers();

    // The mocked '@ice-engine/provider-aws' module is the only one resolvable.
    expect(discovered).toEqual(['aws']);
    expect(manager.get_registry().has('aws')).toBe(true);
    expect(manager.get_registry().get_capabilities('aws')?.provider).toBe('aws');
    manager.dispose();
  });

  it('skips packages whose dynamic import fails (azure / gcp / kubernetes are unmocked)', async () => {
    const manager = new ProviderManager();
    const discovered = await manager.discover_providers();
    expect(discovered).not.toContain('gcp');
    expect(discovered).not.toContain('azure');
    expect(discovered).not.toContain('kubernetes');
    manager.dispose();
  });
});

describe('ProviderManager periodic health checks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs health_check_all on the configured interval until disposed', async () => {
    const manager = new ProviderManager({ health_check_interval_ms: 1000 });
    const spy = vi.spyOn(manager.get_registry(), 'health_check_all').mockResolvedValue(new Map());

    await vi.advanceTimersByTimeAsync(2500);
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);

    manager.dispose();
    spy.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not start a timer when interval is 0', async () => {
    const manager = new ProviderManager({ health_check_interval_ms: 0 });
    const spy = vi.spyOn(manager.get_registry(), 'health_check_all').mockResolvedValue(new Map());

    await vi.advanceTimersByTimeAsync(5000);
    expect(spy).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('dispose is safe to call when no timer is active', () => {
    const manager = new ProviderManager({ health_check_interval_ms: 0 });
    expect(() => manager.dispose()).not.toThrow();
    expect(() => manager.dispose()).not.toThrow();
  });
});

// ─── Singleton helpers ─────────────────────────────────────────────

describe('global registry singleton', () => {
  it('lazily creates a registry on first access', () => {
    const registry = get_global_registry();
    expect(registry).toBeInstanceOf(DefaultProviderRegistry);
  });

  it('returns the same instance on subsequent calls', () => {
    const a = get_global_registry();
    const b = get_global_registry();
    expect(a).toBe(b);
  });

  it('set_global_registry replaces the current singleton', () => {
    const original = get_global_registry();
    const replacement = new DefaultProviderRegistry();
    set_global_registry(replacement);
    expect(get_global_registry()).toBe(replacement);
    expect(get_global_registry()).not.toBe(original);
  });
});
