/**
 * Azure Private Endpoint handler — `azure.network.privateEndpoint`.
 *
 * Backs Network.PrivateNetwork on Azure (parallel to AWS VPC Endpoint
 * and GCP Private Service Connect). The handler attaches a private IP
 * inside a subnet to a target Azure service so traffic stays on the
 * Microsoft backbone.
 *
 * `properties.private_link_service_id` is the resource ID of the target
 * service (e.g. a Storage Account); `properties.group_ids` lists the
 * sub-resources to expose (e.g. ['blob'] for Storage).
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.network.privateEndpoint';
const SDK = '@azure/arm-network';

export const private_endpoint_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('network') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'Private Endpoint', SDK);

    const subnet_id = properties.subnet_id as string | undefined;
    const target_id = properties.private_link_service_id as string | undefined;
    if (!subnet_id || !target_id) {
      return err(
        name,
        TYPE,
        'create',
        start,
        'Private Endpoint requires subnet_id + private_link_service_id (wire a Network.Subnet and the target service).',
      );
    }

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.privateEndpoints.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        subnet: { id: subnet_id },
        privateLinkServiceConnections: [
          {
            name,
            privateLinkServiceId: target_id,
            groupIds: (properties.group_ids as string[]) || [],
          },
        ],
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
    if (!client) return err(name, TYPE, 'update', start, 'Private Endpoint SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.privateEndpoints.updateTags(resource_group, name, {
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
    if (!client) return err(name, TYPE, 'delete', start, 'Private Endpoint SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.privateEndpoints.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
