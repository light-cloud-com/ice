/**
 * Kubernetes NetworkPolicy handler — `k8s.networking.networkpolicy`.
 *
 * Backs Network.SecurityGroup on Kubernetes. Default = deny-all
 * ingress / egress unless properties spell out rules.
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.networking.networkpolicy';
const SDK = '@kubernetes/client-node';

export const networkpolicy_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const networking = ctx.clients.get('networking') as any;
    if (!networking) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes networking API', SDK);
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      try {
        await networking.createNamespacedNetworkPolicy({
          namespace,
          body: {
            apiVersion: 'networking.k8s.io/v1',
            kind: 'NetworkPolicy',
            metadata: {
              name,
              namespace,
              labels: { 'app.kubernetes.io/managed-by': 'ice' },
            },
            spec: {
              podSelector: (properties.pod_selector as Record<string, unknown>) ?? { matchLabels: { app: name } },
              policyTypes: (properties.policy_types as string[]) ?? ['Ingress', 'Egress'],
              ingress: properties.ingress as unknown[] | undefined,
              egress: properties.egress as unknown[] | undefined,
            },
          },
        });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `networking.k8s.io/NetworkPolicy/${namespace}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const networking = ctx.clients.get('networking') as any;
    if (!networking) return err(name, TYPE, 'update', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      const existing = await networking.readNamespacedNetworkPolicy({ name, namespace });
      if (properties.ingress) existing.spec.ingress = properties.ingress;
      if (properties.egress) existing.spec.egress = properties.egress;
      await networking.replaceNamespacedNetworkPolicy({ name, namespace, body: existing });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const networking = ctx.clients.get('networking') as any;
    if (!networking) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await networking.deleteNamespacedNetworkPolicy({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
