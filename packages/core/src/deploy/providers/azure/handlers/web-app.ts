/**
 * Azure Web App handler — `azure.web.app`.
 *
 * Migrated from the legacy monolith. Auto-resource-group support
 * added; B4 quirk: app service plan auto-bootstrap.
 *
 * When `properties.app_service_plan_id` isn't supplied, the handler
 * auto-bootstraps a Free-tier (F1) plan named `ice-default-plan` in
 * the deploy resource group. Operators flip to B1/S1/P1V3 by wiring an
 * explicit App Service Plan block.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureHandlerContext, AzureResourceHandler } from '../types';

const TYPE = 'azure.web.app';
const SDK = '@azure/arm-appservice';
const DEFAULT_PLAN_NAME = 'ice-default-plan';

/**
 * Auto-bootstrap an F1 App Service Plan in the target resource group
 * if no plan was wired on canvas. Returns the resource ID. Reuses any
 * existing `ice-default-plan` so multiple Web Apps share the plan.
 */
async function ensure_default_plan(ctx: AzureHandlerContext, resource_group: string): Promise<string> {
  const client = ctx.clients.get('web') as any;
  if (!client) throw new Error('Web SDK not available — install @azure/arm-appservice');
  try {
    const existing = await client.appServicePlans.get(resource_group, DEFAULT_PLAN_NAME);
    if (existing?.id) return existing.id;
  } catch {
    // not found — create below
  }
  ctx.on_log?.(`Auto-bootstrapping App Service Plan ${DEFAULT_PLAN_NAME} (F1) in ${resource_group}`);
  const created = await client.appServicePlans.beginCreateOrUpdateAndWait(resource_group, DEFAULT_PLAN_NAME, {
    location: ctx.location,
    sku: { name: 'F1', tier: 'Free', capacity: 1 },
    reserved: true,
  });
  return created?.id ?? '';
}

export const web_app_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Web', SDK);

    try {
      const location = (properties.location as string) || ctx.location;
      const resource_group = (properties.resource_group as string) || ctx.resource_group;

      let plan_id = properties.app_service_plan_id as string | undefined;
      if (!plan_id) {
        plan_id = await ensure_default_plan(ctx, resource_group);
      }

      const result = await client.webApps.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        serverFarmId: plan_id,
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
