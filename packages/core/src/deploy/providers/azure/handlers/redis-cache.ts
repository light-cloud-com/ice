/**
 * Azure Cache for Redis handler — `azure.cache.redis`.
 *
 * Backs Database.Cache on Azure. Basic C0 (250MB) is the default tier
 * — cheapest, single-node, no SLA. Operators flip to Standard / Premium
 * for HA + persistence.
 *
 * Long-running: Redis cache creation takes 15–25 minutes (Azure
 * provisioning quirk). The SDK's `beginCreateAndWait` polls until the
 * provisioning state settles.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.cache.redis';
const SDK = '@azure/arm-rediscache';

export const redis_cache_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('redis') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Redis Cache', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;

      const result = await client.redis.beginCreateAndWait(resource_group, name, {
        location,
        sku: {
          name: (properties.sku_name as string) || 'Basic',
          family: (properties.sku_family as string) || 'C',
          capacity: (properties.sku_capacity as number) ?? 0,
        },
        enableNonSslPort: properties.enable_non_ssl_port === true,
        minimumTlsVersion: (properties.minimum_tls_version as string) || '1.2',
        redisVersion: (properties.redis_version as string) || '6',
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('redis') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Redis Cache SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.redis.update(resource_group, name, {
        sku: properties.sku_name
          ? {
              name: properties.sku_name as string,
              family: (properties.sku_family as string) || 'C',
              capacity: (properties.sku_capacity as number) ?? 0,
            }
          : undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('redis') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Redis Cache SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.redis.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
