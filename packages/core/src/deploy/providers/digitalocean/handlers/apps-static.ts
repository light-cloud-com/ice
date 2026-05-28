/**
 * DigitalOcean App Platform static site handler —
 * `digitalocean.apps.staticSite`.
 *
 * Same App Platform API as `apps-app` but with `static_sites` array
 * in the spec instead of `services`.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.apps.staticSite';
const SDK = 'dots-wrapper';

export const apps_static_site_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const spec = {
        name,
        region: (properties.region as string) || ctx.region,
        static_sites: [
          {
            name: 'web',
            github: properties.github,
            git: properties.git,
            build_command: properties.build_command as string | undefined,
            output_dir: (properties.output_dir as string) || 'dist',
            environment_slug: (properties.environment_slug as string) || 'node-js',
          },
        ],
      };
      const result = await ctx.client.app.createApp({ spec });
      const id = result?.data?.app?.id as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createApp (static) returned no id');
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
