/**
 * GCP Deployer — Modular Dispatcher
 *
 * Routes create/update/delete calls to per-service handler modules.
 * Replaces the monolithic gcp-deployer.ts with a scalable architecture.
 */

// Import handlers
import { api_gateway_handler } from './handlers/api-gateway.js';
import { backend_bucket_handler } from './handlers/backend-bucket.js';
import { bigquery_handler } from './handlers/bigquery.js';
import { cloud_armor_handler } from './handlers/cloud-armor.js';
import { cloud_functions_handler } from './handlers/cloud-functions.js';
import { cloud_run_handler } from './handlers/cloud-run.js';
import { cloud_scheduler_handler } from './handlers/cloud-scheduler.js';
import { cloud_sql_handler } from './handlers/cloud-sql.js';
import { cloud_storage_handler } from './handlers/cloud-storage.js';
import { dataflow_handler } from './handlers/dataflow.js';
import { discovery_engine_handler } from './handlers/discovery-engine.js';
import { domain_mapping_handler } from './handlers/domain-mapping.js';
import { firebase_hosting_handler } from './handlers/firebase-hosting.js';
import { firestore_handler } from './handlers/firestore.js';
import { gke_handler } from './handlers/gke.js';
import { identity_platform_handler } from './handlers/identity-platform.js';
import { load_balancer_handler } from './handlers/load-balancer.js';
import { logging_handler } from './handlers/logging.js';
import { managed_ssl_certificate_handler } from './handlers/managed-ssl-certificate.js';
import { memorystore_handler } from './handlers/memorystore.js';
import { pubsub_handler } from './handlers/pubsub.js';
import { secret_manager_handler } from './handlers/secret-manager.js';
import { subnet_handler } from './handlers/subnet.js';
import { vpc_handler } from './handlers/vpc.js';
import { isApiNotEnabledError, isResourceNotFoundError, extractApiName, buildApiEnableUrl } from './messages.js';
import { GCP_DEPLOYER_MESSAGES } from '../../messages.js';
import { vertex_ai_handler } from './handlers/vertex-ai.js';
import { initialize_gcp_clients, create_rest_client } from './sdk-loader.js';
import type { GCPHandlerContext, GCPResourceHandler } from './types.js';
import type { DeployOptions, ResourceDeployResult, ProviderDeployer } from '../../types.js';

// =============================================================================
// GCP API name mapping — resource type prefix → googleapis.com service name
// =============================================================================

const API_FOR_TYPE: Record<string, string> = {
  'gcp.run.domainMapping': 'run.googleapis.com',
  'gcp.run.': 'run.googleapis.com',
  'gcp.sql.': 'sqladmin.googleapis.com',
  'gcp.cloudfunctions.': 'cloudfunctions.googleapis.com',
  'gcp.cloudscheduler.': 'cloudscheduler.googleapis.com',
  'gcp.storage.': 'storage.googleapis.com',
  'gcp.pubsub.': 'pubsub.googleapis.com',
  'gcp.firestore.': 'firestore.googleapis.com',
  'gcp.redis.': 'redis.googleapis.com',
  'gcp.secretmanager.': 'secretmanager.googleapis.com',
  'gcp.identityplatform.': 'identitytoolkit.googleapis.com',
  'gcp.bigquery.': 'bigquery.googleapis.com',
  'gcp.apigateway.': 'apigateway.googleapis.com',
  'gcp.compute.': 'compute.googleapis.com',
  'gcp.logging.': 'logging.googleapis.com',
  'gcp.aiplatform.': 'aiplatform.googleapis.com',
  'gcp.dataflow.': 'dataflow.googleapis.com',
  'gcp.discoveryengine.': 'discoveryengine.googleapis.com',
  'gcp.container.': 'container.googleapis.com',
  // Firebase Hosting needs both APIs. The dispatcher only resolves one
  // per type prefix, so we list the Hosting API here (the more specific
  // longer prefix wins). The Firebase Management API is added to the
  // service-level requiredApis list in deploy.service.ts so it's enabled
  // BEFORE the handler runs (which is when we'd otherwise hit the 403).
  'gcp.firebase.hosting': 'firebasehosting.googleapis.com',
  'gcp.firebase.': 'firebase.googleapis.com',
};

