/**
 * Alibaba MNS queue handler — `alibaba.mns.queue`.
 *
 * Backs Messaging.Queue blocks. Polling-based queue (vs MNS topic
 * which is push-based). VisibilityTimeout / MessageRetentionPeriod
 * surfaced as canvas properties.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.mns.queue';
const SDK = '@alicloud/mns';

export const mns_queue_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const mns = await resolveClient(ctx, 'mns');
    if (!mns) return sdkMissing(name, TYPE, 'create', start, 'Alibaba MNS', SDK);
    try {
      await mns.createQueue({
        queueName: name,
        visibilityTimeout: (properties.visibility_timeout_sec as number) ?? 30,
        maximumMessageSize: (properties.max_message_bytes as number) ?? 65536,
        messageRetentionPeriod: (properties.retention_sec as number) ?? 345600,
        delaySeconds: (properties.delay_sec as number) ?? 0,
        pollingWaitSeconds: (properties.polling_wait_sec as number) ?? 0,
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
      await mns.setQueueAttributes({
        queueName: provider_id,
        visibilityTimeout: properties.visibility_timeout_sec as number | undefined,
        maximumMessageSize: properties.max_message_bytes as number | undefined,
        messageRetentionPeriod: properties.retention_sec as number | undefined,
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
      await mns.deleteQueue({ queueName: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
