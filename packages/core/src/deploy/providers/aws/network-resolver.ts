/**
 * AWS network primitive resolver.
 *
 * `pass-1-6-aws-network-wiring.ts` stamps `connected_subnet_names` and
 * `connected_security_group_names` onto target blocks. This helper
 * resolves those NAMES to actual `subnet-…` / `sg-…` IDs by querying
 * AWS via DescribeSubnets / DescribeSecurityGroups filtered on the
 * `tag:Name=<block-name>` that every ICE-deployed primitive carries.
 *
 * Handlers call `resolve_aws_network_refs` from inside their create
 * paths and merge the result into the SDK call. Operator-supplied
 * raw arrays (`properties.subnets` / `properties.security_groups`)
 * still pass through — when both are present, the canvas-driven set
 * is appended.
 */

import { load_aws_sdk } from './sdk-loader';
import type { AWSHandlerContext } from './types';

const SDK = '@aws-sdk/client-ec2';

export interface ResolvedNetworkRefs {
  subnets: string[];
  security_groups: string[];
}

async function describe_by_name(
  ctx: AWSHandlerContext,
  describer: 'subnet' | 'security-group' | 'vpc',
  names: string[],
): Promise<string[]> {
  if (names.length === 0) return [];
  const ec2 = await load_aws_sdk(SDK);
  if (!ec2) throw new Error('EC2 SDK not available — install @aws-sdk/client-ec2 to resolve canvas network blocks');
  const client = ctx.clients.get('ec2') as any;
  if (!client) throw new Error('EC2 client not initialised');

  if (describer === 'subnet') {
    const out = await client.send(new ec2.DescribeSubnetsCommand({ Filters: [{ Name: 'tag:Name', Values: names }] }));
    return ((out?.Subnets ?? []) as Array<{ SubnetId?: string }>)
      .map((s) => s.SubnetId)
      .filter((id): id is string => !!id);
  }

  if (describer === 'vpc') {
    const out = await client.send(new ec2.DescribeVpcsCommand({ Filters: [{ Name: 'tag:Name', Values: names }] }));
    return ((out?.Vpcs ?? []) as Array<{ VpcId?: string }>).map((v) => v.VpcId).filter((id): id is string => !!id);
  }

  const out = await client.send(
    new ec2.DescribeSecurityGroupsCommand({ Filters: [{ Name: 'tag:Name', Values: names }] }),
  );
  return ((out?.SecurityGroups ?? []) as Array<{ GroupId?: string }>)
    .map((s) => s.GroupId)
    .filter((id): id is string => !!id);
}

/**
 * Look up a single VPC id by its `Name` tag. Used by handlers (e.g.
 * ELBv2 target groups) that need a single VPC id. Returns undefined
 * when no match is found.
 */
export async function resolve_aws_vpc_id_by_name(vpcName: string, ctx: AWSHandlerContext): Promise<string | undefined> {
  const ids = await describe_by_name(ctx, 'vpc', [vpcName]);
  return ids[0];
}

/**
 * Resolve canvas-driven subnet + security-group names to AWS IDs and
 * merge with any operator-supplied raw arrays.
 *
 * Returns `{ subnets, security_groups }` arrays in the union order:
 * operator-supplied first, canvas-driven appended (de-duped).
 */
export async function resolve_aws_network_refs(
  properties: Record<string, unknown>,
  ctx: AWSHandlerContext,
): Promise<ResolvedNetworkRefs> {
  const opSubnets = (properties.subnets as string[]) || [];
  const opSgs = (properties.security_groups as string[]) || [];
  const subnetNames = (properties.connected_subnet_names as string[]) || [];
  const sgNames = (properties.connected_security_group_names as string[]) || [];

  const [resolvedSubnets, resolvedSgs] = await Promise.all([
    describe_by_name(ctx, 'subnet', subnetNames),
    describe_by_name(ctx, 'security-group', sgNames),
  ]);

  const subnets = Array.from(new Set([...opSubnets, ...resolvedSubnets]));
  const security_groups = Array.from(new Set([...opSgs, ...resolvedSgs]));

  return { subnets, security_groups };
}
