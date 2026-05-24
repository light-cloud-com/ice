import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

describe('aws.bedrock.endpoint handler', () => {
  it('is a no-op on create when model_units=0 (on-demand mode)', async () => {
    const bedrock = makeSdkMock({
      client_class_name: 'BedrockClient',
      command_class_names: ['CreateProvisionedModelThroughputCommand', 'DeleteProvisionedModelThroughputCommand'],
    });
    install_dynamic_import_stub({ '@aws-sdk/client-bedrock': bedrock.module });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create(
      'aws.bedrock.endpoint',
      'llm',
      { model_id: 'anthropic.claude-3-haiku-20240307-v1:0', model_units: 0 },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toContain('model/anthropic.claude-3-haiku-20240307-v1:0');
    expect(bedrock.sendCalls).toHaveLength(0);
  });

  it('creates provisioned throughput when model_units>0', async () => {
    const bedrock = makeSdkMock({
      client_class_name: 'BedrockClient',
      command_class_names: ['CreateProvisionedModelThroughputCommand', 'DeleteProvisionedModelThroughputCommand'],
      sendImpl: (cmd) =>
        cmd.__cmd === 'CreateProvisionedModelThroughput'
          ? { provisionedModelArn: `arn:aws:bedrock:us-east-1:111:provisioned-model/${cmd.input.provisionedModelName}` }
          : {},
    });
    install_dynamic_import_stub({ '@aws-sdk/client-bedrock': bedrock.module });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create(
      'aws.bedrock.endpoint',
      'llm',
      { model_id: 'anthropic.claude-3-haiku-20240307-v1:0', model_units: 2, commitment_duration: 'OneMonth' },
      {},
    );
    expect(out.success).toBe(true);
    expect(bedrock.sendCalls[0].__cmd).toBe('CreateProvisionedModelThroughput');
    expect(bedrock.sendCalls[0].input.modelUnits).toBe(2);
  });
});
