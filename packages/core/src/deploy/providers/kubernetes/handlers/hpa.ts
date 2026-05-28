/**
 * Kubernetes HorizontalPodAutoscaler handler — `k8s.autoscaling.hpa`.
 *
 * Backs the auto-scale knob on Compute.Container blocks via a separate
 * canvas wiring (canvas connects an HPA block to a Deployment).
 * Uses autoscaling/v2 (CPU + memory + custom metrics).
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.autoscaling.hpa';
const SDK = '@kubernetes/client-node';

export const hpa_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const autoscaling = ctx.clients.get('autoscaling') as any;
    if (!autoscaling) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes autoscaling API', SDK);
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const target_name = (properties.target_deployment as string) || name;
      try {
        await autoscaling.createNamespacedHorizontalPodAutoscaler({
          namespace,
          body: {
            apiVersion: 'autoscaling/v2',
            kind: 'HorizontalPodAutoscaler',
            metadata: { name, namespace, labels: { 'app.kubernetes.io/managed-by': 'ice' } },
            spec: {
              scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: target_name },
              minReplicas: (properties.min_replicas as number) ?? 1,
              maxReplicas: (properties.max_replicas as number) ?? 10,
              metrics: (properties.metrics as unknown[]) ?? [
                {
                  type: 'Resource',
                  resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 70 } },
                },
              ],
            },
          },
        });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, {
        provider_id: `autoscaling/HorizontalPodAutoscaler/${namespace}/${name}`,
      });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const autoscaling = ctx.clients.get('autoscaling') as any;
    if (!autoscaling) return err(name, TYPE, 'update', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      const existing = await autoscaling.readNamespacedHorizontalPodAutoscaler({ name, namespace });
      if (typeof properties.min_replicas === 'number') existing.spec.minReplicas = properties.min_replicas;
      if (typeof properties.max_replicas === 'number') existing.spec.maxReplicas = properties.max_replicas;
      await autoscaling.replaceNamespacedHorizontalPodAutoscaler({ name, namespace, body: existing });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const autoscaling = ctx.clients.get('autoscaling') as any;
    if (!autoscaling) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await autoscaling.deleteNamespacedHorizontalPodAutoscaler({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
