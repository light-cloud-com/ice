/**
 * Kubernetes PVC handler — `k8s.core.persistentvolumeclaim`.
 *
 * Backs Storage.Bucket on Kubernetes (block-storage-via-PVC analog).
 * The actual backing volume comes from the cluster's default
 * StorageClass unless `properties.storage_class` is set.
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.core.persistentvolumeclaim';
const SDK = '@kubernetes/client-node';

export const persistentvolumeclaim_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes core API', SDK);

    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const size = (properties.size_gi as number) ?? 10;
      try {
        await core.createNamespacedPersistentVolumeClaim({
          namespace,
          body: {
            apiVersion: 'v1',
            kind: 'PersistentVolumeClaim',
            metadata: {
              name,
              namespace,
              labels: { 'app.kubernetes.io/managed-by': 'ice', ...(properties.labels as Record<string, string>) },
            },
            spec: {
              accessModes: (properties.access_modes as string[]) ?? ['ReadWriteOnce'],
              storageClassName: properties.storage_class as string | undefined,
              resources: { requests: { storage: `${size}Gi` } },
            },
          },
        });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `core/PersistentVolumeClaim/${namespace}/${name}` });
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
      // PVCs are mostly immutable; the supported mutation is volume
      // expansion when StorageClass.allowVolumeExpansion is true.
      if (typeof properties.size_gi === 'number') {
        const existing = await core.readNamespacedPersistentVolumeClaim({ name, namespace });
        existing.spec.resources.requests.storage = `${properties.size_gi}Gi`;
        await core.replaceNamespacedPersistentVolumeClaim({ name, namespace, body: existing });
      }
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
      await core.deleteNamespacedPersistentVolumeClaim({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
