/**
 * GCP SDK Lazy Loader
 *
 * Centralized lazy loading of all GCP SDK packages.
 * Uses dynamic import() with graceful fallback for missing packages.
 * Includes a REST client utility for services without Node.js SDKs.
 */

import { isAuthMissingError, isAuthExpiredError, AUTH_MESSAGES } from '@ice/core';
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
 * Initialize all available GCP SDK clients.
 * Returns a Map of client name → client instance.
 */
export async function initialize_gcp_clients(project: string): Promise<Map<string, unknown>> {
  const clients = new Map<string, unknown>();

  // Compute Engine
  const compute = await load_sdk('@google-cloud/compute');
  if (compute) {
    clients.set('compute.instances', new compute.InstancesClient());
    clients.set('compute.globalForwardingRules', new compute.GlobalForwardingRulesClient());
  }

  // Cloud Storage
  const storage = await load_sdk('@google-cloud/storage');
  if (storage) {
    clients.set('storage', new storage.Storage({ projectId: project }));
  }

  // Cloud Run
  const run = await load_sdk('@google-cloud/run');
  if (run) {
    clients.set('run.services', new run.ServicesClient());
    if (run.JobsClient) {
      clients.set('run.jobs', new run.JobsClient());
    }
  }

  // Pub/Sub
  const pubsub = await load_sdk('@google-cloud/pubsub');
  if (pubsub) {
    clients.set('pubsub', new pubsub.PubSub({ projectId: project }));
  }

  // Secret Manager
  const secret_manager = await load_sdk('@google-cloud/secret-manager');
  if (secret_manager) {
    clients.set('secretmanager', new secret_manager.SecretManagerServiceClient());
  }

  // BigQuery
  const bigquery = await load_sdk('@google-cloud/bigquery');
  if (bigquery) {
    clients.set('bigquery', new bigquery.BigQuery({ projectId: project }));
  }

  // Cloud Logging
  const logging = await load_sdk('@google-cloud/logging');
  if (logging) {
    clients.set('logging', new logging.Logging({ projectId: project }));
  }

  // Cloud Scheduler
  const scheduler = await load_sdk('@google-cloud/scheduler');
  if (scheduler) {
    clients.set('scheduler', new scheduler.CloudSchedulerClient());
  }

  // Cloud Functions (v2 API — FunctionServiceClient is under .v2 namespace)
  const functions = await load_sdk('@google-cloud/functions');
  if (functions) {
    const FunctionServiceClient = functions.v2?.FunctionServiceClient ?? functions.FunctionServiceClient;
    if (FunctionServiceClient) {
      clients.set('functions', new FunctionServiceClient());
    }
  }

  // Firestore
  const firestore = await load_sdk('@google-cloud/firestore');
  if (firestore) {
    clients.set('firestore', new firestore.Firestore({ projectId: project }));
  }

  // Vertex AI
  const aiplatform = await load_sdk('@google-cloud/aiplatform');
  if (aiplatform) {
    clients.set('aiplatform.endpoint', new aiplatform.EndpointServiceClient());
    if (aiplatform.IndexServiceClient) {
      clients.set('aiplatform.index', new aiplatform.IndexServiceClient());
    }
    if (aiplatform.IndexEndpointServiceClient) {
      clients.set('aiplatform.indexEndpoint', new aiplatform.IndexEndpointServiceClient());
    }
  }

  // GKE / Container
  const container = await load_sdk('@google-cloud/container');
  if (container) {
    clients.set('container', new container.ClusterManagerClient());
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
async function verify_gcp_auth(external_client?: unknown): Promise<any> {
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
export async function create_rest_client(_project: string, external_auth_client?: unknown): Promise<GCPRestClient> {
  const auth_client = await verify_gcp_auth(external_auth_client);

  async function make_request(method: string, url: string, body?: unknown): Promise<unknown> {
    const response = await auth_client.request({
      url,
      method,
      data: body,
      headers: { 'Content-Type': 'application/json' },
    });

    return response.data;
  }

  return {
    get: (url: string) => make_request('GET', url),
    post: (url: string, body: unknown) => make_request('POST', url, body),
    patch: (url: string, body: unknown) => make_request('PATCH', url, body),
    delete: (url: string) => make_request('DELETE', url),
  };
}
