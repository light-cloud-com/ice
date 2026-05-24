/**
 * Tests for the aws.dynamodb.table handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const dynamo = makeSdkMock({
    client_class_name: 'DynamoDBClient',
    command_class_names: [
      'CreateTableCommand',
      'UpdateTableCommand',
      'DeleteTableCommand',
      'UpdateContinuousBackupsCommand',
    ],
  });
  install_dynamic_import_stub({ '@aws-sdk/client-dynamodb': dynamo.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, dynamo };
}

describe('aws.dynamodb.table handler', () => {
  it('creates a PAY_PER_REQUEST table with a single hash key by default', async () => {
    const { d, dynamo } = await setup();
    const out = await d.create(
      'aws.dynamodb.table',
      'orders',
      { billing_mode: 'PAY_PER_REQUEST', partition_key: 'id', partition_key_type: 'S' },
      {},
    );
    expect(out.success).toBe(true);
    const cmd = dynamo.sendCalls[0];
    expect(cmd.__cmd).toBe('CreateTable');
    expect(cmd.input.BillingMode).toBe('PAY_PER_REQUEST');
    expect(cmd.input.KeySchema).toEqual([{ AttributeName: 'id', KeyType: 'HASH' }]);
    expect(cmd.input.ProvisionedThroughput).toBeUndefined();
  });

  it('adds a RANGE entry to KeySchema when sort_key is set', async () => {
    const { d, dynamo } = await setup();
    await d.create(
      'aws.dynamodb.table',
      'events',
      { partition_key: 'pk', partition_key_type: 'S', sort_key: 'ts', sort_key_type: 'N' },
      {},
    );
    const cmd = dynamo.sendCalls[0];
    expect(cmd.input.KeySchema).toEqual([
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'ts', KeyType: 'RANGE' },
    ]);
    expect(cmd.input.AttributeDefinitions).toEqual([
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'ts', AttributeType: 'N' },
    ]);
  });

  it('emits ProvisionedThroughput when billing_mode=PROVISIONED', async () => {
    const { d, dynamo } = await setup();
    await d.create(
      'aws.dynamodb.table',
      't',
      { billing_mode: 'PROVISIONED', partition_key: 'id', read_capacity: 25, write_capacity: 50 },
      {},
    );
    expect(dynamo.sendCalls[0].input.ProvisionedThroughput).toEqual({
      ReadCapacityUnits: 25,
      WriteCapacityUnits: 50,
    });
  });

  it('issues UpdateContinuousBackups when point_in_time_recovery=true', async () => {
    const { d, dynamo } = await setup();
    await d.create('aws.dynamodb.table', 't', { partition_key: 'id', point_in_time_recovery: true }, {});
    const cmds = dynamo.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['CreateTable', 'UpdateContinuousBackups']);
  });

  it('deletes the table on delete', async () => {
    const { d, dynamo } = await setup();
    await d.delete('aws.dynamodb.table', 't', 'arn', {});
    expect(dynamo.sendCalls[0].__cmd).toBe('DeleteTable');
    expect(dynamo.sendCalls[0].input.TableName).toBe('t');
  });
});
