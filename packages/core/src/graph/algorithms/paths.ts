/**
 * Graph Algorithms — path finding (rf-galg-2).
 *
 * Two helpers extracted from `graph/algorithms.ts` (pre-extraction
 * L229-297). Independent of topo/cycle/components — pure DFS/BFS
 * traversal.
 *
 * Pre-extraction quirks preserved verbatim:
 *  - `find_all_paths` uses recursive DFS with cycle avoidance via
 *    `visited` set; respects `max_paths` cap (default 100). Hits
 *    JS stack on very deep graphs; preserved verbatim.
 *  - `find_shortest_path` uses BFS via Array shift (O(n) per shift,
 *    not O(1)); on very large graphs this is asymptotically slower
 *    than a proper queue. Preserved verbatim — no consumer has
 *    reported a performance issue yet.
 *  - `find_shortest_path` returns `null` when no path exists, NOT
 *    an empty array. Returns `[start]` when `start === end`.
 *  - Both functions iterate `get_outgoing_edges(current)` —
 *    only forward (depends-on direction) traversal.
 */

import type { NodeId } from '../../types/graph';
import type { MutableGraph } from '../mutable-graph';

/**
 * Find all paths between two nodes.
 *
 * DFS-based. Respects `max_paths` cap (default 100); the search
 * short-circuits once the cap is reached. Returns paths in
 * discovery order; each path is a NodeId[] from start to end
 * inclusive.
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
 *
 * Returns `[start]` when start === end, `null` when no path
 * exists. Otherwise returns the path as NodeId[] from start to
 * end inclusive.
 *
 * The path-reconstruction walk uses the `parent` map populated
 * during BFS; safe because BFS guarantees the first time a node
 * is visited gives the shortest path to it.
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
