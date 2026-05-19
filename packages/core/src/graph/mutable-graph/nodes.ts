/**
 * Mutable Graph - Node Operations
 *
 * Standalone functions taking `MutableGraphState` as the first arg.
 * The class delegates `add_node` / `get_node` / `get_node_by_name` /
 * `update_node` / `remove_node` / `has_node` / `get_nodes_by_type`
 * to these helpers verbatim.
 *
 * `nodes_remove_node` calls `edges_remove_edge` to maintain the
 * adjacency-list invariant (removing a node also removes incident
 * edges). The reverse is not true: removing an edge does not affect
 * the node maps.
 */

import { edges_remove_edge } from './edges';
import { create_node_id } from '../../types/graph';
import { classify_resource } from '../classifier/category-classifier';
import type { MutableGraphState } from './types';
import type { AddNodeResult, Node, NodeId, NodeInput } from '../../types/graph';

/**
 * Add a node to the graph.
 */
export function nodes_add_node(state: MutableGraphState, input: NodeInput): AddNodeResult {
  // Generate node ID
  const id = create_node_id(`${input.type}:${input.name}`);

  // Check for duplicates
  if (state.nodes.has(id)) {
    return {
      success: false,
      errors: [`Node already exists: ${id}`],
    };
  }

  if (state.node_names.has(input.name)) {
    return {
      success: false,
      errors: [`Node with name '${input.name}' already exists`],
    };
  }

  const now = new Date().toISOString();
  // Auto-classify category based on resource type
  const category = classify_resource(input.type);

  const node: Node = {
    id,
    type: input.type,
    name: input.name,
    properties: input.properties,
    metadata: {
      created_at: now,
      updated_at: now,
      labels: input.labels ?? {},
      annotations: input.annotations ?? {},
      category,
    },
  };

  state.nodes.set(id, node);
  state.node_names.set(input.name, id);
  state.outgoing.set(id, new Set());
  state.incoming.set(id, new Set());

  return { success: true, node };
}

/**
 * Get a node by ID.
 */
export function nodes_get_node(state: MutableGraphState, id: NodeId): Node | undefined {
  return state.nodes.get(id);
}

/**
 * Get a node by name.
 */
export function nodes_get_node_by_name(state: MutableGraphState, name: string): Node | undefined {
  const id = state.node_names.get(name);
  return id ? state.nodes.get(id) : undefined;
}

/**
 * Update a node's properties.
 */
export function nodes_update_node(
  state: MutableGraphState,
  id: NodeId,
  updates: {
    properties?: Record<string, unknown>;
    labels?: Record<string, string>;
    annotations?: Record<string, unknown>;
  },
): boolean {
  const node = state.nodes.get(id);
  if (!node) return false;

  const updated: Node = {
    ...node,
    properties: updates.properties ? { ...node.properties, ...updates.properties } : node.properties,
    metadata: {
      ...node.metadata,
      updated_at: new Date().toISOString(),
      labels: updates.labels ? { ...node.metadata.labels, ...updates.labels } : node.metadata.labels,
      annotations: updates.annotations
        ? { ...node.metadata.annotations, ...updates.annotations }
        : node.metadata.annotations,
    },
  };

  state.nodes.set(id, updated);
  return true;
}

/**
 * Remove a node and its connected edges.
 *
 * Maintains the index invariant: every edge in `state.edges` whose
 * source or target equals `id` is removed via `edges_remove_edge`,
 * which also clears the corresponding adjacency-list entries.
 */
export function nodes_remove_node(state: MutableGraphState, id: NodeId): boolean {
  const node = state.nodes.get(id);
  if (!node) return false;

  // Remove connected edges
  const out_edges = state.outgoing.get(id) ?? new Set();
  const in_edges = state.incoming.get(id) ?? new Set();

  for (const edge_id of out_edges) {
    edges_remove_edge(state, edge_id);
  }
  for (const edge_id of in_edges) {
    edges_remove_edge(state, edge_id);
  }

  // Remove node
  state.nodes.delete(id);
  state.node_names.delete(node.name);
  state.outgoing.delete(id);
  state.incoming.delete(id);

  return true;
}

/**
 * Check if a node exists.
 */
export function nodes_has_node(state: MutableGraphState, id: NodeId): boolean {
  return state.nodes.has(id);
}

/**
 * Get all nodes of a specific type.
 */
export function nodes_get_nodes_by_type(state: MutableGraphState, type: string): Node[] {
  return Array.from(state.nodes.values()).filter((n) => n.type === type);
}
