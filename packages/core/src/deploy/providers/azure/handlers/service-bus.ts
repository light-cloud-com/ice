/**
 * Azure Service Bus handler — `azure.servicebus.namespace`.
 *
 * Backs Messaging.ServiceBus / Messaging.Queue / Messaging.Topic on
 * Azure. Service Bus uses a namespace (≈ AWS account-scoped SNS+SQS
 * boundary) with per-queue / per-topic children. ICE creates the
 * namespace; child queues/topics ship in a later iteration when the
 * canvas exposes per-child config.
 *
 * Namespace name: 6-50 chars, globally unique, lowercase alphanumeric
 * + hyphens. Extractor / caller sanitises.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.servicebus.namespace';
const SDK = '@azure/arm-servicebus';

export const service_bus_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('servicebus') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Service Bus', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;

      const result = await client.namespaces.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        sku: {
          name: (properties.sku as string) || 'Standard',
          tier: (properties.sku as string) || 'Standard',
        },
        zoneRedundant: properties.zone_redundant === true,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('servicebus') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Service Bus SDK not available');
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
    const client = ctx.clients.get('servicebus') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Service Bus SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.namespaces.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
