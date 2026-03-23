/**
 * Schema Provider Interface
 *
 * Provides schema information to the ICE engine.
 * This abstracts the schema source (embedded, remote, or custom).
 */

import type { IceError } from '../types/errors.js';
import type { Result } from '../types/result.js';

// =============================================================================
// Schema Types
// =============================================================================

/**
 * ICE resource type identifier.
 * Format: "Category.ResourceName" (e.g., "Compute.VirtualMachine")
 */
export type IceType = string & { readonly __brand: 'IceType' };

/**
 * Create a typed IceType from a string.
 */
export function create_ice_type(type: string): IceType {
  return type as IceType;
}

/**
 * Property type in a schema.
 */
export type PropertyType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'map' | 'any';

/**
 * Schema for a single property.
 */
export interface PropertySchema {
  /** Property name */
  readonly name: string;

  /** Property type */
  readonly type: PropertyType;

  /** Human-readable description */
  readonly description: string;

  /** Whether property is required */
  readonly required: boolean;

  /** Whether property is computed (output only) */
  readonly computed: boolean;

  /** Whether property contains sensitive data */
  readonly sensitive: boolean;

  /** Default value if any */
  readonly default_value?: unknown;

  /** Validation constraints */
  readonly validation?: PropertyValidation;

  /** Nested properties for object/map types */
  readonly nested_properties?: PropertySchema[];
}

/**
 * Validation constraints for a property.
 */
export interface PropertyValidation {
  /** Regex pattern for string validation */
  readonly pattern?: string;

  /** Allowed values (enum) */
  readonly allowed_values?: readonly (string | number | boolean)[];

  /** Minimum value for numbers */
  readonly min?: number;

  /** Maximum value for numbers */
  readonly max?: number;

  /** Minimum length for strings/arrays */
  readonly min_length?: number;

  /** Maximum length for strings/arrays */
  readonly max_length?: number;

  /** Custom validation expression */
  readonly expression?: string;
}

/**
 * Provider implementation details.
 */
export interface ProviderImplementation {
  /** Source registry (terraform or pulumi) */
  readonly source: 'terraform' | 'pulumi';

  /** Provider name (e.g., "aws", "google", "azure") */
  readonly provider: string;

  /** Native resource type in the provider */
  readonly native_type: string;

  /** Documentation URL */
  readonly docs_url?: string;

  /** Provider version range */
  readonly version_range?: string;
}

/**
 * Complete schema for a resource type.
 */
export interface ResourceSchema {
  /** ICE type identifier */
  readonly ice_type: IceType;

  /** Human-readable name */
  readonly display_name: string;

  /** Description of the resource */
  readonly description: string;

  /** Resource category */
  readonly category: string;

  /** Property definitions */
  readonly properties: readonly PropertySchema[];

  /** Available provider implementations */
  readonly implementations: readonly ProviderImplementation[];

  /** When the schema was last updated */
  readonly updated_at?: string;
}

// =============================================================================
// Query Types
// =============================================================================

/**
 * Query parameters for searching schemas.
 */
export interface SchemaQuery {
  /** Filter by ICE type (exact match) */
  readonly ice_type?: IceType;

  /** Filter by category */
  readonly category?: string;

  /** Filter by provider */
  readonly provider?: string;

  /** Filter by source registry */
  readonly source?: 'terraform' | 'pulumi';

  /** Full-text search */
  readonly search?: string;

  /** Maximum results to return */
  readonly limit?: number;

  /** Offset for pagination */
  readonly offset?: number;
}

/**
 * Result of a schema query.
 */
export interface SchemaQueryResult {
  /** Matching schemas */
  readonly schemas: readonly ResourceSchema[];

  /** Total count (for pagination) */
  readonly total: number;

  /** Whether there are more results */
  readonly has_more: boolean;
}

// =============================================================================
// Schema Provider Interface
// =============================================================================

/**
 * Interface for providing schema information.
 * Implementations can be embedded, remote, or custom.
 */
