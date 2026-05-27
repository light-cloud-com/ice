/**
 * ELBv2 Handler
 *
 * Handles: aws.elbv2.loadBalancer
 *
 * CreateLoadBalancer + CreateTargetGroup (skeleton target — operators
 * register backend services via outgoing edges + a follow-up
 * RegisterTargets call from the consuming compute handler).
 */

import { resolve_aws_network_refs, resolve_aws_vpc_id_by_name } from '../network-resolver';
import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.elbv2.loadBalancer';
const SDK = '@aws-sdk/client-elastic-load-balancing-v2';

export const elbv2_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('elbv2') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'ELBv2', SDK);

    try {
      const elb = await load_aws_sdk(SDK);
      if (!elb) return sdkMissing(name, TYPE, 'create', start, 'ELBv2', SDK);

      // Resolve canvas-driven Network.Subnet / Network.SecurityGroup names
      // (operator-supplied raw arrays in properties.subnets /
      // properties.security_groups still merge through).
      const network = await resolve_aws_network_refs(properties, ctx);
      if (network.subnets.length < 2) {
        return err(
          name,
          TYPE,
          'create',
          start,
          `ELBv2 requires ≥2 subnets across distinct AZs (got ${network.subnets.length}). ` +
            'Connect Network.Subnet blocks in two AZs, or set properties.subnets explicitly.',
        );
      }

      const lb = await client.send(
        new elb.CreateLoadBalancerCommand({
          Name: name,
          Scheme: properties.scheme as string,
          Type: properties.type as string,
          IpAddressType: properties.ip_address_type as string,
          Subnets: network.subnets,
          SecurityGroups: network.security_groups.length > 0 ? network.security_groups : undefined,
        }),
      );
      const arn =
        lb?.LoadBalancers?.[0]?.LoadBalancerArn ??
        `arn:aws:elasticloadbalancing:${ctx.region}:*:loadbalancer/app/${name}`;

      // Resolve VPC id for the skeleton target group. Prefer the
      // canvas-wired Network.VPC name; fall back to properties.vpc_id;
      // last-resort to an empty value (CreateTargetGroup will reject).
      let vpcId = properties.vpc_id as string | undefined;
      const connectedVpcName = properties.connected_vpc_name as string | undefined;
      if (!vpcId && connectedVpcName) {
        vpcId = await resolve_aws_vpc_id_by_name(connectedVpcName, ctx);
      }

      // Skeleton target group so the LB is wired even before backends connect.
      await client.send(
        new elb.CreateTargetGroupCommand({
          Name: `${name}-tg`,
          Port: (properties.target_group_port as number) || 80,
          Protocol: (properties.target_group_protocol as string) || 'HTTP',
          VpcId: vpcId,
          TargetType: 'ip',
        }),
      );

      return ok(name, TYPE, 'create', start, { provider_id: arn });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('elbv2') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'ELBv2 SDK not available');

    try {
      const elb = await load_aws_sdk(SDK);
      if (!elb) return err(name, TYPE, 'delete', start, 'ELBv2 SDK not available');

      await client.send(new elb.DeleteLoadBalancerCommand({ LoadBalancerArn: provider_id }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
