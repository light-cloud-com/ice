/**
 * DigitalOcean Reserved IP handler — `digitalocean.reservedip.reservedip`.
 */

import { err, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.reservedip.reservedip';
const SDK = 'dots-wrapper';

export const reserved_ip_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const result = await ctx.client.reservedIp.createReservedIp({
        region: (properties.region as string) || ctx.region,
        droplet_id: properties.droplet_id ? Number(properties.droplet_id) : undefined,
      });
      const ip = result?.data?.reserved_ip?.ip as string | undefined;
      if (!ip) return err(name, TYPE, 'create', start, 'createReservedIp returned no ip');
      return ok(name, TYPE, 'create', start, { provider_id: ip });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, _properties, _current, _ctx) {
    const start = Date.now();
    return ok(name, TYPE, 'update', start, { provider_id });
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    if (!ctx.client) return err(name, TYPE, 'delete', start, 'DO SDK not available');
    try {
      await ctx.client.reservedIp.deleteReservedIp({ reserved_ip: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
