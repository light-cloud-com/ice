/**
 * GCP Handler Messages — SDK registry, operation helpers, service names,
 * and GCP-specific error classification.
 *
 * Centralizes the repeated "SDK not available" / "operation failed" /
 * "operation timed out" strings used across all GCP handler modules,
 * plus the regex/pattern detectors that classify GCP error responses
 * (API not enabled, auth missing, resource not found, etc.).
 *
 * GCP-specific by design — every cloud returns errors in a different
 * shape, so the pattern matchers live with the provider that emits
 * them. The generic `core/deploy/messages.ts` re-exports these for
 * backwards-compat but new code should import from this file directly
 * via `'../messages.js'` (handler) or `'./messages.js'` (gcp-deployer).
 */

// =============================================================================
// Error detection patterns
// =============================================================================

export const API_NOT_ENABLED_PATTERNS = [
  'has not been used in project',
  'it is disabled',
  'API has not been enabled',
] as const;

export const AUTH_MISSING_PATTERNS = [
  'Could not load the default credentials',
  'default credentials',
] as const;

export const AUTH_EXPIRED_PATTERNS = ['refresh token', 'expired', 'invalid_grant'] as const;

/**
 * Patterns that indicate "the resource you tried to delete or describe
 * doesn't exist" — covers GCP REST + SDK + raw HTTP. A delete that hits
 * any of these has effectively succeeded (the goal was to make the
 * resource gone, and it's gone).
 *
 * The exact wording varies by service: Cloud Compute returns
 * "The resource '...' was not found", Cloud Storage returns "404",
 * Cloud Run returns "NOT_FOUND" inside the proto error. Match all
 * common variants so the dispatcher's delete-tolerance covers every
 * handler without each one needing its own check.
 */
export const RESOURCE_NOT_FOUND_PATTERNS = [
  'was not found',
  'NOT_FOUND',
  'notFound',
  'not found',
  'does not exist',
  'no longer exists',
] as const;

// =============================================================================
// Detection functions
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
 * Detect if an error indicates the target resource doesn't exist.
 * Used by the deploy dispatcher to make delete actions idempotent — a
 * delete on a non-existent resource is treated as success since the
 * goal (resource is gone) is already met.
 *
 * Also catches plain HTTP 404 status codes that some handlers leak
 * into the error message via `${response.status}` interpolation.
 */
