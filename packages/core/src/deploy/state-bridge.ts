/**
 * State Bridge — Connect Deploy Results to State Store
 *
 * Utilities for persisting deployment results and loading prior state
 * for accurate diffing between deployments.
 */

import type { ResourceDeployResult, DeployResult } from './types.js';
import type { Graph } from '../types/graph.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal state store interface (subset of SqliteStateStore).
 * Avoids coupling to the full StateStore when only deploy-related ops are needed.
 */
export interface DeployStateStore {
  /** Upsert a resource state entry. */
  upsert_resource(entry: StoredResourceEntry): Promise<void>;
  /** Delete a resource state entry. */
  delete_resource(node_id: string): Promise<void>;
  /** Get all resource states for a graph. */
  get_resources(graph_id: string): Promise<StoredResourceEntry[]>;
  /** Get a specific resource state. */
  get_resource(node_id: string): Promise<StoredResourceEntry | null>;
}

export interface StoredResourceEntry {
  node_id: string;
  graph_id: string;
  ice_type: string;
  name: string;
  provider_id?: string;
  status: 'created' | 'updated' | 'deleted' | 'failed';
  properties?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  deployed_at: string;
}

// =============================================================================
// Load state for diffing
// =============================================================================

/**
 * Load stored resource states to enrich the current state graph
 * with provider IDs from previous deployments.
 */
export async function load_state_for_diff(
  store: DeployStateStore,
  graph_id: string,
): Promise<Map<string, StoredResourceEntry>> {
  const entries = await store.get_resources(graph_id);
  const map = new Map<string, StoredResourceEntry>();

  for (const entry of entries) {
    if (entry.status !== 'deleted') {
      map.set(entry.name, entry);
    }
  }

  return map;
}

/**
 * Enrich graph nodes with provider IDs from stored state.
 * This allows the diff engine to detect updates vs creates.
 */
export function enrich_graph_with_state(graph: Graph, state: Map<string, StoredResourceEntry>): Map<string, string> {
  const provider_id_map = new Map<string, string>();

  for (const [_id, node] of graph.nodes) {
    const entry = state.get(node.name);
    if (entry?.provider_id) {
      provider_id_map.set(node.name, entry.provider_id);
    }
  }

  return provider_id_map;
}

// =============================================================================
// Sync deploy results to state
// =============================================================================

/**
 * Persist deployment results to the state store.
 * Called after a successful (or partial) deployment.
 */
export async function sync_deploy_result_to_state(
  store: DeployStateStore,
  result: DeployResult,
  graph_id: string,
): Promise<void> {
  const now = new Date().toISOString();

  for (const resource of result.resources) {
    if (!resource.success) continue;

    if (resource.action === 'delete') {
      await store.delete_resource(`${resource.type}:${resource.name}`);
    } else {
      await store.upsert_resource({
        node_id: `${resource.type}:${resource.name}`,
        graph_id,
        ice_type: resource.type,
        name: resource.name,
        provider_id: resource.provider_id,
        status: resource.action === 'create' ? 'created' : 'updated',
        outputs: resource.outputs,
        deployed_at: now,
      });
    }
  }
}

/**
 * Batch sync deploy results — same as sync_deploy_result_to_state
 * but takes individual results instead of a DeployResult.
 */
export async function sync_resource_results_to_state(
  store: DeployStateStore,
  results: ResourceDeployResult[],
  graph_id: string,
): Promise<void> {
  const now = new Date().toISOString();

  for (const r of results) {
    if (!r.success) continue;

    if (r.action === 'delete') {
      await store.delete_resource(`${r.type}:${r.name}`);
    } else {
      await store.upsert_resource({
        node_id: `${r.type}:${r.name}`,
        graph_id,
        ice_type: r.type,
        name: r.name,
        provider_id: r.provider_id,
        status: r.action === 'create' ? 'created' : 'updated',
        outputs: r.outputs,
        deployed_at: now,
      });
    }
  }
}
