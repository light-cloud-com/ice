/**
 * DigitalOcean Droplet handler — `digitalocean.droplet.instance`.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.droplet.instance';
const SDK = 'dots-wrapper';

export const droplet_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const result = await ctx.client.droplet.createDroplet({
        name,
        region: (properties.region as string) || ctx.region,
        size: (properties.size as string) || 's-1vcpu-1gb',
        image: (properties.image as string) || 'ubuntu-22-04-x64',
        ssh_keys: (properties.ssh_keys as string[]) ?? [],
        vpc_uuid: properties.vpc_uuid as string | undefined,
        user_data: properties.user_data as string | undefined,
        tags: ['managed-by:ice'],
      });
      const id = result?.data?.droplet?.id as number | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createDroplet returned no id');
      return ok(name, TYPE, 'create', start, { provider_id: String(id) });
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
      await ctx.client.droplet.deleteDroplet({ droplet_id: Number(provider_id) });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
