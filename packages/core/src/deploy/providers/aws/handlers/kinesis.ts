/**
 * Kinesis Data Streams Handler
 *
 * Handles: aws.kinesis.stream — backs Messaging.EventStream on AWS
 * (parallel to GCP Dataflow and Azure Event Hubs).
 *
 * On-demand mode by default (auto-scaling, no shard math required).
 * Operators flip to provisioned mode by setting `shard_count`.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.kinesis.stream';
const SDK = '@aws-sdk/client-kinesis';

export const kinesis_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('kinesis') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Kinesis', SDK);

    try {
      const kinesis = await load_aws_sdk(SDK);
      if (!kinesis) return sdkMissing(name, TYPE, 'create', start, 'Kinesis', SDK);

      const shard_count = properties.shard_count as number | undefined;
      await client.send(
        new kinesis.CreateStreamCommand({
          StreamName: name,
          ShardCount: shard_count,
          StreamModeDetails: shard_count ? undefined : { StreamMode: 'ON_DEMAND' },
        }),
      );
      const region = ctx.region;
      const accountId = await ctx.ensure_account_id();
      return ok(name, TYPE, 'create', start, {
        provider_id: `arn:aws:kinesis:${region}:${accountId}:stream/${name}`,
      });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('kinesis') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Kinesis SDK not available');
    try {
      const kinesis = await load_aws_sdk(SDK);
      if (!kinesis) return err(name, TYPE, 'update', start, 'Kinesis SDK not available');
      // ShardCount changes use UpdateShardCount; retention via
      // IncreaseStreamRetentionPeriod / DecreaseStreamRetentionPeriod.
      if (typeof properties.retention_hours === 'number' && kinesis.IncreaseStreamRetentionPeriodCommand) {
        await client.send(
          new kinesis.IncreaseStreamRetentionPeriodCommand({
            StreamName: name,
            RetentionPeriodHours: properties.retention_hours,
          }),
        );
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('kinesis') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Kinesis SDK not available');
    try {
      const kinesis = await load_aws_sdk(SDK);
      if (!kinesis) return err(name, TYPE, 'delete', start, 'Kinesis SDK not available');
      await client.send(new kinesis.DeleteStreamCommand({ StreamName: name, EnforceConsumerDeletion: true }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
