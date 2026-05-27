/**
 * Azure API Management handler — `azure.apimanagement.service`.
 *
 * Backs Network.Gateway on Azure (parallel to AWS API Gateway and GCP
 * API Gateway). Developer tier by default — cheapest, no SLA, dev /
 * staging only. Operators flip to Basic / Standard / Premium for
 * production SLA + multi-region.
 *
 * APIM is long-running: Developer SKU takes 30–45 minutes to provision.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.apimanagement.service';
const SDK = '@azure/arm-apimanagement';

export const apim_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('apim') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'API Management', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.apiManagementService.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        sku: {
          name: (properties.sku_name as string) || 'Developer',
          capacity: (properties.sku_capacity as number) ?? 1,
        },
        publisherEmail: (properties.publisher_email as string) || 'admin@example.com',
        publisherName: (properties.publisher_name as string) || 'ice',
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('apim') as any;
    if (!client) return err(name, TYPE, 'update', start, 'API Management SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.apiManagementService.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('apim') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'API Management SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.apiManagementService.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
