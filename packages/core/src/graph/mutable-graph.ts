/**
 * Mutable Graph Implementation
 *
 * Adjacency list representation of the infrastructure graph.
 * Provides efficient node/edge management and traversal.
 */

import { create_graph_id, create_node_id, create_edge_id } from '../types/graph.js';
import { classify_resource } from './classifier/category-classifier.js';
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

  private _nodes: Map<NodeId, Node> = new Map();
  private _edges: Map<EdgeId, Edge> = new Map();

  // Adjacency lists for efficient traversal
  private outgoing: Map<NodeId, Set<EdgeId>> = new Map();
  private incoming: Map<NodeId, Set<EdgeId>> = new Map();

  // Name to ID mapping for lookups
  private node_names: Map<string, NodeId> = new Map();

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
    return this._nodes;
  }

  get edges(): ReadonlyMap<EdgeId, Edge> {
    return this._edges;
  }

  // ---------------------------------------------------------------------------
  // Node Operations
  // ---------------------------------------------------------------------------

  /**
   * Add a node to the graph.
   */
  add_node(input: NodeInput): AddNodeResult {
    // Generate node ID
    const id = create_node_id(`${input.type}:${input.name}`);

    // Check for duplicates
    if (this._nodes.has(id)) {
      return {
        success: false,
        errors: [`Node already exists: ${id}`],
      };
    }

    if (this.node_names.has(input.name)) {
      return {
        success: false,
        errors: [`Node with name '${input.name}' already exists`],
      };
    }

    const now = new Date().toISOString();
    // Auto-classify category based on resource type
    const category = classify_resource(input.type);

    const node: Node = {
      id,
      type: input.type,
      name: input.name,
      properties: input.properties,
      metadata: {
        created_at: now,
        updated_at: now,
        labels: input.labels ?? {},
        annotations: input.annotations ?? {},
        category,
      },
    };

    this._nodes.set(id, node);
    this.node_names.set(input.name, id);
    this.outgoing.set(id, new Set());
    this.incoming.set(id, new Set());

    return { success: true, node };
  }

  /**
   * Get a node by ID.
   */
  get_node(id: NodeId): Node | undefined {
    return this._nodes.get(id);
  }

  /**
   * Get a node by name.
   */
  get_node_by_name(name: string): Node | undefined {
    const id = this.node_names.get(name);
    return id ? this._nodes.get(id) : undefined;
  }

  /**
   * Update a node's properties.
   */
  update_node(
    id: NodeId,
    updates: {
      properties?: Record<string, unknown>;
      labels?: Record<string, string>;
      annotations?: Record<string, unknown>;
    },
  ): boolean {
    const node = this._nodes.get(id);
    if (!node) return false;

    const updated: Node = {
      ...node,
      properties: updates.properties ? { ...node.properties, ...updates.properties } : node.properties,
      metadata: {
        ...node.metadata,
        updated_at: new Date().toISOString(),
        labels: updates.labels ? { ...node.metadata.labels, ...updates.labels } : node.metadata.labels,
        annotations: updates.annotations
          ? { ...node.metadata.annotations, ...updates.annotations }
          : node.metadata.annotations,
      },
    };

    this._nodes.set(id, updated);
    return true;
  }

  /**
   * Remove a node and its connected edges.
   */
  remove_node(id: NodeId): boolean {
    const node = this._nodes.get(id);
    if (!node) return false;

    // Remove connected edges
    const out_edges = this.outgoing.get(id) ?? new Set();
    const in_edges = this.incoming.get(id) ?? new Set();

    for (const edge_id of out_edges) {
      this.remove_edge(edge_id);
    }
    for (const edge_id of in_edges) {
      this.remove_edge(edge_id);
    }

    // Remove node
    this._nodes.delete(id);
    this.node_names.delete(node.name);
    this.outgoing.delete(id);
    this.incoming.delete(id);

    return true;
  }

  /**
   * Check if a node exists.
   */
  has_node(id: NodeId): boolean {
    return this._nodes.has(id);
  }

  /**
   * Get all nodes of a specific type.
   */
  get_nodes_by_type(type: string): Node[] {
    return Array.from(this._nodes.values()).filter((n) => n.type === type);
  }

  // ---------------------------------------------------------------------------
  // Edge Operations
  // ---------------------------------------------------------------------------

  /**
   * Add an edge to the graph.
   */
  add_edge(input: EdgeInput): AddEdgeResult {
    // Resolve source and target IDs
    const source_id = this.resolve_node_id(input.source);
    const target_id = this.resolve_node_id(input.target);

    if (!source_id) {
      return {
        success: false,
        errors: [`Source node not found: ${input.source}`],
      };
    }

    if (!target_id) {
      return {
        success: false,
        errors: [`Target node not found: ${input.target}`],
      };
    }

    // Generate edge ID
    const id = create_edge_id(`${source_id}->${target_id}:${input.relationship}`);

    // Check for duplicates
    if (this._edges.has(id)) {
      return {
        success: false,
        errors: [`Edge already exists: ${id}`],
      };
    }

    const now = new Date().toISOString();
    const edge: Edge = {
      id,
      source: source_id,
      target: target_id,
      relationship: input.relationship,
      metadata: {
        created_at: now,
        labels: input.labels ?? {},
        inferred: false,
      },
    };

    this._edges.set(id, edge);

    // Update adjacency lists
    this.outgoing.get(source_id)?.add(id);
    this.incoming.get(target_id)?.add(id);

    return { success: true, edge };
  }

  /**
   * Get an edge by ID.
   */
  get_edge(id: EdgeId): Edge | undefined {
    return this._edges.get(id);
  }

  /**
   * Remove an edge.
   */
  remove_edge(id: EdgeId): boolean {
    const edge = this._edges.get(id);
    if (!edge) return false;

    this._edges.delete(id);
    this.outgoing.get(edge.source)?.delete(id);
    this.incoming.get(edge.target)?.delete(id);

    return true;
  }

  /**
   * Get edges between two nodes.
   */
  get_edges_between(source: NodeId, target: NodeId): Edge[] {
    const out_edges = this.outgoing.get(source) ?? new Set();
    const result: Edge[] = [];

    for (const edge_id of out_edges) {
      const edge = this._edges.get(edge_id);
      if (edge && edge.target === target) {
        result.push(edge);
      }
    }

    return result;
  }

  /**
   * Get outgoing edges from a node.
   */
  get_outgoing_edges(node_id: NodeId): Edge[] {
    const edge_ids = this.outgoing.get(node_id) ?? new Set();
    return Array.from(edge_ids)
      .map((id) => this._edges.get(id))
      .filter((e): e is Edge => e !== undefined);
  }

  /**
   * Get incoming edges to a node.
   */
  get_incoming_edges(node_id: NodeId): Edge[] {
    const edge_ids = this.incoming.get(node_id) ?? new Set();
    return Array.from(edge_ids)
      .map((id) => this._edges.get(id))
      .filter((e): e is Edge => e !== undefined);
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
      .map((e) => this._nodes.get(e.target))
      .filter((n): n is Node => n !== undefined);
  }

  /**
   * Get direct dependents (predecessors) of a node.
   */
  get_dependents(node_id: NodeId): Node[] {
    const edges = this.get_incoming_edges(node_id);
    return edges
      .filter((e) => e.relationship === 'depends_on')
      .map((e) => this._nodes.get(e.source))
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
          const node = this._nodes.get(id);
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

      const node = this._nodes.get(id);
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
    return this._nodes.size;
  }

  /**
   * Get the number of edges.
   */
  get edge_count(): number {
    return this._edges.size;
  }

  /**
   * Get graph statistics.
   */
  get_stats(): GraphStats {
    const node_types: Record<string, number> = {};
    const edge_types: Record<string, number> = {};

    for (const node of this._nodes.values()) {
      node_types[node.type] = (node_types[node.type] ?? 0) + 1;
    }

    for (const edge of this._edges.values()) {
      edge_types[edge.relationship] = (edge_types[edge.relationship] ?? 0) + 1;
    }

    return {
      node_count: this._nodes.size,
      edge_count: this._edges.size,
      node_types,
      edge_types,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Resolve a node ID from a string (either ID or name).
   */
  private resolve_node_id(ref: NodeId | string): NodeId | undefined {
    // Check if it's already a valid ID
    if (this._nodes.has(ref as NodeId)) {
      return ref as NodeId;
    }

    // Try to resolve by name
    return this.node_names.get(ref);
  }

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

    for (const node of this._nodes.values()) {
      copy._nodes.set(node.id, { ...node });
      copy.node_names.set(node.name, node.id);
      copy.outgoing.set(node.id, new Set(this.outgoing.get(node.id)));
      copy.incoming.set(node.id, new Set(this.incoming.get(node.id)));
    }

    for (const edge of this._edges.values()) {
      copy._edges.set(edge.id, { ...edge });
    }

    return copy;
  }

  /**
   * Clear all nodes and edges.
   */
  clear(): void {
    this._nodes.clear();
    this._edges.clear();
    this.outgoing.clear();
    this.incoming.clear();
    this.node_names.clear();
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
      nodes: Array.from(this._nodes.values()),
      edges: Array.from(this._edges.values()),
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
      graph._nodes.set(node.id, node);
      graph.node_names.set(node.name, node.id);
      graph.outgoing.set(node.id, new Set());
      graph.incoming.set(node.id, new Set());
    }

    for (const edge of data.edges) {
      graph._edges.set(edge.id, edge);
      graph.outgoing.get(edge.source)?.add(edge.id);
      graph.incoming.get(edge.target)?.add(edge.id);
    }

    return graph;
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Graph statistics.
 */
export interface GraphStats {
  readonly node_count: number;
  readonly edge_count: number;
  readonly node_types: Record<string, number>;
  readonly edge_types: Record<string, number>;
}

/**
 * Serialized graph format.
 */
export interface SerializedGraph {
  readonly id: GraphId;
  readonly name: string;
  readonly version: string;
  readonly metadata: GraphMetadata;
  readonly nodes: Node[];
  readonly edges: Edge[];
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
