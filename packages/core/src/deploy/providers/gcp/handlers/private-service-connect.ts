/**
 * Private Service Connect endpoint Handler
 *
 * Handles: gcp.compute.privateServiceConnect — backs
 * Network.PrivateNetwork on GCP (parallel to AWS VPC Endpoint and
 * Azure Private Endpoint).
 *
 * Implemented as a forwarding rule that targets a Service Attachment
 * URI (`properties.target_service_attachment`). The target attachment
 * is the producer side, supplied by the canvas wiring.
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

const TYPE = 'gcp.compute.privateServiceConnect';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: true, duration_ms: Date.now() - start, ...overrides };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return { resource_id: name, name, type: TYPE, action, success: false, error, duration_ms: Date.now() - start };
}

export const private_service_connect_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('forwardingRules') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.COMPUTE_PSC, 'forwardingRules'));
      const target = properties.target_service_attachment as string | undefined;
      if (!target)
        return fail(name, 'create', start, 'Private Service Connect endpoint requires target_service_attachment');
      const [op] = await client.insert({
        project: ctx.project,
        region: ctx.region,
        forwardingRuleResource: {
          name,
          target,
          network: (properties.network as string) || 'global/networks/default',
          subnetwork: properties.subnetwork as string | undefined,
          loadBalancingScheme: '',
        },
      });
      await op.promise?.();
      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/regions/${ctx.region}/forwardingRules/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return result(name, 'update', Date.now(), { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('forwardingRules') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.COMPUTE_PSC));
      await client.delete({ project: ctx.project, region: ctx.region, forwardingRule: name });
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
