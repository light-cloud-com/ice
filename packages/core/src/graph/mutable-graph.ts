/**
 * Mutable Graph Implementation
 *
 * Adjacency list representation of the infrastructure graph.
 * Provides efficient node/edge management and traversal.
 */

import { create_graph_id } from '../types/graph.js';
import {
  edges_add_edge,
  edges_get_edge,
  edges_get_edges_between,
  edges_get_incoming_edges,
  edges_get_outgoing_edges,
  edges_remove_edge,
} from './mutable-graph/edges.js';
import {
  nodes_add_node,
  nodes_get_node,
  nodes_get_node_by_name,
  nodes_get_nodes_by_type,
  nodes_has_node,
  nodes_remove_node,
  nodes_update_node,
} from './mutable-graph/nodes.js';
import {
  create_mutable_graph_state,
  type GraphStats,
  type MutableGraphState,
  type SerializedGraph,
} from './mutable-graph/types.js';
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
} from '../types/graph.js';

// Re-export internal types so the public surface (`./graph/index.ts` and
// `core/src/index.ts`) stays unchanged.
export type { GraphStats, SerializedGraph } from './mutable-graph/types.js';

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
  // Graph Traversal
  // ---------------------------------------------------------------------------

  /**
   * Get direct dependencies (successors) of a node.
   */
  get_dependencies(node_id: NodeId): Node[] {
    const edges = this.get_outgoing_edges(node_id);
    return edges
      .filter((e) => e.relationship === 'depends_on')
      .map((e) => this.state.nodes.get(e.target))
      .filter((n): n is Node => n !== undefined);
  }

  /**
   * Get direct dependents (predecessors) of a node.
   */
  get_dependents(node_id: NodeId): Node[] {
    const edges = this.get_incoming_edges(node_id);
    return edges
      .filter((e) => e.relationship === 'depends_on')
      .map((e) => this.state.nodes.get(e.source))
      .filter((n): n is Node => n !== undefined);
  }

  /**
   * Get all transitive dependencies.
   */
  get_all_dependencies(node_id: NodeId): Node[] {
    const visited = new Set<NodeId>();
    const result: Node[] = [];

    const visit = (id: NodeId) => {
      if (visited.has(id)) return;
      visited.add(id);

      for (const dep of this.get_dependencies(id)) {
        result.push(dep);
        visit(dep.id);
      }
    };

    visit(node_id);
    return result;
  }

  /**
   * Get all transitive dependents.
   */
  get_all_dependents(node_id: NodeId): Node[] {
    const visited = new Set<NodeId>();
    const result: Node[] = [];

    const visit = (id: NodeId) => {
      if (visited.has(id)) return;
      visited.add(id);

      for (const dep of this.get_dependents(id)) {
        result.push(dep);
        visit(dep.id);
      }
    };

    visit(node_id);
    return result;
  }

  /**
   * Traverse the graph using BFS or DFS.
   */
  traverse(start: NodeId, options: TraversalOptions, callback: (node: Node, depth: number) => boolean | void): void {
    const visited = new Set<NodeId>();
    const max_depth = options.max_depth ?? Infinity;

    const get_neighbors = (node_id: NodeId): NodeId[] => {
      let edges: Edge[] = [];

      if (options.direction === 'forward' || options.direction === 'both') {
        edges = edges.concat(this.get_outgoing_edges(node_id));
      }
      if (options.direction === 'backward' || options.direction === 'both') {
        edges = edges.concat(this.get_incoming_edges(node_id));
      }

      // Filter by relationship type
      if (options.relationship_filter) {
        edges = edges.filter((e) => options.relationship_filter!.includes(e.relationship));
      }

      // Get target nodes
      const targets = edges.map((e) => (e.source === node_id ? e.target : e.source));

      // Filter by node type
      if (options.type_filter) {
        return targets.filter((id) => {
          const node = this.state.nodes.get(id);
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

      const node = this.state.nodes.get(id);
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

  // ---------------------------------------------------------------------------
  // Graph Statistics
  // ---------------------------------------------------------------------------

  /**
   * Get the number of nodes.
   */
  get node_count(): number {
    return this.state.nodes.size;
  }

  /**
   * Get the number of edges.
   */
  get edge_count(): number {
    return this.state.edges.size;
  }

  /**
   * Get graph statistics.
   */
  get_stats(): GraphStats {
    const node_types: Record<string, number> = {};
    const edge_types: Record<string, number> = {};

    for (const node of this.state.nodes.values()) {
      node_types[node.type] = (node_types[node.type] ?? 0) + 1;
    }

    for (const edge of this.state.edges.values()) {
      edge_types[edge.relationship] = (edge_types[edge.relationship] ?? 0) + 1;
    }

    return {
      node_count: this.state.nodes.size,
      edge_count: this.state.edges.size,
      node_types,
      edge_types,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
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

    for (const node of this.state.nodes.values()) {
      copy.state.nodes.set(node.id, { ...node });
      copy.state.node_names.set(node.name, node.id);
      copy.state.outgoing.set(node.id, new Set(this.state.outgoing.get(node.id)));
      copy.state.incoming.set(node.id, new Set(this.state.incoming.get(node.id)));
    }

    for (const edge of this.state.edges.values()) {
      copy.state.edges.set(edge.id, { ...edge });
    }

    return copy;
  }

  /**
   * Clear all nodes and edges.
   */
  clear(): void {
    this.state.nodes.clear();
    this.state.edges.clear();
    this.state.outgoing.clear();
    this.state.incoming.clear();
    this.state.node_names.clear();
  }

  /**
   * Export to a serializable format.
   */
  to_json(): SerializedGraph {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      metadata: this.metadata,
      nodes: Array.from(this.state.nodes.values()),
      edges: Array.from(this.state.edges.values()),
    };
  }

  /**
   * Import from a serialized format.
   */
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

    for (const node of data.nodes) {
      graph.state.nodes.set(node.id, node);
      graph.state.node_names.set(node.name, node.id);
      graph.state.outgoing.set(node.id, new Set());
      graph.state.incoming.set(node.id, new Set());
    }

    for (const edge of data.edges) {
      graph.state.edges.set(edge.id, edge);
      graph.state.outgoing.get(edge.source)?.add(edge.id);
      graph.state.incoming.get(edge.target)?.add(edge.id);
    }

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
