/**
 * Azure Cosmos DB handler — `azure.cosmosdb.account`.
 *
 * Backs Database.CosmosDB (SQL API) and Database.MongoDB (Mongo API).
 * The `kind` property picks the API surface — defaults to GlobalDocumentDB
 * (SQL); Mongo blocks set kind='MongoDB' via the extractor.
 *
 * Default consistency = Session (Azure-recommended balance).
 * Serverless capacity by default (scale-to-zero billing). Operators
 * flip to provisioned with `properties.capabilities = []`.
 *
 * Account name must be globally unique + 3-44 lowercase chars + hyphens.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.cosmosdb.account';
const SDK = '@azure/arm-cosmosdb';

export const cosmosdb_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cosmosdb') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Cosmos DB', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;
      const kind = (properties.kind as string) || 'GlobalDocumentDB';

      // Default capabilities depend on API. Mongo accounts need
      // EnableMongo; serverless billing needs EnableServerless.
      const capabilities: Array<{ name: string }> = [];
      if (kind === 'MongoDB') capabilities.push({ name: 'EnableMongo' });
      if (properties.serverless !== false) capabilities.push({ name: 'EnableServerless' });
      if (Array.isArray(properties.capabilities))
        capabilities.push(...(properties.capabilities as Array<{ name: string }>));

      const result = await client.databaseAccounts.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        kind,
        locations: [{ locationName: location, failoverPriority: 0 }],
        databaseAccountOfferType: 'Standard',
        consistencyPolicy: {
          defaultConsistencyLevel: (properties.consistency_level as string) || 'Session',
        },
        capabilities,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cosmosdb') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Cosmos DB SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.databaseAccounts.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cosmosdb') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Cosmos DB SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.databaseAccounts.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
