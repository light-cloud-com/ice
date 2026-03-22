/**
 * Cloud Functions Handler (v2)
 *
 * Handles: gcp.cloudfunctions.function
 */

import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';
import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';

const TYPE = 'gcp.cloudfunctions.function';
const BASE_URL = 'https://cloudfunctions.googleapis.com/v2';

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

export const cloud_functions_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const region = (properties.region as string) || ctx.region;

    try {
      // Try the SDK first, fall back to REST
      const client = ctx.clients.get('functions') as any;
      if (client) {
        const [operation] = await client.createFunction({
          parent: `projects/${ctx.project}/locations/${region}`,
          functionId: name,
          function: build_function_spec(name, properties, ctx),
        });
        await operation.promise();
      } else {
        const op = (await ctx.rest_client.post(
          `${BASE_URL}/projects/${ctx.project}/locations/${region}/functions?functionId=${name}`,
          build_function_spec(name, properties, ctx)
        )) as any;
        if (op?.name) await wait_for_operation(ctx, op.name);
      }

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/locations/${region}/functions/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const region = extract_region(provider_id) || ctx.region;

    try {
      const func_name = `projects/${ctx.project}/locations/${region}/functions/${name}`;
      await ctx.rest_client.patch(
        `${BASE_URL}/${func_name}`,
        build_function_spec(name, properties, ctx)
      );

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const region = extract_region(provider_id) || ctx.region;

    try {
      const func_name = `projects/${ctx.project}/locations/${region}/functions/${name}`;
      await ctx.rest_client.delete(`${BASE_URL}/${func_name}`);

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

function build_function_spec(
  name: string,
  properties: Record<string, unknown>,
  ctx: GCPHandlerContext
): Record<string, unknown> {
  const spec: Record<string, unknown> = {
    name,
    buildConfig: {
      runtime: properties.runtime || 'nodejs20',
      entryPoint: properties.entry_point || 'handler',
      source: {} as Record<string, unknown>,
    },
    serviceConfig: {
      availableMemory: `${properties.memory_mb || 256}Mi`,
      timeoutSeconds: properties.timeout_seconds || 30,
      environmentVariables: properties.env_vars || {},
    },
    labels: properties.labels || {},
  };

  // ENGINE-9: Cloud Functions v2 requires a source — attach storage or repo source
  const buildConfig = spec.buildConfig as Record<string, unknown>;
  if (properties.source_bucket && properties.source_object) {
    buildConfig.source = {
      storageSource: {
        bucket: properties.source_bucket,
        object: properties.source_object,
      },
    };
  } else if (properties.source_repo) {
    buildConfig.source = {
      repoSource: {
        repoName: properties.source_repo,
        branchName: (properties.source_branch as string) || 'main',
        dir: (properties.source_dir as string) || '/',
      },
    };
  } else {
    // Default: inline source upload expected via the pipeline build step
    buildConfig.source = {
      storageSource: {
        bucket: `${ctx.project}-gcf-source`,
        object: `${name}/function-source.zip`,
      },
    };
  }

  return spec;
}

function extract_region(provider_id: string): string {
  const match = provider_id.match(/locations\/([^/]+)/);
  return match?.[1] ?? 'us-central1';
}

async function wait_for_operation(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 300_000) {
    const op = (await ctx.rest_client.get(
      `https://cloudfunctions.googleapis.com/v2/${op_name}`
    )) as any;
    if (op?.done) {
      if (op.error)
        throw new Error(operation_failed(SERVICE_NAMES.CLOUD_FUNCTIONS, JSON.stringify(op.error)));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.CLOUD_FUNCTIONS));
}
