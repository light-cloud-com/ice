/**
 * AWS VPC handler — `aws.ec2.vpc`.
 *
 * Used by both `Network.VPC` (operator-supplied CIDR) and
 * `Network.PrivateNetwork` (defaults to 10.0.0.0/16 if not set).
 *
 * Mirror of `gcp/handlers/vpc.ts`. AWS VPC creation is synchronous —
 * no polling required. The provider_id is the VPC id (`vpc-…`); the
 * delete path uses that directly.
 *
 * Tagging: Name=name plus any operator-supplied tags. Without a Name
 * tag the EC2 console shows the VPC as anonymous, which is unfriendly.
 */

import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.ec2.vpc';
const SDK = '@aws-sdk/client-ec2';

function tag_specs(
  name: string,
  tags: Record<string, string> | undefined,
): Array<{
  ResourceType: string;
  Tags: Array<{ Key: string; Value: string }>;
}> {
  const base = [{ Key: 'Name', Value: name }];
  const extra = Object.entries(tags ?? {}).map(([Key, Value]) => ({ Key, Value }));
  return [{ ResourceType: 'vpc', Tags: [...base, ...extra] }];
}

export const vpc_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'EC2', SDK);

    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return sdkMissing(name, TYPE, 'create', start, 'EC2', SDK);

      const cidr = (properties.cidr_block as string) || '10.0.0.0/16';
      const created = await client.send(
        new ec2.CreateVpcCommand({
          CidrBlock: cidr,
          InstanceTenancy: (properties.instance_tenancy as string) || 'default',
          TagSpecifications: tag_specs(name, properties.tags as Record<string, string>),
        }),
      );
      const vpcId = created?.Vpc?.VpcId;
      if (!vpcId) return err(name, TYPE, 'create', start, 'CreateVpc returned no VpcId');

      // Optional DNS toggles. Operator can override via properties; the
      // defaults match what most ICE canvases assume.
      if (properties.enable_dns_support !== false) {
        await client.send(new ec2.ModifyVpcAttributeCommand({ VpcId: vpcId, EnableDnsSupport: { Value: true } }));
      }
      if (properties.enable_dns_hostnames === true) {
        await client.send(new ec2.ModifyVpcAttributeCommand({ VpcId: vpcId, EnableDnsHostnames: { Value: true } }));
      }

      return ok(name, TYPE, 'create', start, { provider_id: vpcId });
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

      // Tags update — replace the operator-managed set + the Name tag.
      if (properties.tags) {
        const tags = Object.entries(properties.tags as Record<string, string>).map(([Key, Value]) => ({
          Key,
          Value,
        }));
        await client.send(
          new ec2.CreateTagsCommand({
            Resources: [provider_id],
            Tags: [{ Key: 'Name', Value: name }, ...tags],
          }),
        );
      }

      // DNS attribute updates.
      if (properties.enable_dns_support !== undefined) {
        await client.send(
          new ec2.ModifyVpcAttributeCommand({
            VpcId: provider_id,
            EnableDnsSupport: { Value: properties.enable_dns_support === true },
          }),
        );
      }
      if (properties.enable_dns_hostnames !== undefined) {
        await client.send(
          new ec2.ModifyVpcAttributeCommand({
            VpcId: provider_id,
            EnableDnsHostnames: { Value: properties.enable_dns_hostnames === true },
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

      await client.send(new ec2.DeleteVpcCommand({ VpcId: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
