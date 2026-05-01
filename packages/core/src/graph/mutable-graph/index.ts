/**
 * Mutable Graph - Helper Module Barrel
 *
 * Internal entry point for the helper functions extracted from the
 * `MutableGraph` class. The public API still lives at
 * `../mutable-graph.ts` (`MutableGraph` class + `create_mutable_graph`
 * factory) — this barrel exists so future code that wants to operate
 * on raw `MutableGraphState` (e.g. tests, or ad-hoc tooling that
 * doesn't need the class envelope) can import from one path.
 */

export {
  edges_add_edge,
  edges_get_edge,
  edges_get_edges_between,
  edges_get_incoming_edges,
  edges_get_outgoing_edges,
  edges_remove_edge,
  edges_resolve_node_id,
} from './edges.js';

export {
  nodes_add_node,
  nodes_get_node,
  nodes_get_node_by_name,
  nodes_get_nodes_by_type,
  nodes_has_node,
  nodes_remove_node,
  nodes_update_node,
} from './nodes.js';

export {
  stats_clear,
  stats_copy_state,
  stats_get_stats,
  stats_populate_from_serialized,
  stats_to_json,
  type SerializedGraphIdentity,
} from './stats-serialize.js';

export {
  traversal_get_all_dependencies,
  traversal_get_all_dependents,
  traversal_get_dependencies,
  traversal_get_dependents,
  traversal_traverse,
} from './traversal.js';

export {
  create_mutable_graph_state,
  type GraphStats,
  type MutableGraphState,
  type SerializedGraph,
} from './types.js';
