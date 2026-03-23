/**
 * Cloud SQL Handler — PostgreSQL and MySQL instances
 *
 * Handles: gcp.sql.databaseInstance
 * Uses REST API (Cloud SQL Admin v1beta4) since there's no official Node.js SDK.
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';
import type { ResourceDeployResult } from '@ice/core';

const BASE_URL = 'https://sqladmin.googleapis.com/v1';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: 'gcp.sql.databaseInstance',
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: 'gcp.sql.databaseInstance',
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const cloud_sql_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const region = (properties.region as string) || ctx.region;

    try {
      const instance_body = {
        name,
        project: ctx.project,
        region,
        databaseVersion: properties.database_version || 'POSTGRES_16',
        settings: {
          tier: properties.tier || 'db-f1-micro',
          dataDiskSizeGb: String(properties.storage_size_gb || 20),
          dataDiskType: 'PD_SSD',
          backupConfiguration: {
            enabled: properties.backup_enabled ?? true,
            startTime: '03:00',
          },
          ipConfiguration: {
            ipv4Enabled: true,
            authorizedNetworks: [],
          },
          userLabels: properties.labels || {},
          availabilityType: properties.high_availability ? 'REGIONAL' : 'ZONAL',
        },
      };

      // Create the instance
      const op = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/instances`, instance_body)) as any;

      // Wait for the operation to complete
      if (op?.name) {
        await wait_for_operation(ctx, op.name);
      }

      const provider_id = `projects/${ctx.project}/instances/${name}`;
      return result(name, 'create', start, {
        provider_id,
        outputs: {
          region,
          database_version: properties.database_version,
          port: properties.port || 5432,
        },
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      const patch_body: any = {
        settings: {},
      };

      if (properties.tier) {
        patch_body.settings.tier = properties.tier;
      }
      if (properties.storage_size_gb) {
        patch_body.settings.dataDiskSizeGb = String(properties.storage_size_gb);
      }
      if (properties.labels) {
        patch_body.settings.userLabels = properties.labels;
      }
      if (properties.high_availability !== undefined) {
        patch_body.settings.availabilityType = properties.high_availability ? 'REGIONAL' : 'ZONAL';
      }
      if (properties.backup_enabled !== undefined) {
        patch_body.settings.backupConfiguration = { enabled: properties.backup_enabled };
      }

      const op = (await ctx.rest_client.patch(
        `${BASE_URL}/projects/${ctx.project}/instances/${name}`,
        patch_body,
      )) as any;

      if (op?.name) {
        await wait_for_operation(ctx, op.name);
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const op = (await ctx.rest_client.delete(`${BASE_URL}/projects/${ctx.project}/instances/${name}`)) as any;

      if (op?.name) {
        await wait_for_operation(ctx, op.name);
      }

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

// =============================================================================
// Operation polling
// =============================================================================

async function wait_for_operation(
  ctx: GCPHandlerContext,
  operation_name: string,
  timeout_ms: number = 900_000, // 15 minutes — Cloud SQL is slow
): Promise<void> {
  const start = Date.now();
  const poll_interval = 5000;

  while (Date.now() - start < timeout_ms) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/projects/${ctx.project}/operations/${operation_name}`)) as any;

    if (op?.status === 'DONE') {
      if (op.error) {
        throw new Error(operation_failed(SERVICE_NAMES.CLOUD_SQL, JSON.stringify(op.error)));
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, poll_interval));
  }

  throw new Error(operation_timed_out(SERVICE_NAMES.CLOUD_SQL, timeout_ms / 1000));
}
