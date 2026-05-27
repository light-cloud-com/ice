/**
 * ElastiCache Handler
 *
 * Handles: aws.elasticache.cluster
 *
 * Create the cache cluster — Redis only today (Memcached is a stale
 * engine; ICE doesn't expose it on the canvas). For multi-node setups
 * the handler creates a replication group instead so HA mode actually
 * has standby nodes.
 */

import { resolve_aws_network_refs } from '../network-resolver';
import { load_aws_sdk } from '../sdk-loader';
import { delete_elasticache_subnet_group_if_present, ensure_elasticache_subnet_group } from '../subnet-groups';
import { err, ok, sdkMissing } from './_result';
import type { AWSResourceHandler } from '../types';

const TYPE = 'aws.elasticache.cluster';
const SDK = '@aws-sdk/client-elasticache';

export const elasticache_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('elasticache') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'ElastiCache', SDK);

    try {
      const ec = await load_aws_sdk(SDK);
      if (!ec) return sdkMissing(name, TYPE, 'create', start, 'ElastiCache', SDK);

      // Auto-bootstrap a CacheSubnetGroup when canvas Network.Subnet
      // blocks are wired. Operator's properties.cache_subnet_group_name
      // wins if set; otherwise fall back to AWS default-VPC behaviour
      // (un-wired).
      const subnetGroup = await ensure_elasticache_subnet_group(name, properties, ctx);
      const network = await resolve_aws_network_refs(properties, ctx);

      const isReplicated = (properties.num_cache_nodes as number) > 1;
      if (isReplicated) {
        await client.send(
          new ec.CreateReplicationGroupCommand({
            ReplicationGroupId: name,
            ReplicationGroupDescription: `ICE-managed ${name}`,
            Engine: 'redis',
            EngineVersion: (properties.engine_version as string) || '7.0',
            CacheNodeType: (properties.cache_node_type as string) || 'cache.t3.micro',
            NumCacheClusters: properties.num_cache_nodes as number,
            AutomaticFailoverEnabled: true,
            Port: (properties.port as number) || 6379,
            CacheParameterGroupName: properties.parameter_group_name as string,
            CacheSubnetGroupName: subnetGroup,
            SecurityGroupIds: network.security_groups.length > 0 ? network.security_groups : undefined,
          }),
        );
      } else {
        await client.send(
          new ec.CreateCacheClusterCommand({
            CacheClusterId: name,
            Engine: 'redis',
            EngineVersion: (properties.engine_version as string) || '7.0',
            CacheNodeType: (properties.cache_node_type as string) || 'cache.t3.micro',
            NumCacheNodes: 1,
            Port: (properties.port as number) || 6379,
            CacheParameterGroupName: properties.parameter_group_name as string,
            CacheSubnetGroupName: subnetGroup,
            SecurityGroupIds: network.security_groups.length > 0 ? network.security_groups : undefined,
          }),
        );
      }

      return ok(name, TYPE, 'create', start, { provider_id: `arn:aws:elasticache:${ctx.region}:*:cluster:${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, ctx) {
    // ElastiCache supports limited live updates (engine_version only,
    // and only forward). Skip the no-op path entirely until the
    // canvas exposes the relevant fields.
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('elasticache') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'ElastiCache SDK not available');

    try {
      const ec = await load_aws_sdk(SDK);
      if (!ec) return err(name, TYPE, 'delete', start, 'ElastiCache SDK not available');

      // Best-effort: try cluster first, fall back to replication group.
      try {
        await client.send(new ec.DeleteCacheClusterCommand({ CacheClusterId: name }));
      } catch {
        await client.send(new ec.DeleteReplicationGroupCommand({ ReplicationGroupId: name }));
      }
      try {
        await delete_elasticache_subnet_group_if_present(name, ctx);
      } catch {
        /* leave to operator / cleanup-orphans sweep */
      }
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
