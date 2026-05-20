/**
 * Schema query operations against the SQLite registry.
 *
 * Standalone functions extracted from `EmbeddedSchemaProvider` (rf-esp-2).
 * Each takes a `registry` arg (or null) plus an optional cache pointer
 * for the two cached methods (`get_providers` and `get_stats`); the rest
 * are stateless and fall back to defaults when the registry is null.
 *
 * Behaviour preserved verbatim:
 *  - get_schema/query: fail with InternalError if registry is null.
 *  - has_schema, get_categories, get_native_type: degrade gracefully to
 *    `false` / `[]` / `undefined` when the registry is null.
 *  - get_providers/get_stats: lazy-cache; cache holders are external so
 *    the orchestrator class can hold the same cache slots it always did.
 */
import { convert_property, convert_resource_to_schema } from './converters';
import { to_sqlite_query, type SqliteSchemaRegistry } from './sqlite-types';
import { InternalError } from '../../types/errors';
import { failure, success } from '../../types/result';
import type { IceError } from '../../types/errors';
import type { Result } from '../../types/result';
import type {
  IceType,
  PropertySchema,
  ProviderImplementation,
  ProviderInfo,
  ResourceSchema,
  SchemaQuery,
  SchemaQueryResult,
  SchemaStats,
} from '../schema-provider';

/**
 * External cache slots passed to the cached query helpers.
 * The orchestrator owns these — the helpers read/write through.
 */
export interface QueryCache {
  providers: ProviderInfo[] | null;
  stats: SchemaStats | null;
}

export function make_query_cache(): QueryCache {
  return { providers: null, stats: null };
}

/** Default empty stats, used when the registry is null. */
const EMPTY_STATS: SchemaStats = {
  total_schemas: 0,
  total_categories: 0,
  total_providers: 0,
  by_source: { terraform: 0, pulumi: 0 },
  by_category: {},
};

export async function get_schema(
  registry: SqliteSchemaRegistry | null,
  ice_type: IceType,
): Promise<Result<ResourceSchema, IceError>> {
  if (!registry) {
    return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
  }
  const resource = registry.get(ice_type);
  if (!resource) {
    return failure(new InternalError(`Schema not found: ${ice_type}`, 'NOT_IMPLEMENTED', { ice_type }));
  }
  return success(convert_resource_to_schema(registry, resource));
}

export function has_schema(registry: SqliteSchemaRegistry | null, ice_type: IceType): boolean {
  return registry?.has(ice_type) ?? false;
}

export async function query_schemas(
  registry: SqliteSchemaRegistry | null,
  query: SchemaQuery,
): Promise<Result<SchemaQueryResult, IceError>> {
  if (!registry) {
    return failure(new InternalError('Schema provider not initialized', 'INTERNAL_ERROR'));
  }
  const result = registry.query(to_sqlite_query(query));
  return success({
    schemas: result.resources.map((r) => convert_resource_to_schema(registry, r)),
    total: result.total,
    has_more: result.has_more,
  });
}

export function get_categories(registry: SqliteSchemaRegistry | null): string[] {
  return registry?.get_categories() ?? [];
}

/**
 * Get all available providers, with cache-through.
 * The cache holds onto the last result; pass `cache.providers = null`
 * to invalidate.
 */
export function get_providers(registry: SqliteSchemaRegistry | null, cache: QueryCache): ProviderInfo[] {
  if (cache.providers) {
    return cache.providers;
  }
  if (!registry) {
    return [];
  }
  const sqlite_providers = registry.get_providers();
  cache.providers = sqlite_providers.map((p) => ({
    name: p.name,
    source: p.source as 'terraform' | 'pulumi',
    resource_count: p.resource_count,
  }));
  return cache.providers;
}

export function get_implementation(
  registry: SqliteSchemaRegistry | null,
  ice_type: IceType,
  source: 'terraform' | 'pulumi',
  provider: string,
): ProviderImplementation | undefined {
  const impl = registry?.get_implementation(ice_type, source, provider);
  if (!impl) return undefined;
  return {
    source: impl.source as 'terraform' | 'pulumi',
    provider: impl.provider_name,
    native_type: impl.native_type,
    docs_url: impl.docs_url ?? undefined,
  };
}

export function get_native_type(
  registry: SqliteSchemaRegistry | null,
  ice_type: IceType,
  source: 'terraform' | 'pulumi',
  provider: string,
): string | undefined {
  return registry?.get_native_type(ice_type, source, provider) ?? undefined;
}

export function get_property_schema(
  registry: SqliteSchemaRegistry | null,
  ice_type: IceType,
  property_path: string,
): PropertySchema | undefined {
  if (!registry) return undefined;
  const property = registry.get_property(ice_type, property_path);
  return property ? convert_property(property) : undefined;
}

export function get_required_properties(registry: SqliteSchemaRegistry | null, ice_type: IceType): PropertySchema[] {
  const properties = registry?.get_required_properties(ice_type) ?? [];
  return properties.map((p) => convert_property(p));
}

export function get_computed_properties(registry: SqliteSchemaRegistry | null, ice_type: IceType): PropertySchema[] {
  const properties = registry?.get_computed_properties(ice_type) ?? [];
  return properties.map((p) => convert_property(p));
}

/**
 * Get schema statistics, with cache-through.
 * Falls back to a fixed empty `SchemaStats` when the registry is null.
 */
export function get_stats(registry: SqliteSchemaRegistry | null, cache: QueryCache): SchemaStats {
  if (cache.stats) {
    return cache.stats;
  }
  if (!registry) {
    return EMPTY_STATS;
  }
  const sqlite_stats = registry.get_stats();
  cache.stats = {
    total_schemas: sqlite_stats.total_resources,
    total_categories: Object.keys(sqlite_stats.categories).length,
    total_providers: Object.keys(sqlite_stats.providers).length,
    by_source: {
      terraform: sqlite_stats.sources['terraform'] ?? 0,
      pulumi: sqlite_stats.sources['pulumi'] ?? 0,
    },
    by_category: sqlite_stats.categories,
  };
  return cache.stats;
}
