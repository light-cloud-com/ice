/**
 * Tests for the aws.mq.broker handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const mq = makeSdkMock({
    client_class_name: 'MqClient',
    command_class_names: ['CreateBrokerCommand', 'UpdateBrokerCommand', 'DeleteBrokerCommand'],
    sendImpl: (cmd) =>
      cmd.__cmd === 'CreateBroker' ? { BrokerId: 'b-aaaa', BrokerArn: 'arn:aws:mq:us-east-1:111:broker:b-aaaa' } : {},
  });
  install_dynamic_import_stub({ '@aws-sdk/client-mq': mq.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, mq };
}

describe('aws.mq.broker handler', () => {
  it('creates a RabbitMQ broker with admin creds', async () => {
    const { d, mq } = await setup();
    const out = await d.create(
      'aws.mq.broker',
      'orders',
      { admin_username: 'admin', admin_password: 'StrongPass!42', deployment_mode: 'SINGLE_INSTANCE' },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:mq:us-east-1:111:broker:b-aaaa');
    const create = mq.sendCalls.find((c: any) => c.__cmd === 'CreateBroker')!;
    expect(create.input.EngineType).toBe('RABBITMQ');
    expect(create.input.Users[0].Username).toBe('admin');
  });

  it('refuses to create without admin credentials', async () => {
    const { d } = await setup();
    const out = await d.create('aws.mq.broker', 'orders', { admin_username: 'admin' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/admin_password/);
  });

  it('deletes via DeleteBroker using the broker id from the ARN', async () => {
    const { d, mq } = await setup();
    const out = await d.delete('aws.mq.broker', 'orders', 'arn:aws:mq:us-east-1:111:broker:b-aaaa', {});
    expect(out.success).toBe(true);
    expect(mq.sendCalls.find((c: any) => c.__cmd === 'DeleteBroker')!.input.BrokerId).toBe('b-aaaa');
  });
});
