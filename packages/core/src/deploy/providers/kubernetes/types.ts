/**
 * Kubernetes Deployer Types
 *
 * Shared interfaces for all Kubernetes resource handlers. Parallel to
 * the AWS / Azure / GCP equivalents — same dispatch shape, same
 * `<provider>HandlerContext` + `<provider>ResourceHandler` pair.
 *
 * K8s differs from cloud-provider deployers in two ways:
 *   1. No region/project scoping — context is `cluster_name` + `namespace`.
 *   2. Apply semantics: most handlers read-then-replace (or create on 404)
 *      so re-runs are idempotent without operator-side diffing.
 */

import type { ResourceDeployResult } from '../../types';

/**
 * Context passed to every Kubernetes resource handler.
 */
export interface KubernetesHandlerContext {
  /** Active kubeconfig context name (informational; the loaded clients already point at it). */
  cluster_name: string;
  /** Default namespace — auto-created via `ensure_namespace` if missing. Operator-supplied via DeployOptions.namespaces[0]. */
  namespace: string;
  /**
   * Lazy-loaded typed K8s API clients keyed by short-name. Handlers
   * `ctx.clients.get('apps')` (AppsV1Api), `ctx.clients.get('core')`
   * (CoreV1Api), `ctx.clients.get('networking')` (NetworkingV1Api),
   * `ctx.clients.get('batch')` (BatchV1Api), `ctx.clients.get('autoscaling')`
   * (AutoscalingV2Api), or `ctx.clients.get('custom')` (CustomObjectsApi)
   * for CRDs (cert-manager, Knative, Prometheus, KServe).
   *
   * Returns `undefined` when `@kubernetes/client-node` isn't installed.
   * Handlers guard with a friendly error message.
   */
  clients: Map<string, unknown>;
  /** The lazy-loaded KubeConfig instance — handlers reach into this for CRD-by-GVR access. */
  kubeconfig: unknown;
  /** Optional log callback. */
  on_log?: (message: string) => void;
  /** Optional sub-step progress reporter for poll loops (rollout status etc). */
  on_step?: (resource: string, step: { label: string; index: number; total: number }) => void;
  /** User-cancel signal from the per-card deploy lock. */
  abort_signal?: AbortSignal;
}

/**
 * Interface every Kubernetes resource handler implements. Identical
 * shape to AWS / Azure / GCP so the dispatch surface stays uniform.
 */
export interface KubernetesResourceHandler {
  create(
    name: string,
    properties: Record<string, unknown>,
    ctx: KubernetesHandlerContext,
  ): Promise<ResourceDeployResult>;
  update(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    ctx: KubernetesHandlerContext,
  ): Promise<ResourceDeployResult>;
  delete(name: string, provider_id: string, ctx: KubernetesHandlerContext): Promise<ResourceDeployResult>;
}
