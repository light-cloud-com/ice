/**
 * CloudWatch Logs Handler
 *
 * Handles: aws.cloudwatch.logGroup
 *
 * CreateLogGroup → PutRetentionPolicy (optional) → AssociateKmsKey
 * (optional) on create. Retention update on update. DeleteLogGroup
 * on delete. Tags are passed at creation via the `tags` parameter.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.cloudwatch.logGroup';
const SDK = '@aws-sdk/client-cloudwatch-logs';

export const cloudwatch_logs_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cloudwatch-logs') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'CloudWatch Logs', SDK);

    try {
      const cwl = await load_aws_sdk(SDK);
      if (!cwl) return sdkMissing(name, TYPE, 'create', start, 'CloudWatch Logs', SDK);

      await client.send(
        new cwl.CreateLogGroupCommand({
          logGroupName: name,
          tags: properties.tags as Record<string, string>,
          kmsKeyId: (properties.kms_key_id as string) || undefined,
        }),
      );

      const retention = properties.retention_in_days as number | undefined;
      if (typeof retention === 'number' && retention > 0) {
        await client.send(new cwl.PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: retention }));
      }

      return ok(name, TYPE, 'create', start, { provider_id: `arn:aws:logs:${ctx.region}:*:log-group:${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cloudwatch-logs') as any;
    if (!client) return err(name, TYPE, 'update', start, 'CloudWatch Logs SDK not available');

    try {
      const cwl = await load_aws_sdk(SDK);
      if (!cwl) return err(name, TYPE, 'update', start, 'CloudWatch Logs SDK not available');

      const retention = properties.retention_in_days as number | undefined;
      if (typeof retention === 'number' && retention > 0) {
        await client.send(new cwl.PutRetentionPolicyCommand({ logGroupName: name, retentionInDays: retention }));
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cloudwatch-logs') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'CloudWatch Logs SDK not available');

    try {
      const cwl = await load_aws_sdk(SDK);
      if (!cwl) return err(name, TYPE, 'delete', start, 'CloudWatch Logs SDK not available');

      await client.send(new cwl.DeleteLogGroupCommand({ logGroupName: name }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
