/**
 * Pub/Sub Handler
 *
 * Handles: gcp.pubsub.topic, gcp.pubsub.subscription
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

function result(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const pubsub_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const type = 'gcp.pubsub.topic';

    try {
      const pubsub = ctx.clients.get('pubsub') as any;
      if (!pubsub) return fail(name, type, 'create', start, sdk_not_available(SERVICE_NAMES.PUBSUB, 'pubsub'));

      const [topic] = await pubsub.createTopic({
        name: `projects/${ctx.project}/topics/${name}`,
        labels: properties.labels || {},
        messageRetentionDuration: properties.message_retention_duration
          ? { seconds: parseInt(properties.message_retention_duration as string) }
          : undefined,
      });

      return result(name, type, 'create', start, {
        provider_id: topic.name || `projects/${ctx.project}/topics/${name}`,
      });
    } catch (error) {
      return fail(name, type, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const type = 'gcp.pubsub.topic';

    try {
      const pubsub = ctx.clients.get('pubsub') as any;
      if (!pubsub) return fail(name, type, 'update', start, sdk_not_available_short(SERVICE_NAMES.PUBSUB));

      const topic = pubsub.topic(name);
      if (properties.labels) {
        await topic.setMetadata({ labels: properties.labels });
      }

      return result(name, type, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, type, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const type = 'gcp.pubsub.topic';

    try {
      const pubsub = ctx.clients.get('pubsub') as any;
      if (!pubsub) return fail(name, type, 'delete', start, sdk_not_available_short(SERVICE_NAMES.PUBSUB));

      const topic = pubsub.topic(name);
      await topic.delete();

      return result(name, type, 'delete', start);
    } catch (error) {
      return fail(name, type, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
