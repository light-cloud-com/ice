/**
 * Alibaba KVStore (ApsaraDB for Redis) handler — `alibaba.kvstore.instance`.
 *
 * Backs Database.Redis / Cache blocks.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.kvstore.instance';
const SDK = '@alicloud/r-kvstore20150101';

export const kvstore_instance_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const kvstore = await resolveClient(ctx, 'kvstore');
    if (!kvstore) return sdkMissing(name, TYPE, 'create', start, 'Alibaba KVStore', SDK);
    try {
      const result = await kvstore.createInstance({
        regionId: ctx.region,
        instanceName: name,
        instanceClass: (properties.instance_class as string) || 'redis.master.small.default',
        engineVersion: (properties.engine_version as string) || '7.0',
        chargeType: 'PostPaid',
        instanceType: 'Redis',
      });
      const id = (result?.body?.instanceId ?? result?.body?.InstanceId) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'KVStore CreateInstance returned no InstanceId');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const kvstore = await resolveClient(ctx, 'kvstore');
    if (!kvstore) return err(name, TYPE, 'update', start, 'Alibaba KVStore SDK not available');
    try {
      await kvstore.modifyInstanceAttribute({ instanceId: provider_id, instanceName: name });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const kvstore = await resolveClient(ctx, 'kvstore');
    if (!kvstore) return err(name, TYPE, 'delete', start, 'Alibaba KVStore SDK not available');
    try {
      await kvstore.deleteInstance({ instanceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
