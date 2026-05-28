/**
 * GCP SDK Lazy Loader
 *
 * Centralized lazy loading of all GCP SDK packages.
 * Uses dynamic import() with graceful fallback for missing packages.
 * Includes a REST client utility for services without Node.js SDKs.
 */

import { isAuthMissingError, isAuthExpiredError, AUTH_MESSAGES } from '../../messages';
import type { GCPRestClient } from './types';

/**
 * Dynamically import a GCP SDK package.
 * Returns null if the package is not installed.
 */
export async function load_sdk(module_name: string): Promise<any | null> {
  try {
    return await Function('m', 'return import(m)')(module_name);
  } catch {
    return null;
  }
}

/**
 * Options accepted by {@link initialize_gcp_clients} to scope credentials
 * without relying on Application Default Credentials.
 *
 * Preference order:
 *   1. `keyFilename` — path to a 0600-mode temp SA key file. Every Google
 *      Cloud Node SDK accepts this consistently, so it's the most reliable
 *      credential path.
 *   2. `credentials` — raw parsed SA key object. Works for SDKs that accept
 *      `{ credentials: { client_email, private_key } }`.
 *   3. `authClient` — a pre-built auth client (GoogleAuth instance or a
 *      resolved sub-client). Only used by SDKs that support it and as a
 *      last-resort fallback for the OAuth path where neither keyFilename
 *      nor raw credentials are available.
 */
export interface GcpClientAuthOptions {
  keyFilename?: string;
  credentials?: Record<string, unknown>;
  authClient?: unknown;
}

/**
 * Initialize all available GCP SDK clients.
 *
 * Phase 0 regression fix: every SDK client now receives scoped
 * credentials rather than falling back to Application Default Credentials.
 * The earlier attempt to pass `authClient` alone didn't work for
 * `@google-cloud/storage` because its constructor expected a
 * GoogleAuth-compatible shape, not a resolved JWT client. Passing either
 * a `keyFilename` or raw `credentials` is the universally-accepted path.
 */
