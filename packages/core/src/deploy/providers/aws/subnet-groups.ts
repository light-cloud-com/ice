/**
 * AWS subnet-group bootstrap helpers.
 *
 * RDS and ElastiCache require a "subnet group" — a pre-aggregated
 * collection of subnets across ≥2 AZs — instead of taking raw subnet
 * arrays. When a canvas wires Network.Subnet blocks to RDS / ElastiCache,
 * these helpers auto-create the appropriate subnet group on the fly,
 * named `ice-<resource>-sng`, so the handler can pass it straight to
 * Create{DBInstance,CacheCluster,ReplicationGroup}.
 *
 * Cleanup: delete-paths call the matching `delete_*_subnet_group_if_present`
 * after the resource itself is gone. AWS rejects subnet-group deletion
 * while any DB instance still references it, so order is "delete DB,
 * then group" — the helper swallows NotFound so re-runs are idempotent.
 *
 * Both helpers no-op when:
 *   - Operator supplied `*_subnet_group_name` explicitly (passes through).
 *   - No canvas subnets are wired (returns undefined; handler falls
 *     through to AWS default-VPC behaviour).
 */

import { resolve_aws_network_refs } from './network-resolver';
import { load_aws_sdk } from './sdk-loader';
import type { AWSHandlerContext } from './types';

const RDS_SDK = '@aws-sdk/client-rds';
const ELASTICACHE_SDK = '@aws-sdk/client-elasticache';

function ice_subnet_group_name(resource_name: string): string {
  return `ice-${resource_name}-sng`;
}

/**
 * Ensure an RDS DBSubnetGroup exists covering the canvas-wired subnets.
 * Returns the group name (operator-supplied or freshly-bootstrapped) or
 * undefined when nothing is wired (handler falls back to default VPC).
 */
export async function ensure_rds_db_subnet_group(
  resource_name: string,
  properties: Record<string, unknown>,
  ctx: AWSHandlerContext,
): Promise<string | undefined> {
  const operator = properties.db_subnet_group_name as string | undefined;
  if (operator) return operator;

  const refs = await resolve_aws_network_refs(properties, ctx);
  if (refs.subnets.length < 2) return undefined;

  const rds = await load_aws_sdk(RDS_SDK);
  if (!rds) throw new Error('RDS SDK not available — install @aws-sdk/client-rds');
  const client = ctx.clients.get('rds') as any;
  if (!client) throw new Error('RDS client not initialised');

  const group = ice_subnet_group_name(resource_name);
  try {
    await client.send(
      new rds.CreateDBSubnetGroupCommand({
        DBSubnetGroupName: group,
        DBSubnetGroupDescription: `ICE-managed subnet group for ${resource_name}`,
        SubnetIds: refs.subnets,
      }),
    );
  } catch (e: any) {
    if (e?.name !== 'DBSubnetGroupAlreadyExists') throw e;
  }
  return group;
}

export async function delete_rds_db_subnet_group_if_present(
  resource_name: string,
  ctx: AWSHandlerContext,
): Promise<void> {
  const rds = await load_aws_sdk(RDS_SDK);
  if (!rds) return;
  const client = ctx.clients.get('rds') as any;
  if (!client) return;
  const group = ice_subnet_group_name(resource_name);
  try {
    await client.send(new rds.DeleteDBSubnetGroupCommand({ DBSubnetGroupName: group }));
  } catch (e: any) {
    if (e?.name !== 'DBSubnetGroupNotFoundFault') throw e;
  }
}

/**
 * Ensure an ElastiCache CacheSubnetGroup exists. Mirror of the RDS
 * helper. Returns the group name or undefined.
 */
export async function ensure_elasticache_subnet_group(
  resource_name: string,
  properties: Record<string, unknown>,
  ctx: AWSHandlerContext,
): Promise<string | undefined> {
  const operator = properties.cache_subnet_group_name as string | undefined;
  if (operator) return operator;

  const refs = await resolve_aws_network_refs(properties, ctx);
  if (refs.subnets.length < 1) return undefined;

  const ec = await load_aws_sdk(ELASTICACHE_SDK);
  if (!ec) throw new Error('ElastiCache SDK not available — install @aws-sdk/client-elasticache');
  const client = ctx.clients.get('elasticache') as any;
  if (!client) throw new Error('ElastiCache client not initialised');

  const group = ice_subnet_group_name(resource_name);
  try {
    await client.send(
      new ec.CreateCacheSubnetGroupCommand({
        CacheSubnetGroupName: group,
        CacheSubnetGroupDescription: `ICE-managed subnet group for ${resource_name}`,
        SubnetIds: refs.subnets,
      }),
    );
  } catch (e: any) {
    if (e?.name !== 'CacheSubnetGroupAlreadyExists') throw e;
  }
  return group;
}

export async function delete_elasticache_subnet_group_if_present(
  resource_name: string,
  ctx: AWSHandlerContext,
): Promise<void> {
  const ec = await load_aws_sdk(ELASTICACHE_SDK);
  if (!ec) return;
  const client = ctx.clients.get('elasticache') as any;
  if (!client) return;
  const group = ice_subnet_group_name(resource_name);
  try {
    await client.send(new ec.DeleteCacheSubnetGroupCommand({ CacheSubnetGroupName: group }));
  } catch (e: any) {
    if (e?.name !== 'CacheSubnetGroupNotFoundFault') throw e;
  }
}
