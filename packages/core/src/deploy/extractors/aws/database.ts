/**
 * Property extractors for AWS database services.
 *
 * Resources covered:
 *   - aws.rds.dbInstance        (Database.PostgreSQL, Database.MySQL)
 *   - aws.dynamodb.table        (Database.DynamoDB)
 *   - aws.elasticache.cluster   (Database.Redis)
 *   - aws.docdb.cluster         (Database.MongoDB)
 *
 * Each extractor lays down the AWS SDK-shaped property dict the
 * handler will hand to the SDK. Provider-specific defaults (instance
 * class, engine version, billing mode) live here.
 */

import { parse_storage_gb } from '../../utils/name-utils';

/**
 * RDS dbInstance — backs both Database.PostgreSQL and Database.MySQL.
 * Engine + version are inferred from `iceType` and `runtime` the same
 * way the GCP Cloud SQL extractor does, so the canvas contract stays
 * provider-agnostic.
 *
 * Note: the master_user_password field is intentionally a literal
 * placeholder — operators must supply a real secret via the
 * connected Security.Secret block (or set the field explicitly).
 * The handler will reject empty passwords loudly rather than create
 * an RDS instance with a default credential.
 */
export function extract_rds_db_instance_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  const ice_type = data.iceType as string;
  const is_postgres = ice_type === 'Database.PostgreSQL';
  const runtime = (data.runtime as string) || (is_postgres ? 'PostgreSQL 16' : 'MySQL 8.0');
  const version_match = runtime.match(/(\d+(\.\d+)?)/);
  const version_num = version_match?.[1] ?? (is_postgres ? '16' : '8.0');

  return {
    region,
    engine: is_postgres ? 'postgres' : 'mysql',
    engine_version: version_num,
    // RDS uses `db.<class>.<size>` instance classes — db.t3.micro is
    // the smallest Burstable option, mirrors db-f1-micro on Cloud SQL.
    db_instance_class: (data.size as string) || 'db.t3.micro',
    allocated_storage: parse_storage_gb(data.storage as string) || 20,
    storage_type: (data.storageType as string) || 'gp3',
    backup_retention_period: data.backup_retention ?? 7,
    publicly_accessible: data.publicly_accessible ?? false,
    multi_az: data.multi_az ?? false,
    master_username: (data.master_username as string) || (is_postgres ? 'postgres' : 'admin'),
    // Empty string forces the handler to error rather than ship a
    // resource with no credential.
    master_user_password: (data.master_user_password as string) || '',
    port: data.port || (is_postgres ? 5432 : 3306),
    tags: {},
  };
}

/**
 * DynamoDB table — pay-per-request by default (the AWS recommended
 * mode for new workloads). Operators can switch to provisioned by
 * setting `billing_mode: 'PROVISIONED'` and supplying RCU/WCU values.
 */
export function extract_dynamodb_table_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  const billing_mode = (data.billing_mode as string) || 'PAY_PER_REQUEST';
  return {
    region,
    billing_mode,
    // Hash key defaults to a string `id` — the most common DynamoDB
    // shape. Operators override via `partition_key` / `sort_key`.
    partition_key: (data.partition_key as string) || 'id',
    partition_key_type: (data.partition_key_type as string) || 'S',
    sort_key: (data.sort_key as string) || undefined,
    sort_key_type: (data.sort_key_type as string) || undefined,
    // Provisioned-mode capacity. Ignored by the handler when
    // billing_mode === 'PAY_PER_REQUEST'.
    ...(billing_mode === 'PROVISIONED' && {
      read_capacity: data.read_capacity ?? 5,
      write_capacity: data.write_capacity ?? 5,
    }),
    point_in_time_recovery: data.point_in_time_recovery ?? true,
    tags: {},
  };
}

/**
 * ElastiCache cluster — Redis. The canvas exposes the same M-series
 * size enum that GCP Memorystore uses; we translate to the AWS
 * `cache.<class>.<size>` node type so blocks remain portable.
 */
export const ELASTICACHE_REDIS_SIZE_MAP: Record<string, { node_type: string; num_nodes: number }> = {
  M1: { node_type: 'cache.t3.micro', num_nodes: 1 },
  M2: { node_type: 'cache.t3.small', num_nodes: 1 },
  M3: { node_type: 'cache.t3.medium', num_nodes: 1 },
  M4: { node_type: 'cache.m5.large', num_nodes: 1 },
  // M5 is the HA tier on GCP; on AWS we approximate by spinning up
  // multi-az replicas. The handler will set ReplicationGroup mode.
  M5: { node_type: 'cache.m5.xlarge', num_nodes: 2 },
};

export function extract_elasticache_cluster_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  const size = typeof data.size === 'string' ? data.size : null;
  const mapped = size && ELASTICACHE_REDIS_SIZE_MAP[size] ? ELASTICACHE_REDIS_SIZE_MAP[size] : null;
  return {
    region,
    engine: 'redis',
    engine_version: (data.redisVersion as string) || '7.0',
    cache_node_type: mapped?.node_type ?? (data.cache_node_type as string) ?? 'cache.t3.micro',
    num_cache_nodes: mapped?.num_nodes ?? (data.num_cache_nodes as number) ?? 1,
    port: data.port || 6379,
    parameter_group_name: (data.parameter_group_name as string) || 'default.redis7',
    tags: {},
  };
}

/**
 * DocumentDB cluster — MongoDB-compatible managed engine. Like RDS,
 * DocDB needs an admin password supplied by the operator (no default).
 */
export function extract_docdb_cluster_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    engine: 'docdb',
    engine_version: (data.engineVersion as string) || '5.0.0',
    db_cluster_identifier: (data.cluster_identifier as string) || '',
    db_instance_class: (data.size as string) || 'db.t3.medium',
    instance_count: (data.instance_count as number) ?? 1,
    master_username: (data.master_username as string) || 'admin',
    master_user_password: (data.master_user_password as string) || '',
    backup_retention_period: data.backup_retention ?? 7,
    storage_encrypted: data.storage_encrypted ?? true,
    port: data.port || 27017,
    tags: {},
  };
}
