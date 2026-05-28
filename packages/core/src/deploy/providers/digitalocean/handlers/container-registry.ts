/**
 * DigitalOcean Container Registry handler —
 * `digitalocean.container_registry.registry`.
 *
 * DOCR is single-registry-per-account; the handler is a no-op when one
 * already exists (idempotent reuse).
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.container_registry.registry';
const SDK = 'dots-wrapper';

export const container_registry_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      // DO Container Registry has no per-account create — operators pick a
      // name once via the dashboard. The dots-wrapper `configureRegistry`
      // method only sets the registry's display name; tier / region come
      // from `subscribeToContainerRegistry` (separate API call, not in
      // dots-wrapper). Configure to record the name; tier upgrades happen
      // via the DO API directly.
      await ctx.client.containerRegistry.configureRegistry({ name });
      return ok(name, TYPE, 'create', start, { provider_id: name });
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
      await ctx.client.containerRegistry.deleteRegistry();
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
