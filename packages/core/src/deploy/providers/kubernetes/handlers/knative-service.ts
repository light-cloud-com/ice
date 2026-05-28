/**
 * Knative Service handler — `k8s.serving.service`.
 *
 * Backs Compute.ServerlessFunction on Kubernetes when Knative Serving
 * is installed. Scale-to-zero by default; the operator overrides via
 * `autoscaling.knative.dev/minScale` / `maxScale` annotations.
 */

import { createCrd, deleteCrd, parseCrdProviderId, replaceCrd } from './_crd';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.serving.service';
const SDK = '@kubernetes/client-node';
const REF = { group: 'serving.knative.dev', version: 'v1', plural: 'services' };

function buildKnativeBody(name: string, namespace: string, properties: Record<string, unknown>): unknown {
  const env = Object.entries((properties.env_vars as Record<string, string>) ?? {}).map(([n, value]) => ({
    name: n,
    value,
  }));
  const annotations: Record<string, string> = {};
  if (typeof properties.min_scale === 'number') {
    annotations['autoscaling.knative.dev/minScale'] = String(properties.min_scale);
  }
  if (typeof properties.max_scale === 'number') {
    annotations['autoscaling.knative.dev/maxScale'] = String(properties.max_scale);
  }
  return {
    apiVersion: 'serving.knative.dev/v1',
    kind: 'Service',
    metadata: { name, namespace, labels: { 'app.kubernetes.io/managed-by': 'ice' } },
    spec: {
      template: {
        metadata: { annotations },
        spec: {
          containers: [
            {
              image: (properties.image as string) || '',
              env: env.length ? env : undefined,
              ports: properties.port ? [{ containerPort: properties.port as number }] : undefined,
            },
          ],
        },
      },
    },
  };
}

export const knative_service_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    if (!ctx.clients.get('custom')) return sdkMissing(name, TYPE, 'create', start, 'CustomObjectsApi', SDK);
    if (!properties.image) return err(name, TYPE, 'create', start, 'Knative Service requires properties.image.');
    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const { id } = await createCrd(ctx, REF, namespace, buildKnativeBody(name, namespace, properties));
      return ok(name, TYPE, 'create', start, { provider_id: id });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    try {
      const { namespace } = parseCrdProviderId(provider_id, ctx.namespace);
      await replaceCrd(ctx, REF, namespace, name, buildKnativeBody(name, namespace, properties));
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
