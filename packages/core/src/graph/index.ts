/**
 * ICE Graph Module
 *
 * Graph data structures, algorithms, parsers, and validators.
 */

// Re-export parser module
export * from './parser/index.js';

// Re-export validator module
export * from './validator/index.js';

// Mutable graph implementation
export type { GraphStats, SerializedGraph } from './mutable-graph.js';

export { MutableGraph, create_mutable_graph } from './mutable-graph.js';

// Graph algorithms
export type { GraphMetrics } from './algorithms.js';

export {
  topological_sort,
  reverse_topological_sort,
  has_cycle,
  find_cycles,
  find_all_paths,
  find_shortest_path,
  find_connected_components,
  find_strongly_connected_components,
  get_execution_layers,
  get_critical_path,
  calculate_metrics,
} from './algorithms.js';

// Classifier module
export {
  classify_resource,
  is_category_visible_at_level,
  is_resource_visible_at_level,
  is_container_type,
  get_types_by_category,
  LEVEL_VISIBLE_CATEGORIES,
  NETWORK_CONTAINER_TYPES,
  L1_VISIBLE_NETWORK_TYPES,
} from './classifier/index.js';

// Inference module
export {
  RelationshipInferrer,
  create_relationship_inferrer,
  infer_relationships,
  type InferredRelationship,
  type InferenceOptions,
} from './inference/index.js';
