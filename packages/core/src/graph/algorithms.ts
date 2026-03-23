/**
 * Graph Algorithms
 *
 * Graph algorithms for dependency analysis and deployment ordering.
 */

import type { MutableGraph } from './mutable-graph.js';
import type { NodeId, TopologicalSortResult } from '../types/graph.js';

// =============================================================================
// Topological Sort
// =============================================================================

/**
 * Perform topological sort using Kahn's algorithm.
 * Returns nodes in dependency order (dependencies come before dependents).
 */
export function topological_sort(graph: MutableGraph): TopologicalSortResult {
  const in_degree = new Map<NodeId, number>();
  const result: NodeId[] = [];
  const queue: NodeId[] = [];

  // Initialize in-degree counts
  for (const node of graph.nodes.values()) {
    in_degree.set(node.id, 0);
  }

  // Count incoming edges (dependencies)
  for (const edge of graph.edges.values()) {
    if (edge.relationship === 'depends_on') {
      in_degree.set(edge.source, (in_degree.get(edge.source) ?? 0) + 1);
    }
  }

  // Find all nodes with no dependencies
  for (const [node_id, degree] of in_degree) {
    if (degree === 0) {
      queue.push(node_id);
    }
  }

  // Process nodes in order
  while (queue.length > 0) {
    const node_id = queue.shift()!;
    result.push(node_id);

    // Reduce in-degree for dependents
    for (const edge of graph.get_outgoing_edges(node_id)) {
      if (edge.relationship === 'depends_on') {
        const target_degree = (in_degree.get(edge.target) ?? 0) - 1;
        in_degree.set(edge.target, target_degree);

        if (target_degree === 0) {
          queue.push(edge.target);
        }
      }
    }

    // Note: For depends_on edges, we go in reverse
    // The source depends on the target, so target should come first
    for (const edge of graph.edges.values()) {
      if (edge.relationship === 'depends_on' && edge.target === node_id) {
        const source_degree = (in_degree.get(edge.source) ?? 0) - 1;
        in_degree.set(edge.source, source_degree);

        if (source_degree === 0) {
          queue.push(edge.source);
        }
      }
    }
  }

  // Check for cycles
  if (result.length !== graph.node_count) {
    const remaining = Array.from(in_degree.entries())
      .filter(([_, degree]) => degree > 0)
      .map(([id]) => id);

    const cycle = find_cycle_in_subgraph(graph, remaining);
    return { success: false, cycle };
  }

  return { success: true, order: result };
}

/**
 * Perform reverse topological sort.
 * Returns nodes in reverse dependency order (dependents come before dependencies).
 */
export function reverse_topological_sort(graph: MutableGraph): TopologicalSortResult {
  const result = topological_sort(graph);

  if (result.success && result.order) {
    return {
      success: true,
      order: result.order.slice().reverse(),
    };
  }

  return result;
}

// =============================================================================
// Cycle Detection
// =============================================================================

/**
 * Detect if the graph contains any cycles.
 */
export function has_cycle(graph: MutableGraph): boolean {
  const result = topological_sort(graph);
  return !result.success;
}

/**
 * Find all cycles in the graph.
 */
export function find_cycles(graph: MutableGraph): NodeId[][] {
  const cycles: NodeId[][] = [];
  const visited = new Set<NodeId>();
  const rec_stack = new Set<NodeId>();
  const path: NodeId[] = [];

  const dfs = (node_id: NodeId): boolean => {
    visited.add(node_id);
    rec_stack.add(node_id);
    path.push(node_id);

    for (const edge of graph.edges.values()) {
      if (edge.relationship !== 'depends_on') continue;
      if (edge.source !== node_id) continue;

      const target = edge.target;

      if (!visited.has(target)) {
        if (dfs(target)) {
          return true;
        }
      } else if (rec_stack.has(target)) {
        // Found a cycle
        const cycle_start = path.indexOf(target);
        const cycle = path.slice(cycle_start);
        cycle.push(target); // Complete the cycle
        cycles.push(cycle);
      }
    }

    path.pop();
    rec_stack.delete(node_id);
    return false;
  };

  for (const node of graph.nodes.values()) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return cycles;
}

/**
 * Find a cycle in a subgraph defined by the given node IDs.
 */
function find_cycle_in_subgraph(graph: MutableGraph, node_ids: NodeId[]): NodeId[] {
  const node_set = new Set(node_ids);
  const visited = new Set<NodeId>();
  const rec_stack = new Set<NodeId>();
  const parent = new Map<NodeId, NodeId>();

  const dfs = (node_id: NodeId): NodeId | null => {
    visited.add(node_id);
    rec_stack.add(node_id);

    for (const edge of graph.edges.values()) {
      if (edge.relationship !== 'depends_on') continue;
      if (edge.source !== node_id) continue;
      if (!node_set.has(edge.target)) continue;

      const target = edge.target;

      if (!visited.has(target)) {
        parent.set(target, node_id);
        const result = dfs(target);
        if (result !== null) return result;
      } else if (rec_stack.has(target)) {
        // Found a cycle, reconstruct it
        const cycle: NodeId[] = [target];
        let current = node_id;
        while (current !== target) {
          cycle.unshift(current);
          current = parent.get(current)!;
        }
        cycle.push(target);
        return target;
      }
    }

    rec_stack.delete(node_id);
    return null;
  };

  for (const node_id of node_ids) {
    if (!visited.has(node_id)) {
      const cycle_start = dfs(node_id);
      if (cycle_start !== null) {
        // Reconstruct cycle
        const cycle: NodeId[] = [];
        let found_start = false;
        for (const id of visited) {
          if (id === cycle_start) found_start = true;
          if (found_start) cycle.push(id);
        }
        return cycle;
      }
    }
  }

  return node_ids.slice(0, Math.min(5, node_ids.length)); // Return subset for error message
}

