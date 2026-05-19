/**
 * Embedded Schema Provider
 *
 * Implementation of SchemaProvider that uses the SQLite-based schema registry.
 * Supports both the bundled base database and project-specific customized databases.
 */

import { InternalError } from '../types/errors';
import { success, failure } from '../types/result';
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
} from './schema-provider';
import type { IceError } from '../types/errors';
import type { Result } from '../types/result';
import type { SqliteSchemaRegistry } from './embedded/sqlite-types';
import {
  add_listener,
  emit_event as emit_schema_event,
  remove_listener,
  type EventListenerMap,
} from './embedded/events';
import {
  get_dependencies as g_get_dependencies,
  get_dependents as g_get_dependents,
  get_equivalents as g_get_equivalents,
} from './embedded/graph-queries';
import { initialize_registry, resolve_db_path } from './embedded/initialization';
import {
  get_categories as q_get_categories,
  get_computed_properties as q_get_computed_properties,
  get_implementation as q_get_implementation,
  get_native_type as q_get_native_type,
  get_property_schema as q_get_property_schema,
  get_providers as q_get_providers,
  get_required_properties as q_get_required_properties,
  get_schema as q_get_schema,
  get_stats as q_get_stats,
  has_schema as q_has_schema,
  make_query_cache,
  query_schemas as q_query_schemas,
  type QueryCache,
} from './embedded/queries';

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
  private event_listeners: EventListenerMap = new Map();
  private query_cache: QueryCache = make_query_cache();
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
      const db_path = this.db_path ?? resolve_db_path();
      this.registry = await initialize_registry(db_path);

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
   * Get a schema by ICE type.
   */
  async get_schema(ice_type: IceType): Promise<Result<ResourceSchema, IceError>> {
    return q_get_schema(this.registry, ice_type);
  }

  /**
   * Check if a schema exists.
   */
  has_schema(ice_type: IceType): boolean {
    return q_has_schema(this.registry, ice_type);
  }

  /**
   * Query schemas with filters.
   */
  async query(query: SchemaQuery): Promise<Result<SchemaQueryResult, IceError>> {
    return q_query_schemas(this.registry, query);
  }

  /**
   * Get all available categories.
   */
  get_categories(): string[] {
    return q_get_categories(this.registry);
  }

  /**
   * Get all available providers.
   */
  get_providers(): ProviderInfo[] {
    return q_get_providers(this.registry, this.query_cache);
  }

  /**
   * Get the provider implementation for an ICE type.
   */
  get_implementation(
    ice_type: IceType,
    source: 'terraform' | 'pulumi',
    provider: string,
  ): ProviderImplementation | undefined {
    return q_get_implementation(this.registry, ice_type, source, provider);
  }

  /**
   * Get the native type for a provider.
   */
  get_native_type(ice_type: IceType, source: 'terraform' | 'pulumi', provider: string): string | undefined {
    return q_get_native_type(this.registry, ice_type, source, provider);
  }

  /**
   * Get property schema for a specific property.
   */
  get_property_schema(ice_type: IceType, property_path: string): PropertySchema | undefined {
    return q_get_property_schema(this.registry, ice_type, property_path);
  }

  /**
   * Get all required properties for a type.
   */
  get_required_properties(ice_type: IceType): PropertySchema[] {
    return q_get_required_properties(this.registry, ice_type);
  }

  /**
   * Get all computed properties for a type.
   */
  get_computed_properties(ice_type: IceType): PropertySchema[] {
    return q_get_computed_properties(this.registry, ice_type);
  }

  /**
   * Get schema statistics.
   */
  get_stats(): SchemaStats {
    return q_get_stats(this.registry, this.query_cache);
  }

  // ===========================================================================
  // Graph Query Methods
  // ===========================================================================

  /**
   * Get dependencies for a resource type.
   */
  async get_dependencies(ice_type: IceType, max_depth: number = 10): Promise<Result<ResourceSchema[], IceError>> {
    return g_get_dependencies(this.registry, ice_type, max_depth);
  }

  /**
   * Get dependents for a resource type.
   */
  async get_dependents(ice_type: IceType, max_depth: number = 10): Promise<Result<ResourceSchema[], IceError>> {
    return g_get_dependents(this.registry, ice_type, max_depth);
  }

  /**
   * Get cross-provider equivalents.
   */
  async get_equivalents(ice_type: IceType): Promise<Result<ResourceSchema[], IceError>> {
    return g_get_equivalents(this.registry, ice_type);
  }

  // ===========================================================================
  // Event Methods
  // ===========================================================================

  /**
   * Subscribe to schema events.
   */
  on(event: SchemaEventType, listener: SchemaEventListener): void {
    add_listener(this.event_listeners, event, listener);
  }

  /**
   * Unsubscribe from schema events.
   */
  off(event: SchemaEventType, listener: SchemaEventListener): void {
    remove_listener(this.event_listeners, event, listener);
  }

  /**
   * Emit an event.
   */
  private emit_event(type: SchemaEventType, ice_type?: IceType, message?: string): void {
    emit_schema_event(this.event_listeners, type, ice_type, message);
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
