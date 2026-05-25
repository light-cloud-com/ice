/**
 * SageMaker Handler
 *
 * Handles: aws.sagemaker.endpoint
 *
 * CreateEndpointConfig → CreateEndpoint. The model itself (training +
 * registration) is operator-side — the handler refuses to create an
 * endpoint when `model_name` is empty.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.sagemaker.endpoint';
const SDK = '@aws-sdk/client-sagemaker';

export const sagemaker_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sagemaker') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'SageMaker', SDK);

    if (!properties.model_name) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'SageMaker endpoint requires properties.model_name (register the model first).',
      );
    }

    try {
      const sm = await load_aws_sdk(SDK);
      if (!sm) return sdkMissing(name, TYPE, 'create', start, 'SageMaker', SDK);

      const configName = `${name}-config`;
      await client.send(
        new sm.CreateEndpointConfigCommand({
          EndpointConfigName: configName,
          ProductionVariants: [
            {
              VariantName: 'default',
              ModelName: properties.model_name as string,
              InstanceType: properties.instance_type as string,
              InitialInstanceCount: properties.initial_instance_count as number,
              InitialVariantWeight: properties.initial_variant_weight as number,
            },
          ],
        }),
      );

      const created = await client.send(
        new sm.CreateEndpointCommand({ EndpointName: name, EndpointConfigName: configName }),
      );

      return ok(name, TYPE, 'create', start, {
        provider_id: created?.EndpointArn || `arn:aws:sagemaker:${ctx.region}:*:endpoint/${name}`,
      });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sagemaker') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'SageMaker SDK not available');

    try {
      const sm = await load_aws_sdk(SDK);
      if (!sm) return err(name, TYPE, 'delete', start, 'SageMaker SDK not available');

      await client.send(new sm.DeleteEndpointCommand({ EndpointName: name }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
