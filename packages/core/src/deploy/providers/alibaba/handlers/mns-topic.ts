/**
 * Alibaba MNS topic handler — `alibaba.mns.topic`.
 *
 * Backs Messaging.Topic blocks. Push-based pub/sub. Subscriptions
 * are sibling resources (separate canvas wiring → separate handler).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.mns.topic';
const SDK = '@alicloud/mns20220119';

export const mns_topic_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const mns = await resolveClient(ctx, 'mns');
    if (!mns) return sdkMissing(name, TYPE, 'create', start, 'Alibaba MNS', SDK);
    try {
      await mns.createTopic({
        topicName: name,
        maximumMessageSize: (properties.max_message_bytes as number) ?? 65536,
      });
      return ok(name, TYPE, 'create', start, { provider_id: name });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const mns = await resolveClient(ctx, 'mns');
    if (!mns) return err(name, TYPE, 'update', start, 'Alibaba MNS SDK not available');
    try {
      await mns.setTopicAttributes({
        topicName: provider_id,
        maximumMessageSize: properties.max_message_bytes as number | undefined,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const mns = await resolveClient(ctx, 'mns');
    if (!mns) return err(name, TYPE, 'delete', start, 'Alibaba MNS SDK not available');
    try {
      await mns.deleteTopic({ topicName: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
