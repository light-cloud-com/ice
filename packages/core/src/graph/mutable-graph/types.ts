/**
 * Mutable Graph - Internal State Types
 *
 * The shared mutable state interface for MutableGraph helper modules.
 * Public types (Graph, Node, Edge, NodeId, EdgeId, etc.) live in
 * `../../types/graph.ts` and are not re-defined here.
 */

import type {
  Edge,
  EdgeId,
  GraphId,
  GraphMetadata,
  Node,
  NodeId,
} from '../../types/graph.js';

/**
 * Mutable bag of state shared by all helper functions.
 *
 * The `MutableGraph` class holds an instance of this on `this.state`
 * and passes it as the first arg to every helper. Helpers mutate the
 * fields directly (e.g. `state.nodes.set(id, node)`); the class is
 * a thin delegate.
 *
 * The readonly identity fields (id/name/version/metadata) are not
 * part of this bag — they live on the class shell so the public
 * `Graph` interface continues to expose them as `readonly`.
 */
export interface MutableGraphState {
  /** Map of node id -> node. */
  nodes: Map<NodeId, Node>;

  /** Map of edge id -> edge. */
  edges: Map<EdgeId, Edge>;

  /** Outgoing-edge adjacency list: node id -> set of outgoing edge ids. */
  outgoing: Map<NodeId, Set<EdgeId>>;

  /** Incoming-edge adjacency list: node id -> set of incoming edge ids. */
  incoming: Map<NodeId, Set<EdgeId>>;

  /** Name -> NodeId index for O(1) lookup by human-readable name. */
  node_names: Map<string, NodeId>;
}

/**
 * Construct an empty `MutableGraphState`.
 *
 * Helpers should never reach into `MutableGraphState` and replace
 * the maps wholesale — they should mutate via `.set/.delete/.clear`
 * so the class shell holds a stable reference.
 */
export function create_mutable_graph_state(): MutableGraphState {
  return {
    nodes: new Map(),
    edges: new Map(),
    outgoing: new Map(),
    incoming: new Map(),
    node_names: new Map(),
  };
}

// =============================================================================
// Graph statistics & serialization (public surface re-exported from index)
// =============================================================================

/**
 * Graph statistics.
 */
export interface GraphStats {
  readonly node_count: number;
  readonly edge_count: number;
  readonly node_types: Record<string, number>;
  readonly edge_types: Record<string, number>;
}

/**
 * Serialized graph format.
 */
export interface SerializedGraph {
  readonly id: GraphId;
  readonly name: string;
  readonly version: string;
  readonly metadata: GraphMetadata;
  readonly nodes: Node[];
  readonly edges: Edge[];
}
