/**
 * SQLite Schema Registry — types
 *
 * Internal types describing the row shapes returned by `@ice-engine/schemas/db`.
 * Extracted from `embedded-schema-provider.ts` (rf-esp-1).
 */

import type { SchemaQuery } from '../schema-provider.js';

/**
 * SQLite schema registry interface (from @ice-engine/schemas/db).
 */
export interface SqliteSchemaRegistry {
  get(ice_type: string): SqliteResourceType | null;
  has(ice_type: string): boolean;
  get_all(limit?: number, offset?: number): SqliteResourceType[];
  get_by_category(category: string): SqliteResourceType[];
  get_by_provider(provider: string): SqliteResourceType[];
  get_by_source(source: 'terraform' | 'pulumi' | 'custom'): SqliteResourceType[];
  get_properties(ice_type: string, include_nested?: boolean): SqliteProperty[];
  get_implementations(ice_type: string): SqliteImplementation[];
  get_implementation(
    ice_type: string,
    source: 'terraform' | 'pulumi' | 'custom',
    provider: string,
  ): SqliteImplementation | null;
  get_native_type(ice_type: string, source: 'terraform' | 'pulumi' | 'custom', provider: string): string | null;
  get_property(ice_type: string, property_name: string): SqliteProperty | null;
  get_required_properties(ice_type: string): SqliteProperty[];
  get_computed_properties(ice_type: string): SqliteProperty[];
  query(query: SqliteSchemaQuery): SqliteQueryResult;
  search(query: string, limit?: number, offset?: number): SqliteQueryResult;
  get_categories(): string[];
  get_providers(): SqliteProviderInfo[];
  get_stats(): SqliteSchemaStats;
  get_dependencies(ice_type: string, max_depth?: number): SqliteResourceType[];
  get_dependents(ice_type: string, max_depth?: number): SqliteResourceType[];
  get_equivalents(ice_type: string): SqliteResourceType[];
  get_relationships_from(ice_type: string): SqliteRelationship[];
  get_relationships_to(ice_type: string): SqliteRelationship[];
  close(): void;
}

export interface SqliteResourceType {
  id: number;
  ice_type: string;
  display_name: string;
  description: string | null;
  category: string;
  icon: string | null;
  source: 'terraform' | 'pulumi' | 'custom';
  deprecated: boolean;
  deprecation_message: string | null;
}

export interface SqliteImplementation {
  id: number;
  resource_type_id: number;
  source: 'terraform' | 'pulumi' | 'custom';
  provider_name: string;
  native_type: string;
  docs_url: string | null;
  provider_version: string | null;
}

export interface SqliteProperty {
  id: number;
  resource_type_id: number;
  name: string;
  type: string;
  description: string | null;
  required: boolean;
  computed: boolean;
  sensitive: boolean;
  deprecated: boolean;
  default_value: unknown;
  parent_property_id: number | null;
  element_type: string | null;
  nested_properties?: SqliteProperty[];
  validation?: SqlitePropertyValidation;
}

export interface SqlitePropertyValidation {
  pattern?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  min_length?: number | null;
  max_length?: number | null;
  enum_values?: string[];
}

export interface SqliteRelationship {
  source_type: string;
  target_type: string;
  relationship_type: string;
  property_name: string | null;
  cardinality: 'one' | 'many';
  description: string | null;
  confidence: number;
}

export interface SqliteSchemaQuery {
  ice_type?: string;
  category?: string;
  provider?: string;
  source?: 'terraform' | 'pulumi' | 'custom';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SqliteQueryResult {
  resources: SqliteResourceType[];
  total: number;
  has_more: boolean;
}

export interface SqliteProviderInfo {
  name: string;
  namespace: string;
  source: 'terraform' | 'pulumi' | 'custom';
  resource_count: number;
}

export interface SqliteSchemaStats {
  total_resources: number;
  total_implementations: number;
  total_relationships: number;
  total_properties: number;
  categories: Record<string, number>;
  providers: Record<string, number>;
  sources: Record<string, number>;
  total_resource_types?: number;
  total_categories?: number;
  total_providers?: number;
  custom_resource_types?: number;
  custom_relationships?: number;
}

/**
 * Map a `SchemaQuery` (public) to a `SqliteSchemaQuery` (registry-shape).
 * Centralises the source-cast that was inlined in the original `query()` method.
 */
export function to_sqlite_query(query: SchemaQuery): SqliteSchemaQuery {
  return {
    ice_type: query.ice_type,
    category: query.category,
    provider: query.provider,
    source: query.source as 'terraform' | 'pulumi' | 'custom' | undefined,
    search: query.search,
    limit: query.limit,
    offset: query.offset,
  };
}
