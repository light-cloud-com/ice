/**
 * Deploy Messages — Provider-agnostic error codes, deploy progress strings,
 * and IPC error messages.
 *
 * **Provider-specific error patterns and detection helpers have moved.**
 * They live in each provider's own messages module — for GCP that's
 * `providers/gcp/messages.ts`. This file re-exports them for backwards
 * compat with existing imports, but new code should import directly
 * from the provider module so the dependency direction stays clean
 * (core/deploy doesn't depend on GCP).
 *
 * When AWS / Azure / Kubernetes deployers land, each ships its own
 * `providers/<name>/messages.ts` with provider-shaped patterns. The
 * dispatcher uses the locally-imported one, never these re-exports.
 */

// =============================================================================
// Provider-specific error patterns (re-exported from providers/gcp/messages.ts
// for backwards compat — DEPRECATED, import from the provider module directly)
// =============================================================================

/** @deprecated Import from `providers/gcp/messages.js` directly. */
export {
  API_NOT_ENABLED_PATTERNS,
  AUTH_MISSING_PATTERNS,
  AUTH_EXPIRED_PATTERNS,
  RESOURCE_NOT_FOUND_PATTERNS,
  isApiNotEnabledError,
  isAuthMissingError,
  isAuthExpiredError,
  isAuthError,
  isResourceNotFoundError,
  extractApiName,
  extractApiEnableUrl,
  buildApiEnableUrl,
} from './providers/gcp/messages.js';

// =============================================================================
// Deploy Error Codes
// =============================================================================

export const DEPLOY_ERROR_CODES = {
  CREATE_FAILED: 'CREATE_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
} as const;

// =============================================================================
// GCP Deployer Messages
// =============================================================================

export const GCP_DEPLOYER_MESSAGES = {
  NOT_INITIALIZED: 'GCPDeployer not initialized. Call initialize() first.',
  UNSUPPORTED_TYPE: (type: string) => `Unsupported GCP resource type: ${type}`,
  PROJECT_REQUIRED: 'GCP project is required (--project <id>)',
  DEPLOYER_NOT_INITIALIZED: 'Deployer not initialized',

  // Auto-enable API
  API_NOT_ENABLED_ATTEMPTING: (apiName: string) =>
    `API "${apiName}" is not enabled. Attempting to enable it automatically...`,
  API_ENABLED_RETRYING: (apiName: string) => `API "${apiName}" enabled successfully. Retrying deployment...`,
  API_NOT_ENABLED_MANUAL: (apiName: string, reason: string, consoleUrl: string) =>
    `API "${apiName}" is not enabled and auto-enable failed${reason ? ` (${reason})` : ''}. Enable it manually: ${consoleUrl}`,
  AUTO_ENABLE_FAILED: (apiName: string) =>
    `Auto-enable failed. Please enable "${apiName}" manually in the GCP Console.`,

  // Enable failure reasons
  ENABLE_REASON_INSUFFICIENT_PERMISSIONS: 'insufficient permissions to enable APIs',
  ENABLE_REASON_LACKS_PERMISSION: 'account lacks serviceusage.services.enable permission',
  ENABLE_REASON_SERVICE_USAGE_NOT_ENABLED: 'Service Usage API itself is not enabled',
  ENABLE_REASON_ACCESS_DENIED: 'access denied — check IAM roles',
} as const;

// =============================================================================
// Auth Messages
// =============================================================================

export const AUTH_MESSAGES = {
  // SDK availability
  AUTH_LIB_NOT_INSTALLED_PNPM: 'google-auth-library is not installed. Run: pnpm add google-auth-library',
  AUTH_LIB_NOT_INSTALLED_NPM: 'google-auth-library not installed. Run: npm install google-auth-library',
  AUTH_LIB_NOT_AVAILABLE: 'GCP auth library not available.',

  // Credential errors
  CREDENTIALS_NOT_FOUND:
    'GCP credentials not found. Please authenticate first:\n' +
    '  1. In ICE Desktop: click the Cloud icon \u2192 connect to GCP\n' +
    '  2. Or run in terminal: gcloud auth application-default login',
  CREDENTIALS_EXPIRED:
    'GCP credentials have expired. Please re-authenticate:\n' +
    '  1. In ICE Desktop: click the Cloud icon \u2192 reconnect to GCP\n' +
    '  2. Or run in terminal: gcloud auth application-default login',
  CREDENTIALS_NOT_FOUND_OR_EXPIRED: 'GCP credentials not found or expired.',
  AUTH_FAILED: (msg: string) => `GCP authentication failed: ${msg}`,
  AUTH_ERROR: (msg: string) => `GCP auth error: ${msg}`,
  COULD_NOT_OBTAIN_TOKEN: 'Could not obtain access token',
  COULD_NOT_OBTAIN_GCP_TOKEN: 'Could not obtain GCP access token.',

  // Auth config validation
  SERVICE_ACCOUNT_KEY_REQUIRED: 'Service account key file path is required',
  OAUTH_CREDENTIALS_REQUIRED: 'OAuth2 credentials are required',
  UNKNOWN_AUTH_METHOD: (method: string) => `Unknown auth method: ${method}`,

  // GCP scope
  CLOUD_PLATFORM_SCOPE: 'https://www.googleapis.com/auth/cloud-platform',
} as const;

