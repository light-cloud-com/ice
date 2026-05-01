/**
 * Mutable Graph - Statistics & Serialization
 *
 * Standalone helpers for `get_stats`, `clear`, and the state-shaping
 * pieces of `to_json` / `from_json` / `clone`. The class still owns
 * the constructor + identity fields (`id`, `name`, `version`,
 * `metadata`) needed to assemble a `SerializedGraph` envelope or to
 * construct a target graph in `clone` / `from_json`.
 */

import type {
  Edge,
  GraphId,
  GraphMetadata,
  Node,
} from '../../types/graph.js';
import type { GraphStats, MutableGraphState, SerializedGraph } from './types.js';

/**
 * Compute graph statistics from raw state.
 */
export function stats_get_stats(state: MutableGraphState): GraphStats {
  const node_types: Record<string, number> = {};
  const edge_types: Record<string, number> = {};

  for (const node of state.nodes.values()) {
    node_types[node.type] = (node_types[node.type] ?? 0) + 1;
  }

  for (const edge of state.edges.values()) {
    edge_types[edge.relationship] = (edge_types[edge.relationship] ?? 0) + 1;
  }

  return {
    node_count: state.nodes.size,
    edge_count: state.edges.size,
    node_types,
    edge_types,
  };
}

/**
 * Clear all maps in-place. Preserves the `MutableGraphState` reference
 * so the class shell's `private readonly state` field stays valid.
 */
export function stats_clear(state: MutableGraphState): void {
  state.nodes.clear();
  state.edges.clear();
  state.outgoing.clear();
  state.incoming.clear();
  state.node_names.clear();
}

/**
 * Identity portion of a `SerializedGraph` envelope.
 *
 * Lets `to_json` be a pure function on `(state, identity)` even though
 * the identity fields live on the class shell.
 */
export interface SerializedGraphIdentity {
  readonly id: GraphId;
  readonly name: string;
  readonly version: string;
  readonly metadata: GraphMetadata;
}

/**
 * Build a `SerializedGraph` envelope from raw state plus the
 * caller-provided identity fields.
 */
export function stats_to_json(state: MutableGraphState, identity: SerializedGraphIdentity): SerializedGraph {
  return {
    id: identity.id,
    name: identity.name,
    version: identity.version,
    metadata: identity.metadata,
    nodes: Array.from(state.nodes.values()),
    edges: Array.from(state.edges.values()),
  };
}

/**
 * Copy node/edge data from `src` into `dst`, replicating the
 * `MutableGraph.clone` semantics:
 * - shallow-copy each node/edge object
 * - rebuild `node_names` and adjacency lists in `dst`
 *
 * Both arguments must already be valid `MutableGraphState` instances.
 * `dst` is mutated in place; the caller is responsible for clearing
 * it first if needed.
 */
export function stats_copy_state(src: MutableGraphState, dst: MutableGraphState): void {
  for (const node of src.nodes.values()) {
    dst.nodes.set(node.id, { ...node });
    dst.node_names.set(node.name, node.id);
    dst.outgoing.set(node.id, new Set(src.outgoing.get(node.id)));
    dst.incoming.set(node.id, new Set(src.incoming.get(node.id)));
  }

  for (const edge of src.edges.values()) {
    dst.edges.set(edge.id, { ...edge });
  }
}

/**
 * Populate `state` from a deserialized `SerializedGraph`. Reuses the
 * provided `Node` / `Edge` objects without copying (matches the
 * pre-extraction behavior of `MutableGraph.from_json` which assigned
 * the deserialized nodes/edges directly into the class maps).
 *
 * Adjacency lists are seeded from the edge list. Caller is responsible
 * for ensuring `state` is empty (or accepting that any prior contents
 * will be merged with the deserialized data).
 */
export function stats_populate_from_serialized(state: MutableGraphState, data: SerializedGraph): void {
  for (const node of data.nodes) {
    state.nodes.set(node.id, node satisfies Node);
    state.node_names.set(node.name, node.id);
    state.outgoing.set(node.id, new Set());
    state.incoming.set(node.id, new Set());
  }

  for (const edge of data.edges) {
    state.edges.set(edge.id, edge satisfies Edge);
    state.outgoing.get(edge.source)?.add(edge.id);
    state.incoming.get(edge.target)?.add(edge.id);
  }
}
