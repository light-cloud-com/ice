/**
 * Azure App Service Plan handler — `azure.web.appServicePlan`.
 *
 * Backs the App Service Plan that hosts Compute.Container (web variant).
 * The plan provisions on the canvas's Compute block; the existing
 * `azure.web.app` web-app handler then deploys the Web App against
 * that plan via `app_service_plan_id`.
 *
 * Default tier = F1 (Free, Linux). Operators flip via `properties.tier`.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.web.appServicePlan';
const SDK = '@azure/arm-appservice';

export const app_service_plan_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Web', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;
      const tier = (properties.tier as string) || 'F1';
      const result = await client.appServicePlans.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        sku: {
          name: tier,
          tier: skuTier(tier),
          capacity: (properties.capacity as number) ?? 1,
        },
        reserved: properties.reserved !== false, // Linux by default
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
      // AppServicePlanPatchResource doesn't expose `tags` — there's
      // nothing to PATCH on a plan today besides SKU bumps, which the
      // operator routes through the canvas properties. Emit a no-op
      // success so the deploy plan registers the update.
      if (properties.tags) {
        ctx.on_log?.(`Note: Azure App Service Plan ${name} tag updates go through the generic resources API.`);
      }
      await client.appServicePlans.update(resource_group, name, {});
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
      await client.appServicePlans.delete(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

function skuTier(name: string): string {
  if (name.startsWith('F')) return 'Free';
  if (name.startsWith('D')) return 'Shared';
  if (name.startsWith('B')) return 'Basic';
  if (name.startsWith('S')) return 'Standard';
  if (name.startsWith('P')) return 'PremiumV3';
  return 'Standard';
}
