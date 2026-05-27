/**
 * Property extractors for Azure database services.
 *
 * Resources covered:
 *   - azure.cosmosdb.account            (Database.CosmosDB SQL + Database.MongoDB)
 *   - azure.postgresqlflex.server       (Database.PostgreSQL)
 *   - azure.mysqlflex.server            (Database.MySQL)
 *   - azure.cache.redis                 (Database.Cache)
 *   - azure.sql.server                  (Database.SQL — template-only)
 */

/**
 * Cosmos DB account. Kind is GlobalDocumentDB by default (SQL API);
 * Database.MongoDB block sets `kind='MongoDB'` so the handler attaches
 * the EnableMongo capability. Default consistency = Session
 * (Azure-recommended balance). Serverless by default for scale-to-zero.
 */
export function extract_azure_cosmosdb_account_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  const isMongo = data.iceType === 'Database.MongoDB' || data.kind === 'MongoDB';
  return {
    region,
    location: (data.location as string) || region,
    kind: isMongo ? 'MongoDB' : 'GlobalDocumentDB',
    consistency_level: (data.consistency_level as string) || 'Session',
    serverless: data.serverless !== false,
    capabilities: (data.capabilities as Array<{ name: string }>) || [],
    tags: {},
  };
}

/**
 * PostgreSQL Flexible Server. Backs Database.PostgreSQL on Azure.
 * Burstable B1ms by default — cheapest tier. Password is required.
 */
export function extract_azure_postgresql_flex_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    version: (data.version as string) || (data.engine_version as string) || '16',
    sku_name: (data.sku_name as string) || 'Standard_B1ms',
    sku_tier: (data.sku_tier as string) || 'Burstable',
    storage_size_gb: (data.storage_size_gb as number) ?? (data.allocated_storage as number) ?? 32,
    administrator_login: (data.administrator_login as string) || (data.master_username as string) || '',
    administrator_login_password:
      (data.administrator_login_password as string) || (data.master_user_password as string) || '',
    backup_retention_days: (data.backup_retention_days as number) ?? 7,
    tags: {},
  };
}

/**
 * Azure Cache for Redis. Backs Database.Cache on Azure.
 * Basic C0 by default (cheapest single-node tier, no SLA).
 */
export function extract_azure_redis_cache_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  // Map common iceType tier hints to Azure SKU triples.
  const tier = ((data.tier as string) || (data.sku as string) || 'Basic').toString();
  const family = tier === 'Premium' ? 'P' : 'C';
  const sku_name = tier === 'Standard' ? 'Standard' : tier === 'Premium' ? 'Premium' : 'Basic';
  return {
    region,
    location: (data.location as string) || region,
    sku_name: (data.sku_name as string) || sku_name,
    sku_family: (data.sku_family as string) || family,
    sku_capacity: (data.sku_capacity as number) ?? 0,
    enable_non_ssl_port: data.enable_non_ssl_port === true,
    minimum_tls_version: (data.minimum_tls_version as string) || '1.2',
    redis_version: (data.redis_version as string) || '6',
    tags: {},
  };
}

/**
 * SQL Server (logical). Backs Database.SQL on Azure (template-only).
 * Password is required. v12.0 is the only supported version today.
 */
export function extract_azure_sql_server_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    version: (data.version as string) || '12.0',
    administrator_login: (data.administrator_login as string) || (data.master_username as string) || '',
    administrator_login_password:
      (data.administrator_login_password as string) || (data.master_user_password as string) || '',
    public_network_access: (data.public_network_access as string) || 'Enabled',
    tags: {},
  };
}

/**
 * MySQL Flexible Server. Backs Database.MySQL on Azure.
 * Burstable B1s by default — cheapest tier. Password is required.
 */
export function extract_azure_mysql_flex_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    location: (data.location as string) || region,
    version: (data.version as string) || (data.engine_version as string) || '8.0.21',
    sku_name: (data.sku_name as string) || 'Standard_B1s',
    sku_tier: (data.sku_tier as string) || 'Burstable',
    storage_size_gb: (data.storage_size_gb as number) ?? (data.allocated_storage as number) ?? 32,
    administrator_login: (data.administrator_login as string) || (data.master_username as string) || '',
    administrator_login_password:
      (data.administrator_login_password as string) || (data.master_user_password as string) || '',
    backup_retention_days: (data.backup_retention_days as number) ?? 7,
    tags: {},
  };
}
