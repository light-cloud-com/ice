/**
 * DigitalOcean App Platform env-var handler — `digitalocean.apps.envvar`.
 *
 * Backs Security.Secret blocks for app-platform-attached secrets. The
 * env-var is updated on an existing App's spec.
 */

import { err, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.apps.envvar';
const SDK = 'dots-wrapper';

export const apps_envvar_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    if (!properties.app_id) return err(name, TYPE, 'create', start, 'App env-var requires properties.app_id');
    try {
      const current = await ctx.client.app.getApp({ app_id: properties.app_id as string });
      const spec = current?.data?.app?.spec ?? {};
      const envs = (spec.envs as Array<{ key: string; value: string; type?: string; scope?: string }>) ?? [];
      const existingIndex = envs.findIndex((e) => e.key === name);
      const newEntry = {
        key: name,
        value: (properties.value as string) ?? '',
        type: (properties.type as string) || 'SECRET',
        scope: (properties.scope as string) || 'RUN_TIME',
      };
      if (existingIndex >= 0) envs[existingIndex] = newEntry;
      else envs.push(newEntry);
      spec.envs = envs;
      await ctx.client.app.updateApp({ app_id: properties.app_id as string, spec });
      return ok(name, TYPE, 'create', start, { provider_id: `${properties.app_id}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },
  async update(name, provider_id, properties, _current, ctx) {
    return this.create(name, properties, ctx).then((r) => ({ ...r, action: 'update' as const, provider_id }));
  },
  async delete(name, provider_id, ctx) {
    const start = Date.now();
    if (!ctx.client) return err(name, TYPE, 'delete', start, 'DO SDK not available');
    try {
      const [appId, key] = provider_id.split('/');
      const current = await ctx.client.app.getApp({ app_id: appId });
      const spec = current?.data?.app?.spec ?? {};
      const envs = (spec.envs as Array<{ key: string }>) ?? [];
      spec.envs = envs.filter((e) => e.key !== key);
      await ctx.client.app.updateApp({ app_id: appId, spec });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
