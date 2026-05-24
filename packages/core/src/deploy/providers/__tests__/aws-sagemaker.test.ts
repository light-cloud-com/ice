import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

describe('aws.sagemaker.endpoint handler', () => {
  it('refuses to create when model_name is empty', async () => {
    const sm = makeSdkMock({
      client_class_name: 'SageMakerClient',
      command_class_names: ['CreateEndpointConfigCommand', 'CreateEndpointCommand', 'DeleteEndpointCommand'],
    });
    install_dynamic_import_stub({ '@aws-sdk/client-sagemaker': sm.module });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });
    const out = await d.create('aws.sagemaker.endpoint', 'ep', { model_name: '' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/model_name/);
  });

  it('creates EndpointConfig then Endpoint when model_name is set', async () => {
    const sm = makeSdkMock({
      client_class_name: 'SageMakerClient',
      command_class_names: ['CreateEndpointConfigCommand', 'CreateEndpointCommand', 'DeleteEndpointCommand'],
      sendImpl: (cmd) =>
        cmd.__cmd === 'CreateEndpoint'
          ? { EndpointArn: `arn:aws:sagemaker:us-east-1:111:endpoint/${cmd.input.EndpointName}` }
          : {},
    });
    install_dynamic_import_stub({ '@aws-sdk/client-sagemaker': sm.module });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create(
      'aws.sagemaker.endpoint',
      'ep',
      { model_name: 'my-model', instance_type: 'ml.t2.medium', initial_instance_count: 1, initial_variant_weight: 1 },
      {},
    );
    expect(out.success).toBe(true);
    const cmds = sm.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['CreateEndpointConfig', 'CreateEndpoint']);
  });
});
