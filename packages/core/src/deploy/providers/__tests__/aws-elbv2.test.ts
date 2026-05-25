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
  install_dynamic_import_stub({ '@aws-sdk/client-elastic-load-balancing-v2': elb.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, elb };
}

describe('aws.elbv2.loadBalancer handler', () => {
  it('creates LB + skeleton TG and returns the LB ARN', async () => {
    const { d, elb } = await setup();
    const out = await d.create(
      'aws.elbv2.loadBalancer',
      'lb',
      { scheme: 'internet-facing', type: 'application', target_group_port: 8080, target_group_protocol: 'HTTP' },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toBe('arn:aws:elasticloadbalancing:us-east-1:111:loadbalancer/app/lb/abc');
    const cmds = elb.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['CreateLoadBalancer', 'CreateTargetGroup']);
    expect(elb.sendCalls[1].input.Port).toBe(8080);
  });
});
