/**
 * EC2 Handler
 *
 * Handles: aws.ec2.instance
 *
 * Migrated from the monolithic aws-deployer.ts. Behaviour-equivalent:
 * RunInstancesCommand on create, CreateTagsCommand on update, and
 * TerminateInstancesCommand on delete. The instance id is encoded
 * into the provider_id as `arn:aws:ec2:{region}:*:instance/{id}` so
 * update + delete can recover it from the ARN.
 */

import { load_aws_sdk } from '../sdk-loader';
import type { ResourceDeployResult } from '../../../types';
import type { AWSResourceHandler } from '../types';

function result(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

const TYPE = 'aws.ec2.instance';

export const ec2_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return fail(name, TYPE, 'create', start, 'EC2 SDK not available. Install @aws-sdk/client-ec2');

    try {
      const ec2 = await load_aws_sdk('@aws-sdk/client-ec2');
      if (!ec2) return fail(name, TYPE, 'create', start, 'EC2 SDK not available. Install @aws-sdk/client-ec2');

      const image_id = (properties.image_id as string) || 'ami-0c55b159cbfafe1f0';
      const instance_type = (properties.instance_type as string) || 't2.micro';

      const command = new ec2.RunInstancesCommand({
        ImageId: image_id,
        InstanceType: instance_type,
        MinCount: 1,
        MaxCount: 1,
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              { Key: 'Name', Value: name },
              ...Object.entries((properties.tags as Record<string, string>) || {}).map(([Key, Value]) => ({
                Key,
                Value: Value as string,
              })),
            ],
          },
        ],
        SubnetId: properties.subnet_id as string,
        SecurityGroupIds: properties.security_group_ids as string[],
      });

      const sendResult = await client.send(command);
      const instance_id = sendResult.Instances?.[0]?.InstanceId;
      if (!instance_id)
        return fail(name, TYPE, 'create', start, 'Failed to get instance ID from RunInstances response');

      return result(name, TYPE, 'create', start, {
        provider_id: `arn:aws:ec2:${ctx.region}:*:instance/${instance_id}`,
      });
    } catch (error) {
      return fail(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return fail(name, TYPE, 'update', start, 'EC2 SDK not available');

    try {
      const ec2 = await load_aws_sdk('@aws-sdk/client-ec2');
      if (!ec2) return fail(name, TYPE, 'update', start, 'EC2 SDK not available');

      const instance_id = provider_id.split('/').pop();

      // Tag refresh — pass-through CreateTagsCommand.
      if (properties.tags) {
        const command = new ec2.CreateTagsCommand({
          Resources: [instance_id],
          Tags: Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value })),
        });
        await client.send(command);
      }

      // Volume size resize — ModifyVolume targets the root EBS volume
      // attached to the instance. `volume_size_gb` (or `disk_size_gb`)
      // on canvas → DescribeInstances → ModifyVolume per attached
      // volume. EBS only allows GROWING volumes, never shrinking; we
      // surface the SDK error verbatim if the caller tries to shrink.
      const new_size =
        (properties.volume_size_gb as number | undefined) ?? (properties.disk_size_gb as number | undefined);
      if (new_size && ec2.DescribeInstancesCommand && ec2.ModifyVolumeCommand) {
        const describe = await client.send(new ec2.DescribeInstancesCommand({ InstanceIds: [instance_id] }));
        const mappings = describe?.Reservations?.[0]?.Instances?.[0]?.BlockDeviceMappings ?? [];
        for (const m of mappings) {
          const volume_id = m?.Ebs?.VolumeId;
          if (volume_id) {
            await client.send(new ec2.ModifyVolumeCommand({ VolumeId: volume_id, Size: new_size }));
          }
        }
      }

      return result(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return fail(name, TYPE, 'delete', start, 'EC2 SDK not available');

    try {
      const ec2 = await load_aws_sdk('@aws-sdk/client-ec2');
      if (!ec2) return fail(name, TYPE, 'delete', start, 'EC2 SDK not available');

      const instance_id = provider_id.split('/').pop();
      const command = new ec2.TerminateInstancesCommand({ InstanceIds: [instance_id] });
      await client.send(command);
      return result(name, TYPE, 'delete', start);
    } catch (error) {
      return fail(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
