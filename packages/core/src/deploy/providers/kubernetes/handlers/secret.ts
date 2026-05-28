/**
 * Kubernetes Secret handler — `k8s.core.secret`.
 *
 * Backs Security.Secret on Kubernetes. Values are operator-supplied
 * (the deployer never invents or writes random secret material —
 * mirrors AWS Secrets Manager / Azure Key Vault contract).
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.core.secret';
const SDK = '@kubernetes/client-node';

function encodeData(data: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v == null) continue;
    out[k] = Buffer.from(String(v)).toString('base64');
  }
  return out;
}

export const secret_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const core = ctx.clients.get('core') as any;
    if (!core) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes core API', SDK);

    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const body = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: {
          name,
          namespace,
          labels: { 'app.kubernetes.io/managed-by': 'ice', ...(properties.labels as Record<string, string>) },
        },
        type: (properties.secret_type as string) || 'Opaque',
        data: properties.data ? encodeData(properties.data as Record<string, unknown>) : undefined,
        stringData: properties.string_data as Record<string, string> | undefined,
      };
      try {
        await core.createNamespacedSecret({ namespace, body });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `core/Secret/${namespace}/${name}` });
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
      await core.replaceNamespacedSecret({
        name,
        namespace,
        body: {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name, namespace, labels: properties.labels as Record<string, string> },
          type: (properties.secret_type as string) || 'Opaque',
          data: properties.data ? encodeData(properties.data as Record<string, unknown>) : undefined,
          stringData: properties.string_data as Record<string, string> | undefined,
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
      await core.deleteNamespacedSecret({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
