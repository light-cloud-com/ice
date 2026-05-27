/**
 * Tests for the aws.wafv2.webAcl handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const wafv2 = makeSdkMock({
    client_class_name: 'WAFV2Client',
    command_class_names: ['CreateWebACLCommand', 'GetWebACLCommand', 'UpdateWebACLCommand', 'DeleteWebACLCommand'],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateWebACL') {
        return {
          Summary: {
            Id: 'acl-123',
            LockToken: 'tok-1',
            ARN: 'arn:aws:wafv2:us-east-1:111:regional/webacl/web/acl-123',
          },
        };
      }
      if (cmd.__cmd === 'GetWebACL') return { LockToken: 'tok-2' };
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-wafv2': wafv2.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, wafv2 };
}

describe('aws.wafv2.webAcl handler', () => {
  it('creates a REGIONAL Web ACL with Allow default + visibility config', async () => {
    const { d, wafv2 } = await setup();
    const out = await d.create('aws.wafv2.webAcl', 'web', { scope: 'REGIONAL', rules: [] }, {});
    expect(out.success).toBe(true);
    expect(out.outputs?.scope).toBe('REGIONAL');
    const create = wafv2.sendCalls.find((c: any) => c.__cmd === 'CreateWebACL')!;
    expect(create.input.Scope).toBe('REGIONAL');
    expect(create.input.DefaultAction).toEqual({ Allow: {} });
    expect(create.input.VisibilityConfig.MetricName).toBe('web');
  });

  it('flips default action to Block when properties.default_action="BLOCK"', async () => {
    const { d, wafv2 } = await setup();
    const out = await d.create('aws.wafv2.webAcl', 'lock', { default_action: 'BLOCK' }, {});
    expect(out.success).toBe(true);
    expect(wafv2.sendCalls[0].input.DefaultAction).toEqual({ Block: {} });
  });

  it('update fetches LockToken then sends UpdateWebACL', async () => {
    const { d, wafv2 } = await setup();
    const out = await d.update(
      'aws.wafv2.webAcl',
      'web',
      'arn:aws:wafv2:us-east-1:111:regional/webacl/web/acl-123',
      { scope: 'REGIONAL', rules: [] },
      {},
      {},
    );
    expect(out.success).toBe(true);
    const cmds = wafv2.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toContain('GetWebACL');
    expect(cmds).toContain('UpdateWebACL');
  });

  it('delete: GetWebACL → DeleteWebACL using returned LockToken', async () => {
    const { d, wafv2 } = await setup();
    const out = await d.delete(
      'aws.wafv2.webAcl',
      'web',
      'arn:aws:wafv2:us-east-1:111:regional/webacl/web/acl-123',
      {},
    );
    expect(out.success).toBe(true);
    const del = wafv2.sendCalls.find((c: any) => c.__cmd === 'DeleteWebACL')!;
    expect(del.input.Id).toBe('acl-123');
    expect(del.input.LockToken).toBe('tok-2');
  });
});
