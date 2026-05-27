/**
 * Azure Virtual Network handler — `azure.network.virtualNetwork`.
 *
 * Backs Network.VPC on Azure (parallel to AWS VPC and GCP VPC network).
 * Default address space 10.0.0.0/16 — matches AWS / GCP defaults so
 * canvas-derived diagrams render the same address ranges across all
 * three providers.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.network.virtualNetwork';
const SDK = '@azure/arm-network';

export const vnet_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Virtual Network', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;
      const address_prefixes =
        (properties.address_prefixes as string[]) ||
        (properties.cidr_block ? [properties.cidr_block as string] : ['10.0.0.0/16']);

      const result = await client.virtualNetworks.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        addressSpace: { addressPrefixes: address_prefixes },
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Virtual Network SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.virtualNetworks.updateTags(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Virtual Network SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.virtualNetworks.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
