/**
 * Tests for the aws.ec2.subnet handler.
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
      'CreateSubnetCommand',
      'ModifySubnetAttributeCommand',
      'CreateTagsCommand',
      'DeleteSubnetCommand',
    ],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateSubnet') return { Subnet: { SubnetId: 'subnet-deadbeef' } };
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-ec2': ec2.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, ec2 };
}

describe('aws.ec2.subnet handler', () => {
  it('creates a subnet against the parent VPC, returns the subnet id', async () => {
    const { d, ec2 } = await setup();
    const out = await d.create(
      'aws.ec2.subnet',
      'app',
      { vpc_id: 'vpc-aaaa', cidr_block: '10.0.1.0/24', availability_zone: 'us-east-1a' },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('subnet-deadbeef');
    const create = ec2.sendCalls.find((c) => c.__cmd === 'CreateSubnet')!;
    expect(create.input.VpcId).toBe('vpc-aaaa');
    expect(create.input.CidrBlock).toBe('10.0.1.0/24');
    expect(create.input.AvailabilityZone).toBe('us-east-1a');
  });

  it('refuses to create when vpc_id is missing', async () => {
    const { d } = await setup();
    const out = await d.create('aws.ec2.subnet', 'app', { cidr_block: '10.0.1.0/24' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/vpc_id/);
  });

  it('flips MapPublicIpOnLaunch when properties.map_public_ip_on_launch is true', async () => {
    const { d, ec2 } = await setup();
    const out = await d.create('aws.ec2.subnet', 'public', { vpc_id: 'vpc-aaaa', map_public_ip_on_launch: true }, {});
    expect(out.success).toBe(true);
    const mod = ec2.sendCalls.find((c) => c.__cmd === 'ModifySubnetAttribute');
    expect(mod).toBeDefined();
    expect(mod!.input.MapPublicIpOnLaunch.Value).toBe(true);
  });

  it('updates tags + public IP flag', async () => {
    const { d, ec2 } = await setup();
    const out = await d.update(
      'aws.ec2.subnet',
      'app',
      'subnet-deadbeef',
      { tags: { env: 'prod' }, map_public_ip_on_launch: false },
      {},
      {},
    );
    expect(out.success).toBe(true);
    const tagCmd = ec2.sendCalls.find((c) => c.__cmd === 'CreateTags')!;
    expect(tagCmd.input.Resources).toEqual(['subnet-deadbeef']);
    const mod = ec2.sendCalls.find((c) => c.__cmd === 'ModifySubnetAttribute')!;
    expect(mod.input.MapPublicIpOnLaunch.Value).toBe(false);
  });

  it('deletes via DeleteSubnet using the subnet id', async () => {
    const { d, ec2 } = await setup();
    const out = await d.delete('aws.ec2.subnet', 'app', 'subnet-deadbeef', {});
    expect(out.success).toBe(true);
    expect(ec2.sendCalls[0].input.SubnetId).toBe('subnet-deadbeef');
  });
});
