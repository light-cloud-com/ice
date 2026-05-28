/**
 * DigitalOcean Functions namespace handler —
 * `digitalocean.functions.namespace`.
 *
 * The namespace is the parent grouping; per-function deploys land
 * inside one namespace.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.functions.namespace';
const SDK = 'dots-wrapper';

export const functions_namespace_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const result = await ctx.client.functions.createNamespace({
        label: name,
        region: (properties.region as string) || ctx.region,
      });
      const id = result?.data?.namespace?.namespace as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createNamespace returned no namespace id');
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
      await ctx.client.functions.deleteNamespace({ namespace: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
