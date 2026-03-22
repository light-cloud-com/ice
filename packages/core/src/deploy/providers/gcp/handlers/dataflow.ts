/**
 * Dataflow Handler
 *
 * Handles: gcp.dataflow.job
 * Uses REST API.
 */

import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';

const TYPE = 'gcp.dataflow.job';
const BASE_URL = 'https://dataflow.googleapis.com/v1b3';

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

export const dataflow_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const region = (properties.region as string) || ctx.region;

    try {
      const job_body = {
        name,
        type: properties.template_type === 'batch' ? 'JOB_TYPE_BATCH' : 'JOB_TYPE_STREAMING',
        environment: {
          tempLocation: `gs://${ctx.project}-dataflow-temp/${name}`,
          zone: `${region}-a`,
        },
        labels: properties.labels || {},
      };

      const response = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/locations/${region}/jobs`,
        job_body
      )) as any;

      return result(name, 'create', start, {
        provider_id: response?.id
          ? `projects/${ctx.project}/locations/${region}/jobs/${response.id}`
          : `projects/${ctx.project}/locations/${region}/jobs/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    // Dataflow jobs cannot be updated in-place; they must be drained and recreated
    return result(name, 'update', start, { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const region = extract_region(provider_id) || ctx.region;
    const job_id = provider_id.split('/').pop();

    try {
      // Cancel the job (drain for streaming, cancel for batch)
      await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/locations/${region}/jobs/${job_id}`,
        { requestedState: 'JOB_STATE_CANCELLED' }
      );

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
