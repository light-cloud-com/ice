/**
 * GCP Handler Messages — SDK registry, operation helpers, service names
 *
 * Centralizes the repeated "SDK not available" / "operation failed" /
 * "operation timed out" strings used across all GCP handler modules.
 */

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
  return pkg
    ? `${serviceName} SDK not available. Install ${pkg}`
    : `${serviceName} SDK not available`;
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
  return seconds
    ? `${serviceName} operation timed out after ${seconds}s`
    : `${serviceName} operation timed out`;
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
  DATAFLOW_NO_UPDATE:
    'Dataflow jobs cannot be updated in-place; they must be drained and recreated',

  // Firestore
  FIRESTORE_LIMITED_UPDATE: 'Firestore databases have very limited update options',
} as const;

// =============================================================================
// Cloud Build Messages
// =============================================================================

export const BUILD_MESSAGES = {
  CREATING_ARTIFACT_REGISTRY: (region: string) => `Creating Artifact Registry in ${region}...`,
  AR_CREATE_FAILED: (name: string, error: string) =>
    `Failed to create Artifact Registry "${name}": ${error}`,
  INVALID_REPO_URL: (url: string) =>
    `Invalid GitHub repository: "${url}". Expected format: owner/repo or https://github.com/owner/repo`,
  SUBMITTING_BUILD: (owner: string, repo: string, branch: string) =>
    `Submitting Cloud Build for ${owner}/${repo}@${branch}...`,
  NO_BUILD_ID: 'Cloud Build submission did not return a build ID',
  BUILD_STARTED: (buildId: string) => `Cloud Build started: ${buildId}`,
  BUILD_IN_PROGRESS: (status: string, seconds: number) =>
    `Build ${status.toLowerCase()}... (${seconds}s)`,
  BUILD_SUCCEEDED: (imageUri: string) => `Build succeeded → ${imageUri}`,
  BUILD_FAILED: (status: string, logUrl: string) =>
    `Cloud Build failed with status ${status}${logUrl ? `. Logs: ${logUrl}` : ''}`,
  BUILD_TIMED_OUT: 'Cloud Build timed out after 15 minutes',
  BUILDING_FROM_SOURCE: (repo: string) => `Building container image from source: ${repo}`,
} as const;
