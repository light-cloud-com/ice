/**
 * SNS Handler
 *
 * Handles: aws.sns.topic
 *
 * CreateTopic returns the topic ARN as provider_id. FIFO topics need
 * the .fifo suffix in the name (AWS enforces); the handler appends
 * it when the extractor sets fifo:true.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.sns.topic';
const SDK = '@aws-sdk/client-sns';

function resolve_name(translator_name: string, properties: Record<string, unknown>): string {
  if (properties.fifo === true && !translator_name.endsWith('.fifo')) return `${translator_name}.fifo`;
  return translator_name;
}

function build_topic_attributes(properties: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (properties.fifo === true) attrs.FifoTopic = 'true';
  if (properties.display_name) attrs.DisplayName = String(properties.display_name);
  if (properties.kms_master_key_id) attrs.KmsMasterKeyId = String(properties.kms_master_key_id);
  return attrs;
}

export const sns_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sns') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'SNS', SDK);

    try {
      const sns = await load_aws_sdk(SDK);
      if (!sns) return sdkMissing(name, TYPE, 'create', start, 'SNS', SDK);

      const topicName = resolve_name(name, properties);
      const created = await client.send(
        new sns.CreateTopicCommand({
          Name: topicName,
          Attributes: build_topic_attributes(properties),
          Tags: properties.tags
            ? Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value }))
            : undefined,
        }),
      );
      const arn = created?.TopicArn ?? `arn:aws:sns:${ctx.region}:*:${topicName}`;
      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sns') as any;
    if (!client) return err(name, TYPE, 'update', start, 'SNS SDK not available');

    try {
      const sns = await load_aws_sdk(SDK);
      if (!sns) return err(name, TYPE, 'update', start, 'SNS SDK not available');

      // SNS topic-level attributes are set one at a time via
      // SetTopicAttributes — issue one call per non-empty attribute.
      const attrs = build_topic_attributes(properties);
      // FifoTopic can't change after creation; skip it on update.
      delete attrs.FifoTopic;
      for (const [AttributeName, AttributeValue] of Object.entries(attrs)) {
        await client.send(new sns.SetTopicAttributesCommand({ TopicArn: provider_id, AttributeName, AttributeValue }));
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('sns') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'SNS SDK not available');

    try {
      const sns = await load_aws_sdk(SDK);
      if (!sns) return err(name, TYPE, 'delete', start, 'SNS SDK not available');

      await client.send(new sns.DeleteTopicCommand({ TopicArn: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
