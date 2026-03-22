/**
 * Cloud Load Balancing Handler
 *
 * Handles: gcp.compute.globalForwardingRule
 */

import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';
import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';

const TYPE = 'gcp.compute.globalForwardingRule';
const BASE_URL = 'https://compute.googleapis.com/compute/v1';

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

export const load_balancer_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      const op = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/forwardingRules`, {
        name,
        loadBalancingScheme: properties.scheme || 'EXTERNAL',
        portRange: String(properties.port_range || '443'),
        IPProtocol: properties.protocol === 'HTTP' ? 'TCP' : 'TCP',
        labels: properties.labels || {},
      })) as any;

      if (op?.name) await wait_for_compute_op(ctx, op.name);

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/global/forwardingRules/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      if (properties.labels) {
        await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/forwardingRules/${name}/setLabels`, {
          labels: properties.labels,
        });
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();

    try {
      const op = (await ctx.rest_client.delete(
        `${BASE_URL}/projects/${ctx.project}/global/forwardingRules/${name}`,
      )) as any;

      if (op?.name) await wait_for_compute_op(ctx, op.name);

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

async function wait_for_compute_op(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/projects/${ctx.project}/global/operations/${op_name}`)) as any;
    if (op?.status === 'DONE') {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}
