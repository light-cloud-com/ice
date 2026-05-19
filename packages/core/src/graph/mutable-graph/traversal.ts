/**
 * Mutable Graph - Traversal
 *
 * Standalone functions for graph traversal:
 * - dependency walks (`get_dependencies` / `_dependents` / their
 *   transitive `get_all_*` cousins) only follow `depends_on` edges
 * - the generic `traverse` BFS supports forward/backward/both
 *   directions plus relationship- and node-type filters
 *
 * All helpers take `MutableGraphState` as their first arg.
 */

import { edges_get_incoming_edges, edges_get_outgoing_edges } from './edges';
import type { MutableGraphState } from './types';
import type { Edge, Node, NodeId, TraversalOptions } from '../../types/graph';

/**
 * Get direct dependencies (successors) of a node.
 *
 * "Direct dependencies" = nodes connected via an outgoing
 * `depends_on` edge.
 */
export function traversal_get_dependencies(state: MutableGraphState, node_id: NodeId): Node[] {
  const edges = edges_get_outgoing_edges(state, node_id);
  return edges
    .filter((e) => e.relationship === 'depends_on')
    .map((e) => state.nodes.get(e.target))
    .filter((n): n is Node => n !== undefined);
}

/**
 * Get direct dependents (predecessors) of a node.
 *
 * "Direct dependents" = nodes connected via an incoming
 * `depends_on` edge.
 */
export function traversal_get_dependents(state: MutableGraphState, node_id: NodeId): Node[] {
  const edges = edges_get_incoming_edges(state, node_id);
  return edges
    .filter((e) => e.relationship === 'depends_on')
    .map((e) => state.nodes.get(e.source))
    .filter((n): n is Node => n !== undefined);
}

/**
 * Get all transitive dependencies via DFS.
 *
 * Visit order matches the original class implementation: pre-order
 * (each dependency is pushed before recursing into its own
 * dependencies), starting from the direct dependencies of
 * `node_id` (the start node itself is not included).
 */
export function traversal_get_all_dependencies(state: MutableGraphState, node_id: NodeId): Node[] {
  const visited = new Set<NodeId>();
  const result: Node[] = [];

  const visit = (id: NodeId) => {
    if (visited.has(id)) return;
    visited.add(id);

    for (const dep of traversal_get_dependencies(state, id)) {
      result.push(dep);
      visit(dep.id);
    }
  };

  visit(node_id);
  return result;
}

/**
 * Get all transitive dependents via DFS.
 *
 * Mirrors `traversal_get_all_dependencies` but walks backward through
 * `depends_on` edges. The start node itself is not included.
 */
export function traversal_get_all_dependents(state: MutableGraphState, node_id: NodeId): Node[] {
  const visited = new Set<NodeId>();
  const result: Node[] = [];

  const visit = (id: NodeId) => {
    if (visited.has(id)) return;
    visited.add(id);

    for (const dep of traversal_get_dependents(state, id)) {
      result.push(dep);
      visit(dep.id);
    }
  };

  visit(node_id);
  return result;
}

/**
 * Traverse the graph using BFS.
 *
 * Walks edges in the requested direction, optionally filtered by
 * relationship and target-node type. The callback returns `false`
 * to short-circuit the entire traversal (any other return value or
 * void continues).
 *
 * Despite the name suggesting "BFS or DFS", the implementation is
 * BFS only (uses a queue with `shift`); preserved verbatim from the
 * pre-extraction class method.
 */
export function traversal_traverse(
  state: MutableGraphState,
  start: NodeId,
  options: TraversalOptions,
  callback: (node: Node, depth: number) => boolean | void,
): void {
  const visited = new Set<NodeId>();
  const max_depth = options.max_depth ?? Infinity;

  const get_neighbors = (node_id: NodeId): NodeId[] => {
    let edges: Edge[] = [];

    if (options.direction === 'forward' || options.direction === 'both') {
      edges = edges.concat(edges_get_outgoing_edges(state, node_id));
    }
    if (options.direction === 'backward' || options.direction === 'both') {
      edges = edges.concat(edges_get_incoming_edges(state, node_id));
    }

    // Filter by relationship type
    if (options.relationship_filter) {
      edges = edges.filter((e) => options.relationship_filter!.includes(e.relationship));
    }

    // Get target nodes (the "other end" relative to node_id)
    const targets = edges.map((e) => (e.source === node_id ? e.target : e.source));

    // Filter by node type
    if (options.type_filter) {
      return targets.filter((id) => {
        const node = state.nodes.get(id);
        return node && options.type_filter!.includes(node.type);
      });
    }

    return targets;
  };

  // BFS traversal
  const queue: Array<{ id: NodeId; depth: number }> = [{ id: start, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;

    if (visited.has(id) || depth > max_depth) continue;
    visited.add(id);

    const node = state.nodes.get(id);
    if (!node) continue;

    const should_continue = callback(node, depth);
    if (should_continue === false) return;

    for (const neighbor_id of get_neighbors(id)) {
      if (!visited.has(neighbor_id)) {
        queue.push({ id: neighbor_id, depth: depth + 1 });
      }
    }
  }
}
