/**
 * Tests for the aws.ec2.vpcEndpoint handler.
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
      'CreateVpcEndpointCommand',
      'CreateTagsCommand',
      'DeleteVpcEndpointsCommand',
      'DescribeSubnetsCommand',
      'DescribeSecurityGroupsCommand',
      'DescribeVpcsCommand',
    ],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'CreateVpcEndpoint') return { VpcEndpoint: { VpcEndpointId: 'vpce-aaa' } };
      if (cmd.__cmd === 'DescribeVpcs') return { Vpcs: [{ VpcId: 'vpc-canvas' }] };
      if (cmd.__cmd === 'DescribeSubnets') return { Subnets: [{ SubnetId: 'subnet-111' }] };
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-ec2': ec2.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, ec2 };
}

describe('aws.ec2.vpcEndpoint handler', () => {
  it('creates an Interface endpoint with operator-supplied vpc_id', async () => {
    const { d, ec2 } = await setup();
    const out = await d.create(
      'aws.ec2.vpcEndpoint',
      'priv',
      { vpc_id: 'vpc-zzz', service_name: 'com.amazonaws.us-east-1.s3', subnets: ['subnet-aaa'] },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('vpce-aaa');
    const create = ec2.sendCalls.find((c: any) => c.__cmd === 'CreateVpcEndpoint')!;
    expect(create.input.VpcId).toBe('vpc-zzz');
    expect(create.input.ServiceName).toBe('com.amazonaws.us-east-1.s3');
    expect(create.input.VpcEndpointType).toBe('Interface');
  });

  it('refuses to create without service_name', async () => {
    const { d } = await setup();
    const out = await d.create('aws.ec2.vpcEndpoint', 'priv', { vpc_id: 'vpc-zzz' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/service_name/);
  });

  it('refuses to create without vpc id (operator or canvas-wired)', async () => {
    const { d } = await setup();
    const out = await d.create('aws.ec2.vpcEndpoint', 'priv', { service_name: 'com.amazonaws.us-east-1.s3' }, {});
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Network\.VPC/);
  });

  it('resolves canvas-wired vpc + subnet names via Describe* calls', async () => {
    const { d, ec2 } = await setup();
    const out = await d.create(
      'aws.ec2.vpcEndpoint',
      'priv',
      {
        connected_vpc_name: 'main-vpc',
        connected_subnet_names: ['app-subnet'],
        service_name: 'com.amazonaws.us-east-1.s3',
      },
      {},
    );
    expect(out.success).toBe(true);
    const create = ec2.sendCalls.find((c: any) => c.__cmd === 'CreateVpcEndpoint')!;
    expect(create.input.VpcId).toBe('vpc-canvas');
    expect(create.input.SubnetIds).toEqual(['subnet-111']);
  });

  it('deletes via DeleteVpcEndpoints using the endpoint id', async () => {
    const { d, ec2 } = await setup();
    const out = await d.delete('aws.ec2.vpcEndpoint', 'priv', 'vpce-aaa', {});
    expect(out.success).toBe(true);
    expect(ec2.sendCalls.find((c: any) => c.__cmd === 'DeleteVpcEndpoints')!.input.VpcEndpointIds).toEqual([
      'vpce-aaa',
    ]);
  });
});
