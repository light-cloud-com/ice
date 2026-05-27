/**
 * Tests for the aws.opensearchserverless.collection handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const oss = makeSdkMock({
    client_class_name: 'OpenSearchServerlessClient',
    command_class_names: ['CreateCollectionCommand', 'UpdateCollectionCommand', 'DeleteCollectionCommand'],
    sendImpl: (cmd) =>
      cmd.__cmd === 'CreateCollection'
        ? { createCollectionDetail: { id: 'col-aaa', arn: 'arn:aws:aoss:us-east-1:111:collection/col-aaa' } }
        : {},
  });
  install_dynamic_import_stub({ '@aws-sdk/client-opensearchserverless': oss.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, oss };
}

describe('aws.opensearchserverless.collection handler', () => {
  it('creates a VECTORSEARCH collection by default', async () => {
    const { d, oss } = await setup();
    const out = await d.create('aws.opensearchserverless.collection', 'vectors', {}, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:aoss:us-east-1:111:collection/col-aaa');
    const create = oss.sendCalls.find((c: any) => c.__cmd === 'CreateCollection')!;
    expect(create.input.type).toBe('VECTORSEARCH');
    expect(create.input.standbyReplicas).toBe('DISABLED');
  });

  it('honours operator-supplied collection_type + standby_replicas', async () => {
    const { d, oss } = await setup();
    await d.create(
      'aws.opensearchserverless.collection',
      'logs',
      { collection_type: 'TIMESERIES', standby_replicas: 'ENABLED' },
      {},
    );
    const create = oss.sendCalls.find((c: any) => c.__cmd === 'CreateCollection')!;
    expect(create.input.type).toBe('TIMESERIES');
    expect(create.input.standbyReplicas).toBe('ENABLED');
  });

  it('deletes via DeleteCollection using the id from the ARN', async () => {
    const { d, oss } = await setup();
    const out = await d.delete(
      'aws.opensearchserverless.collection',
      'vectors',
      'arn:aws:aoss:us-east-1:111:collection/col-aaa',
      {},
    );
    expect(out.success).toBe(true);
    expect(oss.sendCalls.find((c: any) => c.__cmd === 'DeleteCollection')!.input.id).toBe('col-aaa');
  });
});
