/**
 * Bedrock Handler
 *
 * Handles: aws.bedrock.endpoint
 *
 * Bedrock on-demand foundation-model access is account-level
 * (nothing to provision). Provisioned throughput IS a real resource
 * — the handler only emits a CreateProvisionedModelThroughput when
 * `model_units > 0`. Otherwise create is a deliberate no-op so the
 * deploy succeeds without an orphan resource.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.bedrock.endpoint';
const SDK = '@aws-sdk/client-bedrock';

export const bedrock_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const modelUnits = (properties.model_units as number) ?? 0;

    // On-demand mode — no resource to create. Surface a clear log
    // message so operators don't think the create silently failed.
    if (modelUnits <= 0) {
      ctx.on_log?.(`Bedrock on-demand mode for ${name}: no provisioned throughput resource created.`);
      return ok(name, TYPE, 'create', start, {
        provider_id: `arn:aws:bedrock:${ctx.region}:*:model/${properties.model_id}`,
      });
    }

    const client = ctx.clients.get('bedrock') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Bedrock', SDK);

    try {
      const bedrock = await load_aws_sdk(SDK);
      if (!bedrock) return sdkMissing(name, TYPE, 'create', start, 'Bedrock', SDK);

      const created = await client.send(
        new bedrock.CreateProvisionedModelThroughputCommand({
          provisionedModelName: name,
          modelId: properties.model_id as string,
          modelUnits,
          commitmentDuration: properties.commitment_duration as string,
        }),
      );

      return ok(name, TYPE, 'create', start, {
        provider_id: created?.provisionedModelArn || `arn:aws:bedrock:${ctx.region}:*:provisioned-model/${name}`,
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
    // On-demand model: nothing to delete (the create returned a synthetic ARN).
    if (!provider_id.includes('provisioned-model')) return ok(name, TYPE, 'delete', start);

    const client = ctx.clients.get('bedrock') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Bedrock SDK not available');

    try {
      const bedrock = await load_aws_sdk(SDK);
      if (!bedrock) return err(name, TYPE, 'delete', start, 'Bedrock SDK not available');

      await client.send(new bedrock.DeleteProvisionedModelThroughputCommand({ provisionedModelId: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
