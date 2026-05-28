/**
 * Compute Firewall Handler
 *
 * Handles: gcp.compute.firewall — backs Network.SecurityGroup on GCP
 * (parallel to AWS Security Group and Azure NSG).
 *
 * GCP firewall rules live at the VPC network level (not per-subnet).
 * The handler builds a single allow-rule from canvas ingress entries.
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

const TYPE = 'gcp.compute.firewall';

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

export const compute_firewall_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('firewalls') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.COMPUTE_FIREWALL, 'firewalls'));
      const [op] = await client.insert({
        project: ctx.project,
        firewallResource: {
          name,
          network: (properties.network as string) || 'global/networks/default',
          direction: (properties.direction as string) || 'INGRESS',
          priority: (properties.priority as number) ?? 1000,
          allowed: (properties.allowed as unknown[]) || [{ IPProtocol: 'tcp', ports: ['80', '443'] }],
          sourceRanges: (properties.source_ranges as string[]) || ['0.0.0.0/0'],
        },
      });
      await op.promise?.();
      return result(name, 'create', start, { provider_id: `projects/${ctx.project}/global/firewalls/${name}` });
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
      const client = ctx.clients.get('firewalls') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.COMPUTE_FIREWALL));
      await client.delete({ project: ctx.project, firewall: name });
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
