/**
 * ICE Deploy Module
 *
 * Deploy infrastructure changes directly to cloud providers.
 */

export { deploy_changes, deploy_graph, format_deploy_result } from './deploy-engine';

export {
  GCPDeployer,
  create_gcp_deployer,
  AWSDeployer,
  create_aws_deployer,
  AzureDeployer,
  create_azure_deployer,
} from "./providers";

export type {
  ResourceDeployResult,
  DeployResult,
  DeploySummary,
  DeployError,
  DeployWarning,
  DeployOptions,
  ProviderDeployer,
  DeployState,
  ResourceDeployState,
  NodeStatusEvent,
  NodeProgressEvent,
  NodeTerminalStatus,
} from './types';

// Parallel scheduler (pdl-1) — exposed for service-layer wiring (pdl-4).
export { run_parallel_apply, ParallelChangeScheduler, DEFAULT_POOL_SIZE, DEFAULT_PER_HANDLER_CAPS } from './scheduler';

export type { SchedulerPhase, SchedulerRunInput } from './scheduler';

// Card-to-Graph translation layer
export { translate_card_to_graph } from './card-translator';

export type {
  CardTranslationInput,
  CardTranslationResult,
  CardNodeInput,
  CardEdgeInput,
  DeployProvider,
  SkippedNode,
} from './card-translator';

// State persistence bridge
export {
  load_state_for_diff,
  enrich_graph_with_state,
  sync_deploy_result_to_state,
  sync_resource_results_to_state,
} from './state-bridge';

export type { DeployStateStore, StoredResourceEntry } from './state-bridge';

// State store adapter (SqliteStateStore → DeployStateStore)
export { create_deploy_state_adapter } from './state-store-adapter';

// Environment-aware deployment
export { apply_environment_overrides, get_environment_label, get_cost_multiplier } from './environment-config';

export type { EnvironmentType } from './environment-config';

// GCP SDK lazy loader — exposed so consumers outside the deploy engine
// (e.g. the log-stream service) can load `@google-cloud/logging` without
// re-implementing the dynamic-import dance.
export { load_sdk } from './providers/gcp/sdk-loader';

// GCP Authentication
export { get_gcp_credentials, validate_gcp_credentials, list_gcp_projects } from './providers/gcp/auth';

export type {
  GCPAuthConfig as GCPDeployAuthConfig,
  GCPAuthMethod,
  GCPAuthResult,
  GCPProject,
} from './providers/gcp/auth';

// Centralized messages
export {
  // Detection patterns
  API_NOT_ENABLED_PATTERNS,
  AUTH_MISSING_PATTERNS,
  AUTH_EXPIRED_PATTERNS,
  // Detection functions
  isApiNotEnabledError,
  isAuthMissingError,
  isAuthExpiredError,
  isAuthError,
  extractApiName,
  extractApiEnableUrl,
  buildApiEnableUrl,
  // Error codes
  DEPLOY_ERROR_CODES,
  // Message objects
  GCP_DEPLOYER_MESSAGES,
  AUTH_MESSAGES,
  DEPLOY_PROGRESS,
  DEPLOY_DISPLAY,
  IPC_ERRORS,
  ALLOWED_EXTERNAL_URL_PREFIXES,
} from './messages';
