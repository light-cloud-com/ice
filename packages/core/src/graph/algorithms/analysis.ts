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
 * Notes:
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
 *  - bugfix-3: the distance update now walks `get_outgoing_edges`
 *    (the dependencies of the current node) and reads the
 *    target's distance — both processed earlier in the topo order
 *    that `topological_sort` produces (leaves first for
 *    `depends_on` graphs). Pre-fix the loop walked
 *    `get_incoming_edges`, but the source nodes for those
 *    incoming edges were processed AFTER the current node in topo
 *    order, so source distances always read `-Infinity` and the
 *    chain never propagated — the function returned just the
 *    start (no-deps) node for any DAG.
 *  - `calculate_metrics` density formula: `edge_count / (n*(n-1))`.
 *    For directed graphs this gives ratio of present-to-possible
 *    directed edges. Self-loops would inflate density above 1.0
 *    in pathological cases — preserved verbatim.
 */

import { find_connected_components } from './components';
import { has_cycle, topological_sort } from './topo-cycle';
import type { MutableGraph } from '../mutable-graph';
import type { NodeId } from '../../types/graph';

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
 * The path is reported leaf-first (start node = node with no
 * outgoing `depends_on` edges) → root-last (end node = the
 * deepest dependent). For chain `a depends_on b depends_on c`
 * (encoded as edges `a→b`, `b→c`), the result is `[c, b, a]`.
 *
 * bugfix-3: distance propagation walks `get_outgoing_edges` (the
 * current node's dependencies) and reads the *target's* distance.
 * In the topo order produced by `topological_sort` (leaves first
 * for `depends_on`), targets are visited before sources, so the
 * target distance is always populated by the time we read it. The
 * pre-fix code walked `get_incoming_edges` and read the source's
 * distance — sources are processed AFTER the current node in topo
 * order, so the lookup always returned `-Infinity` and the chain
 * never propagated past the start node.
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

  // Calculate longest paths.
  //
  // For each node in topo order, look at its dependencies (outgoing
  // `depends_on` edges). Each dependency was processed earlier in
  // topo order (leaves first), so its distance is already set. If
  // chaining through this dependency yields a longer path, update.
  for (const node_id of sort_result.order) {
    let current_dist = distances.get(node_id) ?? -Infinity;

    for (const edge of graph.get_outgoing_edges(node_id)) {
      if (edge.relationship === 'depends_on') {
        const target_dist = distances.get(edge.target) ?? -Infinity;
        const new_dist = target_dist + 1;

        if (new_dist > current_dist) {
          current_dist = new_dist;
          distances.set(node_id, new_dist);
          predecessors.set(node_id, edge.target);
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

  // Reconstruct path. `end_node` has the largest distance — the
  // most-dependent node. Walking predecessors traces back through
  // each dependency hop: predecessor[N] = the dependency that
  // yielded N's longest chain, so the chain reads dependent → ... →
  // leaf. We push to the FRONT (`unshift`) so the final array reads
  // leaf → ... → dependent (start → end).
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
