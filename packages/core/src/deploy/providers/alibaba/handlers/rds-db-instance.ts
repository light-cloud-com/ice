/**
 * Alibaba RDS handler — `alibaba.rds.dbInstance`.
 *
 * Backs Database.PostgreSQL / Database.MySQL blocks. Provisioning is
 * long-running (5–15 min); the handler returns after CreateDBInstance
 * accepts the request without waiting for status='Running'. The
 * deployer polls externally via DescribeDBInstances.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.rds.dbInstance';
const SDK = '@alicloud/rds20140815';

function dbEngineFromProperties(properties: Record<string, unknown>): { Engine: string; EngineVersion: string } {
  const engine = ((properties.engine as string) ?? 'postgres').toLowerCase();
  if (engine.startsWith('mysql'))
    return { Engine: 'MySQL', EngineVersion: (properties.engine_version as string) ?? '8.0' };
  if (engine.startsWith('sql'))
    return { Engine: 'SQLServer', EngineVersion: (properties.engine_version as string) ?? '2019_std' };
  return { Engine: 'PostgreSQL', EngineVersion: (properties.engine_version as string) ?? '16.0' };
}

export const rds_db_instance_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const rds = await resolveClient(ctx, 'rds');
    if (!rds) return sdkMissing(name, TYPE, 'create', start, 'Alibaba RDS', SDK);
    try {
      const { Engine, EngineVersion } = dbEngineFromProperties(properties);
      const result = await rds.createDBInstance({
        regionId: ctx.region,
        engine: Engine,
        engineVersion: EngineVersion,
        DBInstanceClass: (properties.instance_class as string) || 'pg.n2.serverless.1c',
        DBInstanceStorage: (properties.storage_gb as number) || 20,
        DBInstanceNetType: (properties.network_type as string) || 'Internet',
        DBInstanceDescription: name,
        payType: 'Postpaid',
        securityIPList: (properties.allowed_cidrs as string) || '0.0.0.0/0',
        clientToken: `ice-${name}-${ctx.region}`,
      });
      const dbId = (result?.body?.DBInstanceId ?? result?.body?.dbInstanceId) as string | undefined;
      if (!dbId) return err(name, TYPE, 'create', start, 'CreateDBInstance returned no DBInstanceId');
      return ok(name, TYPE, 'create', start, { provider_id: dbId });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const rds = await resolveClient(ctx, 'rds');
    if (!rds) return err(name, TYPE, 'update', start, 'Alibaba RDS SDK not available');
    try {
      await rds.modifyDBInstanceDescription({ DBInstanceId: provider_id, DBInstanceDescription: name });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const rds = await resolveClient(ctx, 'rds');
    if (!rds) return err(name, TYPE, 'delete', start, 'Alibaba RDS SDK not available');
    try {
      await rds.deleteDBInstance({ DBInstanceId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
