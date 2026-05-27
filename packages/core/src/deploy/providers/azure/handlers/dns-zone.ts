/**
 * Azure DNS Zone handler — `azure.network.dnsZone`.
 *
 * Backs Network.CustomDomain on Azure (parallel to AWS Route53 hosted
 * zone and GCP managed DNS). The handler creates a public DNS zone by
 * default; `properties.private === true` flips to a private DNS zone
 * (under @azure/arm-privatedns) — for now the public path covers the
 * canvas Custom Domain block.
 *
 * Zones are global resources — Azure stores them at `location: 'global'`.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.network.dnsZone';
const SDK = '@azure/arm-dns';

export const dns_zone_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('dns') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'DNS Zone', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const zone_name = (properties.zone_name as string) || name;
      const result = await client.zones.createOrUpdate(resource_group, zone_name, {
        location: 'global',
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('dns') as any;
    if (!client) return err(name, TYPE, 'update', start, 'DNS Zone SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      const zone_name = (properties.zone_name as string) || name;
      await client.zones.update(resource_group, zone_name, { tags: properties.tags as Record<string, string> });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('dns') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'DNS Zone SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      const zone_name = provider_id.split('/').pop() || name;
      await client.zones.beginDeleteAndWait(resource_group, zone_name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
