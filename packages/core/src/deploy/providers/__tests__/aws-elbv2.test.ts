import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup() {
  const elb = makeSdkMock({
    client_class_name: 'ElasticLoadBalancingV2Client',
    command_class_names: ['CreateLoadBalancerCommand', 'CreateTargetGroupCommand', 'DeleteLoadBalancerCommand'],
    sendImpl: (cmd) =>
      cmd.__cmd === 'CreateLoadBalancer'
        ? { LoadBalancers: [{ LoadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:111:loadbalancer/app/lb/abc' }] }
        : {},
  });
  // EC2 mock for the network resolver path; no canvas-wired refs in these
  // tests, so the resolver short-circuits without calling Describe*.
  const ec2 = makeSdkMock({
    client_class_name: 'EC2Client',
    command_class_names: ['DescribeSubnetsCommand', 'DescribeSecurityGroupsCommand', 'DescribeVpcsCommand'],
    sendImpl: () => ({}),
  });
  install_dynamic_import_stub({
    '@aws-sdk/client-elastic-load-balancing-v2': elb.module,
    '@aws-sdk/client-ec2': ec2.module,
  });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, elb, ec2 };
}

describe('aws.elbv2.loadBalancer handler', () => {
  it('creates LB + skeleton TG when operator supplies subnets + vpc_id', async () => {
    const { d, elb } = await setup();
    const out = await d.create(
      'aws.elbv2.loadBalancer',
      'lb',
      {
        scheme: 'internet-facing',
        type: 'application',
        subnets: ['subnet-aaa', 'subnet-bbb'],
        vpc_id: 'vpc-zzz',
        target_group_port: 8080,
        target_group_protocol: 'HTTP',
      },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:elasticloadbalancing:us-east-1:111:loadbalancer/app/lb/abc');
    const cmds = elb.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['CreateLoadBalancer', 'CreateTargetGroup']);
    expect(elb.sendCalls[0].input.Subnets).toEqual(['subnet-aaa', 'subnet-bbb']);
    expect(elb.sendCalls[1].input.Port).toBe(8080);
    expect(elb.sendCalls[1].input.VpcId).toBe('vpc-zzz');
  });

  it('refuses to create when fewer than 2 subnets are wired', async () => {
    const { d } = await setup();
    const out = await d.create(
      'aws.elbv2.loadBalancer',
      'lb',
      { scheme: 'internet-facing', type: 'application', subnets: ['subnet-aaa'] },
      {},
    );
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/≥2 subnets/);
  });

  it('resolves canvas-wired subnet + vpc names via DescribeSubnets / DescribeVpcs', async () => {
    const elb = makeSdkMock({
      client_class_name: 'ElasticLoadBalancingV2Client',
      command_class_names: ['CreateLoadBalancerCommand', 'CreateTargetGroupCommand'],
      sendImpl: (cmd) =>
        cmd.__cmd === 'CreateLoadBalancer'
          ? {
              LoadBalancers: [
                { LoadBalancerArn: 'arn:aws:elasticloadbalancing:us-east-1:111:loadbalancer/app/lb/xyz' },
              ],
            }
          : {},
    });
    const ec2 = makeSdkMock({
      client_class_name: 'EC2Client',
      command_class_names: ['DescribeSubnetsCommand', 'DescribeSecurityGroupsCommand', 'DescribeVpcsCommand'],
      sendImpl: (cmd) => {
        if (cmd.__cmd === 'DescribeSubnets') {
          return { Subnets: [{ SubnetId: 'subnet-111' }, { SubnetId: 'subnet-222' }] };
        }
        if (cmd.__cmd === 'DescribeVpcs') return { Vpcs: [{ VpcId: 'vpc-canvas' }] };
        return {};
      },
    });
    install_dynamic_import_stub({
      '@aws-sdk/client-elastic-load-balancing-v2': elb.module,
      '@aws-sdk/client-ec2': ec2.module,
    });
    const d = new AWSDeployer();
    await d.initialize({ provider: 'aws' });

    const out = await d.create(
      'aws.elbv2.loadBalancer',
      'lb',
      {
        scheme: 'internet-facing',
        type: 'application',
        connected_subnet_names: ['app-subnet-a', 'app-subnet-b'],
        connected_vpc_name: 'main-vpc',
      },
      {},
    );
    expect(out.success).toBe(true);
    expect(elb.sendCalls[0].input.Subnets).toEqual(['subnet-111', 'subnet-222']);
    expect(elb.sendCalls[1].input.VpcId).toBe('vpc-canvas');
  });
});
