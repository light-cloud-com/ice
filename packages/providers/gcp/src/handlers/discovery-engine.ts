/**
 * Discovery Engine (Vertex AI Search) Handler
 *
 * Handles: gcp.discoveryengine.searchEngine
 * Uses REST API.
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages';
import type { GCPResourceHandler, GCPHandlerContext } from '../types';
import type { ResourceDeployResult } from '@ice/core';

const TYPE = 'gcp.discoveryengine.searchEngine';
const BASE_URL = 'https://discoveryengine.googleapis.com/v1';

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

export const discovery_engine_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const location = (properties.location as string) || 'global';

    try {
      // Create a data store first
      const ds_op = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/locations/${location}/collections/default_collection/dataStores?dataStoreId=${name}-store`,
        {
          displayName: `${name} Data Store`,
          industryVertical: 'GENERIC',
          solutionTypes: [properties.solution_type || 'SOLUTION_TYPE_SEARCH'],
          contentConfig: 'CONTENT_REQUIRED',
        },
      )) as any;

      if (ds_op?.name) await wait_for_operation(ctx, ds_op.name);

      // Create the search engine
      const engine_op = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/locations/${location}/collections/default_collection/engines?engineId=${name}`,
        {
          displayName: name,
          solutionType: properties.solution_type || 'SOLUTION_TYPE_SEARCH',
          dataStoreIds: [`${name}-store`],
          searchEngineConfig: { searchTier: 'SEARCH_TIER_STANDARD' },
        },
      )) as any;

      if (engine_op?.name) await wait_for_operation(ctx, engine_op.name);

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/locations/${location}/collections/default_collection/engines/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, current, ctx) {
    const start = Date.now();

    try {
      const patch_body: Record<string, string> = {};

      if (properties.display_name && properties.display_name !== current?.display_name) {
        patch_body.displayName = properties.display_name as string;
      }

      if (properties.search_tier && properties.search_tier !== current?.search_tier) {
        patch_body.searchTier = properties.search_tier as string;
      }

      // Only call PATCH if there are actual changes
      if (Object.keys(patch_body).length > 0) {
        await ctx.rest_client.patch(`${BASE_URL}/${provider_id}`, patch_body);
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();

    try {
      const op = (await ctx.rest_client.delete(`${BASE_URL}/${provider_id}`)) as any;
      if (op?.name) await wait_for_operation(ctx, op.name);

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

async function wait_for_operation(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 300_000) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/${op_name}`)) as any;
    if (op?.done) {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.DISCOVERY_ENGINE, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.DISCOVERY_ENGINE));
}
