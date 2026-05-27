/**
 * Azure Cognitive Search handler — `azure.search.service`.
 *
 * Backs Analytics.Search on Azure (parallel to AWS OpenSearch and GCP
 * Discovery Engine). Free tier by default — single-replica dev tier.
 * Operators flip to Basic / S1 / S2 for production SLA + larger index
 * size.
 *
 * Also backs AI.VectorDB on Azure via the same service (vector search
 * capability is a feature flag inside the search service). The canvas
 * routes both Analytics.Search and AI.VectorDB blocks to this handler;
 * a different `iceType` only affects extractor defaults (vector dims).
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.search.service';
const SDK = '@azure/arm-search';

export const cognitive_search_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('search') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Cognitive Search', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.services.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        sku: { name: (properties.sku_name as string) || (properties.tier as string) || 'free' },
        replicaCount: (properties.replica_count as number) ?? 1,
        partitionCount: (properties.partition_count as number) ?? 1,
        hostingMode: (properties.hosting_mode as string) || 'default',
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('search') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Cognitive Search SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.services.update(resource_group, name, {
        replicaCount: (properties.replica_count as number) ?? undefined,
        partitionCount: (properties.partition_count as number) ?? undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('search') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Cognitive Search SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.services.delete(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