// =============================================================================
// Path Finding
// =============================================================================

/**
 * Find all paths between two nodes.
 */
export function find_all_paths(graph: MutableGraph, start: NodeId, end: NodeId, max_paths = 100): NodeId[][] {
  const paths: NodeId[][] = [];
  const current_path: NodeId[] = [];
  const visited = new Set<NodeId>();

  const dfs = (node_id: NodeId): void => {
    if (paths.length >= max_paths) return;

    visited.add(node_id);
    current_path.push(node_id);

    if (node_id === end) {
      paths.push([...current_path]);
    } else {
      for (const edge of graph.get_outgoing_edges(node_id)) {
        if (!visited.has(edge.target)) {
          dfs(edge.target);
        }
      }
    }

    current_path.pop();
    visited.delete(node_id);
  };

  dfs(start);
  return paths;
}

/**
 * Find the shortest path between two nodes using BFS.
 */
export function find_shortest_path(graph: MutableGraph, start: NodeId, end: NodeId): NodeId[] | null {
  if (start === end) return [start];

  const visited = new Set<NodeId>();
  const parent = new Map<NodeId, NodeId>();
  const queue: NodeId[] = [start];

  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const edge of graph.get_outgoing_edges(current)) {
      const target = edge.target;

      if (!visited.has(target)) {
        visited.add(target);
        parent.set(target, current);

        if (target === end) {
          // Reconstruct path
          const path: NodeId[] = [end];
          let node = end;
          while (node !== start) {
            node = parent.get(node)!;
            path.unshift(node);
          }
          return path;
        }

        queue.push(target);
      }
    }
  }

  return null;
}

// =============================================================================
// Connected Components
// =============================================================================

/**
 * Find all connected components in the graph.
 * Treats edges as undirected for this analysis.
 */
export function find_connected_components(graph: MutableGraph): NodeId[][] {
  const visited = new Set<NodeId>();
  const components: NodeId[][] = [];

  const bfs = (start: NodeId): NodeId[] => {
    const component: NodeId[] = [];
    const queue: NodeId[] = [start];

    while (queue.length > 0) {
      const node_id = queue.shift()!;

      if (visited.has(node_id)) continue;
      visited.add(node_id);
      component.push(node_id);

      // Add all neighbors (treating edges as undirected)
      for (const edge of graph.get_outgoing_edges(node_id)) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target);
        }
      }
      for (const edge of graph.get_incoming_edges(node_id)) {
        if (!visited.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }

    return component;
  };

  for (const node of graph.nodes.values()) {
    if (!visited.has(node.id)) {
      const component = bfs(node.id);
      if (component.length > 0) {
        components.push(component);
      }
    }
  }

  return components;
}

/**
 * Find strongly connected components using Tarjan's algorithm.
 */
export function find_strongly_connected_components(graph: MutableGraph): NodeId[][] {
  const index_map = new Map<NodeId, number>();
  const lowlink_map = new Map<NodeId, number>();
  const on_stack = new Set<NodeId>();
  const stack: NodeId[] = [];
  const sccs: NodeId[][] = [];
  let index = 0;

  const strongconnect = (node_id: NodeId): void => {
    index_map.set(node_id, index);
    lowlink_map.set(node_id, index);
    index++;
    stack.push(node_id);
    on_stack.add(node_id);

    for (const edge of graph.get_outgoing_edges(node_id)) {
      const target = edge.target;

      if (!index_map.has(target)) {
        strongconnect(target);
        lowlink_map.set(node_id, Math.min(lowlink_map.get(node_id)!, lowlink_map.get(target)!));
      } else if (on_stack.has(target)) {
        lowlink_map.set(node_id, Math.min(lowlink_map.get(node_id)!, index_map.get(target)!));
      }
    }

    // If node is a root, pop the stack and generate an SCC
    if (lowlink_map.get(node_id) === index_map.get(node_id)) {
      const scc: NodeId[] = [];
      let w: NodeId;
      do {
        w = stack.pop()!;
        on_stack.delete(w);
        scc.push(w);
      } while (w !== node_id);

      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  };

  for (const node of graph.nodes.values()) {
    if (!index_map.has(node.id)) {
      strongconnect(node.id);
    }
  }

  return sccs;
}

// =============================================================================
// Dependency Analysis
// =============================================================================

/**
 * Get execution layers for parallel deployment.
 * Nodes in the same layer can be deployed in parallel.
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
