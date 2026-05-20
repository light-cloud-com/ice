/**
 * Mutable Graph Implementation
 *
 * Adjacency list representation of the infrastructure graph.
 * Provides efficient node/edge management and traversal.
 */

import { create_graph_id } from '../types/graph';
import {
  edges_add_edge,
  edges_get_edge,
  edges_get_edges_between,
  edges_get_incoming_edges,
  edges_get_outgoing_edges,
  edges_remove_edge,
} from './mutable-graph/edges';
import {
  nodes_add_node,
  nodes_get_node,
  nodes_get_node_by_name,
  nodes_get_nodes_by_type,
  nodes_has_node,
  nodes_remove_node,
  nodes_update_node,
} from './mutable-graph/nodes';
import {
  stats_clear,
  stats_copy_state,
  stats_get_stats,
  stats_populate_from_serialized,
  stats_to_json,
} from './mutable-graph/stats-serialize';
import {
  traversal_get_all_dependencies,
  traversal_get_all_dependents,
  traversal_get_dependencies,
  traversal_get_dependents,
  traversal_traverse,
} from './mutable-graph/traversal';
import {
  create_mutable_graph_state,
  type GraphStats,
  type MutableGraphState,
  type SerializedGraph,
} from './mutable-graph/types';
import type {
  Graph,
  GraphId,
  GraphMetadata,
  Node,
  NodeId,
  NodeInput,
  Edge,
  EdgeId,
  EdgeInput,
  AddNodeResult,
  AddEdgeResult,
  TraversalOptions,
} from '../types/graph';

// Re-export internal types so the public surface (`./graph/index.ts` and
// `core/src/index.ts`) stays unchanged.
export type { GraphStats, SerializedGraph } from './mutable-graph/types';

// =============================================================================
// Mutable Graph
// =============================================================================

/**
 * Mutable implementation of the Graph interface.
 */
export class MutableGraph implements Graph {
  readonly id: GraphId;
  readonly name: string;
  readonly version: string;
  readonly metadata: GraphMetadata;

  /**
   * Mutable bag of state shared with the helper modules under
   * `./mutable-graph/`. All node/edge/index data lives here; the
   * class is a thin delegate.
   */
  private readonly state: MutableGraphState = create_mutable_graph_state();

  constructor(
    name: string,
    options: {
      id?: string;
      version?: string;
      description?: string;
      labels?: Record<string, string>;
      annotations?: Record<string, unknown>;
      providers?: string[];
      regions?: string[];
    } = {},
  ) {
    const now = new Date().toISOString();

    this.id = create_graph_id(options.id ?? `graph_${Date.now()}`);
    this.name = name;
    this.version = options.version ?? '1.0.0';
    this.metadata = {
      created_at: now,
      updated_at: now,
      description: options.description,
      labels: options.labels ?? {},
      annotations: options.annotations ?? {},
      providers: options.providers,
      regions: options.regions,
    };
  }

  // ---------------------------------------------------------------------------
  // Graph Interface Implementation
  // ---------------------------------------------------------------------------

  get nodes(): ReadonlyMap<NodeId, Node> {
    return this.state.nodes;
  }

  get edges(): ReadonlyMap<EdgeId, Edge> {
    return this.state.edges;
  }

  // ---------------------------------------------------------------------------
  // Node Operations (delegated to ./mutable-graph/nodes.ts)
  // ---------------------------------------------------------------------------

  add_node(input: NodeInput): AddNodeResult {
    return nodes_add_node(this.state, input);
  }

  get_node(id: NodeId): Node | undefined {
    return nodes_get_node(this.state, id);
  }

  get_node_by_name(name: string): Node | undefined {
    return nodes_get_node_by_name(this.state, name);
  }

  update_node(
    id: NodeId,
    updates: {
      properties?: Record<string, unknown>;
      labels?: Record<string, string>;
      annotations?: Record<string, unknown>;
    },
  ): boolean {
    return nodes_update_node(this.state, id, updates);
  }

