/**
 * Alibaba ApsaraDB for MongoDB handler — `alibaba.dds.dbInstance`.
 *
 * Backs Database.MongoDB blocks. Replica-set topology by default;
 * sharded clusters are P2 (separate handler).
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.dds.dbInstance';
const SDK = '@alicloud/dds20151201';

export const dds_db_instance_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const dds = await resolveClient(ctx, 'dds');
    if (!dds) return sdkMissing(name, TYPE, 'create', start, 'Alibaba MongoDB', SDK);
    try {
      const result = await dds.createDBInstance({
        regionId: ctx.region,
        engineVersion: (properties.engine_version as string) || '6.0',
        DBInstanceClass: (properties.instance_class as string) || 'dds.mongo.mid',
        DBInstanceStorage: (properties.storage_gb as number) || 10,
        DBInstanceDescription: name,
        chargeType: 'PostPaid',
        clientToken: `ice-${name}-${ctx.region}`,
      });
      const dbId = (result?.body?.DBInstanceId ?? result?.body?.dbInstanceId) as string | undefined;
      if (!dbId) return err(name, TYPE, 'create', start, 'MongoDB CreateDBInstance returned no DBInstanceId');
      return ok(name, TYPE, 'create', start, { provider_id: dbId });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const dds = await resolveClient(ctx, 'dds');
    if (!dds) return err(name, TYPE, 'update', start, 'Alibaba MongoDB SDK not available');
    try {
      await dds.modifyDBInstanceDescription({ DBInstanceId: provider_id, DBInstanceDescription: name });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const dds = await resolveClient(ctx, 'dds');
    if (!dds) return err(name, TYPE, 'delete', start, 'Alibaba MongoDB SDK not available');
    try {
      await dds.deleteDBInstance({ DBInstanceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
