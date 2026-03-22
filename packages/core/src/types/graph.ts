/**
 * Graph Type Definitions
 *
 * Core types for the ICE infrastructure graph model.
 * Resources are nodes, dependencies are edges.
 */

// =============================================================================
// Node Types
// =============================================================================

/**
 * Unique identifier for a node in the graph.
 */
export type NodeId = string & { readonly __brand: 'NodeId' };

/**
 * Create a typed NodeId from a string.
 */
export function create_node_id(id: string): NodeId {
  return id as NodeId;
}

/**
 * Node representing an infrastructure resource.
 */
export interface Node<TProperties = Record<string, unknown>> {
  /** Unique identifier */
  readonly id: NodeId;

  /** ICE resource type (e.g., "Ec2.Vpc", "S3.Bucket") */
  readonly type: string;

  /** Human-readable name */
  readonly name: string;

  /** Resource properties */
  readonly properties: TProperties;

  /** Node metadata */
  readonly metadata: NodeMetadata;

  /** Validation constraints */
  readonly constraints?: NodeConstraints;
}

/**
 * Metadata attached to a node.
 */
export interface NodeMetadata {
  /** When the node was created */
  readonly created_at: string;

  /** When the node was last modified */
  readonly updated_at: string;

  /** User-defined labels */
  readonly labels: Record<string, string>;

  /** User-defined annotations */
  readonly annotations: Record<string, unknown>;

  /** Source location if parsed from file */
  readonly source?: SourceLocation;

  /** Node category for level filtering */
  readonly category?: NodeCategory;
}

/**
 * Source location for parsed nodes.
 */
export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/**
 * Constraints applied to a node.
 */
export interface NodeConstraints {
  /** Required properties that must be set */
  readonly required_properties?: string[];

  /** Properties that must match specific patterns */
  readonly property_patterns?: Record<string, string>;

  /** Allowed values for properties */
  readonly allowed_values?: Record<string, unknown[]>;

  /** Custom validation rules */
  readonly custom_rules?: CustomRule[];
}

/**
 * Custom validation rule.
 */
export interface CustomRule {
  readonly name: string;
  readonly expression: string;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
}

// =============================================================================
// Edge Types
// =============================================================================

/**
 * Unique identifier for an edge.
 */
export type EdgeId = string & { readonly __brand: 'EdgeId' };

/**
 * Create a typed EdgeId from a string.
 */
export function create_edge_id(id: string): EdgeId {
  return id as EdgeId;
}

/**
 * Type of relationship between nodes.
 */
export type EdgeRelationship =
  | 'depends_on' // Target must exist before source can be created
  | 'contains' // Source contains target (parent-child)
  | 'references' // Source references target (soft dependency)
  | 'connects_to' // Source connects to target (network/data flow)
  | 'talks_to'; // Inferred data flow (service communication)

// =============================================================================
// Node Categories for Level Filtering
// =============================================================================

/**
 * Node category for level filtering.
 * Determines visibility at different view levels (L1/L2/L3).
 */
export type NodeCategory =
  | 'Compute' // Functions, containers, VMs
  | 'Data' // Databases, storage, caches
  | 'Network' // VPCs, subnets, load balancers, gateways
  | 'Security' // IAM, secrets, security groups
  | 'Observability'; // Monitoring, logging, dashboards

// =============================================================================
// Inference Types
// =============================================================================

/**
 * Confidence level for inferred relationships.
 */
export type InferenceConfidence = 'high' | 'medium' | 'low';

/**
 * Source of an inferred relationship.
 */
export type InferenceSource =
  | 'terraform_reference' // Direct reference in Terraform
  | 'environment_variable' // Connection string in env vars
  | 'iam_policy' // IAM policy grants access
  | 'security_group'; // Security group allows traffic

/**
 * Edge representing a dependency or relationship between nodes.
 */
export interface Edge {
  /** Unique identifier */
  readonly id: EdgeId;

  /** Source node ID */
  readonly source: NodeId;

  /** Target node ID */
  readonly target: NodeId;

  /** Type of relationship */
  readonly relationship: EdgeRelationship;

  /** Edge metadata */
  readonly metadata: EdgeMetadata;
}

/**
 * Metadata attached to an edge.
 */
export interface EdgeMetadata {
  /** When the edge was created */
  readonly created_at: string;

