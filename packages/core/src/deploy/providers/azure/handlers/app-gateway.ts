/**
 * Azure Application Gateway handler — `azure.network.applicationGateway`.
 *
 * Backs the regional Network.LoadBalancer variant on Azure (parallel to
 * AWS ALB / NLB and GCP regional load balancer). Application Gateway
 * lives inside a Virtual Network — `subnet_id` is required (canvas
 * wiring resolves this).
 *
 * Standard_v2 SKU is the default — the modern tier with auto-scaling.
 * Operators flip to WAF_v2 (bundles the WAF policy) via properties.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.network.applicationGateway';
const SDK = '@azure/arm-network';

export const app_gateway_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Application Gateway', SDK);

    const subnet_id = properties.subnet_id as string | undefined;
    if (!subnet_id) {
      return err(name, TYPE, 'create', start, 'Application Gateway requires subnet_id (wire a Network.Subnet block).');
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const sku_name = (properties.sku_name as string) || 'Standard_v2';
      const sku_tier = (properties.sku_tier as string) || 'Standard_v2';
      const result = await client.applicationGateways.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        sku: { name: sku_name, tier: sku_tier, capacity: (properties.capacity as number) ?? 2 },
        gatewayIPConfigurations: [{ name: 'gwIpConfig', subnet: { id: subnet_id } }],
        // Minimal config — listeners / rules / backends added via canvas
        // wiring in Phase B4.
        frontendPorts: [{ name: 'frontendPort', port: (properties.port as number) ?? 80 }],
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
    if (!client) return err(name, TYPE, 'update', start, 'Application Gateway SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.applicationGateways.updateTags(resource_group, name, {
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
    if (!client) return err(name, TYPE, 'delete', start, 'Application Gateway SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.applicationGateways.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
