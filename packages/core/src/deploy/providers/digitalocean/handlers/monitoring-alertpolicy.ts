/**
 * DigitalOcean Monitoring alert policy handler —
 * `digitalocean.monitoring.alertpolicy`.
 */

import { err, isDoAlreadyExists, isDoNotFound, ok, sdkMissing } from './_result';
import type { DOResourceHandler } from '../types';

const TYPE = 'digitalocean.monitoring.alertpolicy';
const SDK = 'dots-wrapper';

export const monitoring_alertpolicy_handler: DOResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.client) return sdkMissing(name, TYPE, 'create', start, 'DigitalOcean', SDK);
    try {
      const result = await ctx.client.monitoring.createAlertPolicy({
        description: name,
        type: (properties.metric as string) || 'v1/insights/droplet/cpu',
        compare: (properties.compare as string) || 'GreaterThan',
        value: (properties.threshold as number) ?? 80,
        window: (properties.window as string) || '5m',
        enabled: true,
        alerts: {
          email: (properties.email_alerts as string[]) ?? [],
          slack: (properties.slack_alerts as unknown[]) ?? [],
        },
        entities: (properties.entities as string[]) ?? [],
        tags: ['managed-by:ice'],
      });
      const id = result?.data?.policy?.uuid as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'createAlertPolicy returned no uuid');
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
      await ctx.client.monitoring.deleteAlertPolicy({ alert_uuid: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isDoNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
