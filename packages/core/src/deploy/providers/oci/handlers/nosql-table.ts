/**
 * OCI NoSQL Database table handler — `oci.nosql.table`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.nosql.table';
const SDK = 'oci-nosql';

export const nosql_table_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const nosql = await resolveClient(ctx, 'nosql');
    if (!nosql) return sdkMissing(name, TYPE, 'create', start, 'OCI NoSQL', SDK);
    try {
      const result = await nosql.createTable({
        createTableDetails: {
          compartmentId: ctx.compartment_id,
          name,
          ddlStatement: (properties.ddl as string) || `CREATE TABLE ${name} (id STRING, data JSON, PRIMARY KEY(id))`,
          tableLimits: {
            maxReadUnits: (properties.read_units as number) ?? 10,
            maxWriteUnits: (properties.write_units as number) ?? 10,
            maxStorageInGBs: (properties.storage_gb as number) ?? 1,
          },
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.table?.id as string | undefined;
      return ok(name, TYPE, 'create', start, { provider_id: id ?? name });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const nosql = await resolveClient(ctx, 'nosql');
    if (!nosql) return err(name, TYPE, 'delete', start, 'OCI NoSQL SDK not available');
    try {
      await nosql.deleteTable({ tableNameOrId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
