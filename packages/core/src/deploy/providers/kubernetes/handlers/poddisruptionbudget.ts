/**
 * PodDisruptionBudget handler — `k8s.policy.poddisruptionbudget`.
 *
 * Reliability hardening for Compute.Container blocks — guarantees a
 * minimum number of pods stay available during voluntary disruptions.
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.policy.poddisruptionbudget';
const SDK = '@kubernetes/client-node';

function buildPdbBody(name: string, namespace: string, properties: Record<string, unknown>): unknown {
  return {
    apiVersion: 'policy/v1',
    kind: 'PodDisruptionBudget',
    metadata: { name, namespace, labels: { 'app.kubernetes.io/managed-by': 'ice' } },
    spec: {
      minAvailable: (properties.min_available as number | string) ?? '50%',
      selector: { matchLabels: (properties.match_labels as Record<string, string>) ?? { app: name } },
    },
  };
}

export const poddisruptionbudget_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const policy = ctx.clients.get('policy') as any;
    if (!policy) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes policy API', SDK);
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      try {
        await policy.createNamespacedPodDisruptionBudget({
          namespace,
          body: buildPdbBody(name, namespace, properties),
        });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `policy/PodDisruptionBudget/${namespace}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const policy = ctx.clients.get('policy') as any;
    if (!policy) return err(name, TYPE, 'update', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await policy.replaceNamespacedPodDisruptionBudget({
        name,
        namespace,
        body: buildPdbBody(name, namespace, properties),
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const policy = ctx.clients.get('policy') as any;
    if (!policy) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await policy.deleteNamespacedPodDisruptionBudget({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
