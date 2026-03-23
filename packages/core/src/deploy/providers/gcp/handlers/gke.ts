/**
 * GKE (Google Kubernetes Engine) Handler
 *
 * Handles: gcp.container.cluster
 * Used primarily for RabbitMQ on GKE.
 */

import { SERVICE_NAMES, sdk_not_available, sdk_not_available_short, HANDLER_MESSAGES } from '../messages.js';
import type { ResourceDeployResult } from '../../../types.js';
import type { GCPResourceHandler } from '../types.js';

const TYPE = 'gcp.container.cluster';

function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}

export const gke_handler: GCPResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const location = (properties.location as string) || ctx.region;

    try {
      const client = ctx.clients.get('container') as any;
      if (!client) return fail(name, 'create', start, sdk_not_available(SERVICE_NAMES.GKE, 'container'));

      const [operation] = await client.createCluster({
        parent: `projects/${ctx.project}/locations/${location}`,
        cluster: {
          name,
          initialNodeCount: properties.initial_node_count || 3,
          nodeConfig: {
            machineType: properties.machine_type || 'e2-standard-2',
            oauthScopes: ['https://www.googleapis.com/auth/cloud-platform'],
          },
          labels: properties.labels || {},
        },
      });

      // Wait for cluster creation (can take 5-10 minutes)
      if (operation?.name) {
        const op_start = Date.now();
        while (Date.now() - op_start < 900_000) {
          try {
            const [op] = await client.getOperation({
              name: `projects/${ctx.project}/locations/${location}/operations/${operation.name.split('/').pop()}`,
            });
            if (op?.status === 'DONE' || op?.status === 3) break;
            if (op?.status === 'ABORTING' || op?.status === 4) {
              throw new Error(HANDLER_MESSAGES.GKE_CREATION_ABORTED(op.statusMessage));
            }
          } catch (e: any) {
            if (e.message?.includes('aborted')) throw e;
          }
          await new Promise((r) => setTimeout(r, 10000));
        }
      }

      return result(name, 'create', start, {
        provider_id: `projects/${ctx.project}/locations/${location}/clusters/${name}`,
      });
    } catch (error) {
      return fail(name, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, current, ctx) {
    const start = Date.now();
    try {
      const client = ctx.clients.get('container') as any;
      if (!client) return fail(name, 'update', start, sdk_not_available_short(SERVICE_NAMES.GKE));

      const node_pool_name = `${provider_id}/nodePools/default-pool`;

      // Update labels if provided
      if (properties.labels) {
        await client.setLabels({
          name: provider_id,
          resourceLabels: properties.labels,
        });
      }

      // Update node pool size if node_count or initial_node_count changed
      const desired_count = (properties.node_count ?? properties.initial_node_count) as number | undefined;
      const current_count = (current?.node_count ?? current?.initial_node_count) as number | undefined;
      if (desired_count != null && desired_count !== current_count) {
        await client.setNodePoolSize({
          name: node_pool_name,
          nodeCount: desired_count,
        });
      }

      // Update machine type if it changed
      const desired_machine = properties.machine_type as string | undefined;
      const current_machine = current?.machine_type as string | undefined;
      if (desired_machine && desired_machine !== current_machine) {
        await client.updateNodePool({
          name: node_pool_name,
          nodeVersion: '-',
          config: {
            machineType: desired_machine,
          },
        });
      }

      return result(name, 'update', start, { provider_id });
    } catch (error) {
      return fail(name, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();

    try {
      const client = ctx.clients.get('container') as any;
      if (!client) return fail(name, 'delete', start, sdk_not_available_short(SERVICE_NAMES.GKE));

      await client.deleteCluster({ name: provider_id });

      return result(name, 'delete', start);
    } catch (error) {
      return fail(name, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
