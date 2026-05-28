/**
 * ICE Deploy Types
 *
 * Types for deploying infrastructure changes directly via cloud APIs.
 */

/**
 * Result of deploying a single resource.
 */
export interface ResourceDeployResult {
  /** Resource ID from the graph */
  resource_id: string;
  /** Resource name */
  name: string;
  /** ICE resource type */
  type: string;
  /** Action performed */
  action: 'create' | 'update' | 'delete' | 'skip';
  /** Whether the action succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** URL to enable the required GCP API (set when API is not enabled) */
  api_enable_url?: string;
  /** Provider-specific resource ID after creation */
  provider_id?: string;
  /** Duration in milliseconds */
  duration_ms: number;
  /** Output properties from the resource */
  outputs?: Record<string, unknown>;
}

/**
 * Result of a deployment operation.
 */
export interface DeployResult {
  /** Whether the entire deployment succeeded */
  success: boolean;
  /** Results for each resource */
  resources: ResourceDeployResult[];
  /** Summary statistics */
  summary: DeploySummary;
  /** Provider used for deployment */
  provider: string;
  /** Timestamp when deployment started */
  started_at: string;
  /** Timestamp when deployment completed */
  completed_at: string;
  /** Total duration in milliseconds */
  duration_ms: number;
  /** Errors that caused deployment to fail */
  errors: DeployError[];
  /** Warnings during deployment */
  warnings: DeployWarning[];
}

/**
 * Summary of deployment results.
 */
export interface DeploySummary {
  total: number;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
}

/**
 * Error during deployment.
 */
export interface DeployError {
  code: string;
  message: string;
  resource_id?: string;
  recoverable: boolean;
}

/**
 * Warning during deployment.
 */
export interface DeployWarning {
  code: string;
  message: string;
  resource_id?: string;
}

/**
 * Terminal status for a node in the parallel scheduler.
 *
 * `cancelled-due-to-dep` covers two cases:
 *   1. A dependency failed (and `continue_on_error` was false, OR the
 *      cancelled node is a transitive descendant of the failure).
 *   2. The deploy was aborted via `abort_signal` before this node was
 *      dispatched.
 */
export type NodeTerminalStatus = 'succeeded' | 'failed' | 'skipped' | 'cancelled-due-to-dep';

/**
 * Lifecycle event for a single node in the parallel scheduler.
 * Fired exactly once per `(node_id, status)` pair.
 */
export interface NodeStatusEvent {
  /**
   * Graph node id (`${type}:${name}`) — the engine-internal id built by
   * `MutableGraph.add_node`. The scheduler emits `change.id` directly,
   * which is the graph id, NOT the canvas node id. The service layer
   * (pdl-4 `deploy.service.ts`) translates this to the canvas node id
   * via `translation.deployables[]` before emitting on the wire — see
   * the learning anchor `scheduler-resource-name-vs-graph-node-id-vs-canvas-node-id`
   * for why these three identifier spaces don't share an id.
   */
  node_id: string;
  /** Generated resource name (e.g. ice-foo-…). May not equal node_id. */
  resource_name: string;
  /** ICE resource type (e.g. gcp.run.service). */
  resource_type: string;
  action: 'create' | 'update' | 'delete';
  status: 'queued' | 'applying' | NodeTerminalStatus;
  /** Set on terminal status when status === 'failed'. */
  error?: { code: string; message: string; recoverable?: boolean };
  /** ISO timestamp. */
  at: string;
  /** Set on terminal status. Wall-clock duration since 'applying'. */
  duration_ms?: number;
}

/**
 * Sub-step milestone fired by handlers during long-running operations.
 * Carried through from the existing `GCPHandlerContext.on_step` channel.
 *
 * `node_id` is the graph node id (`${type}:${name}`) — same caveat as
 * {@link NodeStatusEvent}; the service layer translates it to the canvas
 * node id before emitting on the wire.
 */
export interface NodeProgressEvent {
  node_id: string;
  resource_name: string;
  step: { label: string; index: number; total: number };
  at: string;
}

/**
 * Options for deployment.
 */
