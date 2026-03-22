/**
 * API Gateway Handler
 *
 * Handles: gcp.apigateway.api
 * Uses REST API.
 */

import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler, GCPHandlerContext } from '../types.js';
import { SERVICE_NAMES, operation_failed, operation_timed_out } from '../messages.js';

const TYPE = 'gcp.apigateway.api';
const BASE_URL = 'https://apigateway.googleapis.com/v1';

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

export const api_gateway_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();

    try {
      // Step 1: Create the API
      const apiOp = (await ctx.rest_client.post(
        `${BASE_URL}/projects/${ctx.project}/locations/global/apis?apiId=${name}`,
        {
          displayName: name,
          labels: properties.labels || {},
        }
      )) as any;

      if (apiOp?.name) await wait_for_operation(ctx, apiOp.name);

      // Step 2: Create API Config (requires an OpenAPI spec)
      const configName = `${name}-config`;
      if (properties.openapi_spec) {
        const configOp = (await ctx.rest_client.post(
          `${BASE_URL}/projects/${ctx.project}/locations/global/apis/${name}/configs?apiConfigId=${configName}`,
          {
            displayName: configName,
            openapiDocuments: [{
              document: {
                path: 'openapi.yaml',
                contents: Buffer.from(
                  typeof properties.openapi_spec === 'string'
                    ? properties.openapi_spec
                    : JSON.stringify(properties.openapi_spec)
                ).toString('base64'),
              },
            }],
            labels: properties.labels || {},
          }
        )) as any;

        if (configOp?.name) await wait_for_operation(ctx, configOp.name);

        // Step 3: Create the Gateway
        const gatewayName = `${name}-gw`;
        const region = (properties.region as string) || ctx.region;
        const gwOp = (await ctx.rest_client.post(
          `${BASE_URL}/projects/${ctx.project}/locations/${region}/gateways?gatewayId=${gatewayName}`,
          {
            displayName: gatewayName,
            apiConfig: `projects/${ctx.project}/locations/global/apis/${name}/configs/${configName}`,
            labels: properties.labels || {},
          }
        )) as any;

        if (gwOp?.name) await wait_for_operation(ctx, gwOp.name);
      }

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/locations/global/apis/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();

    try {
      if (properties.labels) {
        await ctx.rest_client.patch(
          `${BASE_URL}/projects/${ctx.project}/locations/global/apis/${name}?updateMask=labels`,
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
        `${BASE_URL}/projects/${ctx.project}/locations/global/apis/${name}`
      )) as any;

      if (op?.name) await wait_for_operation(ctx, op.name);

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

async function wait_for_operation(ctx: GCPHandlerContext, op_name: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const op = (await ctx.rest_client.get(`${BASE_URL}/${op_name}`)) as any;
    if (op?.done) {
      if (op.error)
        throw new Error(operation_failed(SERVICE_NAMES.API_GATEWAY, JSON.stringify(op.error)));
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(operation_timed_out(SERVICE_NAMES.API_GATEWAY));
}
