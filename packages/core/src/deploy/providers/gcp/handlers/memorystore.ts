/**
 * Memorystore Redis Handler
 *
 * Handles: gcp.redis.instance
 * Uses REST API (no official Node.js SDK for Memorystore).
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler, GCPHandlerContext } from '../types';

const TYPE = 'gcp.redis.instance';
const BASE_URL = 'https://redis.googleapis.com/v1';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
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
    type: TYPE,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const memorystore_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const region = (properties.region as string) || ctx.region;

    // Memorystore Redis takes 3-5 minutes per instance. The submit returns
    // a long-running operation immediately; the rest is the wait.
    const TOTAL_STEPS = 2;
    const reportStep = (index: number, label: string) => {
      ctx.on_step?.(name, { label, index, total: TOTAL_STEPS });
    };

    try {
      reportStep(1, 'Creating Redis instance');
      const op = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/locations/${region}/instances?instanceId=${name}`,
        {
          tier: properties.tier || 'BASIC',
          memorySizeGb: properties.memory_size_gb || 1,
          redisVersion: properties.redis_version || 'REDIS_7_0',
          displayName: name,
          labels: properties.labels || {},
        },
      )) as any;

      if (op?.name) {
        reportStep(2, 'Waiting for instance to become ready');
        await wait_for_operation(ctx, op.name);
      }

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/locations/${region}/instances/${name}`,
        outputs: { port: properties.port || 6379 },
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const region = extract_region(provider_id) || ctx.region;

    try {
      const update_mask: string[] = [];
      const body: any = {};

      if (properties.memory_size_gb) {
        body.memorySizeGb = properties.memory_size_gb;
        update_mask.push('memory_size_gb');
      }
      if (properties.labels) {
        body.labels = properties.labels;
        update_mask.push('labels');
      }

      if (update_mask.length > 0) {
        const op = (await ctx.rest_client.patch(
          `${BASE_URL}/projects/${ctx.project}/locations/${region}/instances/${name}?updateMask=${update_mask.join(',')}`,
          body,
        )) as any;
        if (op?.name) await wait_for_operation(ctx, op.name);
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const region = extract_region(provider_id) || ctx.region;

    try {
      const op = (await ctx.rest_client.delete(
        `${BASE_URL}/projects/${ctx.project}/locations/${region}/instances/${name}`,
      )) as any;
      if (op?.name) await wait_for_operation(ctx, op.name);

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

function extract_region(provider_id: string): string {
  const match = provider_id.match(/locations\/([^/]+)/);
  return match?.[1] ?? 'us-central1';
}

async function wait_for_operation(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 600_000) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/${op_name}`)) as any;
    if (op?.done) {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.MEMORYSTORE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.MEMORYSTORE));
}
