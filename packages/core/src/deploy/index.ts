/**
 * ICE Deploy Module
 *
 * Deploy infrastructure changes directly to cloud providers.
 */

export { deploy_changes, deploy_graph, format_deploy_result } from './deploy-engine.js';

export {
  GCPDeployer,
  create_gcp_deployer,
  AWSDeployer,
  create_aws_deployer,
  AzureDeployer,
  create_azure_deployer,
} from "./providers/index.js";

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
} from './types.js';

// Card-to-Graph translation layer
export { translate_card_to_graph } from './card-translator.js';

export type {
  CardTranslationInput,
  CardTranslationResult,
  CardNodeInput,
  CardEdgeInput,
  DeployProvider,
  SkippedNode,
} from './card-translator.js';

// State persistence bridge
export {
  load_state_for_diff,
  enrich_graph_with_state,
  sync_deploy_result_to_state,
  sync_resource_results_to_state,
} from './state-bridge.js';

export type { DeployStateStore, StoredResourceEntry } from './state-bridge.js';

// State store adapter (SqliteStateStore → DeployStateStore)
export { create_deploy_state_adapter } from './state-store-adapter.js';

// Environment-aware deployment
export { apply_environment_overrides, get_environment_label, get_cost_multiplier } from './environment-config.js';

export type { EnvironmentType } from './environment-config.js';

// GCP Authentication
export { get_gcp_credentials, validate_gcp_credentials, list_gcp_projects } from './providers/gcp/auth.js';

export type {
  GCPAuthConfig as GCPDeployAuthConfig,
  GCPAuthMethod,
  GCPAuthResult,
  GCPProject,
} from './providers/gcp/auth.js';

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
} from './messages.js';
