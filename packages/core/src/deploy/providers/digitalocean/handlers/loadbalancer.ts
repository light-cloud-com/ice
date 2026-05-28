/**
 * DigitalOcean Load Balancer handler —
 * `digitalocean.loadbalancer.loadbalancer`.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.loadbalancer.loadbalancer';
const SDK = 'dots-wrapper';

export const loadbalancer_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const result = await ctx.client.loadBalancer.createLoadBalancer({
        name,
        region: (properties.region as string) || ctx.region,
        size_unit: (properties.size_unit as number) ?? 1,
        vpc_uuid: properties.vpc_uuid as string | undefined,
        droplet_ids: (properties.droplet_ids as number[]) ?? [],
        forwarding_rules: (properties.forwarding_rules as unknown[]) ?? [
          { entry_protocol: 'http', entry_port: 80, target_protocol: 'http', target_port: 8080 },
        ],
      });
      const id = result?.data?.load_balancer?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createLoadBalancer returned no id');
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
      await ctx.client.loadBalancer.updateLoadBalancer({
        load_balancer_id: provider_id,
        size_unit: properties.size_unit as number | undefined,
        droplet_ids: properties.droplet_ids as number[] | undefined,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    if (!ctx.client) return err(name, TYPE, 'delete', start, 'DO SDK not available');
    try {
      await ctx.client.loadBalancer.deleteLoadBalancer({ load_balancer_id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
