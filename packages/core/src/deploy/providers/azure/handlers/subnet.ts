/**
 * Azure Subnet handler — `azure.network.subnet`.
 *
 * Backs Network.Subnet on Azure. Subnets live inside a Virtual Network
 * (parent vnet name supplied via properties.virtual_network_name or
 * resolved from canvas wiring). Default CIDR is 10.0.1.0/24.
 *
 * The Subnets SDK is exposed under `client.subnets`, parented by
 * `(resource_group, vnet_name, subnet_name)`.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.network.subnet';
const SDK = '@azure/arm-network';

function extract_vnet_name_from_id(provider_id: string, fallback: string): string {
  const match = provider_id.match(/\/virtualNetworks\/([^/]+)\/subnets\//);
  return match ? match[1] : fallback;
}

export const subnet_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Subnet', SDK);

    const vnet_name = properties.virtual_network_name as string | undefined;
    if (!vnet_name) {
      return err(name, TYPE, 'create', start, 'Subnet requires virtual_network_name (wire a Network.VPC block).');
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.subnets.beginCreateOrUpdateAndWait(resource_group, vnet_name, name, {
        addressPrefix: (properties.cidr_block as string) || '10.0.1.0/24',
      });
      return ok(name, TYPE, 'create', start, { provider_id: result?.id ?? '' });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return err(name, TYPE, 'update', start, 'Subnet SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      const vnet_name = extract_vnet_name_from_id(provider_id, (properties.virtual_network_name as string) || '');
      if (!vnet_name) return err(name, TYPE, 'update', start, 'Subnet update requires virtual_network_name');
      await client.subnets.beginCreateOrUpdateAndWait(resource_group, vnet_name, name, {
        addressPrefix: (properties.cidr_block as string) || undefined,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'Subnet SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      const vnet_name = extract_vnet_name_from_id(provider_id, '');
      if (!vnet_name)
        return err(name, TYPE, 'delete', start, 'Subnet delete requires virtual_network_name in provider_id');
      await client.subnets.beginDeleteAndWait(resource_group, vnet_name, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
