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
  overrides: Partial<ResourceDeployResult> = {}
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
  error: string
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
      // Step 1: Create backend service (serverless NEG or instance group)
      const backendName = `${name}-backend`;
      const backendOp = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/global/backendServices`,
        {
          name: backendName,
          loadBalancingScheme: properties.scheme || 'EXTERNAL',
          protocol: properties.backend_protocol || 'HTTP',
          timeoutSec: properties.timeout_sec || 30,
          labels: properties.labels || {},
        }
      )) as any;
      if (backendOp?.name) await wait_for_compute_op(ctx, backendOp.name);

      // Step 2: Create URL map
      const urlMapName = `${name}-url-map`;
      const urlMapOp = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/global/urlMaps`,
        {
          name: urlMapName,
          defaultService: `projects/${ctx.project}/global/backendServices/${backendName}`,
        }
      )) as any;
      if (urlMapOp?.name) await wait_for_compute_op(ctx, urlMapOp.name);

      // Step 3: Create target HTTP(S) proxy
      const proxyName = `${name}-proxy`;
      const isHttps = properties.protocol !== 'HTTP';
      const proxyEndpoint = isHttps ? 'targetHttpsProxies' : 'targetHttpProxies';
      const proxyBody: Record<string, any> = {
        name: proxyName,
        urlMap: `projects/${ctx.project}/global/urlMaps/${urlMapName}`,
      };
      if (isHttps && properties.ssl_certificate) {
        proxyBody.sslCertificates = [properties.ssl_certificate];
      }
      const proxyOp = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/global/${proxyEndpoint}`,
        proxyBody
      )) as any;
      if (proxyOp?.name) await wait_for_compute_op(ctx, proxyOp.name);

      // Step 4: Create forwarding rule
      const op = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/global/forwardingRules`,
        {
          name,
          loadBalancingScheme: properties.scheme || 'EXTERNAL',
          portRange: String(properties.port_range || (isHttps ? '443' : '80')),
          IPProtocol: 'TCP',
          target: `projects/${ctx.project}/global/${proxyEndpoint}/${proxyName}`,
          labels: properties.labels || {},
        }
      )) as any;

      if (op?.name) await wait_for_compute_op(ctx, op.name);

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/global/forwardingRules/${name}`,
        outputs: { backendService: backendName, urlMap: urlMapName, proxy: proxyName },
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      if (properties.labels) {
        await ctx.rest_client.post(
          `${BASE_URL}/projects/${ctx.project}/global/forwardingRules/${name}/setLabels`,
          { labels: properties.labels }
        );
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
        `${BASE_URL}/projects/${ctx.project}/global/forwardingRules/${name}`
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
    const op = (await ctx.rest_client.get(
      `${BASE_URL}/projects/${ctx.project}/global/operations/${op_name}`
    )) as any;
    if (op?.status === 'DONE') {
      if (op.error)
        throw new Error(operation_failed(SERVICE_NAMES.COMPUTE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.COMPUTE));
}
