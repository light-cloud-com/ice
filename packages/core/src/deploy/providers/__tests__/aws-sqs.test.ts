/**
 * Tests for the aws.sqs.queue handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const sqs = makeSdkMock({
    client_class_name: 'SQSClient',
    command_class_names: ['CreateQueueCommand', 'SetQueueAttributesCommand', 'DeleteQueueCommand'],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateQueue') {
        return { QueueUrl: `https://sqs.us-east-1.amazonaws.com/111/${cmd.input.QueueName}` };
      }
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-sqs': sqs.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, sqs };
}

describe('aws.sqs.queue handler', () => {
  it('creates a standard queue and returns the QueueUrl as provider_id', async () => {
    const { d, sqs } = await setup();
    const out = await d.create(
      'aws.sqs.queue',
      'orders',
      { message_retention_seconds: 345600, visibility_timeout_seconds: 30, delay_seconds: 0, fifo: false },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('https://sqs.us-east-1.amazonaws.com/111/orders');
    const cmd = sqs.sendCalls[0];
    expect(cmd.input.QueueName).toBe('orders');
    expect(cmd.input.Attributes).toMatchObject({
      MessageRetentionPeriod: '345600',
      VisibilityTimeout: '30',
      DelaySeconds: '0',
    });
    expect(cmd.input.Attributes.FifoQueue).toBeUndefined();
  });

  it('appends .fifo suffix + FifoQueue attribute when fifo=true', async () => {
    const { d, sqs } = await setup();
    const out = await d.create('aws.sqs.queue', 'jobs', { fifo: true, content_based_deduplication: true }, {});
    expect(out.success).toBe(true);
    const cmd = sqs.sendCalls[0];
    expect(cmd.input.QueueName).toBe('jobs.fifo');
    expect(cmd.input.Attributes.FifoQueue).toBe('true');
    expect(cmd.input.Attributes.ContentBasedDeduplication).toBe('true');
  });

  it('deletes via DeleteQueue using the provider_id URL', async () => {
    const { d, sqs } = await setup();
    const out = await d.delete('aws.sqs.queue', 'orders', 'https://sqs.us-east-1.amazonaws.com/111/orders', {});
    expect(out.success).toBe(true);
    expect(sqs.sendCalls[0].__cmd).toBe('DeleteQueue');
    expect(sqs.sendCalls[0].input.QueueUrl).toBe('https://sqs.us-east-1.amazonaws.com/111/orders');
  });
});
