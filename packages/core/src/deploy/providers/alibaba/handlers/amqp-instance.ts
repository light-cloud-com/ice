/**
 * Alibaba AMQP instance handler — `alibaba.amqp.instance`.
 *
 * Backs Messaging.RabbitMQ blocks. Provisions an AMQP-compatible
 * broker instance.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.amqp.instance';
const SDK = '@alicloud/amqp-open20210309';

export const amqp_instance_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const amqp = await resolveClient(ctx, 'amqp');
    if (!amqp) return sdkMissing(name, TYPE, 'create', start, 'Alibaba AMQP', SDK);
    try {
      const result = await amqp.createInstance({
        instanceName: name,
        instanceType: (properties.instance_type as string) || 'professional',
        maxTps: (properties.max_tps as number) || 1000,
        maxConnections: (properties.max_connections as number) || 50,
        queueCapacity: (properties.queue_capacity as number) || 50,
        paymentType: 'PayAsYouGo',
      });
      const id = (result?.body?.data ?? result?.body?.instanceId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateInstance returned no InstanceId');
      return ok(name, TYPE, 'create', start, { provider_id: String(id) });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const amqp = await resolveClient(ctx, 'amqp');
    if (!amqp) return err(name, TYPE, 'delete', start, 'Alibaba AMQP SDK not available');
    try {
      await amqp.releaseInstance({ instanceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
