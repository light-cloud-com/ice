/**
 * Azure Front Door handler — `azure.network.frontDoor`.
 *
 * Backs the global Network.LoadBalancer variant on Azure (parallel to
 * AWS CloudFront / Global Accelerator and GCP global Load Balancer).
 * Uses the Standard/Premium AzureFrontDoor SKU — the modern profile —
 * not the classic Front Door (deprecated 2024).
 *
 * The handler creates the AFD profile; routes + origin groups +
 * endpoints are added via canvas wiring + per-block extractor entries
 * in Phase B4 quirks (covered alongside CloudFront cert wiring).
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.network.frontDoor';
const SDK = '@azure/arm-cdn';

export const front_door_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cdn') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Front Door', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.profiles.beginCreateAndWait(resource_group, name, {
        location: 'global',
        sku: { name: (properties.sku_name as string) || 'Standard_AzureFrontDoor' },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cdn') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Front Door SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.profiles.beginUpdateAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('cdn') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Front Door SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.profiles.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
