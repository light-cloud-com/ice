/**
 * Alibaba ACK managed cluster handler — `alibaba.cs.managedCluster`.
 *
 * Backs Compute.Kubernetes blocks. Provisions a fully-managed K8s
 * control plane; worker nodes come from a separate node pool block
 * (P2). Long-running create (~10 min) — handler returns on
 * CreateCluster ack; orchestrator polls externally.
 */

import { resolveClient } from './_client';
import { err, isAlibabaAlreadyExists, isAlibabaNotFound, ok, sdkMissing } from './_result';
import type { AlibabaResourceHandler } from '../types';

const TYPE = 'alibaba.cs.managedCluster';
const SDK = '@alicloud/cs20151215';

export const cs_managed_cluster_handler: AlibabaResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const cs = await resolveClient(ctx, 'cs');
    if (!cs) return sdkMissing(name, TYPE, 'create', start, 'Alibaba ACK', SDK);
    try {
      const result = await cs.createCluster({
        body: {
          name,
          cluster_type: 'ManagedKubernetes',
          region_id: ctx.region,
          kubernetes_version: (properties.version as string) || '1.28.9-aliyun.1',
          vpcid: properties.vpc_id as string | undefined,
          vswitch_ids: (properties.vswitch_ids as string[]) ?? [],
          service_cidr: (properties.service_cidr as string) || '172.21.0.0/20',
          container_cidr: (properties.pod_cidr as string) || '172.20.0.0/16',
          num_of_nodes: (properties.node_count as number) ?? 1,
        },
      });
      const id = (result?.body?.clusterId ?? result?.body?.cluster_id) as string | undefined;
      if (!id) return err(name, TYPE, 'create', start, 'CreateCluster returned no ClusterId');
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      if (isAlibabaAlreadyExists(error)) return ok(name, TYPE, 'create', start, { provider_id: name });
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const cs = await resolveClient(ctx, 'cs');
    if (!cs) return err(name, TYPE, 'update', start, 'Alibaba ACK SDK not available');
    try {
      await cs.modifyClusterConfiguration({
        ClusterId: provider_id,
        body: { customizations: properties.customizations },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const cs = await resolveClient(ctx, 'cs');
    if (!cs) return err(name, TYPE, 'delete', start, 'Alibaba ACK SDK not available');
    try {
      await cs.deleteCluster({ ClusterId: provider_id });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isAlibabaNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