// =============================================================================
// Handler registry — maps type prefixes to handlers
// =============================================================================

const HANDLER_REGISTRY: Array<{ prefix: string; handler: GCPResourceHandler }> = [
  // Cloud Run Domain Mapping (must precede generic gcp.run. prefix)
  { prefix: 'gcp.run.domainMapping', handler: domain_mapping_handler },
  // Cloud Run (services and jobs)
  { prefix: 'gcp.run.', handler: cloud_run_handler },
  // Cloud SQL
  { prefix: 'gcp.sql.', handler: cloud_sql_handler },
  // Cloud Functions
  { prefix: 'gcp.cloudfunctions.', handler: cloud_functions_handler },
  // Cloud Scheduler
  { prefix: 'gcp.cloudscheduler.', handler: cloud_scheduler_handler },
  // Cloud Storage
  { prefix: 'gcp.storage.', handler: cloud_storage_handler },
  // Pub/Sub
  { prefix: 'gcp.pubsub.', handler: pubsub_handler },
  // Firestore
  { prefix: 'gcp.firestore.', handler: firestore_handler },
  // Memorystore Redis
  { prefix: 'gcp.redis.', handler: memorystore_handler },
  // Secret Manager
  { prefix: 'gcp.secretmanager.', handler: secret_manager_handler },
  // Identity Platform
  { prefix: 'gcp.identityplatform.', handler: identity_platform_handler },
  // BigQuery
  { prefix: 'gcp.bigquery.', handler: bigquery_handler },
  // API Gateway
  { prefix: 'gcp.apigateway.', handler: api_gateway_handler },
  // Phase 8 — specific compute handlers must precede the generic prefix.
  // Managed SSL certificate (Custom Domain block)
  { prefix: 'gcp.compute.managedSslCertificate', handler: managed_ssl_certificate_handler },
  // Backend bucket (static site wiring)
  { prefix: 'gcp.compute.backendBucket', handler: backend_bucket_handler },
  // VPC, Subnet, Cloud Armor — specific routes must precede the catch-all
  { prefix: 'gcp.compute.network', handler: vpc_handler },
  { prefix: 'gcp.compute.subnetwork', handler: subnet_handler },
  { prefix: 'gcp.compute.securityPolicy', handler: cloud_armor_handler },
  // Compute (load balancer, forwarding rules, fallthrough for everything else)
  { prefix: 'gcp.compute.', handler: load_balancer_handler },
  // Cloud Logging
  { prefix: 'gcp.logging.', handler: logging_handler },
  // Vertex AI
  { prefix: 'gcp.aiplatform.', handler: vertex_ai_handler },
  // Dataflow
  { prefix: 'gcp.dataflow.', handler: dataflow_handler },
  // Discovery Engine
  { prefix: 'gcp.discoveryengine.', handler: discovery_engine_handler },
  // GKE
  { prefix: 'gcp.container.', handler: gke_handler },
  // Firebase Hosting (static site preferred path on GCP)
  { prefix: 'gcp.firebase.hosting', handler: firebase_hosting_handler },
];

// =============================================================================
// GCPDeployer class
// =============================================================================

export class GCPDeployer implements ProviderDeployer {
  provider = 'gcp';

  private ctx: GCPHandlerContext | null = null;
  private on_log?: (message: string) => void;
  private on_progress?: (
    resource: string,
    action: string,
    status: string,
    extra?: { step?: { label: string; index: number; total: number } },
  ) => void;

