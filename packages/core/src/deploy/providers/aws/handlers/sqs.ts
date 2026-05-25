/**
 * SQS Handler
 *
 * Handles: aws.sqs.queue
 *
 * CreateQueue → SetQueueAttributes (if needed) → returns the QueueUrl
 * as provider_id. FIFO queues require the `.fifo` suffix in the name
 * (AWS enforces this); the handler appends it when the extractor
 * marks fifo:true.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.sqs.queue';
const SDK = '@aws-sdk/client-sqs';

function build_queue_attributes(properties: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (typeof properties.message_retention_seconds === 'number')
    attrs.MessageRetentionPeriod = String(properties.message_retention_seconds);
  if (typeof properties.visibility_timeout_seconds === 'number')
    attrs.VisibilityTimeout = String(properties.visibility_timeout_seconds);
  if (typeof properties.delay_seconds === 'number') attrs.DelaySeconds = String(properties.delay_seconds);
  if (properties.fifo === true) {
    attrs.FifoQueue = 'true';
    if (properties.content_based_deduplication === true) attrs.ContentBasedDeduplication = 'true';
  }
  return attrs;
}

function resolve_name(translator_name: string, properties: Record<string, unknown>): string {
  if (properties.fifo === true && !translator_name.endsWith('.fifo')) return `${translator_name}.fifo`;
  return translator_name;
}

export const sqs_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sqs') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'SQS', SDK);

    try {
      const sqs = await load_aws_sdk(SDK);
      if (!sqs) return sdkMissing(name, TYPE, 'create', start, 'SQS', SDK);

      const queueName = resolve_name(name, properties);
      const created = await client.send(
        new sqs.CreateQueueCommand({
          QueueName: queueName,
          Attributes: build_queue_attributes(properties),
          tags: properties.tags as Record<string, string>,
        }),
      );
      const url = created?.QueueUrl ?? `https://sqs.${ctx.region}.amazonaws.com/*/${queueName}`;
      return ok(name, TYPE, 'create', start, { provider_id: url });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sqs') as any;
    if (!client) return err(name, TYPE, 'update', start, 'SQS SDK not available');

    try {
      const sqs = await load_aws_sdk(SDK);
      if (!sqs) return err(name, TYPE, 'update', start, 'SQS SDK not available');

      const attrs = build_queue_attributes(properties);
      if (Object.keys(attrs).length > 0) {
        await client.send(new sqs.SetQueueAttributesCommand({ QueueUrl: provider_id, Attributes: attrs }));
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sqs') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'SQS SDK not available');

    try {
      const sqs = await load_aws_sdk(SDK);
      if (!sqs) return err(name, TYPE, 'delete', start, 'SQS SDK not available');

      await client.send(new sqs.DeleteQueueCommand({ QueueUrl: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
