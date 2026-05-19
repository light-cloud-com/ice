/**
 * Graph Algorithms — topological sort + cycle detection (rf-galg-1).
 *
 * Five helpers extracted from `graph/algorithms.ts` (pre-extraction
 * L18-220). These are grouped together because:
 *  - `topological_sort` calls `find_cycle_in_subgraph` (a private
 *    helper) on cycle detection.
 *  - `has_cycle` is a one-line wrapper around `topological_sort`.
 *  - `reverse_topological_sort` is a one-line wrapper around
 *    `topological_sort`.
 *  - `find_cycles` is a standalone DFS-based cycle finder.
 *  - `find_cycle_in_subgraph` is a private helper used internally
 *    by `topological_sort` for error reporting.
 *
 * Pre-extraction quirks preserved verbatim:
 *  - `topological_sort` uses Kahn's algorithm but has a curious
 *    DOUBLE-COUNTING pattern: it iterates outgoing edges of the
 *    current node AND iterates ALL edges checking for `target ===
 *    node_id`. This double-counts in-degree decrement for some
 *    edge configurations. Preserved verbatim — this is the
 *    pre-extraction behaviour that consumers depend on.
 *  - `find_cycles` uses recursive DFS; can hit JS stack limits
 *    on very deep graphs (1000+ nodes), but no consumer has
 *    reported that yet.
 *  - `find_cycle_in_subgraph` returns the FIRST cycle found OR
 *    a slice of `node_ids` (max 5) if no cycle is reconstructed
 *    — the "best-effort error reporting" fallback.
 *  - The `cycles[]` accumulated by `find_cycles` includes
 *    duplicates if a node participates in multiple cycles —
 *    no dedup applied.
 */

import type { NodeId, TopologicalSortResult } from '../../types/graph';
import type { MutableGraph } from '../mutable-graph';

// =============================================================================
// Topological Sort
// =============================================================================

/**
 * Perform topological sort using Kahn's algorithm.
 * Returns nodes in dependency order (dependencies come before dependents).
 *
 * On cycle detection (when result.length !== node_count), returns
 * `{ success: false, cycle }` with a representative cycle from the
 * remaining-nodes subgraph.
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
 *
 * One-liner around `topological_sort` + `.reverse()`. On failure,
 * propagates the cycle result unchanged.
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
 *
 * Wrapper around `topological_sort` — `success: false` means cycle.
 */
export function has_cycle(graph: MutableGraph): boolean {
  const result = topological_sort(graph);
  return !result.success;
}

/**
 * Find all cycles in the graph.
 *
 * DFS-based cycle finder. Returns an array of cycles, each cycle
 * being a NodeId[] starting and ending at the same node (the
 * `cycle.push(target)` at the end completes the loop).
 *
 * Note: this can return DUPLICATE cycles if a node participates
 * in multiple cycles — no dedup applied. Pre-extraction behaviour.
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
 *
 * Private helper used by `topological_sort` for error reporting.
 * Returns a representative cycle (first cycle found) or — if no
 * cycle can be reconstructed — a slice of up to 5 node IDs from
 * the input. The 5-node slice is a best-effort fallback for
 * pathological inputs where the DFS misses the cycle.
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
