/**
 * IBM Databases for X factory handler. One file backs four engine
 * variants:
 *   - `ibm.databases.postgresql`
 *   - `ibm.databases.mysql`
 *   - `ibm.databases.mongodb`
 *   - `ibm.databases.redis`
 *
 * Each variant is a separate Resource Controller managed instance with
 * a fixed `service_name` (Databases for ICD service catalog) and
 * `service_plan_id` (standard plan).
 */

import { resolveClient } from './_client';
import { err, isIbmAlreadyExists, isIbmNotFound, ok, sdkMissing } from './_result';
import type { IBMResourceHandler } from '../types';

const SDK = '@ibm-cloud/platform-services';

const PLAN_IDS: Record<string, { service_name: string; plan_id: string }> = {
  postgresql: { service_name: 'databases-for-postgresql', plan_id: '38774ff2-9eef-4ee5-bef5-d8d2d0671c2c' },
  mysql: { service_name: 'databases-for-mysql', plan_id: 'standard' },
  mongodb: { service_name: 'databases-for-mongodb', plan_id: '4929e7bb-25e9-4ce0-a4f1-c8a87ff39b32' },
  redis: { service_name: 'databases-for-redis', plan_id: 'ec47775e-9cf6-4d83-9bf4-fe71e9a78a72' },
};

function makeHandler(engine: 'postgresql' | 'mysql' | 'mongodb' | 'redis'): IBMResourceHandler {
  const TYPE = `ibm.databases.${engine}`;
  return {
    async create(name, properties, ctx) {
      const start = Date.now();
      const rc = await resolveClient(ctx, 'resourcecontroller');
      if (!rc) return sdkMissing(name, TYPE, 'create', start, 'IBM Resource Controller', SDK);
      try {
        const { plan_id } = PLAN_IDS[engine];
        const result = await rc.createResourceInstance({
          name,
          target: ctx.region,
          resourceGroup: ctx.resource_group_id,
          resourcePlanId: (properties.plan_id as string) || plan_id,
          parameters: {
            members_memory_allocation_mb: (properties.memory_mb as number) ?? 1024,
            members_disk_allocation_mb: (properties.disk_mb as number) ?? 5120,
            version: properties.engine_version as string | undefined,
          },
        });
        const id = result?.result?.id as string | undefined;
        if (!id) return err(name, TYPE, 'create', start, 'createResourceInstance returned no id');
        return ok(name, TYPE, 'create', start, { provider_id: id });
      } catch (error) {
        if (isIbmAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
        return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
      }
    },
    async update(name, provider_id, _properties, _current, ctx) {
      const start = Date.now();
      const rc = await resolveClient(ctx, 'resourcecontroller');
      if (!rc) return err(name, TYPE, 'update', start, 'IBM Resource Controller SDK not available');
      try {
        await rc.updateResourceInstance({ id: provider_id, name });
        return ok(name, TYPE, 'update', start, { provider_id });
      } catch (error) {
        return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
      }
    },
    async delete(name, provider_id, ctx) {
      const start = Date.now();
      const rc = await resolveClient(ctx, 'resourcecontroller');
      if (!rc) return err(name, TYPE, 'delete', start, 'IBM Resource Controller SDK not available');
      try {
        await rc.deleteResourceInstance({ id: provider_id, recursive: true });
        return ok(name, TYPE, 'delete', start);
      } catch (error) {
        if (isIbmNotFound(error)) return ok(name, TYPE, 'delete', start);
        return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export const databases_postgresql_handler = makeHandler('postgresql');
export const databases_mysql_handler = makeHandler('mysql');
export const databases_mongodb_handler = makeHandler('mongodb');
export const databases_redis_handler = makeHandler('redis');
