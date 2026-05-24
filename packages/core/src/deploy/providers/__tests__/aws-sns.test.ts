/**
 * Tests for the aws.sns.topic handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const sns = makeSdkMock({
    client_class_name: 'SNSClient',
    command_class_names: ['CreateTopicCommand', 'SetTopicAttributesCommand', 'DeleteTopicCommand'],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateTopic') return { TopicArn: `arn:aws:sns:us-east-1:111:${cmd.input.Name}` };
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-sns': sns.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, sns };
}

describe('aws.sns.topic handler', () => {
  it('creates a standard topic and returns the TopicArn', async () => {
    const { d, sns } = await setup();
    const out = await d.create('aws.sns.topic', 'alerts', {}, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:sns:us-east-1:111:alerts');
    expect(sns.sendCalls[0].input.Name).toBe('alerts');
  });

  it('appends .fifo + sets FifoTopic attribute when fifo=true', async () => {
    const { d, sns } = await setup();
    await d.create('aws.sns.topic', 'jobs', { fifo: true }, {});
    const cmd = sns.sendCalls[0];
    expect(cmd.input.Name).toBe('jobs.fifo');
    expect(cmd.input.Attributes.FifoTopic).toBe('true');
  });

  it('deletes via DeleteTopic with the TopicArn provider_id', async () => {
    const { d, sns } = await setup();
    await d.delete('aws.sns.topic', 'alerts', 'arn:aws:sns:us-east-1:111:alerts', {});
    expect(sns.sendCalls[0].__cmd).toBe('DeleteTopic');
    expect(sns.sendCalls[0].input.TopicArn).toBe('arn:aws:sns:us-east-1:111:alerts');
  });
});