export async function initialize_gcp_clients(
  project: string,
  auth?: GcpClientAuthOptions,
): Promise<Map<string, unknown>> {
  const clients = new Map<string, unknown>();
  // Every GCP Node SDK constructor accepts `projectId` + at least one of
  // `keyFilename`, `credentials`, `authClient`. We prefer keyFilename
  // (universal) and fall back to credentials or authClient.
  const common: Record<string, unknown> = { projectId: project };
  if (auth?.keyFilename) {
    common.keyFilename = auth.keyFilename;
  } else if (auth?.credentials) {
    common.credentials = auth.credentials;
  } else if (auth?.authClient) {
    common.authClient = auth.authClient;
  }
  const gaxOpts: Record<string, unknown> = { ...common };
  const storageOpts: Record<string, unknown> = { ...common };

  // Compute Engine
  const compute = await load_sdk('@google-cloud/compute');
  if (compute) {
    clients.set('compute.instances', new compute.InstancesClient(gaxOpts));
    clients.set('compute.globalForwardingRules', new compute.GlobalForwardingRulesClient(gaxOpts));
    if (compute.FirewallsClient) clients.set('firewalls', new compute.FirewallsClient(gaxOpts));
    if (compute.InstancesClient) clients.set('instances', new compute.InstancesClient(gaxOpts));
    if (compute.ForwardingRulesClient) clients.set('forwardingRules', new compute.ForwardingRulesClient(gaxOpts));
  }

  // Artifact Registry
  const artifactRegistry = await load_sdk('@google-cloud/artifact-registry');
  if (artifactRegistry) {
    const Client = artifactRegistry.v1?.ArtifactRegistryClient ?? artifactRegistry.ArtifactRegistryClient;
    if (Client) clients.set('artifactregistry', new Client(gaxOpts));
  }

  // Cloud Build
  const cloudbuild = await load_sdk('@google-cloud/cloudbuild');
  if (cloudbuild) {
    const Client = cloudbuild.v1?.CloudBuildClient ?? cloudbuild.CloudBuildClient;
    if (Client) clients.set('cloudbuild', new Client(gaxOpts));
  }

  // Cloud Monitoring (Alert Policies)
  const monitoring = await load_sdk('@google-cloud/monitoring');
  if (monitoring) {
    const Client = monitoring.AlertPolicyServiceClient ?? monitoring.v3?.AlertPolicyServiceClient;
    if (Client) clients.set('monitoring', new Client(gaxOpts));
  }

  // Cloud DNS
  const dns = await load_sdk('@google-cloud/dns');
  if (dns) {
    clients.set('dns', new dns.DNS(storageOpts));
  }

  // Cloud Storage
  const storage = await load_sdk('@google-cloud/storage');
  if (storage) {
    clients.set('storage', new storage.Storage(storageOpts));
  }

  // Cloud Run
  const run = await load_sdk('@google-cloud/run');
  if (run) {
    clients.set('run.services', new run.ServicesClient(gaxOpts));
    if (run.JobsClient) {
      clients.set('run.jobs', new run.JobsClient(gaxOpts));
    }
  }

  // Pub/Sub
  const pubsub = await load_sdk('@google-cloud/pubsub');
  if (pubsub) {
    clients.set('pubsub', new pubsub.PubSub(storageOpts));
  }

  // Secret Manager
  const secret_manager = await load_sdk('@google-cloud/secret-manager');
  if (secret_manager) {
    clients.set('secretmanager', new secret_manager.SecretManagerServiceClient(gaxOpts));
  }

  // BigQuery
  const bigquery = await load_sdk('@google-cloud/bigquery');
  if (bigquery) {
    clients.set('bigquery', new bigquery.BigQuery(storageOpts));
  }

  // Cloud Logging
  const logging = await load_sdk('@google-cloud/logging');
  if (logging) {
    clients.set('logging', new logging.Logging(storageOpts));
  }

  // Cloud Scheduler
  const scheduler = await load_sdk('@google-cloud/scheduler');
  if (scheduler) {
    clients.set('scheduler', new scheduler.CloudSchedulerClient(gaxOpts));
  }

  // Cloud Functions (v2 API — FunctionServiceClient is under .v2 namespace)
  const functions = await load_sdk('@google-cloud/functions');
  if (functions) {
    const FunctionServiceClient = functions.v2?.FunctionServiceClient ?? functions.FunctionServiceClient;
    if (FunctionServiceClient) {
      clients.set('functions', new FunctionServiceClient(gaxOpts));
    }
  }

  // Firestore
  const firestore = await load_sdk('@google-cloud/firestore');
  if (firestore) {
    clients.set('firestore', new firestore.Firestore(storageOpts));
  }

  // Vertex AI
  const aiplatform = await load_sdk('@google-cloud/aiplatform');
  if (aiplatform) {
    clients.set('aiplatform.endpoint', new aiplatform.EndpointServiceClient(gaxOpts));
    if (aiplatform.IndexServiceClient) {
      clients.set('aiplatform.index', new aiplatform.IndexServiceClient(gaxOpts));
    }
    if (aiplatform.IndexEndpointServiceClient) {
      clients.set('aiplatform.indexEndpoint', new aiplatform.IndexEndpointServiceClient(gaxOpts));
    }
  }

  // GKE / Container
  const container = await load_sdk('@google-cloud/container');
  if (container) {
    clients.set('container', new container.ClusterManagerClient(gaxOpts));
  }

  return clients;
}

/**
 * Verify that GCP Application Default Credentials are available.
 * Attempts to get an access token using google-auth-library.
 * Returns the authenticated client or throws with a clear message.
 *
 * If `external_client` is provided (e.g. from Electron main process
 * where dynamic import resolution works), it is used directly.
 */
