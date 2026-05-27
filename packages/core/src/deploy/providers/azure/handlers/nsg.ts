/**
 * Azure Network Security Group handler — `azure.network.networkSecurityGroup`.
 *
 * Backs Network.SecurityGroup on Azure (parallel to AWS Security Group
 * and GCP firewall rules). The handler creates the NSG and applies any
 * security rules listed in `properties.rules`. Rules are arrays of
 * { name, direction, access, protocol, sourcePortRange, ... } — the
 * extractor projects canvas ingress/egress entries into that shape.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.network.networkSecurityGroup';
const SDK = '@azure/arm-network';

export const nsg_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Network Security Group', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const location = (properties.location as string) || ctx.location;
      const result = await client.networkSecurityGroups.beginCreateOrUpdateAndWait(resource_group, name, {
        location,
        securityRules: (properties.rules as unknown[]) || [],
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
    if (!client) return err(name, TYPE, 'update', start, 'Network Security Group SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.networkSecurityGroups.updateTags(resource_group, name, {
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
    if (!client) return err(name, TYPE, 'delete', start, 'Network Security Group SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.networkSecurityGroups.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
