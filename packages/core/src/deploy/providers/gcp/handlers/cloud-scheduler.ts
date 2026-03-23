/**
 * Cloud Scheduler Handler
 *
 * Handles: gcp.cloudscheduler.job
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short } from '../messages.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler } from '../types.js';

const TYPE = 'gcp.cloudscheduler.job';

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

export const cloud_scheduler_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const region = (properties.region as string) || ctx.region;

    try {
      const client = ctx.clients.get('scheduler') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.CLOUD_SCHEDULER, 'scheduler'));

      const [job] = await client.createJob({
        parent: `projects/${ctx.project}/locations/${region}`,
        job: {
          name: `projects/${ctx.project}/locations/${region}/jobs/${name}`,
          schedule: properties.schedule || '0 0 * * *',
          timeZone: properties.timezone || 'UTC',
          httpTarget: properties.target_uri
            ? {
                uri: properties.target_uri,
                httpMethod: 'POST',
              }
            : undefined,
        },
      });

      return result(name, 'create', start, {
        provider_id: job.name || `projects/${ctx.project}/locations/${region}/jobs/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      const client = ctx.clients.get('scheduler') as any;
      if (!client) return fail(name, 'update', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_SCHEDULER));

      await client.updateJob({
        job: {
          name: provider_id,
          schedule: properties.schedule,
          timeZone: properties.timezone,
        },
        updateMask: { paths: ['schedule', 'time_zone'] },
      });

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();

    try {
      const client = ctx.clients.get('scheduler') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.CLOUD_SCHEDULER));

      await client.deleteJob({ name: provider_id });

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
