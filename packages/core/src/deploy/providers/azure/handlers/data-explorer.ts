/**
 * Azure Data Explorer cluster handler — `azure.kusto.cluster`.
 *
 * Backs the data-explorer template block (real-time analytics over
 * append-only data — parallel to AWS Timestream/Kinesis Analytics and
 * GCP BigQuery streaming).
 *
 * Default SKU = Dev(No SLA)_Standard_E2a_v4 — the smallest dev tier
 * (cheapest, no SLA). Operators flip to Standard_E2a_v4 (with capacity
 * > 1) for production HA.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.kusto.cluster';
const SDK = '@azure/arm-kusto';

export const data_explorer_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('kusto') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Data Explorer', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.clusters.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        sku: {
          name: (properties.sku_name as string) || 'Dev(No SLA)_Standard_E2a_v4',
          tier: (properties.sku_tier as string) || 'Basic',
          capacity: (properties.sku_capacity as number) ?? 1,
        },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('kusto') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Data Explorer SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.clusters.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('kusto') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Data Explorer SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.clusters.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
