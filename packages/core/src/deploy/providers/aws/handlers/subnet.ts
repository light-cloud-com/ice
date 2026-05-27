/**
 * AWS Subnet handler — `aws.ec2.subnet`.
 *
 * Subnets are zonal — each lives in a single AZ. The handler expects
 * the parent VPC id (`vpc_id`) and a CIDR block. AZ is operator-
 * supplied via `availability_zone` or derived from the canvas node id
 * (the third argument to the extractor) so two subnets in the same
 * canvas spread across AZs by default.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.ec2.subnet';
const SDK = '@aws-sdk/client-ec2';

function tag_specs(
  name: string,
  tags: Record<string, string> | undefined,
): Array<{ ResourceType: string; Tags: Array<{ Key: string; Value: string }> }> {
  const base = [{ Key: 'Name', Value: name }];
  const extra = Object.entries(tags ?? {}).map(([Key, Value]) => ({ Key, Value }));
  return [{ ResourceType: 'subnet', Tags: [...base, ...extra] }];
}

export const subnet_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'EC2', SDK);

    const vpcId = properties.vpc_id as string;
    if (!vpcId) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'Subnet create refused: vpc_id is required (connect a Network.VPC block).',
      );
    }

    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return sdkMissing(name, TYPE, 'create', start, 'EC2', SDK);

      const cidrBlock = (properties.cidr_block as string) || '10.0.0.0/24';
      const az = properties.availability_zone as string | undefined;

      const created = await client.send(
        new ec2.CreateSubnetCommand({
          VpcId: vpcId,
          CidrBlock: cidrBlock,
          AvailabilityZone: az,
          TagSpecifications: tag_specs(name, properties.tags as Record<string, string>),
        }),
      );
      const subnetId = created?.Subnet?.SubnetId;
      if (!subnetId) return err(name, TYPE, 'create', start, 'CreateSubnet returned no SubnetId');

      // Auto-assign public IPv4 toggle. Defaults to false to mirror
      // the secure-by-default stance; flip on for canvas-driven public
      // subnets via `properties.map_public_ip_on_launch: true`.
      if (properties.map_public_ip_on_launch === true) {
        await client.send(
          new ec2.ModifySubnetAttributeCommand({
            SubnetId: subnetId,
            MapPublicIpOnLaunch: { Value: true },
          }),
        );
      }

      return ok(name, TYPE, 'create', start, { provider_id: subnetId });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return sdkMissing(name, TYPE, 'update', start, 'EC2', SDK);

    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return sdkMissing(name, TYPE, 'update', start, 'EC2', SDK);

      if (properties.tags) {
        const tags = Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({ Key, Value }));
        await client.send(
          new ec2.CreateTagsCommand({
            Resources: [provider_id],
            Tags: [{ Key: 'Name', Value: name }, ...tags],
          }),
        );
      }

      if (properties.map_public_ip_on_launch !== undefined) {
        await client.send(
          new ec2.ModifySubnetAttributeCommand({
            SubnetId: provider_id,
            MapPublicIpOnLaunch: { Value: properties.map_public_ip_on_launch === true },
          }),
        );
      }

      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return sdkMissing(name, TYPE, 'delete', start, 'EC2', SDK);

    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return sdkMissing(name, TYPE, 'delete', start, 'EC2', SDK);

      await client.send(new ec2.DeleteSubnetCommand({ SubnetId: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
