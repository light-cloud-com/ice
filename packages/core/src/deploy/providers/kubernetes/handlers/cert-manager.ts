/**
 * cert-manager Certificate handler — `k8s.certmanager.certificate`.
 *
 * Backs Security.Certificate on Kubernetes when cert-manager is
 * installed in the cluster. CRD: cert-manager.io/v1/Certificate.
 */

import { createCrd, deleteCrd, parseCrdProviderId, replaceCrd } from './_crd';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.certmanager.certificate';
const SDK = '@kubernetes/client-node';
const REF = { group: 'cert-manager.io', version: 'v1', plural: 'certificates' };

function buildCertBody(name: string, namespace: string, properties: Record<string, unknown>): unknown {
  return {
    apiVersion: 'cert-manager.io/v1',
    kind: 'Certificate',
    metadata: { name, namespace, labels: { 'app.kubernetes.io/managed-by': 'ice' } },
    spec: {
      secretName: (properties.secret_name as string) || `${name}-tls`,
      duration: (properties.duration as string) || '2160h',
      renewBefore: (properties.renew_before as string) || '360h',
      dnsNames: (properties.dns_names as string[]) ?? (properties.domain ? [properties.domain as string] : []),
      issuerRef: {
        name: (properties.issuer_name as string) || 'letsencrypt-prod',
        kind: (properties.issuer_kind as string) || 'ClusterIssuer',
        group: 'cert-manager.io',
      },
    },
  };
}

export const cert_manager_certificate_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.clients.get('custom')) return sdkMissing(name, TYPE, 'create', start, 'CustomObjectsApi', SDK);
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const { id } = await createCrd(ctx, REF, namespace, buildCertBody(name, namespace, properties));
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    try {
      const { namespace } = parseCrdProviderId(provider_id, ctx.namespace);
      await replaceCrd(ctx, REF, namespace, name, buildCertBody(name, namespace, properties));
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    try {
      const { namespace } = parseCrdProviderId(provider_id, ctx.namespace);
      await deleteCrd(ctx, REF, namespace, name);
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
