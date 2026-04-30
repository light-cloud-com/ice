/**
 * Property extractors for database services on the card-to-graph translator.
 *
 * Each extractor maps a canvas node's `data` payload to the deployer-handler
 * input shape for a specific GCP database resource type. The translator's
 * dispatch table looks up the right extractor by resolved `resource_type`.
 *
 * Loose `Record<string, unknown>` types on the parameter and return value
 * are intentional — handlers further down the pipeline coerce per-resource.
 */

import { parse_storage_gb } from '../utils/name-utils.js';

export function extract_cloud_sql_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  const ice_type = data.iceType as string;
  const is_postgres = ice_type === 'Database.PostgreSQL';
  const runtime = (data.runtime as string) || (is_postgres ? 'PostgreSQL 16' : 'MySQL 8.0');
  const version_match = runtime.match(/(\d+(\.\d+)?)/);
  const version_num = version_match?.[1] ?? (is_postgres ? '16' : '8.0');

  // Edition + tier flow through to the handler, which resolves the pair
  // (e.g. forces ENTERPRISE for db-f1-micro). Pass through whatever the
  // user set; the handler defaults and validates.
  const props: Record<string, unknown> = {
    region,
    database_version: is_postgres ? `POSTGRES_${version_num}` : `MYSQL_${version_num.replace('.', '_')}`,
    storage_size_gb: parse_storage_gb(data.storage as string) || 20,
    backup_enabled: true,
    port: data.port || (is_postgres ? 5432 : 3306),
    labels: {},
  };
  if (data.size) props.tier = data.size;
  if (data.edition) props.edition = data.edition;
  return props;
}

export function extract_firestore_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    location_id: region,
    type: data.databaseType || 'FIRESTORE_NATIVE',
    labels: {},
  };
}

// Memorystore for Redis exposes BASIC and STANDARD_HA as the only valid
// `tier` values on the API. The canvas instead exposes the M-series size
// enum from high-level-resources (M1=1GB BASIC, M2=4GB BASIC, etc.). The
// common blueprint's nodeDataDefaults also leaks an internal `tier: 'small'`
// label that's not a real API enum and would 400 the request. Translate
// here so the handler always sees a (tier, memorySizeGb) pair the API
// will accept.
export const REDIS_SIZE_MAP: Record<string, { tier: string; memorySizeGb: number }> = {
  M1: { tier: 'BASIC', memorySizeGb: 1 },
  M2: { tier: 'BASIC', memorySizeGb: 4 },
  M3: { tier: 'BASIC', memorySizeGb: 10 },
  M4: { tier: 'BASIC', memorySizeGb: 35 },
  M5: { tier: 'STANDARD_HA', memorySizeGb: 100 },
};
export const REDIS_VALID_TIERS = new Set(['BASIC', 'STANDARD_HA']);

export function extract_memorystore_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  // 1. Prefer the size enum (canvas property) and look up its tier+memory pair.
  const size = typeof data.size === 'string' ? data.size : null;
  const mapped = size && REDIS_SIZE_MAP[size] ? REDIS_SIZE_MAP[size] : null;

  // 2. Otherwise accept a literal tier value if it matches the API enum;
  //    drop sentinel labels like 'small' from the common blueprint.
  const literalTier = typeof data.tier === 'string' && REDIS_VALID_TIERS.has(data.tier) ? data.tier : null;

  // 3. memoryMb (common blueprint) → memorySizeGb (API). Floor at 1 because
  //    the API rejects sub-1 GB instances.
  const fromMemoryMb =
    typeof data.memoryMb === 'number' && data.memoryMb > 0 ? Math.max(1, Math.round(data.memoryMb / 1024)) : null;
  const literalGb = typeof data.memorySizeGb === 'number' && data.memorySizeGb > 0 ? data.memorySizeGb : null;

  return {
    region,
    tier: mapped?.tier ?? literalTier ?? 'BASIC',
    memory_size_gb: mapped?.memorySizeGb ?? literalGb ?? fromMemoryMb ?? 1,
    redis_version: data.redisVersion || 'REDIS_7_0',
    port: data.port || 6379,
    labels: {},
  };
}
