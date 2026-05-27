/**
 * Azure Container Registry handler — `azure.containerregistry.registry`.
 *
 * Backs Compute.ContainerRegistry on Azure (parallel to AWS ECR and GCP
 * Artifact Registry). Default SKU = Basic (cheapest); operators flip to
 * Standard / Premium for georeplication + content trust + private link.
 *
 * Registry names must be 5–50 alphanumeric chars (no hyphens) and
 * globally unique — quirks file handles the suffix-append logic; the
 * handler trusts the caller's name.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.containerregistry.registry';
const SDK = '@azure/arm-containerregistry';

export const acr_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('acr') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Container Registry', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.registries.beginCreateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        sku: { name: (properties.sku_name as string) || 'Basic' },
        adminUserEnabled: properties.admin_user_enabled === true,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('acr') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Container Registry SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.registries.beginUpdateAndWait(resource_group, name, {
        sku: properties.sku_name ? { name: properties.sku_name as string } : undefined,
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('acr') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Container Registry SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.registries.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