export async function verify_gcp_auth(external_client?: unknown): Promise<any> {
  // If a pre-authenticated client was passed in, use it directly
  if (external_client) {
    return external_client;
  }

  const google_auth = await load_sdk('google-auth-library');
  if (!google_auth) {
    throw new Error(AUTH_MESSAGES.AUTH_LIB_NOT_INSTALLED_PNPM);
  }

  const auth = new google_auth.GoogleAuth({
    scopes: [AUTH_MESSAGES.CLOUD_PLATFORM_SCOPE],
  });

  let client: any;
  try {
    client = await auth.getClient();
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (isAuthMissingError(msg)) {
      throw new Error(AUTH_MESSAGES.CREDENTIALS_NOT_FOUND, { cause: err });
    }
    throw new Error(AUTH_MESSAGES.AUTH_FAILED(msg), { cause: err });
  }

  // Verify we can actually get a token
  try {
    const token = await client.getAccessToken();
    if (!token?.token) {
      throw new Error(AUTH_MESSAGES.COULD_NOT_OBTAIN_TOKEN);
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (isAuthExpiredError(msg)) {
      throw new Error(AUTH_MESSAGES.CREDENTIALS_EXPIRED, { cause: err });
    }
    throw new Error(AUTH_MESSAGES.AUTH_FAILED(msg), { cause: err });
  }

  return client;
}

/**
 * Create a REST client for GCP APIs using Application Default Credentials.
 * Validates auth eagerly — throws immediately if credentials are missing/expired.
 *
 * If `external_auth_client` is provided, it is used instead of loading
 * google-auth-library (which may fail in bundled Electron contexts).
 */
/**
 * Phase 3 retry wrapper.
 *
 * GCP occasionally returns transient failures (5xx, 429 rate limits,
 * DEADLINE_EXCEEDED, plain old ECONNRESET) that used to fail the entire
 * deploy because nothing retried them. This helper wraps every REST call
 * in exponential-backoff retries so a single network blip doesn't take
 * down a 10-resource deploy.
 *
 * Retries only on known-transient codes; permanent errors (4xx except 429,
 * validation, permission denied) pass through immediately.
 */
function isTransientError(err: any): boolean {
  const status = err?.response?.status || err?.code || err?.status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
  }
  const code = err?.code || err?.cause?.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') return true;
  const msg = String(err?.message || '').toLowerCase();
  if (msg.includes('deadline_exceeded') || msg.includes('deadline exceeded')) return true;
  if (msg.includes('retry') && msg.includes('later')) return true;
  return false;
}

async function withRetry<T>(op: () => Promise<T>, label: string, onLog?: (m: string) => void): Promise<T> {
  const MAX_ATTEMPTS = 5;
  const BASE_DELAY_MS = 500;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS || !isTransientError(err)) throw err;
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
      onLog?.(`[retry] ${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export async function create_rest_client(_project: string, external_auth_client?: unknown): Promise<GCPRestClient> {
  const auth_client = await verify_gcp_auth(external_auth_client);

  async function make_request(method: string, url: string, body?: unknown): Promise<unknown> {
    return withRetry(async () => {
      const response = await auth_client.request({
        url,
        method,
        data: body,
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data;
    }, `${method} ${url}`);
  }

  // Raw request used by handlers that need to send a binary body
  // (Firebase Hosting file uploads, GCS resumable uploads, etc.) or
  // need to pass through non-2xx status codes (Firebase Hosting often
  // returns 409 ALREADY_EXISTS, which is success-as-adoption for us).
  async function make_request_raw(opts: {
    method: string;
    url: string;
    body?: unknown;
    contentType?: string;
    responseType?: 'json' | 'text' | 'arraybuffer';
    validateStatus?: (status: number) => boolean;
  }): Promise<{ status: number; data: any; headers: Record<string, string> }> {
    return withRetry(async () => {
      const response = await auth_client.request({
        url: opts.url,
        method: opts.method,
        data: opts.body,
        headers: { 'Content-Type': opts.contentType || 'application/json' },
        responseType: opts.responseType || 'json',
        validateStatus: opts.validateStatus || ((s: number) => s < 500),
      });
      return {
        status: response.status,
        data: response.data,
        headers: (response.headers as Record<string, string>) || {},
      };
    }, `${opts.method} ${opts.url}`);
  }

  const rc: GCPRestClient = {
    get: (url: string) => make_request('GET', url),
    post: (url: string, body: unknown) => make_request('POST', url, body),
    patch: (url: string, body: unknown) => make_request('PATCH', url, body),
    delete: (url: string) => make_request('DELETE', url),
  };
  // Attached for handlers that need full request control. Cast at the
  // call site so the GCPRestClient interface stays minimal for the
  // common case.
  (rc as any).requestRaw = make_request_raw;
  (rc as any).authClient = auth_client;
  return rc;
}
