/**
 * Graph Algorithms — connected components (rf-galg-3).
 *
 * Two helpers extracted from `graph/algorithms.ts` (pre-extraction
 * L307-402). Both treat the graph differently:
 *  - `find_connected_components` treats edges as UNDIRECTED (uses
 *    both incoming and outgoing edges); finds weakly-connected
 *    components.
 *  - `find_strongly_connected_components` (Tarjan's algorithm)
 *    treats edges as DIRECTED; finds strongly-connected components
 *    (SCCs are sets of nodes that can all reach each other).
 *
 * Pre-extraction quirks preserved verbatim:
 *  - `find_connected_components` BFS-based; the `visited.has(node_id)`
 *    check at the top of the inner loop allows the same node to be
 *    pushed to `queue` multiple times (e.g. when a node is a target
 *    via two distinct edges); the duplicate enqueue is tolerated.
 *  - `find_strongly_connected_components` filters `scc.length > 1`
 *    — single-node "SCCs" (nodes with no self-loop) are NOT
 *    returned. This is intentional: a single node is trivially
 *    its own SCC, so excluding singletons gives the meaningful
 *    SCCs (cycles + multi-node strongly-connected sets).
 *  - Tarjan's recursive `strongconnect` can hit JS stack limits
 *    on very deep graphs.
 */

import type { MutableGraph } from '../mutable-graph.js';
import type { NodeId } from '../../types/graph.js';

/**
 * Find all connected components in the graph.
 * Treats edges as undirected for this analysis.
 *
 * BFS from each unvisited node; returns one component per BFS
 * "tree". Component order matches node iteration order.
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
 *
 * Standard Tarjan SCC: iterative DFS with index/lowlink tracking
 * and an on-stack set. Returns multi-node SCCs only — single-node
 * "SCCs" (nodes without self-loop) are filtered out.
 *
 * Each SCC is returned as a NodeId[] in the order they were popped
 * off the auxiliary stack (reverse-DFS order). Caller should not
 * depend on intra-SCC ordering being stable across graph mutations.
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
