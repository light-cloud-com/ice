/**
 * Embedded Schema Provider
 *
 * Implementation of SchemaProvider that uses the SQLite-based schema registry.
 * Supports both the bundled base database and project-specific customized databases.
 */

import * as fs from 'fs';
import * as path from 'path';
import { InternalError } from '../types/errors.js';
import { success, failure } from '../types/result.js';
import type {
  IceType,
  PropertySchema,
  ProviderImplementation,
  ProviderInfo,
  ResourceSchema,
  SchemaEventListener,
  SchemaEventType,
  SchemaQuery,
  SchemaQueryResult,
  SchemaStats,
  ObservableSchemaProvider,
} from './schema-provider.js';
import type { IceError } from '../types/errors.js';
import type { Result } from '../types/result.js';
import type { SqliteSchemaRegistry } from './embedded/sqlite-types.js';
import { to_sqlite_query } from './embedded/sqlite-types.js';
import { convert_property, convert_resource_to_schema } from './embedded/converters.js';

// =============================================================================
// Extended Schema Provider Interface
// =============================================================================

/**
 * Extended schema provider with graph query capabilities.
 */
interface GraphSchemaProvider extends ObservableSchemaProvider {
  /**
   * Get dependencies for a resource type (resources it depends on).
   */
  get_dependencies(ice_type: IceType, max_depth?: number): Promise<Result<ResourceSchema[], IceError>>;

  /**
   * Get dependents for a resource type (resources that depend on it).
   */
  get_dependents(ice_type: IceType, max_depth?: number): Promise<Result<ResourceSchema[], IceError>>;

  /**
   * Get cross-provider equivalents for a resource type.
   */
  get_equivalents(ice_type: IceType): Promise<Result<ResourceSchema[], IceError>>;
}

// =============================================================================
// Embedded Schema Provider
// =============================================================================

/**
 * Schema provider using the SQLite-based schema registry.
 */
export class EmbeddedSchemaProvider implements GraphSchemaProvider {
  private registry: SqliteSchemaRegistry | null = null;
  private initialized = false;
  private event_listeners: Map<SchemaEventType, Set<SchemaEventListener>> = new Map();
  private cached_stats: SchemaStats | null = null;
  private cached_providers: ProviderInfo[] | null = null;
  private db_path: string | null = null;

  /**
   * Create an embedded schema provider.
   * @param db_path Optional explicit database path (for testing or overrides)
   */
  constructor(db_path?: string) {
    this.db_path = db_path ?? null;
  }

  /**
   * Initialize the provider.
   */
  async initialize(): Promise<Result<void, IceError>> {
    if (this.initialized) {
      return success(undefined);
    }

    try {
      // Dynamically import the schemas db module.
      // Graceful fallback: if the module or export doesn't exist, the provider runs without a registry.
      const schemas: Record<string, unknown> | null = await import("../schemas/db").catch(() => null);

      if (schemas && typeof schemas.get_schema_registry === 'function') {
        const factory = schemas.get_schema_registry as (dbPath?: string) => SqliteSchemaRegistry;
        const db_path = this.db_path ?? this.resolve_db_path();
        this.registry = factory(db_path);
      }

      if (!this.registry) {
        return failure(
          new InternalError(
            'Failed to initialize schema registry: @ice-engine/schemas/db not available',
            'INTERNAL_ERROR',
          ),
        );
      }

      this.initialized = true;
      this.emit_event('initialized');
      return success(undefined);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return failure(
        new InternalError(`Failed to initialize schema provider: ${err.message}`, 'INTERNAL_ERROR', {}, err),
      );
    }
  }

  /**
   * Resolve the database path - project DB if exists, otherwise bundled.
   */
  private resolve_db_path(): string | undefined {
    // Check for project-specific database first
    const project_db = path.join(process.cwd(), '.ice', 'schemas.db');
    if (fs.existsSync(project_db)) {
      return project_db;
    }

    // Let the registry use its default (bundled database)
    return undefined;
  }

  /**
   * Get a schema by ICE type.
   */
  async get_schema(ice_type: IceType): Promise<Result<ResourceSchema, IceError>> {
    if (!this.registry) {
      return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
    }

    const resource = this.registry.get(ice_type);

    if (!resource) {
      return failure(new InternalError(`Schema not found: ${ice_type}`, 'NOT_IMPLEMENTED', { ice_type }));
    }

    return success(convert_resource_to_schema(this.registry, resource));
  }

  /**
   * Check if a schema exists.
   */
  has_schema(ice_type: IceType): boolean {
    return this.registry?.has(ice_type) ?? false;
  }

  /**
   * Query schemas with filters.
   */
  async query(query: SchemaQuery): Promise<Result<SchemaQueryResult, IceError>> {
    if (!this.registry) {
      return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
    }

    const result = this.registry.query(to_sqlite_query(query));

    return success({
      schemas: result.resources.map((r) => convert_resource_to_schema(this.registry, r)),
      total: result.total,
      has_more: result.has_more,
    });
  }

  /**
   * Get all available categories.
   */
  get_categories(): string[] {
    return this.registry?.get_categories() ?? [];
  }

