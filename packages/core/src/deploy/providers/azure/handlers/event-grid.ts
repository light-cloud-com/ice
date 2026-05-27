/**
 * Azure Event Grid handler — `azure.eventgrid.topic`.
 *
 * Custom topic for pub/sub-style event delivery (parallel to AWS SNS
 * topic / EventBridge custom bus and GCP Pub/Sub topic). Subscriptions
 * are attached separately via canvas wiring + extractor branches in
 * Phase B4.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.eventgrid.topic';
const SDK = '@azure/arm-eventgrid';

export const event_grid_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('eventgrid') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Event Grid', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.topics.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('eventgrid') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Event Grid SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.topics.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('eventgrid') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Event Grid SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.topics.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