  async initialize(options: DeployOptions): Promise<void> {
    this.on_log = options.on_log;
    this.on_progress = options.on_progress;
    if (!options.project) {
      throw new Error(GCP_DEPLOYER_MESSAGES.PROJECT_REQUIRED);
    }

    const project = options.project;
    const region = options.regions?.[0] || 'us-central1';

    // Initialize SDK clients and REST client in parallel.
    //
    // The SDK clients accept scoped auth via keyFilename / credentials /
    // authClient. We prefer `keyFilename` because every Google Cloud Node
    // SDK accepts it consistently; the earlier attempt to pass a resolved
    // auth client didn't work for `@google-cloud/storage` because its
    // constructor expects a GoogleAuth factory, not a sub-client.
    // `deploy.service.ts` writes the SA key to a 0600 temp file and passes
    // the path via `options.auth_key_file`.
    //
    // The REST client keeps using the already-resolved `auth_client`
    // because it only needs an authorized `request()` method.
    const [clients, rest_client] = await Promise.all([
      initialize_gcp_clients(project, {
        keyFilename: options.auth_key_file,
        credentials: options.auth_credentials,
        authClient: options.auth_client,
      }),
      create_rest_client(project, options.auth_client),
    ]);

    this.ctx = {
      project,
      region,
      clients,
      rest_client,
      on_log: options.on_log,
      // Phase 2: forward sub-step events from handlers up to the service.
      on_step: (resource, step) => {
        this.on_progress?.(resource, 'create', 'step', { step });
      },
      abort_signal: options.abort_signal,
    };
  }

  async cleanup(): Promise<void> {
    this.ctx = null;
  }

  async create(
    type: string,
    name: string,
    properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    return this.dispatch('create', type, name, properties, '', {}, options);
  }

  async update(
    type: string,
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    return this.dispatch('update', type, name, properties, provider_id, current_properties, options);
  }

  async delete(
    type: string,
    name: string,
    provider_id: string,
    options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    return this.dispatch('delete', type, name, {}, provider_id, {}, options);
  }

  /**
   * Phase 7 — describe a resource for drift detection. Returns
   * `{ exists: false }` for resource types whose handlers don't implement
   * describe yet, which the caller treats as "drift detection unavailable."
   */
  async describe(
    type: string,
    name: string,
    provider_id: string,
  ): Promise<{ exists: boolean; properties?: Record<string, unknown>; error?: string; supported: boolean }> {
    if (!this.ctx) return { exists: false, supported: false, error: 'Deployer not initialized' };
    const handler = this.get_handler(type);
    if (!handler || typeof handler.describe !== 'function') {
      return { exists: false, supported: false };
    }
    const result = await handler.describe(name, provider_id, this.ctx);
    return { ...result, supported: true };
  }

  // ==========================================================================
  // Dispatch to handler (with auto-enable API on PERMISSION_DENIED)
  // ==========================================================================

  private async dispatch(
    action: 'create' | 'update' | 'delete',
    type: string,
    name: string,
    properties: Record<string, unknown>,
    provider_id: string,
    current_properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    if (!this.ctx) {
      return {
        resource_id: name,
        name,
        type,
        action,
        success: false,
        error: GCP_DEPLOYER_MESSAGES.NOT_INITIALIZED,
        duration_ms: 0,
      };
    }

    const handler = this.get_handler(type);
    if (!handler) {
      return {
        resource_id: name,
        name,
        type,
        action,
        success: false,
        error: GCP_DEPLOYER_MESSAGES.UNSUPPORTED_TYPE(type),
        duration_ms: 0,
      };
    }

    // First attempt
    let result = await this.call_handler(handler, action, name, properties, provider_id, current_properties);

    // Generic delete-not-found tolerance: a delete that finds the
    // resource missing has effectively achieved its goal — flip it to
    // success so partial-failure retries don't keep marking the same
    // already-gone resource as failed forever. Each handler is supposed
    // to do this individually, but human-readable GCP error text comes
    // in many flavors ("was not found", "NOT_FOUND", "404", "notFound",
    // "does not exist") and at least one handler missed it on the user
    // report that triggered this fix. Centralizing keeps every handler
    // covered automatically.
    if (action === 'delete' && !result.success && isResourceNotFoundError(result.error)) {
      this.on_log?.(`[gcp-deployer] ${type} '${name}' was already gone — treating delete as success.`);
      result = {
        ...result,
        success: true,
        error: undefined,
      };
    }

    // Auto-enable API and retry on PERMISSION_DENIED / "API not enabled"
    if (!result.success && isApiNotEnabledError(result.error)) {
      const api_name = extractApiName(result.error) || this.get_api_for_type(type);
      if (api_name) {
        this.on_log?.(GCP_DEPLOYER_MESSAGES.API_NOT_ENABLED_ATTEMPTING(api_name));
        const enable_result = await this.enable_api(api_name);
        if (enable_result.ok) {
          this.on_log?.(GCP_DEPLOYER_MESSAGES.API_ENABLED_RETRYING(api_name));
          result = await this.call_handler(handler, action, name, properties, provider_id, current_properties);
        } else {
          // Enrich the error with the console URL and enable instructions
          const project = this.ctx!.project;
          const console_url = buildApiEnableUrl(api_name, project);
          result.error = GCP_DEPLOYER_MESSAGES.API_NOT_ENABLED_MANUAL(
            api_name,
            enable_result.reason || '',
            console_url,
          );
          result.api_enable_url = console_url;
          this.on_log?.(GCP_DEPLOYER_MESSAGES.AUTO_ENABLE_FAILED(api_name));
        }
      }
    }

    return result;
  }

