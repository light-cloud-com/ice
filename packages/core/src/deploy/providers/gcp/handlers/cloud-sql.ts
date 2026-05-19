/**
 * Cloud SQL Handler — PostgreSQL and MySQL instances
 *
 * Handles: gcp.sql.databaseInstance
 * Uses REST API (Cloud SQL Admin v1beta4) since there's no official Node.js SDK.
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler, GCPHandlerContext } from '../types';

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

/**
 * Resolve the (edition, tier) pair to send to the Cloud SQL Admin API.
 *
 * The two are coupled: ENTERPRISE accepts shared-core tiers
 * (`db-f1-micro`, `db-g1-small`) and `db-custom-CPU-MEM`; ENTERPRISE_PLUS
 * only accepts `db-perf-optimized-N-*`. Picking one without the other
 * yields HTTP 400 "Invalid Tier (X) for (Y) Edition" — which is the bug
 * we hit on projects whose default edition is ENTERPRISE_PLUS.
 *
 * Strategy:
 *   1. If the user supplied an explicit edition, trust it and validate
 *      that the tier matches; auto-fix mismatches with a sensible default.
 *   2. If only a tier was supplied, infer edition from the tier prefix.
 *   3. If neither was supplied, default to ENTERPRISE + db-f1-micro
 *      (the cheapest dev-friendly combination).
 *
 * This makes the handler self-correcting on projects whose default
 * edition is ENTERPRISE_PLUS — the user no longer has to know that
 * `db-f1-micro` doesn't exist on that edition.
 */
function resolve_edition_and_tier(properties: Record<string, unknown>): { edition: string; tier: string } {
  const requested_edition = ((properties.edition as string) || '').toUpperCase();
  const requested_tier = (properties.tier as string) || '';

  const tier_is_perf_optimized = /^db-perf-optimized/i.test(requested_tier);
  const tier_is_shared_or_custom = /^(db-f1-micro|db-g1-small|db-custom-)/i.test(requested_tier);

  if (requested_edition === 'ENTERPRISE_PLUS') {
    return {
      edition: 'ENTERPRISE_PLUS',
      tier: tier_is_perf_optimized ? requested_tier : 'db-perf-optimized-N-2',
    };
  }
  if (requested_edition === 'ENTERPRISE') {
    return {
      edition: 'ENTERPRISE',
      tier: tier_is_perf_optimized || !requested_tier ? 'db-f1-micro' : requested_tier,
    };
  }
  // No edition specified — infer from tier shape.
  if (tier_is_perf_optimized) {
    return { edition: 'ENTERPRISE_PLUS', tier: requested_tier };
  }
  return {
    edition: 'ENTERPRISE',
    tier: tier_is_shared_or_custom ? requested_tier : 'db-f1-micro',
  };
}

export const cloud_sql_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const region = (properties.region as string) || ctx.region;

    // Two coarse milestones: the submit and the long async wait. Cloud SQL's
    // instance create returns a long-running operation immediately and then
    // takes 5-10+ minutes to actually become RUNNABLE — the wait is the
    // user-visible slow part, so it gets its own step.
    const TOTAL_STEPS = 2;
    const reportStep = (index: number, label: string) => {
      ctx.on_step?.(name, { label, index, total: TOTAL_STEPS });
    };

    try {
      const { edition, tier } = resolve_edition_and_tier(properties);
      ctx.on_log?.(`[cloud-sql] Creating ${name} (edition=${edition}, tier=${tier})`);

      const instance_body = {
        name,
        project: ctx.project,
        region,
        databaseVersion: properties.database_version || 'POSTGRES_16',
        settings: {
          tier,
          edition,
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
      reportStep(1, 'Creating Cloud SQL instance');
      const op = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/instances`, instance_body)) as any;

      // Wait for the operation to complete
      if (op?.name) {
        reportStep(2, 'Waiting for instance to become ready');
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

      // Cloud SQL automated backups persist for the project's backup
      // retention window (default 7 days) after the instance is deleted.
      // We deliberately do NOT auto-delete these — they're the last line
      // of defense against "oh no I destroyed the wrong instance" — but
      // we tell the user where to find them in case they want a manual
      // cleanup.
      ctx.on_log?.(
        `[cloud-sql] Instance ${name} deleted. Automated backups persist for the configured retention window ` +
          `(default 7 days). If you need to delete them manually, go to ` +
          `https://console.cloud.google.com/sql/instances and use the Backups tab before the retention window expires.`,
      );

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
