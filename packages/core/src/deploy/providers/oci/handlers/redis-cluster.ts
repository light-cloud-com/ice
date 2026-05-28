/**
 * OCI Cache (Redis) cluster handler — `oci.redis.cluster`.
 */

import { resolveClient } from './_client';
import { err, isOciAlreadyExists, isOciNotFound, ok, sdkMissing } from './_result';
import type { OCIResourceHandler } from '../types';

const TYPE = 'oci.redis.cluster';
const SDK = 'oci-redis';

export const redis_cluster_handler: OCIResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const redis = await resolveClient(ctx, 'redis');
    if (!redis) return sdkMissing(name, TYPE, 'create', start, 'OCI Cache', SDK);
    try {
      const result = await redis.createRedisCluster({
        createRedisClusterDetails: {
          compartmentId: ctx.compartment_id,
          displayName: name,
          subnetId: properties.subnet_id as string | undefined,
          softwareVersion: (properties.version as string) || 'REDIS_7_0',
          nodeCount: (properties.node_count as number) ?? 1,
          nodeMemoryInGBs: (properties.memory_gb as number) ?? 1,
          freeformTags: { 'managed-by': 'ice' },
        },
      });
      const id = result?.redisCluster?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createRedisCluster returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isOciAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, ctx) {
    const start = Date.now();
    const redis = await resolveClient(ctx, 'redis');
    if (!redis) return err(name, TYPE, 'update', start, 'OCI Cache SDK not available');
    try {
      await redis.updateRedisCluster({
        redisClusterId: provider_id,
        updateRedisClusterDetails: { displayName: name },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const redis = await resolveClient(ctx, 'redis');
    if (!redis) return err(name, TYPE, 'delete', start, 'OCI Cache SDK not available');
    try {
      await redis.deleteRedisCluster({ redisClusterId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isOciNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
