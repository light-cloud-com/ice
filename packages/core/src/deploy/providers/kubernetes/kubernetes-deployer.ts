/**
 * Kubernetes Deployer — Modular Dispatcher
 *
 * Routes create/update/delete calls to per-kind handler modules.
 * Same `HANDLER_REGISTRY` of `{ prefix, handler }` pairs the
 * AWS/Azure/GCP deployers use, so adding a new K8s resource type is
 * a one-file drop + one registry entry.
 *
 * Resource types follow `k8s.<api-group>.<kind>` shape (e.g.,
 * `k8s.apps.deployment`, `k8s.core.service`, `k8s.networking.ingress`).
 * The dispatch regex `/^(gcp|aws|azure|k8s)\.[a-z0-9]+\.[a-zA-Z]+$/`
 * gates the typings.
 *
 * Auth model: kubeconfig-driven. The deployer's `initialize()` accepts
 * `kubeconfig_path` or `kubeconfig_raw` via DeployOptions. In-cluster
 * service-account auto-detection fires when `KUBERNETES_SERVICE_HOST`
 * is set. See `auth.ts` + `sdk-loader.ts`.
 */

import { configmap_handler } from './handlers/configmap';
import { cronjob_handler } from './handlers/cronjob';
import { deployment_handler } from './handlers/deployment';
import { hpa_handler } from './handlers/hpa';
import { ingress_handler } from './handlers/ingress';
import { job_handler } from './handlers/job';
import { namespace_handler } from './handlers/namespace';
import { networkpolicy_handler } from './handlers/networkpolicy';
import { persistentvolumeclaim_handler } from './handlers/persistentvolumeclaim';
import { secret_handler } from './handlers/secret';
import { service_handler } from './handlers/service';
import { serviceaccount_handler } from './handlers/serviceaccount';
import { statefulset_handler } from './handlers/statefulset';
import { DEFAULT_NAMESPACE } from './namespace';
import { active_context_name, initialize_kubernetes_clients } from './sdk-loader';
import type { KubernetesHandlerContext, KubernetesResourceHandler } from './types';
import type { DeployOptions, ProviderDeployer, ResourceDeployResult } from '../../types';

// =============================================================================
// Handler registry
// =============================================================================

const HANDLER_REGISTRY: Array<{ prefix: string; handler: KubernetesResourceHandler }> = [
  // P0 — must-have
  { prefix: 'k8s.core.namespace', handler: namespace_handler },
  { prefix: 'k8s.core.secret', handler: secret_handler },
  { prefix: 'k8s.core.configmap', handler: configmap_handler },
  { prefix: 'k8s.core.persistentvolumeclaim', handler: persistentvolumeclaim_handler },
  { prefix: 'k8s.core.serviceaccount', handler: serviceaccount_handler },
  { prefix: 'k8s.core.service', handler: service_handler },
  { prefix: 'k8s.apps.deployment', handler: deployment_handler },
  { prefix: 'k8s.apps.statefulset', handler: statefulset_handler },
  { prefix: 'k8s.batch.cronjob', handler: cronjob_handler },
  { prefix: 'k8s.batch.job', handler: job_handler },
  { prefix: 'k8s.networking.ingress', handler: ingress_handler },
  { prefix: 'k8s.networking.networkpolicy', handler: networkpolicy_handler },
  { prefix: 'k8s.autoscaling.hpa', handler: hpa_handler },
];

function resolve_handler(type: string): KubernetesResourceHandler | undefined {
  for (const entry of HANDLER_REGISTRY) {
    if (type.startsWith(entry.prefix)) return entry.handler;
  }
  return undefined;
}

function unsupported(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
): ResourceDeployResult {
  const phrase = action === 'create' ? 'creation' : action === 'delete' ? 'deletion' : 'update';
  return {
    resource_id: name,
    name,
    type,
    action,
    success: false,
    error: `Unsupported resource type for ${phrase}: ${type}`,
    duration_ms: Date.now() - start,
  };
}

// =============================================================================
// KubernetesDeployer class
// =============================================================================

export interface KubernetesDeployOptions extends DeployOptions {
  /** Inline kubeconfig YAML — wins over kubeconfig_path. */
  kubeconfig_raw?: string;
  /** Path to a kubeconfig file (defaults to ~/.kube/config). */
  kubeconfig_path?: string;
}

export class KubernetesDeployer implements ProviderDeployer {
  provider = 'kubernetes';

  private ctx: KubernetesHandlerContext = {
    cluster_name: 'default',
    namespace: DEFAULT_NAMESPACE,
    clients: new Map(),
    kubeconfig: null,
  };

  async initialize(options: DeployOptions): Promise<void> {
    const opts = options as KubernetesDeployOptions;
    const namespace = (opts.namespaces?.[0] ?? DEFAULT_NAMESPACE) as string;

    try {
      const { kc, clients } = await initialize_kubernetes_clients({
        kubeconfig_raw: opts.kubeconfig_raw,
        kubeconfig_path: opts.kubeconfig_path,
      });
      this.ctx = {
        cluster_name: active_context_name(kc),
        namespace,
        clients,
        kubeconfig: kc,
        on_log: opts.on_log,
        on_step: opts.on_progress
          ? (resource, step) => opts.on_progress?.(resource, 'running', 'in-progress', { step })
          : undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to initialize Kubernetes client: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async cleanup(): Promise<void> {
    // K8s API clients don't expose a destroy hook today; nothing to release.
  }

  async create(
    type: string,
    name: string,
    properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'create', start);
    const result = await handler.create(name, properties, this.ctx);
    return { ...result, type };
  }

  async update(
    type: string,
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'update', start);
    const result = await handler.update(name, provider_id, properties, current_properties, this.ctx);
    return { ...result, type };
  }

  async delete(
    type: string,
    name: string,
    provider_id: string,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'delete', start);
    const result = await handler.delete(name, provider_id, this.ctx);
    return { ...result, type };
  }
}

export function create_kubernetes_deployer(): KubernetesDeployer {
  return new KubernetesDeployer();
}

// Export so handlers can register themselves below as they land.
export { HANDLER_REGISTRY };
