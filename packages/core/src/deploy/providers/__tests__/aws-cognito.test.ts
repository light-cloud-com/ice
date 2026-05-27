import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const cog = makeSdkMock({
    client_class_name: 'CognitoIdentityProviderClient',
    command_class_names: ['CreateUserPoolCommand', 'DeleteUserPoolCommand', 'UpdateUserPoolCommand'],
    sendImpl: (cmd) =>
      cmd.__cmd === 'CreateUserPool'
        ? { UserPool: { Arn: `arn:aws:cognito-idp:us-east-1:111:userpool/us-east-1_${cmd.input.PoolName}` } }
        : {},
  });
  install_dynamic_import_stub({ '@aws-sdk/client-cognito-identity-provider': cog.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, cog };
}

describe('aws.cognito.userPool handler', () => {
  it('creates a user pool with the extractor password policy', async () => {
    const { d, cog } = await setup();
    const out = await d.create(
      'aws.cognito.userPool',
      'main',
      {
        auto_verified_attributes: ['email'],
        mfa_configuration: 'ON',
        password_policy: { minimum_length: 12, require_symbols: true },
      },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toContain('userpool/us-east-1_main');
    expect(cog.sendCalls[0].input.MfaConfiguration).toBe('ON');
    expect(cog.sendCalls[0].input.Policies.PasswordPolicy.MinimumLength).toBe(12);
    expect(cog.sendCalls[0].input.Policies.PasswordPolicy.RequireSymbols).toBe(true);
  });

  it('updates a user pool via UpdateUserPool (A4 update path)', async () => {
    const { d, cog } = await setup();
    const out = await d.update(
      'aws.cognito.userPool',
      'main',
      'us-east-1_main',
      { mfa_configuration: 'OPTIONAL', password_policy: { minimum_length: 16 } },
      {},
      {},
    );
    expect(out.success).toBe(true);
    const update_call = cog.sendCalls.find((c: any) => c.__cmd === 'UpdateUserPool');
    expect(update_call).toBeDefined();
    expect(update_call?.input.UserPoolId).toBe('us-east-1_main');
    expect(update_call?.input.MfaConfiguration).toBe('OPTIONAL');
  });
});
