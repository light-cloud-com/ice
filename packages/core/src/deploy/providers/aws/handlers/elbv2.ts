/**
 * ELBv2 Handler
 *
 * Handles: aws.elbv2.loadBalancer
 *
 * CreateLoadBalancer + CreateTargetGroup (skeleton target — operators
 * register backend services via outgoing edges + a follow-up
 * RegisterTargets call from the consuming compute handler).
 */

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

      const lb = await client.send(
        new elb.CreateLoadBalancerCommand({
          Name: name,
          Scheme: properties.scheme as string,
          Type: properties.type as string,
          IpAddressType: properties.ip_address_type as string,
        }),
      );
      const arn =
        lb?.LoadBalancers?.[0]?.LoadBalancerArn ??
        `arn:aws:elasticloadbalancing:${ctx.region}:*:loadbalancer/app/${name}`;

      // Skeleton target group so the LB is wired even before backends connect.
      await client.send(
        new elb.CreateTargetGroupCommand({
          Name: `${name}-tg`,
          Port: (properties.target_group_port as number) || 80,
          Protocol: (properties.target_group_protocol as string) || 'HTTP',
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
