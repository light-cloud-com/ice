/**
 * Tests for the aws.amplify.app handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const amplify = makeSdkMock({
    client_class_name: 'AmplifyClient',
    command_class_names: ['CreateAppCommand', 'CreateBranchCommand', 'UpdateAppCommand', 'DeleteAppCommand'],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateApp') {
        return { app: { appId: 'app-123', appArn: 'arn:aws:amplify:us-east-1:111:apps/app-123' } };
      }
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-amplify': amplify.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, amplify };
}

describe('aws.amplify.app handler', () => {
  it('creates app + first branch when repository is wired', async () => {
    const { d, amplify } = await setup();
    const out = await d.create(
      'aws.amplify.app',
      'web',
      { repository: 'https://github.com/org/site', branch: 'main', platform: 'WEB_COMPUTE' },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:amplify:us-east-1:111:apps/app-123');
    const cmds = amplify.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['CreateApp', 'CreateBranch']);
    expect(amplify.sendCalls[0].input.platform).toBe('WEB_COMPUTE');
    expect(amplify.sendCalls[1].input.branchName).toBe('main');
  });

  it('refuses to create without repository', async () => {
    const { d } = await setup();
    const out = await d.create('aws.amplify.app', 'web', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Source\.Repository/);
  });

  it('deletes via DeleteApp', async () => {
    const { d, amplify } = await setup();
    const out = await d.delete('aws.amplify.app', 'web', 'arn:aws:amplify:us-east-1:111:apps/app-123', {});
    expect(out.success).toBe(true);
    expect(amplify.sendCalls.find((c: any) => c.__cmd === 'DeleteApp')!.input.appId).toBe('app-123');
  });
});
