/**
 * Azure Static Web Apps handler — `azure.web.staticSite`.
 *
 * Backs Compute.SSRSite on Azure (parallel to AWS Amplify Hosting and
 * GCP Firebase Hosting). The Free tier (`Free` SKU) is the default —
 * suits dev / hobby. Operators flip to `Standard` for SLA + private
 * endpoints + larger size limits.
 *
 * Repo wiring (repositoryUrl + branch + repositoryToken) is supplied
 * via canvas properties when a GitHub Repo block is connected; absent
 * those, the SWA is created in "BYOC" mode and the operator pushes
 * content via the CLI.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.web.staticSite';
const SDK = '@azure/arm-appservice';

export const static_web_apps_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('web') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Static Web Apps', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;

      const result = await client.staticSites.beginCreateOrUpdateStaticSiteAndWait(resource_group, name, {
        location,
        sku: {
          name: (properties.sku_name as string) || 'Free',
          tier: (properties.sku_tier as string) || (properties.sku_name as string) || 'Free',
        },
        repositoryUrl: (properties.repository_url as string) || undefined,
        branch: (properties.branch as string) || undefined,
        repositoryToken: (properties.repository_token as string) || undefined,
        buildProperties: properties.repository_url
          ? {
              appLocation: (properties.app_location as string) || '/',
              outputLocation: (properties.output_location as string) || 'dist',
              apiLocation: (properties.api_location as string) || undefined,
              appBuildCommand: (properties.app_build_command as string) || undefined,
            }
          : undefined,
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
    if (!client) return err(name, TYPE, 'update', start, 'Static Web Apps SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.staticSites.updateStaticSite(resource_group, name, {
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
    if (!client) return err(name, TYPE, 'delete', start, 'Static Web Apps SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.staticSites.beginDeleteStaticSiteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
