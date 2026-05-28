/**
 * OCI Autonomous Database handler — `oci.database.autonomousdatabase`.
 *
 * Provisioning ~5–10 min. Admin password must be 12–30 chars with
 * upper/lower/digit/special, no admin/user keywords. Handler validates
 * before submit.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.database.autonomousdatabase';
const SDK = 'oci-database';

function validatePassword(password: string): string | null {
  if (password.length < 12 || password.length > 30) return 'Admin password must be 12–30 chars';
  if (!/[A-Z]/.test(password)) return 'Admin password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Admin password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Admin password must contain a digit';
  if (!/[#_]/.test(password)) return 'Admin password must contain # or _';
  if (/admin|user/i.test(password)) return 'Admin password must not include admin/user keywords';
  return null;
}

export const database_autonomous_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const db = await resolveClient(ctx, 'database');
    if (!db) return sdkMissing(name, TYPE, 'create', start, 'OCI Database', SDK);
    const password = (properties.admin_password as string) ?? '';
    const passwordError = validatePassword(password);
    if (passwordError) return err(name, TYPE, 'create', start, passwordError);
    try {
      const result = await db.createAutonomousDatabase({
        createAutonomousDatabaseDetails: {
          compartmentId: ctx.compartment_id,
          dbName: name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 14),
          displayName: name,
          cpuCoreCount: (properties.cpu_cores as number) ?? 1,
          dataStorageSizeInTBs: (properties.storage_tb as number) ?? 1,
          adminPassword: password,
          isFreeTier: (properties.free_tier as boolean) ?? false,
          dbWorkload: (properties.workload as string) || 'OLTP',
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.autonomousDatabase?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createAutonomousDatabase returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const db = await resolveClient(ctx, 'database');
    if (!db) return err(name, TYPE, 'update', start, 'OCI Database SDK not available');
    try {
      await db.updateAutonomousDatabase({
        autonomousDatabaseId: provider_id,
        updateAutonomousDatabaseDetails: {
          displayName: name,
          cpuCoreCount: properties.cpu_cores as number | undefined,
        },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const db = await resolveClient(ctx, 'database');
    if (!db) return err(name, TYPE, 'delete', start, 'OCI Database SDK not available');
    try {
      await db.deleteAutonomousDatabase({ autonomousDatabaseId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
