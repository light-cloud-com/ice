/**
 * GCP VPC handler — `gcp.compute.network`.
 *
 * Used by both `Network.VPC` (custom-mode, expects explicit Subnet
 * children) and `Network.PrivateNetwork` (auto-mode — GCP creates a /20
 * subnet per region automatically). The card-translator's property
 * extractor sets `auto_create_subnets` based on the iceType, so this
 * handler treats both flows uniformly.
 *
 * Routing mode defaults to GLOBAL ("single global VPC" semantics).
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';

const TYPE = 'gcp.compute.network';
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
  return { resource_id: name, name, type: TYPE, action, success: false, error, duration_ms: Date.now() - start };
}

export const vpc_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const body = {
        name,
        autoCreateSubnetworks: properties.auto_create_subnets === true,
        routingConfig: { routingMode: (properties.routing_mode as string) || 'GLOBAL' },
        description: (properties.description as string) || `Created by ICE for ${name}`,
      };
      const op = (await ctx.rest_client.post(`${BASE_URL}/projects/${ctx.project}/global/networks`, body)) as any;
      if (op?.name) await wait_for_compute_op(ctx, op.name);
      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/global/networks/${name}`,
        outputs: {
          self_link: `https://www.googleapis.com/compute/v1/projects/${ctx.project}/global/networks/${name}`,
          network_id: name,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ALREADY_EXISTS') || msg.includes('alreadyExists')) {
        return result(name, 'create', start, {
          provider_id: `projects/${ctx.project}/global/networks/${name}`,
          outputs: {
            self_link: `https://www.googleapis.com/compute/v1/projects/${ctx.project}/global/networks/${name}`,
            network_id: name,
          },
        });
      }
      return fail(name, 'create', start, msg);
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    // VPC properties (auto-create-subnets, routing mode) require recreate
    // for most changes. Treat as no-op until we have a dedicated drift flow.
    const start = Date.now();
    return result(name, 'update', start, { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    try {
      const op = (await ctx.rest_client.delete(`${BASE_URL}/projects/${ctx.project}/global/networks/${name}`)) as any;
      if (op?.name) await wait_for_compute_op(ctx, op.name);
      return result(name, 'delete', start);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('NOT_FOUND') || msg.includes('404')) {
        return result(name, 'delete', start);
      }
      return fail(name, 'delete', start, msg);
    }
  },

  async describe(name, _provider_id, ctx) {
    try {
      const network = (await ctx.rest_client.get(
        `${BASE_URL}/projects/${ctx.project}/global/networks/${name}`,
      )) as any;
      if (!network) return { exists: false };
      return {
        exists: true,
        raw: network,
        properties: {
          name: network.name,
          self_link: network.selfLink,
          routing_mode: network?.routingConfig?.routingMode,
        },
      };
    } catch (error: any) {
      const code = error?.response?.status || error?.code;
      if (code === 404) return { exists: false };
      return { exists: false, error: error?.message || String(error) };
    }
  },
};

async function wait_for_compute_op(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 900_000) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/projects/${ctx.project}/global/operations/${op_name}`)) as any;
    if (op?.status === 'DONE') {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}
