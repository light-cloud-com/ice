/**
 * Provider Registry
 *
 * Dynamic provider registration and management.
 */

import { InternalError, ProviderError } from '../types/errors';
import { success, failure } from '../types/result';
import type { IceError } from '../types/errors';
import type {
  ProviderName,
  ProviderConfig,
  ProviderClient,
  ProviderFactory,
  ProviderRegistry,
  ProviderCapabilities,
  HealthCheckResult,
} from '../types/providers';
import type { Result } from '../types/result';

// =============================================================================
// Provider Registry Implementation
// =============================================================================

/**
 * Registry for managing provider clients.
 */
export class DefaultProviderRegistry implements ProviderRegistry {
  private factories: Map<ProviderName, ProviderFactory> = new Map();
  private clients: Map<string, ProviderClient> = new Map();
  private capabilities: Map<ProviderName, ProviderCapabilities> = new Map();

  /**
   * Register a provider client factory.
   *
   * findings.md #41 — registering the same name twice silently
   * replaced the factory, so a typo or accidental double-register
   * during plugin discovery quietly broke whichever caller hit the
   * registry first. We now warn on collision (and keep the
   * last-write-wins behaviour, since a future opt-in plugin host
   * may legitimately replace a built-in provider).
   */
  register(name: ProviderName, factory: ProviderFactory): void {
    if (this.factories.has(name)) {
      console.warn(
        `[provider-registry] register("${name}") replacing an existing factory — last write wins. Investigate the duplicate registration.`,
      );
    }
    this.factories.set(name, factory);
  }

  /**
   * Get a provider client (creates one if needed).
   */
  async get(config: ProviderConfig): Promise<ProviderClient> {
    const cache_key = this.get_cache_key(config);

    // Return cached client if available
    const cached = this.clients.get(cache_key);
    if (cached) {
      return cached;
    }

    // Get factory
    const factory = this.factories.get(config.provider);
    if (!factory) {
      throw new ProviderError(`Provider not registered: ${config.provider}`, config.provider, 'PROVIDER_NOT_FOUND');
    }

    // Create client
    const client = await factory(config);
    this.clients.set(cache_key, client);

    return client;
  }

  /**
   * Check if a provider is registered.
   */
  has(name: ProviderName): boolean {
    return this.factories.has(name);
  }