export interface DeployOptions {
  /** Cloud provider to deploy to */
  provider: 'gcp' | 'aws' | 'azure' | 'kubernetes';
  /** GCP project ID (required for GCP) */
  project?: string;
  /** AWS regions (optional, defaults to all) */
  regions?: string[];
  /** Azure subscriptions (optional) */
  subscriptions?: string[];
  /** Resource groups (Azure) */
  resource_groups?: string[];
  /** Kubernetes namespaces (Kubernetes) — first entry is the default deploy target. */
  namespaces?: string[];
  /** Inline kubeconfig YAML (Kubernetes) — wins over kubeconfig_path. */
  kubeconfig_raw?: string;
  /** Path to a kubeconfig file (Kubernetes) — defaults to ~/.kube/config. */
  kubeconfig_path?: string;
  /** Target specific resources by name/type pattern */
  target?: string[];
  /** Exclude resources by name/type pattern */
  exclude?: string[];
  /**
   * Maximum parallel operations.
   * @deprecated Use `pool_size` instead. When `pool_size` is omitted, the
   *   scheduler falls back to `parallelism` for one revision. Will be
   *   removed in a future cleanup.
   */
  parallelism?: number;
  /**
   * Bounded worker pool size for the parallel scheduler. Default 6.
   * Replaces (deprecates) `parallelism`. The scheduler dispatches up to
   * `pool_size` nodes concurrently across one phase (creates, updates,
   * or deletes) of the deploy plan.
   */
  pool_size?: number;
  /**
   * Per-handler-prefix concurrency cap. Map keys are resource_type
   * prefixes (e.g. `gcp.sql.`, `gcp.redis.`) — longest match wins —
   * values are the maximum number of in-flight nodes for that prefix.
   * Defaults: `gcp.sql.* = 1`, `gcp.redis.* = 1` (Cloud SQL has a
   * 1-create-per-project-per-minute soft quota and Memorystore Redis
   * IP-range allocation fails when two creates race). Other prefixes
   * default to `pool_size`.
   */
  per_handler_caps?: Record<string, number>;
  /** Continue on errors */
  continue_on_error?: boolean;
  /** Dry run - show what would be deployed */
  dry_run?: boolean;
  /** Auto-approve without confirmation */
  auto_approve?: boolean;
  /** Progress callback. `extra.step` carries sub-step info when available,
   *  `extra.outputs` / `extra.error` are populated on completed/failed so the
   *  host can surface per-resource URLs or error text live instead of waiting
   *  for the post-deploy batch of resource_result events. */
  on_progress?: (
    resource: string,
    action: string,
    status: string,
    extra?: {
      step?: { label: string; index: number; total: number };
      outputs?: Record<string, unknown>;
      error?: string;
      provider_id?: string;
    },
  ) => void;
  /**
   * Per-node lifecycle hook. Fired exactly once per node on each
   * lifecycle transition: queued → applying → (succeeded | failed |
   * skipped | cancelled-due-to-dep).
   */
  on_node_status?: (event: NodeStatusEvent) => void;
  /**
   * Per-node milestone hook. Fired 0..N times per node by handlers
   * reporting sub-step progress (e.g. Cloud Build phases, SQL operation
   * polls). Bridged through the existing `GCPHandlerContext.on_step`
   * channel — handler signatures are unchanged.
   */
  on_node_progress?: (event: NodeProgressEvent) => void;
  /**
   * Fired exactly once per node, after `on_node_status` reaches a
   * terminal state, with the full `ResourceDeployResult`. The current
   * service-layer callsite (`deploy.service.ts:825`) passes this in but
   * the previous engine dropped it — now formalized.
   */
  on_resource_result?: (result: ResourceDeployResult) => void;
  /** Log callback for informational messages during deployment */
  on_log?: (message: string) => void;
  /** Pre-authenticated client (passed from host environment, e.g. Electron main process) */
  auth_client?: unknown;
  /** Phase 0 regression fix — absolute path to the temp SA key file the
   *  service already wrote with 0600 perms. When present, SDK clients are
   *  initialized with `{ keyFilename }` instead of falling back to ADC. */
  auth_key_file?: string;
  /** Alternative to auth_key_file: raw parsed SA key object. */
  auth_credentials?: Record<string, unknown>;
  /**
   * Abort signal from the per-card deploy lock. When fired, long-running
   * GCP operations (Cloud Build polls, operation waits, etc.) should stop
   * polling and — where the cloud API allows — actively cancel the
   * remote work so the user isn't billed for a deploy they cancelled.
   */
  abort_signal?: AbortSignal;
}

/**
 * Handler for deploying resources to a specific provider.
 */
export interface ProviderDeployer {
  /** Provider name */
  provider: string;

  /** Create a new resource */
  create(
    type: string,
    name: string,
    properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<ResourceDeployResult>;

  /** Update an existing resource */
  update(
    type: string,
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<ResourceDeployResult>;

  /** Delete a resource */
  delete(
    type: string,
    name: string,
    provider_id: string,
    options: Record<string, unknown>,
  ): Promise<ResourceDeployResult>;

  /** Initialize the deployer */
  initialize(options: DeployOptions): Promise<void>;

  /** Clean up resources */
  cleanup(): Promise<void>;
}

/**
 * State of a deployment operation.
 */
export interface DeployState {
  /** Current status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Resources being deployed */
  resources: Map<string, ResourceDeployState>;
  /** Start time */
  started_at?: string;
  /** End time */
  completed_at?: string;
}

/**
 * State of a single resource during deployment.
 */
export interface ResourceDeployState {
  resource_id: string;
  name: string;
  type: string;
  action: 'create' | 'update' | 'delete';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  provider_id?: string;
  started_at?: string;
  completed_at?: string;
}
