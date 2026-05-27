/**
 * Property extractors for Azure database services.
 *
 * Resources covered:
 *   - azure.cosmosdb.account            (Database.CosmosDB SQL + Database.MongoDB)
 *   - azure.postgresqlflex.server       (Database.PostgreSQL)
 *   - azure.mysqlflex.server            (Database.MySQL)
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
