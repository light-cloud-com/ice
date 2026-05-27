/**
 * Tests for the aws.ec2.vpc handler.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const ec2 = makeSdkMock({
    client_class_name: 'EC2Client',
    command_class_names: ['CreateVpcCommand', 'ModifyVpcAttributeCommand', 'CreateTagsCommand', 'DeleteVpcCommand'],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateVpc') return { Vpc: { VpcId: 'vpc-1234abcd' } };
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-ec2': ec2.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, ec2 };
}

describe('aws.ec2.vpc handler', () => {
  it('creates a VPC with default CIDR + Name tag, returns the VPC id', async () => {
    const { d, ec2 } = await setup();
    const out = await d.create('aws.ec2.vpc', 'main', {}, {});
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('vpc-1234abcd');

    const create = ec2.sendCalls.find((c) => c.__cmd === 'CreateVpc');
    expect(create).toBeDefined();
    expect(create!.input.CidrBlock).toBe('10.0.0.0/16');
    expect(create!.input.InstanceTenancy).toBe('default');
    expect(create!.input.TagSpecifications[0].Tags).toContainEqual({ Key: 'Name', Value: 'main' });
  });

  it('honours operator-supplied CIDR + extra tags + dns_hostnames', async () => {
    const { d, ec2 } = await setup();
    const out = await d.create(
      'aws.ec2.vpc',
      'analytics',
      { cidr_block: '172.16.0.0/16', enable_dns_hostnames: true, tags: { env: 'prod' } },
      {},
    );
    expect(out.success).toBe(true);

    const create = ec2.sendCalls.find((c) => c.__cmd === 'CreateVpc')!;
    expect(create.input.CidrBlock).toBe('172.16.0.0/16');
    expect(create.input.TagSpecifications[0].Tags).toEqual(
      expect.arrayContaining([
        { Key: 'Name', Value: 'analytics' },
        { Key: 'env', Value: 'prod' },
      ]),
    );

    // Both ModifyVpcAttribute calls fire (dns_support default + hostnames opt-in)
    const modCalls = ec2.sendCalls.filter((c) => c.__cmd === 'ModifyVpcAttribute');
    expect(modCalls).toHaveLength(2);
    expect(modCalls.find((c) => c.input.EnableDnsSupport)).toBeDefined();
    expect(modCalls.find((c) => c.input.EnableDnsHostnames)).toBeDefined();
  });

  it('skips ModifyVpcAttribute when dns_support is explicitly off', async () => {
    const { d, ec2 } = await setup();
    await d.create('aws.ec2.vpc', 'mvpc', { enable_dns_support: false }, {});
    const modCalls = ec2.sendCalls.filter((c) => c.__cmd === 'ModifyVpcAttribute');
    expect(modCalls).toHaveLength(0);
  });

  it('update flips DNS attributes + replaces tags', async () => {
    const { d, ec2 } = await setup();
    const out = await d.update(
      'aws.ec2.vpc',
      'main',
      'vpc-1234abcd',
      { enable_dns_support: true, enable_dns_hostnames: true, tags: { team: 'platform' } },
      {},
      {},
    );
    expect(out.success).toBe(true);
    const tagCmd = ec2.sendCalls.find((c) => c.__cmd === 'CreateTags');
    expect(tagCmd!.input.Resources).toEqual(['vpc-1234abcd']);
    expect(tagCmd!.input.Tags).toEqual(
      expect.arrayContaining([
        { Key: 'Name', Value: 'main' },
        { Key: 'team', Value: 'platform' },
      ]),
    );
    const modCalls = ec2.sendCalls.filter((c) => c.__cmd === 'ModifyVpcAttribute');
    expect(modCalls).toHaveLength(2);
  });

  it('deletes via DeleteVpc using the VPC id', async () => {
    const { d, ec2 } = await setup();
    const out = await d.delete('aws.ec2.vpc', 'main', 'vpc-1234abcd', {});
    expect(out.success).toBe(true);
    const del = ec2.sendCalls.find((c) => c.__cmd === 'DeleteVpc');
    expect(del!.input.VpcId).toBe('vpc-1234abcd');
  });
});