export function isResourceNotFoundError(error?: string): boolean {
  if (!error) return false;
  if (RESOURCE_NOT_FOUND_PATTERNS.some((p) => error.includes(p))) return true;
  // HTTP status code patterns that handlers commonly emit:
  //   "Request failed with status code 404"
  //   "404 Not Found"
  //   "GCP DELETE 404: ..."
  if (/\b404\b/.test(error)) return true;
  return false;
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
// Service Names (human-readable labels for log messages)
// =============================================================================

export const SERVICE_NAMES = {
  CLOUD_RUN: 'Cloud Run',
  CLOUD_RUN_JOBS: 'Cloud Run Jobs',
  CLOUD_SQL: 'Cloud SQL',
  CLOUD_FUNCTIONS: 'Cloud Function',
  CLOUD_SCHEDULER: 'Cloud Scheduler',
  CLOUD_STORAGE: 'Cloud Storage',
  PUBSUB: 'Pub/Sub',
  FIRESTORE: 'Firestore',
  MEMORYSTORE: 'Memorystore',
  SECRET_MANAGER: 'Secret Manager',
  IDENTITY_PLATFORM: 'Identity Platform',
  BIGQUERY: 'BigQuery',
  API_GATEWAY: 'API Gateway',
  COMPUTE: 'Compute',
  LOGGING: 'Cloud Logging',
  VERTEX_AI: 'Vertex AI',
  DATAFLOW: 'Dataflow',
  DISCOVERY_ENGINE: 'Discovery Engine',
  GKE: 'GKE',
  DOMAIN_MAPPING: 'Domain Mapping',
} as const;

// =============================================================================
// SDK Package Names (npm install instructions)
// =============================================================================

export const SDK_PACKAGES: Record<string, string> = {
  'run.services': '@google-cloud/run',
  'run.jobs': '@google-cloud/run',
  storage: '@google-cloud/storage',
  pubsub: '@google-cloud/pubsub',
  secretmanager: '@google-cloud/secret-manager',
  bigquery: '@google-cloud/bigquery',
  logging: '@google-cloud/logging',
  scheduler: '@google-cloud/scheduler',
  functions: '@google-cloud/functions',
  container: '@google-cloud/container',
};

// =============================================================================
// SDK Not Available Messages
// =============================================================================

/**
 * Generate a "SDK not available" error for a create operation (with install hint).
 */
export function sdk_not_available(serviceName: string, clientKey: string): string {
  const pkg = SDK_PACKAGES[clientKey];
  return pkg ? `${serviceName} SDK not available. Install ${pkg}` : `${serviceName} SDK not available`;
}

/**
 * Generate a short "SDK not available" error (for update/delete, no install hint).
 */
export function sdk_not_available_short(serviceName: string): string {
  return `${serviceName} SDK not available`;
}

// =============================================================================
// Operation Result Messages
// =============================================================================

/**
 * Generate an "operation failed" error string.
 */
export function operation_failed(serviceName: string, errorJson: string): string {
  return `${serviceName} operation failed: ${errorJson}`;
}

/**
 * Generate an "operation timed out" error string.
 */
export function operation_timed_out(serviceName: string, seconds?: number): string {
  return seconds ? `${serviceName} operation timed out after ${seconds}s` : `${serviceName} operation timed out`;
}

// =============================================================================
// Handler-Specific Messages
// =============================================================================

export const HANDLER_MESSAGES = {
  // Cloud Run
  CLOUD_RUN_IMAGE_REQUIRED: 'Cloud Run service requires an image property',
  CLOUD_RUN_NO_SOURCE:
    'No image or repository configured. Set data.image (Docker image) or data.repository (GitHub URL) on the node.',

  // GKE
  GKE_CREATION_ABORTED: (statusMessage: string) => `GKE cluster creation aborted: ${statusMessage}`,

  // Dataflow
  DATAFLOW_NO_UPDATE: 'Dataflow jobs cannot be updated in-place; they must be drained and recreated',

  // Firestore
  FIRESTORE_LIMITED_UPDATE: 'Firestore databases have very limited update options',
} as const;

// =============================================================================
// Cloud Build Messages
// =============================================================================

export const BUILD_MESSAGES = {
  CREATING_ARTIFACT_REGISTRY: (region: string) => `Creating Artifact Registry in ${region}...`,
  AR_CREATE_FAILED: (name: string, error: string) => `Failed to create Artifact Registry "${name}": ${error}`,
  INVALID_REPO_URL: (url: string) =>
    `Invalid GitHub repository: "${url}". Expected format: owner/repo or https://github.com/owner/repo`,
  SUBMITTING_BUILD: (owner: string, repo: string, branch: string) =>
    `Submitting Cloud Build for ${owner}/${repo}@${branch}...`,
  NO_BUILD_ID: 'Cloud Build submission did not return a build ID',
  BUILD_STARTED: (buildId: string) => `Cloud Build started: ${buildId}`,
  BUILD_IN_PROGRESS: (status: string, seconds: number) => `Build ${status.toLowerCase()}... (${seconds}s)`,
  BUILD_SUCCEEDED: (imageUri: string) => `Build succeeded → ${imageUri}`,
  BUILD_FAILED: (status: string, logUrl: string) =>
    `Cloud Build failed with status ${status}${logUrl ? `. Logs: ${logUrl}` : ''}`,
  BUILD_TIMED_OUT: 'Cloud Build timed out after 15 minutes',
  BUILDING_FROM_SOURCE: (repo: string) => `Building container image from source: ${repo}`,
} as const;
