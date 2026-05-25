/**
 * Tests for the aws.secretsmanager.secret handler.
 *
 * Uses the shared `_aws-test-harness` so we don't duplicate the
 * Function-constructor stub setup per file.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const sm = makeSdkMock({
    client_class_name: 'SecretsManagerClient',
    command_class_names: ['CreateSecretCommand', 'UpdateSecretCommand', 'DeleteSecretCommand'],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateSecret') {
        return { ARN: `arn:aws:secretsmanager:us-east-1:111:secret:${cmd.input.Name}-AbCdEf` };
      }
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-secrets-manager': sm.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, sm };
}

describe('aws.secretsmanager.secret handler', () => {
  it('creates a secret and returns the ARN from the SDK response', async () => {
    const { d, sm } = await setup();
    const out = await d.create('aws.secretsmanager.secret', 'prod-stripe-key', { description: 'stripe' }, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:secretsmanager:us-east-1:111:secret:prod-stripe-key-AbCdEf');
    expect(sm.sendCalls[0].__cmd).toBe('CreateSecret');
    expect(sm.sendCalls[0].input.Name).toBe('prod-stripe-key');
    expect(sm.sendCalls[0].input.Description).toBe('stripe');
  });

  it('updates description + KmsKeyId via UpdateSecret', async () => {
    const { d, sm } = await setup();
    const out = await d.update(
      'aws.secretsmanager.secret',
      'k',
      'arn:aws:secretsmanager:us-east-1:111:secret:k',
      { description: 'rotated', kms_key_id: 'alias/aws/secretsmanager' },
      {},
      {},
    );
    expect(out.success).toBe(true);
    expect(sm.sendCalls[0].__cmd).toBe('UpdateSecret');
    expect(sm.sendCalls[0].input).toMatchObject({
      SecretId: 'arn:aws:secretsmanager:us-east-1:111:secret:k',
      Description: 'rotated',
      KmsKeyId: 'alias/aws/secretsmanager',
    });
  });

  it('delete passes ForceDeleteWithoutRecovery=true', async () => {
    const { d, sm } = await setup();
    const out = await d.delete('aws.secretsmanager.secret', 'k', 'arn:aws:secretsmanager:us-east-1:111:secret:k', {});
    expect(out.success).toBe(true);
    expect(sm.sendCalls[0].__cmd).toBe('DeleteSecret');
    expect(sm.sendCalls[0].input.ForceDeleteWithoutRecovery).toBe(true);
  });

  it('returns SDK-not-installed error when @aws-sdk/client-secrets-manager is absent', async () => {
    install_dynamic_import_stub({});
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });
    const out = await d.create('aws.secretsmanager.secret', 'k', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Secrets Manager SDK not available/);
  });
});