  private async call_handler(
    handler: GCPResourceHandler,
    action: 'create' | 'update' | 'delete',
    name: string,
    properties: Record<string, unknown>,
    provider_id: string,
    current_properties: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    switch (action) {
      case 'create':
        return handler.create(name, properties, this.ctx!);
      case 'update':
        return handler.update(name, provider_id, properties, current_properties, this.ctx!);
      case 'delete':
        return handler.delete(name, provider_id, this.ctx!);
    }
  }

  /**
   * Enable a GCP API using the Service Usage REST API.
   * Waits for the operation to complete (up to 60s).
   */
  private async enable_api(api_name: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.ctx) return { ok: false, reason: GCP_DEPLOYER_MESSAGES.DEPLOYER_NOT_INITIALIZED };

    try {
      const url = `https://serviceusage.googleapis.com/v1/projects/${this.ctx.project}/services/${api_name}:enable`;
      const response = (await this.ctx.rest_client.post(url, {})) as any;

      // The response is a long-running operation — poll until done
      if (response?.name) {
        await this.wait_for_operation(response.name);
      }

      // Give GCP a moment to propagate the enablement
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return { ok: true };
    } catch (err: any) {
      const msg = err?.message || String(err);
      let reason: string = GCP_DEPLOYER_MESSAGES.ENABLE_REASON_INSUFFICIENT_PERMISSIONS;
      if (msg.includes('PERMISSION_DENIED')) {
        reason = GCP_DEPLOYER_MESSAGES.ENABLE_REASON_LACKS_PERMISSION;
      } else if (msg.includes('serviceusage') && msg.includes('not been used')) {
        reason = GCP_DEPLOYER_MESSAGES.ENABLE_REASON_SERVICE_USAGE_NOT_ENABLED;
      } else if (msg.includes('403')) {
        reason = GCP_DEPLOYER_MESSAGES.ENABLE_REASON_ACCESS_DENIED;
      }
      return { ok: false, reason };
    }
  }

  /**
   * Poll a long-running operation until it completes (max 60s).
   */
  private async wait_for_operation(operation_name: string): Promise<void> {
    if (!this.ctx) return;
    const deadline = Date.now() + 60_000;
    const poll_url = `https://serviceusage.googleapis.com/v1/${operation_name}`;

    while (Date.now() < deadline) {
      try {
        const op = (await this.ctx.rest_client.get(poll_url)) as any;
        if (op?.done) return;
      } catch {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  private get_api_for_type(type: string): string | null {
    for (const [prefix, api] of Object.entries(API_FOR_TYPE)) {
      if (type.startsWith(prefix)) return api;
    }
    return null;
  }

  private get_handler(type: string): GCPResourceHandler | null {
    for (const { prefix, handler } of HANDLER_REGISTRY) {
      if (type.startsWith(prefix)) {
        return handler;
      }
    }
    return null;
  }
}

/**
 * Create a GCP deployer instance.
 */
export function create_gcp_deployer(): GCPDeployer {
  return new GCPDeployer();
}

// Detection functions (isApiNotEnabledError, extractApiName) imported from ../../messages.js
