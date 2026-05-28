/**
 * Kubernetes Service handler — `k8s.core.service`.
 *
 * Backs Network.LoadBalancer (type=LoadBalancer) + the default
 * ClusterIP exposure for a sibling Deployment. The extractor projects
 * `service_type`: 'ClusterIP' | 'NodePort' | 'LoadBalancer'.
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.core.service';
const SDK = '@kubernetes/client-node';

export const service_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes core API', SDK);

    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const port = (properties.port as number) ?? 80;
      const target_port = (properties.target_port as number) ?? port;
      const selector_app = (properties.selector_app as string) || name;
      const body = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name,
          namespace,
          labels: { 'app.kubernetes.io/managed-by': 'ice', ...(properties.labels as Record<string, string>) },
          annotations: properties.annotations as Record<string, string> | undefined,
        },
        spec: {
          type: (properties.service_type as string) || 'ClusterIP',
          selector: { app: selector_app },
          ports: [{ port, targetPort: target_port, protocol: (properties.protocol as string) || 'TCP' }],
        },
      };
      try {
        await core.createNamespacedService({ namespace, body });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `core/Service/${namespace}/${name}` });
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
      const existing = await core.readNamespacedService({ name, namespace });
      if (typeof properties.port === 'number') existing.spec.ports[0].port = properties.port;
      if (typeof properties.target_port === 'number') existing.spec.ports[0].targetPort = properties.target_port;
      if (typeof properties.service_type === 'string') existing.spec.type = properties.service_type;
      await core.replaceNamespacedService({ name, namespace, body: existing });
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
      await core.deleteNamespacedService({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
