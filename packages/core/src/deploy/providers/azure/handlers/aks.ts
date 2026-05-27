/**
 * Azure Kubernetes Service handler — `azure.containerservice.managedCluster`.
 *
 * Backs Compute.Kubernetes on Azure (parallel to AWS EKS and GCP GKE).
 * Defaults: 1-node Standard_D2s_v3 pool, system-assigned managed
 * identity, auto-selected Kubernetes version. Operators flip to larger
 * pools / Spot nodes / multiple node pools via properties.
 */

import { extract_resource_group_from_id } from '../resource-group';
import { err, ok, sdkMissing } from './_result';
import type { AzureResourceHandler } from '../types';

const TYPE = 'azure.containerservice.managedCluster';
const SDK = '@azure/arm-containerservice';

export const aks_handler: AzureResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('aks') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'AKS', SDK);

    try {
      const resource_group = (properties.resource_group as string) || ctx.resource_group;
      const result = await client.managedClusters.beginCreateOrUpdateAndWait(resource_group, name, {
        location: (properties.location as string) || ctx.location,
        identity: { type: 'SystemAssigned' },
        dnsPrefix: (properties.dns_prefix as string) || 'icek8s',
        kubernetesVersion: (properties.kubernetes_version as string) || undefined,
        agentPoolProfiles: [
          {
            name: 'system',
            mode: 'System',
            count: (properties.node_count as number) ?? 1,
            vmSize: (properties.vm_size as string) || 'Standard_D2s_v3',
            osType: 'Linux',
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
    const client = ctx.clients.get('aks') as any;
    if (!client) return err(name, TYPE, 'update', start, 'AKS SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.managedClusters.beginUpdateTagsAndWait(resource_group, name, {
        tags: properties.tags as Record<string, string>,
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('aks') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'AKS SDK not available');
    try {
      const resource_group = extract_resource_group_from_id(provider_id, ctx.resource_group);
      await client.managedClusters.beginDeleteAndWait(resource_group, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