  /** User-defined labels */
  readonly labels: Record<string, string>;

  /** Whether this edge was inferred or explicit */
  readonly inferred: boolean;

  /** Source property that created this edge */
  readonly source_property?: string;

  /** Target property referenced by this edge */
  readonly target_property?: string;

  /** Confidence level for inferred edges */
  readonly inference_confidence?: InferenceConfidence;

  /** Source of the inference */
  readonly inference_source?: InferenceSource;

  /** Evidence for the inference (e.g., "env var DATABASE_URL references...") */
  readonly inference_evidence?: string;

  /** Security rule label for L2 display (e.g., "allow 443/tcp") */
  readonly security_rule?: string;
}

// =============================================================================
// Graph Types
// =============================================================================

/**
 * Unique identifier for a graph.
 */
export type GraphId = string & { readonly __brand: 'GraphId' };

/**
 * Create a typed GraphId from a string.
 */
export function create_graph_id(id: string): GraphId {
  return id as GraphId;
}

/**
 * Infrastructure graph containing nodes and edges.
 */
export interface Graph {
  /** Unique identifier */
  readonly id: GraphId;

  /** Graph name */
  readonly name: string;

  /** Graph version */
  readonly version: string;

  /** All nodes in the graph */
  readonly nodes: ReadonlyMap<NodeId, Node>;

  /** All edges in the graph */
  readonly edges: ReadonlyMap<EdgeId, Edge>;

  /** Graph metadata */
  readonly metadata: GraphMetadata;
}

/**
 * Metadata attached to a graph.
 */
export interface GraphMetadata {
  /** When the graph was created */
  readonly created_at: string;

  /** When the graph was last modified */
  readonly updated_at: string;

  /** Graph description */
  readonly description?: string;

  /** User-defined labels */
  readonly labels: Record<string, string>;

  /** User-defined annotations */
  readonly annotations: Record<string, unknown>;

  /** Target providers for deployment */
  readonly providers?: string[];

  /** Target regions for deployment */
  readonly regions?: string[];
}

// =============================================================================
// Graph Operations
// =============================================================================

/**
 * Result of adding a node to the graph.
 */
export interface AddNodeResult {
  readonly success: boolean;
  readonly node?: Node;
  readonly errors?: string[];
}

/**
 * Result of adding an edge to the graph.
 */
export interface AddEdgeResult {
  readonly success: boolean;
  readonly edge?: Edge;
  readonly errors?: string[];
}

/**
 * Options for graph traversal.
 */
export interface TraversalOptions {
  /** Direction of traversal */
  readonly direction: 'forward' | 'backward' | 'both';

  /** Maximum depth to traverse */
  readonly max_depth?: number;

  /** Filter edges by relationship type */
  readonly relationship_filter?: EdgeRelationship[];

  /** Filter nodes by type */
  readonly type_filter?: string[];
}

/**
 * Result of topological sort.
 */
export interface TopologicalSortResult {
  readonly success: boolean;
  readonly order?: NodeId[];
  readonly cycle?: NodeId[];
}

// =============================================================================
// Graph Builder Types
// =============================================================================

/**
 * Input for creating a new node.
 */
export interface NodeInput<TProperties = Record<string, unknown>> {
  /** ICE resource type */
  readonly type: string;

  /** Human-readable name */
  readonly name: string;

  /** Resource properties */
  readonly properties: TProperties;

  /** User-defined labels */
  readonly labels?: Record<string, string>;

  /** User-defined annotations */
  readonly annotations?: Record<string, unknown>;
}

/**
 * Input for creating a new edge.
 */
export interface EdgeInput {
  /** Source node ID or name */
  readonly source: NodeId | string;

  /** Target node ID or name */
  readonly target: NodeId | string;

  /** Type of relationship */
  readonly relationship: EdgeRelationship;

  /** User-defined labels */
  readonly labels?: Record<string, string>;
}

/**
 * Input for creating a new graph.
 */
export interface GraphInput {
  /** Graph name */
  readonly name: string;

  /** Graph description */
  readonly description?: string;

  /** User-defined labels */
  readonly labels?: Record<string, string>;

  /** User-defined annotations */
  readonly annotations?: Record<string, unknown>;

  /** Target providers */
  readonly providers?: string[];

  /** Target regions */
  readonly regions?: string[];
}
