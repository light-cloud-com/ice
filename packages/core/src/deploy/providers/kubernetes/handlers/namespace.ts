/**
 * Kubernetes Namespace handler — `k8s.core.namespace`.
 *
 * Backs Network.VPC on Kubernetes (logical isolation analog).
 * read-then-create on 404, replace on update, delete is a no-op when
 * already absent.
 */

import { ensure_namespace } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.core.namespace';
const SDK = '@kubernetes/client-node';

export const namespace_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes core API', SDK);

    try {
      const body = {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          name,
          labels: { 'app.kubernetes.io/managed-by': 'ice', ...(properties.labels as Record<string, string>) },
          annotations: properties.annotations as Record<string, string> | undefined,
        },
      };
      try {
        await core.createNamespace({ body });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `core/Namespace//${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return err(name, TYPE, 'update', start, 'K8s SDK not available');
    try {
      const existing = await core.readNamespace({ name });
      const merged = {
        ...existing,
        metadata: {
          ...existing.metadata,
          labels: { ...existing.metadata?.labels, ...(properties.labels as Record<string, string>) },
        },
      };
      await core.replaceNamespace({ name, body: merged });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      await core.deleteNamespace({ name });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};

// Re-export the namespace bootstrap helper so the deployer init flow
// can call it without importing two modules.
export { ensure_namespace };
