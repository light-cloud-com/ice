/**
 * DigitalOcean Managed Database cluster handler —
 * `digitalocean.databases.cluster`.
 *
 * Engine is picked from properties.engine:
 *   - postgres  (default: version 16)
 *   - mysql     (default: 8)
 *   - mongodb   (default: 7)
 *   - redis     (default: 7)
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.databases.cluster';
const SDK = 'dots-wrapper';

const DEFAULT_VERSION: Record<string, string> = { pg: '16', mysql: '8', mongodb: '7', redis: '7' };
function engineSlug(engine: string): string {
  const e = engine.toLowerCase();
  if (e.startsWith('postgres') || e === 'pg') return 'pg';
  if (e.startsWith('mysql')) return 'mysql';
  if (e.startsWith('mongo')) return 'mongodb';
  if (e.startsWith('redis')) return 'redis';
  return 'pg';
}

export const databases_cluster_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const engine = engineSlug((properties.engine as string) ?? 'postgres');
      const result = await ctx.client.database.createDatabaseCluster({
        name,
        engine,
        version: (properties.engine_version as string) ?? DEFAULT_VERSION[engine],
        size: (properties.size as string) || 'db-s-1vcpu-1gb',
        region: (properties.region as string) || ctx.region,
        num_nodes: (properties.num_nodes as number) ?? 1,
        tags: ['managed-by:ice'],
      });
      const id = result?.data?.database?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createDatabaseCluster returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isDoAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    if (!ctx.client) return err(name, TYPE, 'update', start, 'DO SDK not available');
    try {
      if (properties.size || properties.num_nodes) {
        await ctx.client.database.resizeDatabaseCluster({
          database_cluster_id: provider_id,
          size: properties.size as string | undefined,
          num_nodes: properties.num_nodes as number | undefined,
        });
      }
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    if (!ctx.client) return err(name, TYPE, 'delete', start, 'DO SDK not available');
    try {
      await ctx.client.database.deleteDatabaseCluster({ database_cluster_id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
