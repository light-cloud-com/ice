/**
 * DigitalOcean App Platform handler — `digitalocean.apps.app`.
 *
 * The full spec (services + databases + static-sites + jobs + envs)
 * is composed from connected canvas blocks by the extractor.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.apps.app';
const SDK = 'dots-wrapper';

export const apps_app_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const spec = (properties.spec as Record<string, unknown>) ?? {
        name,
        region: (properties.region as string) || ctx.region,
        services: [
          {
            name: 'web',
            instance_size_slug: (properties.instance_size as string) || 'basic-xxs',
            instance_count: (properties.instance_count as number) ?? 1,
            github: properties.github,
            git: properties.git,
          },
        ],
      };
      const result = await ctx.client.app.createApp({ spec });
      const id = result?.data?.app?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createApp returned no id');
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
      const spec = (properties.spec as Record<string, unknown>) ?? { name };
      await ctx.client.app.updateApp({ app_id: provider_id, spec });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    if (!ctx.client) return err(name, TYPE, 'delete', start, 'DO SDK not available');
    try {
      await ctx.client.app.deleteApp({ app_id: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
