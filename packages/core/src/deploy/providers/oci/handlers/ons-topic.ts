/**
 * OCI Notifications topic handler — `oci.ons.topic`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.ons.topic';
const SDK = 'oci-ons';

export const ons_topic_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const ons = await resolveClient(ctx, 'ons');
    if (!ons) return sdkMissing(name, TYPE, 'create', start, 'OCI Notifications', SDK);
    try {
      const result = await ons.createTopic({
        createTopicDetails: {
          compartmentId: ctx.compartment_id,
          name,
          description: (properties.description as string) || `Topic managed by ice`,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.notificationTopic?.topicId as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createTopic returned no topicId');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const ons = await resolveClient(ctx, 'ons');
    if (!ons) return err(name, TYPE, 'delete', start, 'OCI Notifications SDK not available');
    try {
      await ons.deleteTopic({ topicId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
