/**
 * Tests for the aws.ec2.instance handler — focused on the
 * RunInstances + CreateTags + ModifyVolume update path.
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
      'RunInstancesCommand',
      'TerminateInstancesCommand',
      'CreateTagsCommand',
      'DescribeInstancesCommand',
      'ModifyVolumeCommand',
    ],
    sendImpl: (cmd) => {
      if (cmd.__cmd === 'RunInstances') return { Instances: [{ InstanceId: 'i-abc' }] };
      if (cmd.__cmd === 'DescribeInstances')
        return {
          Reservations: [{ Instances: [{ BlockDeviceMappings: [{ Ebs: { VolumeId: 'vol-1' } }] }] }],
        };
      return {};
    },
  });
  install_dynamic_import_stub({ '@aws-sdk/client-ec2': ec2.module });
  const d = new AWSDeployer();
  await d.initialize({ provider: 'aws' });
  return { d, ec2 };
}

describe('aws.ec2.instance handler', () => {
  it('runs an instance and returns an ARN-shaped provider_id', async () => {
    const { d, ec2 } = await setup();
    const out = await d.create(
      'aws.ec2.instance',
      'web1',
      {
        ami_id: 'ami-12345',
        instance_type: 't3.micro',
      },
      {},
    );
    expect(out.success).toBe(true);
    expect(out.provider_id).toContain('arn:aws:ec2:');
    expect(ec2.sendCalls[0].__cmd).toBe('RunInstances');
  });

  it('resizes the attached EBS volume via ModifyVolume (A4 update path)', async () => {
    const { d, ec2 } = await setup();
    const out = await d.update(
      'aws.ec2.instance',
      'web1',
      'arn:aws:ec2:us-east-1:*:instance/i-abc',
      { volume_size_gb: 100 },
      {},
      {},
    );
    expect(out.success).toBe(true);
    const modify = ec2.sendCalls.find((c: any) => c.__cmd === 'ModifyVolume');
    expect(modify).toBeDefined();
    expect(modify?.input.VolumeId).toBe('vol-1');
    expect(modify?.input.Size).toBe(100);
  });
});
