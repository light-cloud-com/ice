/**
 * State Store Adapter
 *
 * Adapts SqliteStateStore (Result<T, IceError> interface) to the simpler
 * DeployStateStore interface used by state-bridge.ts.
 */

import { create_node_id } from '../types/graph.js';
import type { DeployStateStore, StoredResourceEntry } from './state-bridge.js';
import type { SqliteStateStore } from '../state/sqlite-state-store.js';

/**
 * Create a DeployStateStore adapter around a SqliteStateStore.
 * Unwraps Result types and converts between StoredResourceEntry ↔ StoredResourceState.
 */
export function create_deploy_state_adapter(store: SqliteStateStore, graph_id: string): DeployStateStore {
  return {
    async upsert_resource(entry: StoredResourceEntry): Promise<void> {
      const now = new Date().toISOString();
      const result = await store.save_resource({
        node_id: create_node_id(entry.node_id),
        graph_id: entry.graph_id,
        ice_type: entry.ice_type,
        name: entry.name,
        state: {
          cloud_id: entry.provider_id ?? '',
          status: entry.status === 'created' || entry.status === 'updated' ? 'available' : 'pending',
          outputs: entry.outputs ?? {},
          created_at: entry.deployed_at,
          updated_at: now,
        },
        created_at: entry.deployed_at,
        updated_at: now,
        version: 1,
      });

      if (!result.ok) {
        throw new Error(`Failed to upsert resource: ${result.error.message}`);
      }
    },

    async delete_resource(node_id: string): Promise<void> {
      const result = await store.delete_resource(graph_id, create_node_id(node_id));
      if (!result.ok) {
        throw new Error(`Failed to delete resource: ${result.error.message}`);
      }
    },

    async get_resources(gid: string): Promise<StoredResourceEntry[]> {
      const result = await store.get_resources(gid);
      if (!result.ok) {
        throw new Error(`Failed to get resources: ${result.error.message}`);
      }

      return result.value.map((r) => ({
        node_id: r.node_id,
        graph_id: r.graph_id,
        ice_type: r.ice_type,
        name: r.name,
        provider_id: r.state.cloud_id || undefined,
        status: resource_status_to_entry_status(r.state.status),
        outputs: r.state.outputs,
        deployed_at: r.updated_at,
      }));
    },

    async get_resource(node_id: string): Promise<StoredResourceEntry | null> {
      const result = await store.get_resource(graph_id, create_node_id(node_id));
      if (!result.ok) {
        throw new Error(`Failed to get resource: ${result.error.message}`);
      }

      if (!result.value) return null;

      const r = result.value;
      return {
        node_id: r.node_id,
        graph_id: r.graph_id,
        ice_type: r.ice_type,
        name: r.name,
        provider_id: r.state.cloud_id || undefined,
        status: resource_status_to_entry_status(r.state.status),
        outputs: r.state.outputs,
        deployed_at: r.updated_at,
      };
    },
  };
}

function resource_status_to_entry_status(status: string): 'created' | 'updated' | 'deleted' | 'failed' {
  switch (status) {
    case 'available':
      return 'created';
    case 'updating':
      return 'updated';
    case 'deleting':
      return 'deleted';
    default:
      return 'created';
  }
}
