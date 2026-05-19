/**
 * Mutable Graph - Edge Operations
 *
 * Standalone functions taking `MutableGraphState` as the first arg.
 * The class delegates `add_edge` / `get_edge` / `remove_edge` /
 * `get_edges_between` / `get_outgoing_edges` / `get_incoming_edges`
 * to these helpers verbatim.
 *
 * `edges_resolve_node_id` is also exported for reuse by other helpers
 * (it was the class's private `resolve_node_id` utility).
 */

import { create_edge_id } from '../../types/graph';
import type {
  AddEdgeResult,
  Edge,
  EdgeId,
  EdgeInput,
  NodeId,
} from '../../types/graph';
import type { MutableGraphState } from './types';

/**
 * Resolve a node ID from a string (either ID or name).
 *
 * Internal helper used by `edges_add_edge` to allow callers to pass
 * either a NodeId (the branded `${type}:${name}` form) or a bare
 * human-readable name in `EdgeInput.source` / `.target`.
 */
export function edges_resolve_node_id(state: MutableGraphState, ref: NodeId | string): NodeId | undefined {
  // Check if it's already a valid ID
  if (state.nodes.has(ref as NodeId)) {
    return ref as NodeId;
  }

  // Try to resolve by name
  return state.node_names.get(ref);
}

/**
 * Add an edge to the graph.
 */
export function edges_add_edge(state: MutableGraphState, input: EdgeInput): AddEdgeResult {
  // Resolve source and target IDs
  const source_id = edges_resolve_node_id(state, input.source);
  const target_id = edges_resolve_node_id(state, input.target);

  if (!source_id) {
    return {
      success: false,
      errors: [`Source node not found: ${input.source}`],
    };
  }

  if (!target_id) {
    return {
      success: false,
      errors: [`Target node not found: ${input.target}`],
    };
  }

  // Generate edge ID
  const id = create_edge_id(`${source_id}->${target_id}:${input.relationship}`);

  // Check for duplicates
  if (state.edges.has(id)) {
    return {
      success: false,
      errors: [`Edge already exists: ${id}`],
    };
  }

  const now = new Date().toISOString();
  const edge: Edge = {
    id,
    source: source_id,
    target: target_id,
    relationship: input.relationship,
    metadata: {
      created_at: now,
      labels: input.labels ?? {},
      inferred: false,
    },
  };

  state.edges.set(id, edge);

  // Update adjacency lists
  state.outgoing.get(source_id)?.add(id);
  state.incoming.get(target_id)?.add(id);

  return { success: true, edge };
}

/**
 * Get an edge by ID.
 */
export function edges_get_edge(state: MutableGraphState, id: EdgeId): Edge | undefined {
  return state.edges.get(id);
}

/**
 * Remove an edge.
 *
 * Clears the edge from `state.edges` and from both adjacency-list
 * entries. Does not touch the node maps.
 */
export function edges_remove_edge(state: MutableGraphState, id: EdgeId): boolean {
  const edge = state.edges.get(id);
  if (!edge) return false;

  state.edges.delete(id);
  state.outgoing.get(edge.source)?.delete(id);
  state.incoming.get(edge.target)?.delete(id);

  return true;
}

/**
 * Get edges between two nodes.
 */
export function edges_get_edges_between(state: MutableGraphState, source: NodeId, target: NodeId): Edge[] {
  const out_edges = state.outgoing.get(source) ?? new Set();
  const result: Edge[] = [];

  for (const edge_id of out_edges) {
    const edge = state.edges.get(edge_id);
    if (edge && edge.target === target) {
      result.push(edge);
    }
  }

  return result;
}

/**
 * Get outgoing edges from a node.
 */
export function edges_get_outgoing_edges(state: MutableGraphState, node_id: NodeId): Edge[] {
  const edge_ids = state.outgoing.get(node_id) ?? new Set();
  return Array.from(edge_ids)
    .map((id) => state.edges.get(id))
    .filter((e): e is Edge => e !== undefined);
}

/**
 * Get incoming edges to a node.
 */
export function edges_get_incoming_edges(state: MutableGraphState, node_id: NodeId): Edge[] {
  const edge_ids = state.incoming.get(node_id) ?? new Set();
  return Array.from(edge_ids)
    .map((id) => state.edges.get(id))
    .filter((e): e is Edge => e !== undefined);
}
