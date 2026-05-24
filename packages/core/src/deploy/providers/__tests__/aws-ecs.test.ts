import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AWSDeployer } from '../aws-deployer';
import { install_dynamic_import_stub, makeSdkMock, restore_dynamic_import_stub } from './_aws-test-harness';

beforeEach(() => install_dynamic_import_stub({}));
afterEach(() => restore_dynamic_import_stub());

async function setup(opts: { clusterActive?: boolean } = { clusterActive: true }) {
  const ecs = makeSdkMock({
    client_class_name: 'ECSClient',
    command_class_names: [
      'DescribeClustersCommand',
      'CreateClusterCommand',
      'RegisterTaskDefinitionCommand',
      'CreateServiceCommand',
      'UpdateServiceCommand',
      'DeleteServiceCommand',
    ],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'DescribeClusters') {
        return opts.clusterActive
          ? { clusters: [{ clusterName: 'ice-default-cluster', status: 'ACTIVE' }] }
          : { clusters: [] };
      }
      if (cmd.__cmd === 'RegisterTaskDefinition') {
        return {
          taskDefinition: { taskDefinitionArn: `arn:aws:ecs:us-east-1:111:task-definition/${cmd.input.family}:1` },
        };
      }
      if (cmd.__cmd === 'CreateService') {
        return {
          service: { serviceArn: `arn:aws:ecs:us-east-1:111:service/ice-default-cluster/${cmd.input.serviceName}` },
        };
      }
      return {};
    },
  });
  const iam = makeSdkMock({
    client_class_name: 'IAMClient',
    command_class_names: ['GetRoleCommand', 'CreateRoleCommand', 'AttachRolePolicyCommand'],
    sendImpl: (cmd) => (cmd.__cmd === 'GetRole' ? { Role: { Arn: 'arn:aws:iam::111:role/ecsTaskExecutionRole' } } : {}),
  });
  install_dynamic_import_stub({ '@aws-sdk/client-ecs': ecs.module, '@aws-sdk/client-iam': iam.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, ecs, iam };
}

describe('aws.ecs.service handler', () => {
  it('uses the default cluster when it already exists', async () => {
    const { d, ecs } = await setup({ clusterActive: true });
    const out = await d.create(
      'aws.ecs.service',
      'api',
      { image: 'app:v1', port: 8080, cpu: '256', memory: '512', desired_count: 2 },
      {},
    );
    expect(out.success).toBe(true);
    const cmds = ecs.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['DescribeClusters', 'RegisterTaskDefinition', 'CreateService']);
    expect(ecs.sendCalls[1].input.containerDefinitions[0].image).toBe('app:v1');
    expect(ecs.sendCalls[2].input.desiredCount).toBe(2);
  });

  it('creates the default cluster on first deploy when absent', async () => {
    const { d, ecs } = await setup({ clusterActive: false });
    const out = await d.create(
      'aws.ecs.service',
      'api',
      { image: 'app:v1', port: 8080, cpu: '256', memory: '512' },
      {},
    );
    expect(out.success).toBe(true);
    const cmds = ecs.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['DescribeClusters', 'CreateCluster', 'RegisterTaskDefinition', 'CreateService']);
  });

  it('delete scales to zero then deletes the service', async () => {
    const { d, ecs } = await setup();
    await d.delete('aws.ecs.service', 'api', 'arn:aws:ecs:us-east-1:111:service/ice-default-cluster/api', {});
    const cmds = ecs.sendCalls.map((c: any) => c.__cmd);
    expect(cmds).toEqual(['UpdateService', 'DeleteService']);
    expect(ecs.sendCalls[0].input.desiredCount).toBe(0);
    expect(ecs.sendCalls[1].input.force).toBe(true);
  });
});
