/**
 * Kubernetes ServiceAccount handler — `k8s.core.serviceaccount`.
 *
 * Backs Security.Identity on Kubernetes. RBAC bindings are
 * sub-blocks (RoleBinding / ClusterRoleBinding) — out of scope today.
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.core.serviceaccount';
const SDK = '@kubernetes/client-node';

export const serviceaccount_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes core API', SDK);
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      try {
        await core.createNamespacedServiceAccount({
          namespace,
          body: {
            apiVersion: 'v1',
            kind: 'ServiceAccount',
            metadata: {
              name,
              namespace,
              labels: { 'app.kubernetes.io/managed-by': 'ice', ...(properties.labels as Record<string, string>) },
              annotations: properties.annotations as Record<string, string> | undefined,
            },
            automountServiceAccountToken: properties.automount_token !== false,
          },
        });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `core/ServiceAccount/${namespace}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, _properties, _current, _ctx) {
    return ok(name, TYPE, 'update', Date.now(), { provider_id });
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await core.deleteNamespacedServiceAccount({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
