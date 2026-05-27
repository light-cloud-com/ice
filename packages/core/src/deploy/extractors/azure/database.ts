/**
 * Property extractors for Azure database services.
 *
 * Resources covered:
 *   - azure.cosmosdb.account   (Database.CosmosDB SQL API + Database.MongoDB API)
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