  remove_node(id: NodeId): boolean {
    return nodes_remove_node(this.state, id);
  }

  has_node(id: NodeId): boolean {
    return nodes_has_node(this.state, id);
  }

  get_nodes_by_type(type: string): Node[] {
    return nodes_get_nodes_by_type(this.state, type);
  }

  // ---------------------------------------------------------------------------
  // Edge Operations (delegated to ./mutable-graph/edges.ts)
  // ---------------------------------------------------------------------------

  add_edge(input: EdgeInput): AddEdgeResult {
    return edges_add_edge(this.state, input);
  }

  get_edge(id: EdgeId): Edge | undefined {
    return edges_get_edge(this.state, id);
  }

  remove_edge(id: EdgeId): boolean {
    return edges_remove_edge(this.state, id);
  }

  get_edges_between(source: NodeId, target: NodeId): Edge[] {
    return edges_get_edges_between(this.state, source, target);
  }

  get_outgoing_edges(node_id: NodeId): Edge[] {
    return edges_get_outgoing_edges(this.state, node_id);
  }

  get_incoming_edges(node_id: NodeId): Edge[] {
    return edges_get_incoming_edges(this.state, node_id);
  }

  // ---------------------------------------------------------------------------
  // Graph Traversal (delegated to ./mutable-graph/traversal.ts)
  // ---------------------------------------------------------------------------

  get_dependencies(node_id: NodeId): Node[] {
    return traversal_get_dependencies(this.state, node_id);
  }

  get_dependents(node_id: NodeId): Node[] {
    return traversal_get_dependents(this.state, node_id);
  }

  get_all_dependencies(node_id: NodeId): Node[] {
    return traversal_get_all_dependencies(this.state, node_id);
  }

  get_all_dependents(node_id: NodeId): Node[] {
    return traversal_get_all_dependents(this.state, node_id);
  }

  traverse(start: NodeId, options: TraversalOptions, callback: (node: Node, depth: number) => boolean | void): void {
    traversal_traverse(this.state, start, options, callback);
  }

  // ---------------------------------------------------------------------------
  // Graph Statistics (delegated to ./mutable-graph/stats-serialize.ts)
  // ---------------------------------------------------------------------------

  get node_count(): number {
    return this.state.nodes.size;
  }

  get edge_count(): number {
    return this.state.edges.size;
  }

  get_stats(): GraphStats {
    return stats_get_stats(this.state);
  }

  // ---------------------------------------------------------------------------
  // Utility Methods (delegated to ./mutable-graph/stats-serialize.ts)
  // ---------------------------------------------------------------------------

  /**
   * Create a shallow copy of the graph.
   */
  clone(): MutableGraph {
    const copy = new MutableGraph(this.name, {
      version: this.version,
      description: this.metadata.description,
      labels: { ...this.metadata.labels },
      annotations: { ...this.metadata.annotations },
      providers: this.metadata.providers ? [...this.metadata.providers] : undefined,
      regions: this.metadata.regions ? [...this.metadata.regions] : undefined,
    });
    stats_copy_state(this.state, copy.state);
    return copy;
  }

  clear(): void {
    stats_clear(this.state);
  }

  to_json(): SerializedGraph {
    return stats_to_json(this.state, {
      id: this.id,
      name: this.name,
      version: this.version,
      metadata: this.metadata,
    });
  }

  static from_json(data: SerializedGraph): MutableGraph {
    const graph = new MutableGraph(data.name, {
      id: data.id,
      version: data.version,
      description: data.metadata.description,
      labels: data.metadata.labels,
      annotations: data.metadata.annotations,
      providers: data.metadata.providers,
      regions: data.metadata.regions,
    });
    stats_populate_from_serialized(graph.state, data);
    return graph;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new mutable graph.
 */
export function create_mutable_graph(
  name: string,
  options?: {
    id?: string;
    version?: string;
    description?: string;
    labels?: Record<string, string>;
    providers?: string[];
    regions?: string[];
  },
): MutableGraph {
  return new MutableGraph(name, options);
}