export interface SchemaProvider {
  /**
   * Initialize the provider.
   */
  initialize(): Promise<Result<void, IceError>>;

  /**
   * Get a schema by ICE type.
   */
  get_schema(ice_type: IceType): Promise<Result<ResourceSchema, IceError>>;

  /**
   * Check if a schema exists.
   */
  has_schema(ice_type: IceType): boolean;

  /**
   * Query schemas with filters.
   */
  query(query: SchemaQuery): Promise<Result<SchemaQueryResult, IceError>>;

  /**
   * Get all available categories.
   */
  get_categories(): string[];

  /**
   * Get all available providers.
   */
  get_providers(): ProviderInfo[];

  /**
   * Get the provider implementation for an ICE type.
   */
  get_implementation(
    ice_type: IceType,
    source: 'terraform' | 'pulumi',
    provider: string,
  ): ProviderImplementation | undefined;

  /**
   * Get the native type for a provider.
   */
  get_native_type(ice_type: IceType, source: 'terraform' | 'pulumi', provider: string): string | undefined;

  /**
   * Get property schema for a specific property.
   */
  get_property_schema(ice_type: IceType, property_path: string): PropertySchema | undefined;

  /**
   * Get all required properties for a type.
   */
  get_required_properties(ice_type: IceType): PropertySchema[];

  /**
   * Get all computed properties for a type.
   */
  get_computed_properties(ice_type: IceType): PropertySchema[];

  /**
   * Get schema statistics.
   */
  get_stats(): SchemaStats;
}

/**
 * Information about an available provider.
 */
export interface ProviderInfo {
  /** Provider name */
  readonly name: string;

  /** Source registry */
  readonly source: 'terraform' | 'pulumi';

  /** Number of resource types */
  readonly resource_count: number;
}

/**
 * Schema registry statistics.
 */
export interface SchemaStats {
  /** Total number of schemas */
  readonly total_schemas: number;

  /** Number of categories */
  readonly total_categories: number;

  /** Number of providers */
  readonly total_providers: number;

  /** Schema breakdown by source */
  readonly by_source: {
    readonly terraform: number;
    readonly pulumi: number;
  };

  /** Schema breakdown by category */
  readonly by_category: Record<string, number>;
}

// =============================================================================
// Schema Type Mapping
// =============================================================================

/**
 * Maps ICE types to their native provider types.
 */
export interface TypeMapping {
  /** ICE type */
  readonly ice_type: IceType;

  /** Native type in Terraform */
  readonly terraform_type?: string;

  /** Native type in Pulumi */
  readonly pulumi_type?: string;

  /** Property mappings (ICE property -> native property) */
  readonly property_mappings?: Record<string, PropertyMapping>;
}

/**
 * Maps ICE property to native property.
 */
export interface PropertyMapping {
  /** ICE property name */
  readonly ice_name: string;

  /** Terraform property name */
  readonly terraform_name?: string;

  /** Pulumi property name */
  readonly pulumi_name?: string;

  /** Value transformation function name */
  readonly transform?: string;
}

// =============================================================================
// Schema Events
// =============================================================================

/**
 * Schema provider event types.
 */
export type SchemaEventType = 'initialized' | 'schema_added' | 'schema_updated' | 'schema_removed' | 'error';

/**
 * Schema provider event.
 */
export interface SchemaEvent {
  readonly type: SchemaEventType;
  readonly timestamp: string;
  readonly ice_type?: IceType;
  readonly message?: string;
}

/**
 * Schema event listener.
 */
export type SchemaEventListener = (event: SchemaEvent) => void;

/**
 * Extended provider with event support.
 */
export interface ObservableSchemaProvider extends SchemaProvider {
  /**
   * Subscribe to schema events.
   */
  on(event: SchemaEventType, listener: SchemaEventListener): void;

  /**
   * Unsubscribe from schema events.
   */
  off(event: SchemaEventType, listener: SchemaEventListener): void;
}