  /**
   * Get all available providers.
   */
  get_providers(): ProviderInfo[] {
    if (this.cached_providers) {
      return this.cached_providers;
    }

    if (!this.registry) {
      return [];
    }

    const sqlite_providers = this.registry.get_providers();
    this.cached_providers = sqlite_providers.map((p) => ({
      name: p.name,
      source: p.source as 'terraform' | 'pulumi',
      resource_count: p.resource_count,
    }));

    return this.cached_providers;
  }

  /**
   * Get the provider implementation for an ICE type.
   */
  get_implementation(
    ice_type: IceType,
    source: 'terraform' | 'pulumi',
    provider: string,
  ): ProviderImplementation | undefined {
    const impl = this.registry?.get_implementation(ice_type, source, provider);

    if (!impl) {
      return undefined;
    }

    return {
      source: impl.source as 'terraform' | 'pulumi',
      provider: impl.provider_name,
      native_type: impl.native_type,
      docs_url: impl.docs_url ?? undefined,
    };
  }

  /**
   * Get the native type for a provider.
   */
  get_native_type(ice_type: IceType, source: 'terraform' | 'pulumi', provider: string): string | undefined {
    return this.registry?.get_native_type(ice_type, source, provider) ?? undefined;
  }

  /**
   * Get property schema for a specific property.
   */
  get_property_schema(ice_type: IceType, property_path: string): PropertySchema | undefined {
    if (!this.registry) {
      return undefined;
    }

    const property = this.registry.get_property(ice_type, property_path);
    return property ? convert_property(property) : undefined;
  }

  /**
   * Get all required properties for a type.
   */
  get_required_properties(ice_type: IceType): PropertySchema[] {
    const properties = this.registry?.get_required_properties(ice_type) ?? [];
    return properties.map((p) => convert_property(p));
  }

  /**
   * Get all computed properties for a type.
   */
  get_computed_properties(ice_type: IceType): PropertySchema[] {
    const properties = this.registry?.get_computed_properties(ice_type) ?? [];
    return properties.map((p) => convert_property(p));
  }

  /**
   * Get schema statistics.
   */
  get_stats(): SchemaStats {
    if (this.cached_stats) {
      return this.cached_stats;
    }

    if (!this.registry) {
      return {
        total_schemas: 0,
        total_categories: 0,
        total_providers: 0,
        by_source: { terraform: 0, pulumi: 0 },
        by_category: {},
      };
    }

    const sqlite_stats = this.registry.get_stats();

    this.cached_stats = {
      total_schemas: sqlite_stats.total_resources,
      total_categories: Object.keys(sqlite_stats.categories).length,
      total_providers: Object.keys(sqlite_stats.providers).length,
      by_source: {
        terraform: sqlite_stats.sources['terraform'] ?? 0,
        pulumi: sqlite_stats.sources['pulumi'] ?? 0,
      },
      by_category: sqlite_stats.categories,
    };

    return this.cached_stats;
  }

  // ===========================================================================
  // Graph Query Methods
  // ===========================================================================

  /**
   * Get dependencies for a resource type.
   */
  async get_dependencies(ice_type: IceType, max_depth: number = 10): Promise<Result<ResourceSchema[], IceError>> {
    if (!this.registry) {
      return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
    }

    const deps = this.registry.get_dependencies(ice_type, max_depth);
    return success(deps.map((r) => convert_resource_to_schema(this.registry, r)));
  }

  /**
   * Get dependents for a resource type.
   */
  async get_dependents(ice_type: IceType, max_depth: number = 10): Promise<Result<ResourceSchema[], IceError>> {
    if (!this.registry) {
      return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
    }

    const dependents = this.registry.get_dependents(ice_type, max_depth);
    return success(dependents.map((r) => convert_resource_to_schema(this.registry, r)));
  }

  /**
   * Get cross-provider equivalents.
   */
  async get_equivalents(ice_type: IceType): Promise<Result<ResourceSchema[], IceError>> {
    if (!this.registry) {
      return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
    }

    const equivalents = this.registry.get_equivalents(ice_type);
    return success(equivalents.map((r) => convert_resource_to_schema(this.registry, r)));
  }

  // ===========================================================================
  // Event Methods
  // ===========================================================================

  /**
   * Subscribe to schema events.
   */
  on(event: SchemaEventType, listener: SchemaEventListener): void {
    let listeners = this.event_listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.event_listeners.set(event, listeners);
    }
    listeners.add(listener);
  }

  /**
   * Unsubscribe from schema events.
   */
  off(event: SchemaEventType, listener: SchemaEventListener): void {
    const listeners = this.event_listeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit an event.
   */
  private emit_event(type: SchemaEventType, ice_type?: IceType, message?: string): void {
    const listeners = this.event_listeners.get(type);
    if (listeners) {
      const event = {
        type,
        timestamp: new Date().toISOString(),
        ice_type,
        message,
      };
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Ignore listener errors
        }
      }
    }
  }

}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an embedded schema provider.
 */
export function create_embedded_schema_provider(db_path?: string): EmbeddedSchemaProvider {
  return new EmbeddedSchemaProvider(db_path);
}

/**
 * Create an embedded schema provider with a custom registry factory.
 * @deprecated Use create_embedded_schema_provider with db_path instead.
 */
export function create_embedded_schema_provider_with_registry(
  _registry_factory: () => Promise<unknown>,
): EmbeddedSchemaProvider {
  // For backwards compatibility, create a provider and let initialize handle it
  return new EmbeddedSchemaProvider();
}
