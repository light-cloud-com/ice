/**
 * DynamoDB Handler
 *
 * Handles: aws.dynamodb.table
 *
 * CreateTable with the extractor-shaped partition/sort key spec +
 * billing mode. PROVISIONED billing emits ProvisionedThroughput;
 * PAY_PER_REQUEST omits it. Point-in-time recovery is set via a
 * follow-up UpdateContinuousBackups call when enabled.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.dynamodb.table';
const SDK = '@aws-sdk/client-dynamodb';

function build_key_schema(properties: Record<string, unknown>): {
  KeySchema: Array<{ AttributeName: string; KeyType: 'HASH' | 'RANGE' }>;
  AttributeDefinitions: Array<{ AttributeName: string; AttributeType: string }>;
} {
  const pk = String(properties.partition_key);
  const pkType = String(properties.partition_key_type || 'S');
  const sk = properties.sort_key ? String(properties.sort_key) : undefined;
  const skType = String(properties.sort_key_type || 'S');

  const KeySchema: Array<{ AttributeName: string; KeyType: 'HASH' | 'RANGE' }> = [
    { AttributeName: pk, KeyType: 'HASH' },
  ];
  const AttributeDefinitions: Array<{ AttributeName: string; AttributeType: string }> = [
    { AttributeName: pk, AttributeType: pkType },
  ];
  if (sk) {
    KeySchema.push({ AttributeName: sk, KeyType: 'RANGE' });
    AttributeDefinitions.push({ AttributeName: sk, AttributeType: skType });
  }
  return { KeySchema, AttributeDefinitions };
}

export const dynamodb_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('dynamodb') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'DynamoDB', SDK);

    try {
      const dynamo = await load_aws_sdk(SDK);
      if (!dynamo) return sdkMissing(name, TYPE, 'create', start, 'DynamoDB', SDK);

      const { KeySchema, AttributeDefinitions } = build_key_schema(properties);
      const billing = (properties.billing_mode as string) || 'PAY_PER_REQUEST';

      await client.send(
        new dynamo.CreateTableCommand({
          TableName: name,
          KeySchema,
          AttributeDefinitions,
          BillingMode: billing,
          ...(billing === 'PROVISIONED' && {
            ProvisionedThroughput: {
              ReadCapacityUnits: (properties.read_capacity as number) || 5,
              WriteCapacityUnits: (properties.write_capacity as number) || 5,
            },
          }),
          Tags: properties.tags
            ? Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value }))
            : undefined,
        }),
      );

      if (properties.point_in_time_recovery === true) {
        await client.send(
          new dynamo.UpdateContinuousBackupsCommand({
            TableName: name,
            PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
          }),
        );
      }

      return ok(name, TYPE, 'create', start, { provider_id: `arn:aws:dynamodb:${ctx.region}:*:table/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('dynamodb') as any;
    if (!client) return err(name, TYPE, 'update', start, 'DynamoDB SDK not available');

    try {
      const dynamo = await load_aws_sdk(SDK);
      if (!dynamo) return err(name, TYPE, 'update', start, 'DynamoDB SDK not available');

      // Only billing mode + provisioned capacity are safely updatable
      // mid-flight (key schema is locked at create). PITR can be
      // toggled via UpdateContinuousBackups.
      const billing = properties.billing_mode as string | undefined;
      if (billing) {
        await client.send(
          new dynamo.UpdateTableCommand({
            TableName: name,
            BillingMode: billing,
            ...(billing === 'PROVISIONED' && {
              ProvisionedThroughput: {
                ReadCapacityUnits: (properties.read_capacity as number) || 5,
                WriteCapacityUnits: (properties.write_capacity as number) || 5,
              },
            }),
          }),
        );
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('dynamodb') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'DynamoDB SDK not available');

    try {
      const dynamo = await load_aws_sdk(SDK);
      if (!dynamo) return err(name, TYPE, 'delete', start, 'DynamoDB SDK not available');

      await client.send(new dynamo.DeleteTableCommand({ TableName: name }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