  /**
   * List all registered providers.
   */
  list(): ProviderName[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get provider capabilities.
   */
  get_capabilities(name: ProviderName): ProviderCapabilities | undefined {
    return this.capabilities.get(name);
  }

  /**
   * Set provider capabilities.
   */
  set_capabilities(name: ProviderName, caps: ProviderCapabilities): void {
    this.capabilities.set(name, caps);
  }

  /**
   * Unregister a provider.
   */
  unregister(name: ProviderName): void {
    this.factories.delete(name);
    this.capabilities.delete(name);

    // Remove cached clients
    for (const [key, client] of this.clients) {
      if (client.provider === name) {
        this.clients.delete(key);
      }
    }
  }

  /**
   * Clear all cached clients.
   */
  clear_cache(): void {
    this.clients.clear();
  }

  /**
   * Health check all providers that have been instantiated.
   *
   * findings.md #42 — this method only iterates `this.clients`,
   * which is populated by `get(config)` on first use. Providers
   * that are registered but never instantiated stay invisible to
   * the health report. The lazy semantics are intentional:
   * instantiating a provider has side effects (env-credential
   * lookups, network probes during construction, etc.) and a
   * health-check call should not silently force them. Callers that
   * want a "register-and-probe" sweep should call `get()` for each
   * registered provider explicitly before calling this method.
   */
  async health_check_all(): Promise<Map<ProviderName, HealthCheckResult>> {
    const results = new Map<ProviderName, HealthCheckResult>();

    for (const [_key, client] of this.clients) {
      try {
        const result = await client.health_check();
        results.set(client.provider, result);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        results.set(client.provider, {
          healthy: false,
          message: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Get cache key for a config.
   */
  private get_cache_key(config: ProviderConfig): string {
    const parts = [config.provider];
    if (config.region) parts.push(config.region);
    if (config.credentials.type === 'environment') {
      const env_creds = config.credentials as { profile?: string };
      if (env_creds.profile) {
        parts.push(env_creds.profile);
      }
    }
    return parts.join(':');
  }
}

// =============================================================================
// Provider Manager
// =============================================================================

/**
 * Options for provider manager.
 */
export interface ProviderManagerOptions {
  /** Whether to auto-discover providers */
  readonly auto_discover?: boolean;

  /** Default timeout for provider operations (ms) */
  readonly default_timeout_ms?: number;

  /** Default retry count */
  readonly default_retries?: number;

  /** Health check interval (ms, 0 to disable) */
  readonly health_check_interval_ms?: number;
}

/**
 * High-level provider management.
 */
export class ProviderManager {
  private readonly registry: DefaultProviderRegistry;
  private readonly options: Required<ProviderManagerOptions>;
  private health_check_timer?: NodeJS.Timeout;

  constructor(options: ProviderManagerOptions = {}) {
    this.registry = new DefaultProviderRegistry();
    this.options = {
      auto_discover: options.auto_discover ?? true,
      default_timeout_ms: options.default_timeout_ms ?? 30000,
      default_retries: options.default_retries ?? 3,
      health_check_interval_ms: options.health_check_interval_ms ?? 0,
    };

    if (this.options.health_check_interval_ms > 0) {
      this.start_health_checks();
    }
  }

  /**
   * Get the underlying registry.
   */
  get_registry(): ProviderRegistry {
    return this.registry;
  }

  /**
   * Register a provider factory.
   */
  register_provider(name: ProviderName, factory: ProviderFactory, capabilities?: ProviderCapabilities): void {
    this.registry.register(name, factory);
    if (capabilities) {
      this.registry.set_capabilities(name, capabilities);
    }
  }

  /**
   * Get a provider client with default settings applied.
   */
  async get_provider(config: ProviderConfig): Promise<Result<ProviderClient, IceError>> {
    try {
      const full_config: ProviderConfig = {
        ...config,
        timeout_ms: config.timeout_ms ?? this.options.default_timeout_ms,
        max_retries: config.max_retries ?? this.options.default_retries,
      };

      const client = await this.registry.get(full_config);
      return success(client);
    } catch (error) {
      if (error instanceof ProviderError) {
        return failure(error);
      }
      const err = error instanceof Error ? error : new Error(String(error));
      return failure(
        new InternalError(
          `Failed to get provider: ${err.message}`,
          'INTERNAL_ERROR',
          { provider: config.provider },
          err,
        ),
      );
    }
  }

  /**
   * Check if a provider supports a resource type.
   */
  supports_type(provider: ProviderName, ice_type: string): boolean {
    const caps = this.registry.get_capabilities(provider);
    if (!caps) return false;
    return caps.supported_types.includes(ice_type);
  }

  /**
   * Get providers that support a resource type.
   */
  get_providers_for_type(ice_type: string): ProviderName[] {
    const result: ProviderName[] = [];

    for (const provider of this.registry.list()) {
      if (this.supports_type(provider, ice_type)) {
        result.push(provider);
      }
    }

    return result;
  }

  /**
   * Get all provider capabilities.
   */
  get_all_capabilities(): Map<ProviderName, ProviderCapabilities> {
    const result = new Map<ProviderName, ProviderCapabilities>();

    for (const provider of this.registry.list()) {
      const caps = this.registry.get_capabilities(provider);
      if (caps) {
        result.set(provider, caps);
      }
    }

    return result;
  }

  /**
   * Discover and auto-register available providers.
   */
  async discover_providers(): Promise<ProviderName[]> {
    const discovered: ProviderName[] = [];

    // Try to dynamically import provider packages
    const provider_packages = [
      { name: 'aws', package: '@ice-engine/provider-aws' },
      { name: 'azure', package: '@ice-engine/provider-azure' },
      { name: 'gcp', package: '@ice-engine/provider-gcp' },
      { name: 'kubernetes', package: '@ice-engine/provider-kubernetes' },
    ];

    for (const { name, package: pkg } of provider_packages) {
      try {
        const module = await import(pkg).catch(() => null);
        if (module && typeof module.create_provider_factory === 'function') {
          const factory = module.create_provider_factory();
          const capabilities = module.get_capabilities?.();

          this.register_provider(name, factory, capabilities);
          discovered.push(name);
        }
      } catch {
        // Provider not available
      }
    }

    return discovered;
  }

  /**
   * Start periodic health checks.
   */
  private start_health_checks(): void {
    this.health_check_timer = setInterval(async () => {
      await this.registry.health_check_all();
    }, this.options.health_check_interval_ms);
  }

  /**
   * Stop health checks and cleanup.
   */
  dispose(): void {
    if (this.health_check_timer) {
      clearInterval(this.health_check_timer);
      this.health_check_timer = undefined;
    }
    this.registry.clear_cache();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new provider registry.
 */
export function create_provider_registry(): DefaultProviderRegistry {
  return new DefaultProviderRegistry();
}

/**
 * Create a new provider manager.
 */
export function create_provider_manager(options?: ProviderManagerOptions): ProviderManager {
  return new ProviderManager(options);
}

// =============================================================================
// Singleton
// =============================================================================

let global_registry: DefaultProviderRegistry | null = null;

/**
 * Get the global provider registry.
 */
export function get_global_registry(): DefaultProviderRegistry {
  if (!global_registry) {
    global_registry = new DefaultProviderRegistry();
  }
  return global_registry;
}

/**
 * Set the global provider registry.
 */
export function set_global_registry(registry: DefaultProviderRegistry): void {
  global_registry = registry;
}
