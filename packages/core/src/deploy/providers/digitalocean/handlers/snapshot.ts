/**
 * DigitalOcean Droplet snapshot handler — `digitalocean.droplet.snapshot`.
 *
 * Snapshots a target Droplet by ID; the result snapshot ID is returned
 * for restore wiring.
 */

import { err, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.droplet.snapshot';
const SDK = 'dots-wrapper';

export const snapshot_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    if (!properties.droplet_id) return err(name, TYPE, 'create', start, 'Snapshot requires properties.droplet_id');
    try {
      const result = await ctx.client.dropletAction.snapshotDroplet({
        droplet_id: Number(properties.droplet_id),
        name,
      });
      const actionId = result?.data?.action?.id as number | undefined;
      return ok(name, TYPE, 'create', start, { provider_id: String(actionId ?? name) });
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
      await ctx.client.snapshot.deleteSnapshot({ snapshot_id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
