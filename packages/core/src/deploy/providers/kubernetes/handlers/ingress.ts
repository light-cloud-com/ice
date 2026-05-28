/**
 * Kubernetes Ingress handler — `k8s.networking.ingress`.
 *
 * Backs Network.CustomDomain on Kubernetes. The default ingress class
 * is `nginx`; operator overrides via `properties.ingress_class`. TLS
 * is operator-supplied (a `Secret` of type `kubernetes.io/tls` named
 * via `properties.tls_secret_name`); cert-manager wiring is a
 * separate `k8s.certmanager.certificate` block.
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.networking.ingress';
const SDK = '@kubernetes/client-node';

function buildIngressBody(name: string, namespace: string, properties: Record<string, unknown>): unknown {
  const host = (properties.host as string) || '';
  const service_name = (properties.service_name as string) || name;
  const service_port = (properties.service_port as number) ?? 80;
  const tls_secret = properties.tls_secret_name as string | undefined;
  const annotations: Record<string, string> = {
    ...(properties.annotations as Record<string, string>),
  };
  if (properties.cert_manager_issuer) {
    annotations['cert-manager.io/cluster-issuer'] = properties.cert_manager_issuer as string;
  }
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: { name, namespace, annotations, labels: { 'app.kubernetes.io/managed-by': 'ice' } },
    spec: {
      ingressClassName: (properties.ingress_class as string) || 'nginx',
      tls: tls_secret && host ? [{ hosts: [host], secretName: tls_secret }] : undefined,
      rules: host
        ? [
            {
              host,
              http: {
                paths: [
                  {
                    path: (properties.path as string) || '/',
                    pathType: (properties.path_type as string) || 'Prefix',
                    backend: { service: { name: service_name, port: { number: service_port } } },
                  },
                ],
              },
            },
          ]
        : [],
    },
  };
}

export const ingress_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const networking = ctx.clients.get('networking') as any;
    if (!networking) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes networking API', SDK);
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const body = buildIngressBody(name, namespace, properties);
      try {
        await networking.createNamespacedIngress({ namespace, body });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `networking.k8s.io/Ingress/${namespace}/${name}` });
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
      await networking.replaceNamespacedIngress({
        name,
        namespace,
        body: buildIngressBody(name, namespace, properties),
      });
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
      await networking.deleteNamespacedIngress({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
