/**
 * Graph Algorithms — dependency analysis + metrics (rf-galg-4).
 *
 * Three helpers + one interface extracted from
 * `graph/algorithms.ts` (pre-extraction L412-586). All three depend
 * on helpers from the other algorithm modules:
 *  - `get_execution_layers` is independent — uses `get_dependencies`.
 *  - `get_critical_path` depends on `topological_sort` (topo-cycle).
 *  - `calculate_metrics` depends on
 *    `find_connected_components` (components), `has_cycle` (topo-cycle),
 *    `get_critical_path` (this file), `get_execution_layers` (this file).
 *
 * Pre-extraction quirks preserved verbatim:
 *  - `get_execution_layers` uses iterative "layer-peel" pattern;
 *    if a cycle is present, the inner loop produces an empty
 *    `layer` and breaks — silently ceasing layer production.
 *    Callers can detect this by comparing total layer-node count
 *    to graph.node_count.
 *  - `get_critical_path` uses longest-path-DAG via topological
 *    order; on cycle returns `[]` empty path. The `predecessors`
 *    map is only populated when a longer path is found, so the
 *    reconstruction starts at the node with max distance and
 *    walks back via predecessors.
 *  - get_critical_path KNOWN QUIRK: the distance update walks
 *    `get_incoming_edges`, but the source nodes for those incoming
 *    edges are processed AFTER the current node in the topo
 *    order produced by topological_sort (which emits leaves first
 *    for `depends_on` graphs). Result: the distance update reads
 *    `-Infinity` for the source, the new_dist comparison fails,
 *    and the chain never propagates. The function effectively
 *    returns just the start (no-deps) node. Preserved verbatim
 *    from pre-extraction — fixing this would change the public
 *    behaviour and is out-of-scope for the refactor.
 *  - `calculate_metrics` density formula: `edge_count / (n*(n-1))`.
 *    For directed graphs this gives ratio of present-to-possible
 *    directed edges. Self-loops would inflate density above 1.0
 *    in pathological cases — preserved verbatim.
 */

import { find_connected_components } from './components.js';
import { has_cycle, topological_sort } from './topo-cycle.js';
import type { MutableGraph } from '../mutable-graph.js';
import type { NodeId } from '../../types/graph.js';

// =============================================================================
// Dependency Analysis
// =============================================================================

/**
 * Get execution layers for parallel deployment.
 * Nodes in the same layer can be deployed in parallel.
 *
 * Layer-peel: at each iteration, find all nodes whose dependencies
 * are already completed; emit them as a layer; repeat. Breaks if
 * a layer is empty (cycle/invalid state).
 */
export function get_execution_layers(graph: MutableGraph): NodeId[][] {
  const layers: NodeId[][] = [];
  const remaining = new Set(graph.nodes.keys());
  const completed = new Set<NodeId>();

  while (remaining.size > 0) {
    const layer: NodeId[] = [];

    for (const node_id of remaining) {
      const deps = graph.get_dependencies(node_id);
      const all_deps_complete = deps.every((dep) => completed.has(dep.id));

      if (all_deps_complete) {
        layer.push(node_id);
      }
    }

    if (layer.length === 0) {
      // Cycle detected or invalid state
      break;
    }

    for (const node_id of layer) {
      remaining.delete(node_id);
      completed.add(node_id);
    }

    layers.push(layer);
  }

  return layers;
}

/**
 * Calculate the critical path (longest dependency chain).
 *
 * Uses longest-path-on-DAG: initialise distances at start nodes
 * (no deps) to 0, propagate through topological order, track
 * predecessors when a longer path is found. Reconstruct path from
 * the max-distance node.
 *
 * Returns `[]` if the graph has a cycle (topological_sort fails).
 */
export function get_critical_path(graph: MutableGraph): NodeId[] {
  const distances = new Map<NodeId, number>();
  const predecessors = new Map<NodeId, NodeId>();

  // Initialize distances
  for (const node of graph.nodes.values()) {
    distances.set(node.id, -Infinity);
  }

  // Find start nodes (no dependencies)
  for (const node of graph.nodes.values()) {
    const deps = graph.get_dependencies(node.id);
    if (deps.length === 0) {
      distances.set(node.id, 0);
    }
  }

  // Topological order
  const sort_result = topological_sort(graph);
  if (!sort_result.success || !sort_result.order) {
    return [];
  }

  // Calculate longest paths
  for (const node_id of sort_result.order) {
    const current_dist = distances.get(node_id) ?? -Infinity;

    for (const edge of graph.get_incoming_edges(node_id)) {
      if (edge.relationship === 'depends_on') {
        const source_dist = distances.get(edge.source) ?? -Infinity;
        const new_dist = source_dist + 1;

        if (new_dist > current_dist) {
          distances.set(node_id, new_dist);
          predecessors.set(node_id, edge.source);
        }
      }
    }
  }

  // Find the end of the critical path
  let max_dist = -Infinity;
  let end_node: NodeId | null = null;

  for (const [node_id, dist] of distances) {
    if (dist > max_dist) {
      max_dist = dist;
      end_node = node_id;
    }
  }

  if (end_node === null) {
    return [];
  }

  // Reconstruct path
  const path: NodeId[] = [end_node];
  let current = end_node;

  while (predecessors.has(current)) {
    current = predecessors.get(current)!;
    path.unshift(current);
  }

  return path;
}

// =============================================================================
// Graph Metrics
// =============================================================================

/**
 * Calculate various graph metrics.
 */
export interface GraphMetrics {
  readonly node_count: number;
  readonly edge_count: number;
  readonly density: number;
  readonly average_degree: number;
  readonly max_in_degree: number;
  readonly max_out_degree: number;
  readonly connected_components: number;
  readonly is_dag: boolean;
  readonly critical_path_length: number;
  readonly max_parallelism: number;
}

/**
 * Calculate graph metrics.
 *
 * Computes: node/edge counts, density (e/(n*(n-1))), degree
 * statistics (avg, max in, max out), connected components,
 * DAG check, critical path length, max parallelism.
 *
 * Density edge case: when node_count is 0 or 1, max_edges is 0
 * and density is 0 (not NaN — guarded by `max_edges > 0` check).
 */
export function calculate_metrics(graph: MutableGraph): GraphMetrics {
  const node_count = graph.node_count;
  const edge_count = graph.edge_count;

  // Density
  const max_edges = node_count * (node_count - 1);
  const density = max_edges > 0 ? edge_count / max_edges : 0;

  // Degree statistics
  let total_degree = 0;
  let max_in = 0;
  let max_out = 0;

  for (const node of graph.nodes.values()) {
    const in_deg = graph.get_incoming_edges(node.id).length;
    const out_deg = graph.get_outgoing_edges(node.id).length;
    total_degree += in_deg + out_deg;
    max_in = Math.max(max_in, in_deg);
    max_out = Math.max(max_out, out_deg);
  }

  const average_degree = node_count > 0 ? total_degree / node_count : 0;

  // Connected components
  const components = find_connected_components(graph);

  // DAG check
  const is_dag = !has_cycle(graph);

  // Critical path
  const critical_path = get_critical_path(graph);

  // Max parallelism
  const layers = get_execution_layers(graph);
  const max_parallelism = Math.max(0, ...layers.map((l) => l.length));

  return {
    node_count,
    edge_count,
    density,
    average_degree,
    max_in_degree: max_in,
    max_out_degree: max_out,
    connected_components: components.length,
    is_dag,
    critical_path_length: critical_path.length,
    max_parallelism,
  };
}
