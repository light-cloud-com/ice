/**
 * Azure Web App handler — `azure.web.app`.
 *
 * Migrated from the legacy monolith. Auto-resource-group support
 * added; everything else is unchanged.
 *
 * Note: the App Service Plan is operator-supplied today
 * (`properties.app_service_plan_id`). Auto-bootstrap of an F1 plan
 * lands in B4 as part of the quirks sweep.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.web.app';
const SDK = '@azure/arm-appservice';

export const web_app_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Web', SDK);

    try {
      const location = (properties.location as string) || ctx.location;
      const resource_group = (properties.resource_group as string) || ctx.resource_group;

      const result = await client.webApps.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        serverFarmId: properties.app_service_plan_id as string,
        siteConfig: {
          linuxFxVersion: properties.linux_fx_version as string,
          appSettings: properties.app_settings
            ? Object.entries(properties.app_settings as Record<string, string>).map(([n, value]) => ({
                name: n,
                value,
              }))
            : undefined,
        },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Web SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.webApps.update(resource_group, name, {
        siteConfig: {
          appSettings: properties.app_settings
            ? Object.entries(properties.app_settings as Record<string, string>).map(([n, value]) => ({
                name: n,
                value,
              }))
            : undefined,
        },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Web SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.webApps.delete(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
