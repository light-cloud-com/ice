/**
 * Azure Entra External ID (B2C) handler — `azure.aad.b2cTenant`.
 *
 * Backs Security.Identity on Azure (parallel to AWS Cognito and GCP
 * Identity Platform). B2C tenants are exposed via the
 * `Microsoft.AzureActiveDirectory/b2cDirectories` ARM provider, which
 * lives under `@azure/arm-aad`.
 *
 * Standard tier by default. Tenant names must end in `.onmicrosoft.com`
 * and be globally unique; the canvas appends a suffix via the
 * global-uniqueness quirk in Phase B4.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.aadb2c.directory';
const SDK = '@azure/arm-aad';

export const entra_b2c_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('aad') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Entra External ID (B2C)', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const tenant_name = (properties.tenant_name as string) || `${name}.onmicrosoft.com`;
      const result = await client.b2CTenants.beginCreateAndWait(resource_group, tenant_name, {
        location: (properties.location as string) || ctx.location || 'United States',
        sku: { name: (properties.sku_name as string) || 'Standard', tier: 'A0' },
        properties: {
          countryCode: (properties.country_code as string) || 'US',
          displayName: (properties.display_name as string) || name,
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
    const client = ctx.clients.get('aad') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Entra External ID SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      const tenant_name = (properties.tenant_name as string) || provider_id.split('/').pop() || name;
      await client.b2CTenants.update(resource_group, tenant_name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('aad') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Entra External ID SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      const tenant_name = provider_id.split('/').pop() || name;
      await client.b2CTenants.beginDeleteAndWait(resource_group, tenant_name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
