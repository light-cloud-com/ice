/**
 * Azure Event Hubs handler — `azure.eventhub.namespace`.
 *
 * Backs Messaging.EventStream on Azure (parallel to AWS Kinesis Data
 * Streams and GCP Pub/Sub). Namespace is the parent resource;
 * individual event hubs (topics) inside the namespace come via canvas
 * sub-block extraction in Phase B4.
 *
 * Standard SKU by default (cheapest tier with 7-day retention); auto-
 * inflate disabled — operators turn it on for predictable cost.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.eventhub.namespace';
const SDK = '@azure/arm-eventhub';

export const event_hubs_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('eventhub') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Event Hubs', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.namespaces.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        sku: {
          name: (properties.sku_name as string) || 'Standard',
          tier: (properties.sku_tier as string) || (properties.sku_name as string) || 'Standard',
          capacity: (properties.sku_capacity as number) ?? 1,
        },
        isAutoInflateEnabled: properties.auto_inflate === true,
        maximumThroughputUnits:
          properties.auto_inflate === true ? ((properties.max_throughput_units as number) ?? 10) : undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('eventhub') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Event Hubs SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.namespaces.update(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('eventhub') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Event Hubs SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.namespaces.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
