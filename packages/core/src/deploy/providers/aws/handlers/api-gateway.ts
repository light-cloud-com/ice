/**
 * API Gateway Handler
 *
 * Handles: aws.apigateway.restApi
 *
 * CreateRestApi → CreateDeployment (default stage). Routes /
 * integrations are wired by the consuming compute handler (Lambda
 * etc.) via outgoing edges; the baseline here just stands up an
 * empty REST API + deployable stage.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.apigateway.restApi';
const SDK = '@aws-sdk/client-api-gateway';

export const api_gateway_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('apigateway') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'API Gateway', SDK);

    try {
      const api = await load_aws_sdk(SDK);
      if (!api) return sdkMissing(name, TYPE, 'create', start, 'API Gateway', SDK);

      const created = await client.send(
        new api.CreateRestApiCommand({
          name,
          description: properties.description as string,
          endpointConfiguration: { types: [(properties.endpoint_type as string) || 'REGIONAL'] },
          apiKeySource: properties.api_key_required ? 'HEADER' : undefined,
          binaryMediaTypes: properties.binary_media_types as string[],
        }),
      );
      const restApiId = created?.id;
      if (!restApiId) return err(name, TYPE, 'create', start, 'CreateRestApi returned no id');

      await client.send(
        new api.CreateDeploymentCommand({ restApiId, stageName: (properties.stage_name as string) || 'prod' }),
      );

      return ok(name, TYPE, 'create', start, {
        provider_id: `arn:aws:apigateway:${ctx.region}::/restapis/${restApiId}`,
      });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('apigateway') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'API Gateway SDK not available');

    try {
      const api = await load_aws_sdk(SDK);
      if (!api) return err(name, TYPE, 'delete', start, 'API Gateway SDK not available');

      // Recover restApiId from the ARN.
      const restApiId = provider_id.split('/').pop();
      await client.send(new api.DeleteRestApiCommand({ restApiId }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
