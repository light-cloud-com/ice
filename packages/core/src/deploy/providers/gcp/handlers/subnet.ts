/**
 * GCP Subnet handler — `gcp.compute.subnetwork`.
 *
 * Subnets are regional; the parent VPC is global. The translator passes
 * `network` as the parent VPC's name (or full selfLink) — we resolve to
 * the canonical projects/.../global/networks/<name> form here.
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';

const TYPE = 'gcp.compute.subnetwork';
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

function resolve_network(network: string, project: string): string {
  if (network.startsWith('projects/') || network.startsWith('https://')) return network;
  return `projects/${project}/global/networks/${network}`;
}

export const subnet_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const region = (properties.region as string) || ctx.region;
    const network = (properties.network as string) || 'default';
    const ipCidrRange = (properties.ip_cidr_range as string) || '10.0.0.0/24';

    try {
      const body = {
        name,
        ipCidrRange,
        network: resolve_network(network, ctx.project),
        region,
        privateIpGoogleAccess: properties.private_ip_google_access === true,
        description: (properties.description as string) || `Created by ICE for ${name}`,
      };
      const op = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/regions/${region}/subnetworks`,
        body,
      )) as any;
      if (op?.name) await wait_for_compute_region_op(ctx, region, op.name);
      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/regions/${region}/subnetworks/${name}`,
        outputs: {
          self_link: `https://www.googleapis.com/compute/v1/projects/${ctx.project}/regions/${region}/subnetworks/${name}`,
          ip_cidr_range: ipCidrRange,
          region,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ALREADY_EXISTS') || msg.includes('alreadyExists')) {
        return result(name, 'create', start, {
          provider_id: `projects/${ctx.project}/regions/${region}/subnetworks/${name}`,
          outputs: { ip_cidr_range: ipCidrRange, region },
        });
      }
      return fail(name, 'create', start, msg);
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    // CIDR range / network changes require recreate. No-op for now.
    const start = Date.now();
    return result(name, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const region = extract_region(provider_id) || ctx.region;
    try {
      const op = (await ctx.rest_client.delete(
        `${BASE_URL}/projects/${ctx.project}/regions/${region}/subnetworks/${name}`,
      )) as any;
      if (op?.name) await wait_for_compute_region_op(ctx, region, op.name);
      return result(name, 'delete', start);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('NOT_FOUND') || msg.includes('404')) return result(name, 'delete', start);
      return fail(name, 'delete', start, msg);
    }
  },

  async describe(name, provider_id, ctx) {
    const region = extract_region(provider_id) || ctx.region;
    try {
      const subnet = (await ctx.rest_client.get(
        `${BASE_URL}/projects/${ctx.project}/regions/${region}/subnetworks/${name}`,
      )) as any;
      if (!subnet) return { exists: false };
      return {
        exists: true,
        raw: subnet,
        properties: {
          name: subnet.name,
          ip_cidr_range: subnet.ipCidrRange,
          network: subnet.network,
          region,
        },
      };
    } catch (error: any) {
      const code = error?.response?.status || error?.code;
      if (code === 404) return { exists: false };
      return { exists: false, error: error?.message || String(error) };
    }
  },
};

function extract_region(provider_id: string): string | null {
  const m = provider_id.match(/regions\/([^/]+)/);
  return m?.[1] ?? null;
}

async function wait_for_compute_region_op(ctx: GCPHandlerContext, region: string, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 900_000) {
    const op = (await ctx.rest_client.get(
      `${BASE_URL}/projects/${ctx.project}/regions/${region}/operations/${op_name}`,
    )) as any;
    if (op?.status === 'DONE') {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}
