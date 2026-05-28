/**
 * Compute Engine Instance Handler
 *
 * Handles: gcp.compute.instance — backs Compute.VirtualMachine on GCP
 * (parallel to AWS EC2 and Azure VM). e2-micro (free tier) by default;
 * operators flip to larger machine types via `machine_type`.
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages';
import type { ResourceDeployResult } from '../../../types';
import type { GCPResourceHandler } from '../types';

const TYPE = 'gcp.compute.instance';

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

export const compute_instance_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('instances') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.COMPUTE_INSTANCE, 'instances'));
      const zone = (properties.zone as string) || `${ctx.region}-a`;
      const machine_type = (properties.machine_type as string) || 'e2-micro';
      const image = (properties.image as string) || 'projects/debian-cloud/global/images/family/debian-12';
      const [operation] = await client.insert({
        project: ctx.project,
        zone,
        instanceResource: {
          name,
          machineType: `zones/${zone}/machineTypes/${machine_type}`,
          disks: [{ initializeParams: { sourceImage: image }, boot: true, autoDelete: true }],
          networkInterfaces: [{ accessConfigs: [{ name: 'External NAT', type: 'ONE_TO_ONE_NAT' }] }],
        },
      });
      await operation.promise?.();
      return result(name, 'create', start, { provider_id: `projects/${ctx.project}/zones/${zone}/instances/${name}` });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return result(name, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('instances') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.COMPUTE_INSTANCE));
      const zone = provider_id.match(/zones\/([^/]+)/)?.[1] ?? `${ctx.region}-a`;
      await client.delete({ project: ctx.project, zone, instance: name });
      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
