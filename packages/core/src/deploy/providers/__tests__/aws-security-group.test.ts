/**
 * Tests for the aws.ec2.securityGroup handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const ec2 = makeSdkMock({
    client_class_name: 'EC2Client',
    command_class_names: [
      'CreateSecurityGroupCommand',
      'AuthorizeSecurityGroupIngressCommand',
      'AuthorizeSecurityGroupEgressCommand',
      'RevokeSecurityGroupEgressCommand',
      'CreateTagsCommand',
      'DeleteSecurityGroupCommand',
    ],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateSecurityGroup') return { GroupId: 'sg-cafeb00b' };
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-ec2': ec2.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, ec2 };
}

describe('aws.ec2.securityGroup handler', () => {
  it('creates a security group with no rules', async () => {
    const { d, ec2 } = await setup();
    const out = await d.create('aws.ec2.securityGroup', 'web', { vpc_id: 'vpc-1' }, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('sg-cafeb00b');
    const create = ec2.sendCalls.find((c) => c.__cmd === 'CreateSecurityGroup')!;
    expect(create.input.GroupName).toBe('web');
    expect(create.input.VpcId).toBe('vpc-1');
  });

  it('refuses to create without vpc_id', async () => {
    const { d } = await setup();
    const out = await d.create('aws.ec2.securityGroup', 'web', {}, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/vpc_id/);
  });

  it('applies ingress rules', async () => {
    const { d, ec2 } = await setup();
    await d.create(
      'aws.ec2.securityGroup',
      'web',
      {
        vpc_id: 'vpc-1',
        ingress: [{ protocol: 'tcp', from_port: 443, to_port: 443, cidr_blocks: ['0.0.0.0/0'] }],
      },
      {},
    );
    const auth = ec2.sendCalls.find((c) => c.__cmd === 'AuthorizeSecurityGroupIngress')!;
    expect(auth.input.IpPermissions[0]).toMatchObject({ IpProtocol: 'tcp', FromPort: 443, ToPort: 443 });
    expect(auth.input.IpPermissions[0].IpRanges[0].CidrIp).toBe('0.0.0.0/0');
  });

  it('revokes default egress when revoke_default_egress: true', async () => {
    const { d, ec2 } = await setup();
    await d.create('aws.ec2.securityGroup', 'locked', { vpc_id: 'vpc-1', revoke_default_egress: true }, {});
    const revoke = ec2.sendCalls.find((c) => c.__cmd === 'RevokeSecurityGroupEgress');
    expect(revoke).toBeDefined();
  });

  it('updates tags via CreateTags', async () => {
    const { d, ec2 } = await setup();
    const out = await d.update('aws.ec2.securityGroup', 'web', 'sg-cafeb00b', { tags: { env: 'prod' } }, {}, {});
    expect(out.success).toBe(true);
    const tag = ec2.sendCalls.find((c) => c.__cmd === 'CreateTags')!;
    expect(tag.input.Resources).toEqual(['sg-cafeb00b']);
  });

  it('deletes via DeleteSecurityGroup using the GroupId', async () => {
    const { d, ec2 } = await setup();
    const out = await d.delete('aws.ec2.securityGroup', 'web', 'sg-cafeb00b', {});
    expect(out.success).toBe(true);
    expect(ec2.sendCalls[0].input.GroupId).toBe('sg-cafeb00b');
  });
});