// =============================================================================
// Deploy Progress Messages (used by deploy-handler.ts)
// =============================================================================

export const DEPLOY_PROGRESS = {
  // Authentication
  OPENING_AUTH: 'Opening GCP authentication...',
  AUTH_SUCCESSFUL: 'GCP authentication successful.',
  CHECKING_CREDENTIALS: 'Checking GCP credentials...',
  CREDENTIALS_VERIFIED: 'GCP credentials verified.',
  VERIFYING_CREDENTIALS: 'Verifying GCP credentials...',
  CREDENTIALS_OK: 'GCP credentials OK.',

  // Translation
  TRANSLATING_CANVAS: 'Translating canvas to deployment graph...',
  TRANSLATED: (count: number) => `Translated ${count} resources.`,
  LOADED_PRIOR_STATE: (count: number) => `Loaded ${count} previously deployed resources.`,
  NO_DEPLOYABLE_RESOURCES_CANVAS: 'No deployable resources found on canvas.',
  NO_DEPLOYABLE_RESOURCES: 'No deployable resources found.',

  // Deploy execution
  STARTING_DEPLOYMENT: 'Starting deployment...',
  TRANSLATING_GRAPH: 'Translating graph...',
  DEPLOYING_RESOURCES: (count: number, project: string, existingCount?: number) =>
    `Deploying ${count} resources to GCP project "${project}"${existingCount && existingCount > 0 ? ` (${existingCount} existing)` : ''}...`,
  CREATING_RESOURCE: (name: string, type: string) => `Creating ${name} (${type})...`,
  UPDATING_RESOURCE: (name: string, type: string) => `Updating ${name} (${type})...`,
  CREATED_RESOURCE: (name: string, type: string, seconds: string) => `Created ${name} (${type}) in ${seconds}s`,
  UPDATED_RESOURCE: (name: string, type: string, seconds: string) => `Updated ${name} (${type}) in ${seconds}s`,
  FAILED_TO_CREATE: (name: string, error: string) => `Failed to create ${name}: ${error}`,
  FAILED_TO_UPDATE: (name: string, error: string) => `Failed to update ${name}: ${error}`,
  FAILED_TO_ACTION: (action: string, name: string, error: string) => `Failed to ${action} ${name}: ${error}`,

  // Deletes
  DELETING_RESOURCE: (name: string, type: string) => `Deleting ${name} (${type})...`,
  DELETED_RESOURCE: (name: string, type: string, seconds: string) => `Deleted ${name} (${type}) in ${seconds}s`,
  FAILED_TO_DELETE: (name: string, error: string) => `Failed to delete ${name}: ${error}`,

  // Completion
  DEPLOYMENT_COMPLETED: (success: boolean, seconds: string) =>
    `Deployment ${success ? 'completed' : 'finished with errors'} in ${seconds}s`,
  SOME_RESOURCES_FAILED: 'Some resources failed to deploy.',

  // Destroy
  DESTROY_NOT_IMPLEMENTED: 'Destroy not yet implemented.',
  DESTROY_NOT_IMPLEMENTED_ERROR: 'Destroy is not yet implemented.',
} as const;

// =============================================================================
// Deploy Engine Display Messages
// =============================================================================

export const DEPLOY_DISPLAY = {
  TITLE: '\nICE Deployment Result',
  PROVIDER: (provider: string) => `Provider: ${provider}`,
  DURATION: (seconds: string) => `Duration: ${seconds}s`,
  NO_CHANGES: 'No changes applied.',
  SEPARATOR: '\u2500'.repeat(50),
  RESULT_SUCCESS: 'Result: SUCCESS',
  RESULT_FAILED: 'Result: FAILED',
  CREATED_HEADER: (count: number) => `+ Created (${count}):`,
  UPDATED_HEADER: (count: number) => `~ Updated (${count}):`,
  DELETED_HEADER: (count: number) => `- Deleted (${count}):`,
  RESOURCE_LINE: (success: boolean, type: string, name: string, error?: string) =>
    `  ${success ? '\u2713' : '\u2717'} ${type} "${name}"${error ? ` - ${error}` : ''}`,
  SUMMARY_CREATED: (count: number) => `  Created: ${count}`,
  SUMMARY_UPDATED: (count: number) => `  Updated: ${count}`,
  SUMMARY_DELETED: (count: number) => `  Deleted: ${count}`,
  SUMMARY_FAILED: (count: number) => `  Failed: ${count}`,
} as const;

// =============================================================================
// IPC Error Messages
// =============================================================================

export const IPC_ERRORS = {
  URL_NOT_ALLOWED: 'URL not allowed.',
} as const;

// =============================================================================
// Allowed URL Prefixes (for openExternal)
// =============================================================================

export const ALLOWED_EXTERNAL_URL_PREFIXES = [
  'https://console.developers.google.com/',
  'https://console.cloud.google.com/',
] as const;
