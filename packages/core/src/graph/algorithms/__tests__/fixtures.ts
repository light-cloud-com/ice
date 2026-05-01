/**
 * Shared fixtures for graph algorithms tests (rf-galg).
 *
 * Helpers to build small graphs for unit-testing the algorithm
 * helpers without coupling to provider/schema infrastructure.
 */
import { create_mutable_graph } from '../../mutable-graph.js';
import type { MutableGraph } from '../../mutable-graph.js';

/**
 * Build a graph from a node-list + edge-list.
 *
 * Each node gets `type: 'test.resource'` and empty properties.
 * Each edge has relationship `'depends_on'` by default. Use
 * tuple-form `[source, target, 'contains']` to override the
 * relationship.
 */
export function make_graph(
  nodes: string[],
  edges: Array<[string, string] | [string, string, string]>,
): MutableGraph {
  const graph = create_mutable_graph('test');
  const node_ids = new Map<string, string>();

  for (const name of nodes) {
    const result = graph.add_node({
      type: 'test.resource',
      name,
      properties: {},
    });
    if (result.success && result.node) {
      node_ids.set(name, result.node.id);
    }
  }

  for (const edge of edges) {
    const [source_name, target_name, relationship = 'depends_on'] = edge;
    const source = node_ids.get(source_name) ?? source_name;
    const target = node_ids.get(target_name) ?? target_name;
    graph.add_edge({
      source,
      target,
      relationship: relationship as 'depends_on',
    });
  }

  return graph;
}

/**
 * Resolve a node-name back to its actual graph id.
 */
export function id_of(graph: MutableGraph, name: string): string {
  for (const node of graph.nodes.values()) {
    if (node.name === name) return node.id;
  }
  throw new Error(`Node not found: ${name}`);
}
