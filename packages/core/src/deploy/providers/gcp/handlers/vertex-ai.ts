/**
 * Vertex AI Handler — Endpoints, Indexes, Index Endpoints
 *
 * Handles: gcp.aiplatform.endpoint, gcp.aiplatform.index, gcp.aiplatform.indexEndpoint
 */

import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';

const _BASE_URL = 'https://us-central1-aiplatform.googleapis.com/v1';

function result(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const vertex_ai_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const region = (properties.region as string) || ctx.region;
    const base = `https://${region}-aiplatform.googleapis.com/v1`;

    // Determine resource type from explicit property, fall back to name heuristic
    const explicit_type = properties.vertex_type as string | undefined;
    const is_index =
      explicit_type === 'index' || (!explicit_type && (name.includes('vector') || name.includes('index')));
    const type = is_index ? 'gcp.aiplatform.index' : 'gcp.aiplatform.endpoint';

    try {
      if (is_index) {
        // Create a Vector Search index
        const op = (await ctx.rest_client.post(`${base}/projects/${ctx.project}/locations/${region}/indexes`, {
          displayName: properties.display_name || name,
          description: `ICE managed index: ${name}`,
          metadata: {
            contentsDeltaUri: '',
            config: {
              dimensions: properties.dimensions || 768,
              approximateNeighborsCount: properties.neighbors_count || 150,
              algorithmConfig: {
                treeAhConfig: { leafNodeEmbeddingCount: 1000, leafNodesToSearchPercent: 10 },
              },
            },
          },
          indexUpdateMethod: 'STREAM_UPDATE',
          labels: properties.labels || {},
        })) as any;

        if (op?.name) await wait_for_operation(ctx, region, op.name);

        return result(name, type, 'create', start, {
          provider_id: `projects/${ctx.project}/locations/${region}/indexes/${name}`,
        });
      } else {
        // Create an endpoint (for LLM gateway or model serving)
        const op = (await ctx.rest_client.post(`${base}/projects/${ctx.project}/locations/${region}/endpoints`, {
          displayName: properties.display_name || name,
          labels: properties.labels || {},
        })) as any;

        if (op?.name) await wait_for_operation(ctx, region, op.name);

        return result(name, type, 'create', start, {
          provider_id: `projects/${ctx.project}/locations/${region}/endpoints/${name}`,
        });
      }
    } catch (error) {
      return fail(name, type, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const type = provider_id.includes('/indexes/') ? 'gcp.aiplatform.index' : 'gcp.aiplatform.endpoint';
    const region = extract_region(provider_id) || ctx.region;
    const base = `https://${region}-aiplatform.googleapis.com/v1`;

    try {
      if (properties.labels) {
        await ctx.rest_client.patch(`${base}/${provider_id}?updateMask=labels`, {
          labels: properties.labels,
        });
      }

      return result(name, type, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, type, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const type = provider_id.includes('/indexes/') ? 'gcp.aiplatform.index' : 'gcp.aiplatform.endpoint';
    const region = extract_region(provider_id) || ctx.region;
    const base = `https://${region}-aiplatform.googleapis.com/v1`;

    try {
      const op = (await ctx.rest_client.delete(`${base}/${provider_id}`)) as any;
      if (op?.name) await wait_for_operation(ctx, region, op.name);

      return result(name, type, 'delete', start);
    } catch (error) {
      return fail(name, type, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

function extract_region(provider_id: string): string {
  const match = provider_id.match(/locations\/([^/]+)/);
  return match?.[1] ?? 'us-central1';
}

async function wait_for_operation(ctx: GCPHandlerContext, region: string, op_name: string): Promise<void> {
  const base = `https://${region}-aiplatform.googleapis.com/v1`;
  const start = Date.now();
  while (Date.now() - start < 600_000) {
    const op = (await ctx.rest_client.get(`${base}/${op_name}`)) as any;
    if (op?.done) {
      if (op.error) throw new Error(operation_failed(SERVICE_NAMES.VERTEX_AI, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.VERTEX_AI));
}
