/**
 * AWS VPC Endpoint handler — `aws.ec2.vpcEndpoint`.
 *
 * Backs the shared `Network.PrivateNetwork` block. Two endpoint types:
 *   - Interface (default): an ENI in each canvas subnet, talks to an
 *     AWS service (S3, DynamoDB, SNS, etc.) over PrivateLink.
 *   - Gateway: route-table entry for S3 / DynamoDB only (cheaper but
 *     limited service set).
 *
 * Canvas wiring (pass-1-6) populates `connected_subnet_names` +
 * `connected_security_group_names` + `connected_vpc_name`; the
 * resolver maps those to subnet-… / sg-… / vpc-… ids.
 *
 * Provider id = endpoint id (`vpce-xxxx`). Delete = DeleteVpcEndpoints.
 */

import { resolve_aws_network_refs, resolve_aws_vpc_id_by_name } from '../network-resolver';
import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.ec2.vpcEndpoint';
const SDK = '@aws-sdk/client-ec2';

export const vpc_endpoint_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'EC2', SDK);

    const serviceName = properties.service_name as string | undefined;
    if (!serviceName) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'VPC endpoint requires properties.service_name (e.g. com.amazonaws.us-east-1.s3).',
      );
    }

    // Resolve VPC id (operator-supplied wins; canvas-wired is fallback).
    let vpcId = properties.vpc_id as string | undefined;
    const connectedVpcName = properties.connected_vpc_name as string | undefined;
    if (!vpcId && connectedVpcName) vpcId = await resolve_aws_vpc_id_by_name(connectedVpcName, ctx);
    if (!vpcId) {
      return err(name, TYPE, 'create', start, 'VPC endpoint requires a connected Network.VPC (or properties.vpc_id).');
    }

    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return sdkMissing(name, TYPE, 'create', start, 'EC2', SDK);

      const endpointType = (properties.endpoint_type as string) || 'Interface';
      const network = endpointType === 'Interface' ? await resolve_aws_network_refs(properties, ctx) : null;

      const created = await client.send(
        new ec2.CreateVpcEndpointCommand({
          VpcId: vpcId,
          ServiceName: serviceName,
          VpcEndpointType: endpointType,
          SubnetIds: network?.subnets,
          SecurityGroupIds: network?.security_groups,
          PrivateDnsEnabled: endpointType === 'Interface' ? properties.private_dns_enabled !== false : undefined,
          RouteTableIds: endpointType === 'Gateway' ? (properties.route_table_ids as string[] | undefined) : undefined,
          TagSpecifications: [
            {
              ResourceType: 'vpc-endpoint',
              Tags: [
                { Key: 'Name', Value: name },
                ...Object.entries((properties.tags as Record<string, string>) || {}).map(([Key, Value]) => ({
                  Key,
                  Value,
                })),
              ],
            },
          ],
        }),
      );
      const endpointId = created?.VpcEndpoint?.VpcEndpointId;
      if (!endpointId) return err(name, TYPE, 'create', start, 'CreateVpcEndpoint returned no VpcEndpointId');
      return ok(name, TYPE, 'create', start, { provider_id: endpointId });
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
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ec2') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'EC2 SDK not available');
    try {
      const ec2 = await load_aws_sdk(SDK);
      if (!ec2) return err(name, TYPE, 'delete', start, 'EC2 SDK not available');
      await client.send(new ec2.DeleteVpcEndpointsCommand({ VpcEndpointIds: [provider_id] }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
