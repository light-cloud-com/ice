/**
 * Deploy Messages — Centralized error messages, detection patterns, and strings
 *
 * All error detection patterns, deploy error codes, auth messages, and progress
 * messages are defined here once and imported everywhere.
 */

// =============================================================================
// API Not Enabled — Detection Patterns
// =============================================================================

export const API_NOT_ENABLED_PATTERNS = [
  'has not been used in project',
  'it is disabled',
  'API has not been enabled',
] as const;

export const AUTH_MISSING_PATTERNS = ['Could not load the default credentials', 'default credentials'] as const;

export const AUTH_EXPIRED_PATTERNS = ['refresh token', 'expired', 'invalid_grant'] as const;

// =============================================================================
// Detection Functions
// =============================================================================

/**
 * Detect if an error is a "API not enabled" error.
 * GCP returns these as PERMISSION_DENIED with a specific message pattern.
 */
export function isApiNotEnabledError(error?: string): boolean {
  if (!error) return false;
  return (
    API_NOT_ENABLED_PATTERNS.some((p) => error.includes(p)) ||
    (error.includes('PERMISSION_DENIED') && error.includes('googleapis.com'))
  );
}

/**
 * Detect if an error is an auth-missing error.
 */
export function isAuthMissingError(error?: string): boolean {
  if (!error) return false;
  return AUTH_MISSING_PATTERNS.some((p) => error.includes(p));
}

/**
 * Detect if an error is an auth-expired error.
 */
export function isAuthExpiredError(error?: string): boolean {
  if (!error) return false;
  return AUTH_EXPIRED_PATTERNS.some((p) => error.includes(p));
}

/**
 * Detect if an error is any kind of auth issue (missing or expired).
 */
export function isAuthError(error?: string): boolean {
  return isAuthMissingError(error) || isAuthExpiredError(error);
}

/**
 * Extract the API service name from a GCP "not enabled" error message.
 * E.g., "Enable it by visiting .../apis/api/run.googleapis.com/..." → "run.googleapis.com"
 */
export function extractApiName(error?: string): string | null {
  if (!error) return null;
  // Pattern: "apis/api/<service>/overview" in the console URL
  const url_match = error.match(/apis\/api\/([a-z0-9.-]+\.googleapis\.com)\//);
  if (url_match?.[1]) return url_match[1];
  // Pattern: "<service> API has not been used"
  const name_match = error.match(/([a-z0-9.-]+\.googleapis\.com)/);
  if (name_match?.[1]) return name_match[1];
  return null;
}

/**
 * Extract a console URL from an error message.
 */
export function extractApiEnableUrl(error?: string): string | null {
  if (!error) return null;
  const urlMatch = error.match(/(https:\/\/console\.developers\.google\.com\/[^\s]+)/);
  return urlMatch?.[1] ?? null;
}

/**
 * Build a GCP Console URL for enabling an API.
 */
export function buildApiEnableUrl(apiName: string, project: string): string {
  return `https://console.developers.google.com/apis/api/${apiName}/overview?project=${project}`;
}

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
