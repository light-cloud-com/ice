/**
 * DigitalOcean Cloud Firewall handler — `digitalocean.firewall.firewall`.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.firewall.firewall';
const SDK = 'dots-wrapper';

export const firewall_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const result = await ctx.client.firewall.createFirewall({
        name,
        inbound_rules: (properties.inbound_rules as unknown[]) ?? [
          { protocol: 'tcp', ports: '22', sources: { addresses: ['0.0.0.0/0', '::/0'] } },
        ],
        outbound_rules: (properties.outbound_rules as unknown[]) ?? [
          { protocol: 'tcp', ports: 'all', destinations: { addresses: ['0.0.0.0/0', '::/0'] } },
        ],
        droplet_ids: (properties.droplet_ids as number[]) ?? [],
        tags: ['managed-by:ice'],
      });
      const id = result?.data?.firewall?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createFirewall returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isDoAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
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
      await ctx.client.firewall.deleteFirewall({ firewall_id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
