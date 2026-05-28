/**
 * OCI Database with PostgreSQL handler — `oci.psql.dbsystem`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.psql.dbsystem';
const SDK = 'oci-psql';

export const psql_dbsystem_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const psql = await resolveClient(ctx, 'psql');
    if (!psql) return sdkMissing(name, TYPE, 'create', start, 'OCI PostgreSQL', SDK);
    try {
      const result = await psql.createDbSystem({
        createDbSystemDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          dbVersion: (properties.engine_version as string) || '14',
          shape: (properties.shape as string) || 'VM.Standard.E4.Flex',
          instanceCount: (properties.instance_count as number) ?? 1,
          instanceMemorySizeInGBs: (properties.memory_gb as number) ?? 8,
          instanceOcpuCount: (properties.ocpus as number) ?? 2,
          storageDetails: { systemType: 'OCI_OPTIMIZED_STORAGE', iops: 600000 },
          networkDetails: { subnetId: properties.subnet_id as string | undefined },
          credentials: {
            username: (properties.admin_username as string) || 'postgres',
            passwordDetails: { passwordType: 'PLAIN_TEXT', password: properties.admin_password as string | undefined },
          },
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.dbSystem?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'PSQL createDbSystem returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const psql = await resolveClient(ctx, 'psql');
    if (!psql) return err(name, TYPE, 'update', start, 'OCI PostgreSQL SDK not available');
    try {
      await psql.updateDbSystem({ dbSystemId: provider_id, updateDbSystemDetails: { displayName: name } });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const psql = await resolveClient(ctx, 'psql');
    if (!psql) return err(name, TYPE, 'delete', start, 'OCI PostgreSQL SDK not available');
    try {
      await psql.deleteDbSystem({ dbSystemId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
