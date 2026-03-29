/**
 * ICE Core Type Definitions
 *
 * Central export point for all core types.
 */

// Graph types
export type {
  NodeId,
  EdgeId,
  GraphId,
  Node,
  NodeMetadata,
  SourceLocation,
  NodeConstraints,
  CustomRule,
  Edge,
  EdgeRelationship,
  EdgeMetadata,
  Graph,
  GraphMetadata,
  AddNodeResult,
  AddEdgeResult,
  TraversalOptions,
  TopologicalSortResult,
  NodeInput,
  EdgeInput,
  GraphInput,
  // New types for three-level architecture
  NodeCategory,
  InferenceConfidence,
  InferenceSource,
} from './graph.js';

export { create_node_id, create_edge_id, create_graph_id } from './graph.js';

// Provider types
export type {
  ProviderName,
  ProviderId,
  ProviderCredentials,
  CredentialType,
  AccessKeyCredentials,
  ServiceAccountCredentials,
  ClientSecretCredentials,
  EnvironmentCredentials,
  ProviderConfig,
  ResourceStatus,
  ResourceState,
  DeploymentResult,
  DeploymentError,
  DestroyResult,
  ProviderClient,
  HealthCheckResult,
  ProviderRegistry,
  ProviderFactory,
  ProviderCapabilities,
} from './providers.js';

export { create_provider_id } from './providers.js';

// Deployment types
export type {
  DeploymentId,
  DeploymentAction,
  PlannedChange,
  PropertyChange,
  DeploymentPlan,
  PlanSummary,
  ProviderRequirement,
  DeploymentStatus,
  OperationStatus,
  OperationResult,
  OperationError,
  DeploymentExecution,
  ExecutionSummary,
  PlanOptions,
  ExecuteOptions,
  ProgressEvent,
  DeploymentState,
  StateDiff,
  DriftResult,
  DriftedResource,
} from './deployment.js';

export { create_deployment_id } from './deployment.js';

// Error types
export type { ErrorCategory, ErrorCode, ErrorJson, ValidationViolation } from './errors.js';

export {
  IceError,
  ValidationError,
  GraphError,
  NodeNotFoundError,
  CycleDetectedError,
  ProviderError,
  AuthenticationError,
  RateLimitError,
  DeploymentError as DeploymentOperationError,
  SecurityError,
  InternalError,
  NotImplementedError,
  is_ice_error,
  is_retryable,
  wrap_error,
} from './errors.js';

// Result types
export type { Result, Success, Failure, IceResult, AsyncIceResult, MultiResult } from './result.js';

export {
  success,
  failure,
  is_success,
  is_failure,
  unwrap_or,
  unwrap_or_else,
  unwrap,
  unwrap_error,
  map,
  map_error,
  flat_map,
  or_else,
  all,
  any,
  partition,
  from_promise,
  from_try,
  from_nullable,
} from './result.js';
