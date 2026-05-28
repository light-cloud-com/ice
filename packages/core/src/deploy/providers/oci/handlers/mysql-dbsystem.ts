/**
 * OCI MySQL HeatWave DB system handler — `oci.mysql.dbsystem`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.mysql.dbsystem';
const SDK = 'oci-mysql';

export const mysql_dbsystem_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const mysql = await resolveClient(ctx, 'mysql');
    if (!mysql) return sdkMissing(name, TYPE, 'create', start, 'OCI MySQL HeatWave', SDK);
    try {
      const result = await mysql.createDbSystem({
        createDbSystemDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          shapeName: (properties.shape as string) || 'MySQL.VM.Standard.E4.1.8GB',
          adminUsername: (properties.admin_username as string) || 'admin',
          adminPassword: (properties.admin_password as string) ?? '',
          subnetId: properties.subnet_id as string | undefined,
          availabilityDomain: properties.availability_domain as string | undefined,
          dataStorageSizeInGBs: (properties.storage_gb as number) ?? 50,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.dbSystem?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createDbSystem returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const mysql = await resolveClient(ctx, 'mysql');
    if (!mysql) return err(name, TYPE, 'update', start, 'OCI MySQL HeatWave SDK not available');
    try {
      await mysql.updateDbSystem({ dbSystemId: provider_id, updateDbSystemDetails: { displayName: name } });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const mysql = await resolveClient(ctx, 'mysql');
    if (!mysql) return err(name, TYPE, 'delete', start, 'OCI MySQL HeatWave SDK not available');
    try {
      await mysql.deleteDbSystem({ dbSystemId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
