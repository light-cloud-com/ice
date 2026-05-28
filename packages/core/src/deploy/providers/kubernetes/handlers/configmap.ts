/**
 * Kubernetes ConfigMap handler — `k8s.core.configmap`.
 *
 * Backs Config.ConfigMap. Strings only — binary data goes through
 * Secret with `secret_type: 'Opaque'`.
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.core.configmap';
const SDK = '@kubernetes/client-node';

export const configmap_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes core API', SDK);

    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      try {
        await core.createNamespacedConfigMap({
          namespace,
          body: {
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: {
              name,
              namespace,
              labels: { 'app.kubernetes.io/managed-by': 'ice', ...(properties.labels as Record<string, string>) },
            },
            data: properties.data as Record<string, string> | undefined,
          },
        });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `core/ConfigMap/${namespace}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return err(name, TYPE, 'update', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await core.replaceNamespacedConfigMap({
        name,
        namespace,
        body: {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name, namespace, labels: properties.labels as Record<string, string> },
          data: properties.data as Record<string, string> | undefined,
        },
      });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await core.deleteNamespacedConfigMap({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
