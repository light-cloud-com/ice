/**
 * DigitalOcean Kubernetes (DOKS) cluster handler —
 * `digitalocean.kubernetes.cluster`.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.kubernetes.cluster';
const SDK = 'dots-wrapper';

export const kubernetes_cluster_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const result = await ctx.client.kubernetes.createKubernetesCluster({
        name,
        region: (properties.region as string) || ctx.region,
        version: (properties.version as string) || 'latest',
        vpc_uuid: properties.vpc_uuid as string | undefined,
        node_pools: (properties.node_pools as unknown[]) ?? [
          {
            name: 'default',
            size: (properties.node_size as string) || 's-1vcpu-2gb',
            count: (properties.node_count as number) ?? 2,
          },
        ],
        tags: ['managed-by:ice'],
      });
      const id = result?.data?.kubernetes_cluster?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createKubernetesCluster returned no id');
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
      await ctx.client.kubernetes.updateKubernetesCluster({
        kubernetes_cluster_id: provider_id,
        name,
      });
      if (properties.version) {
        await ctx.client.kubernetes.upgradeKubernetesCluster({
          kubernetes_cluster_id: provider_id,
          version: properties.version as string,
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
      await ctx.client.kubernetes.deleteKubernetesCluster({ kubernetes_cluster_id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
