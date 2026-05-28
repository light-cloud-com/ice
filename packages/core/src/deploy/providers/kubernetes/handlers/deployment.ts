/**
 * Kubernetes Deployment handler — `k8s.apps.deployment`.
 *
 * Backs Compute.Container / Compute.BackendAPI / Compute.Worker on
 * Kubernetes. Worker variant: `properties.service_type === 'worker'`
 * — no Service is created (a sibling `k8s.core.service` block handles
 * exposure for non-worker variants).
 */

import { extract_namespace_from_provider_id } from '../namespace';
import { err, isK8sNotFound, ok, sdkMissing } from './_result';
import type { KubernetesResourceHandler } from '../types';

const TYPE = 'k8s.apps.deployment';
const SDK = '@kubernetes/client-node';

function buildContainer(properties: Record<string, unknown>): unknown {
  const env = Object.entries((properties.env_vars as Record<string, string>) ?? {}).map(([n, value]) => ({
    name: n,
    value,
  }));
  return {
    name: (properties.container_name as string) || 'app',
    image: (properties.image as string) || '',
    imagePullPolicy: (properties.image_pull_policy as string) || 'IfNotPresent',
    ports: properties.port ? [{ containerPort: properties.port as number }] : undefined,
    env: env.length ? env : undefined,
    resources: {
      requests: {
        cpu: (properties.cpu_request as string) || '100m',
        memory: (properties.memory_request as string) || '128Mi',
      },
      limits: {
        cpu: (properties.cpu_limit as string) || '1',
        memory: (properties.memory_limit as string) || '512Mi',
      },
    },
  };
}

export const deployment_handler: KubernetesResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const apps = ctx.clients.get('apps') as any;
    if (!apps) return sdkMissing(name, TYPE, 'create', start, 'Kubernetes apps API', SDK);

    if (!properties.image) {
      return err(name, TYPE, 'create', start, 'Deployment requires properties.image (container image reference).');
    }

    try {
      const namespace = (properties.namespace as string) || ctx.namespace;
      const replicas = (properties.replicas as number) ?? 1;
      const labels = {
        app: name,
        'app.kubernetes.io/managed-by': 'ice',
        ...(properties.labels as Record<string, string>),
      };
      const body = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name, namespace, labels },
        spec: {
          replicas,
          selector: { matchLabels: { app: name } },
          template: {
            metadata: { labels },
            spec: {
              containers: [buildContainer(properties)],
              serviceAccountName: properties.service_account as string | undefined,
            },
          },
        },
      };
      try {
        await apps.createNamespacedDeployment({ namespace, body });
      } catch (error) {
        const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
        if (code !== 409) throw error;
      }
      return ok(name, TYPE, 'create', start, { provider_id: `apps/Deployment/${namespace}/${name}` });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const apps = ctx.clients.get('apps') as any;
    if (!apps) return err(name, TYPE, 'update', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      const existing = await apps.readNamespacedDeployment({ name, namespace });
      existing.spec.template.spec.containers[0] = buildContainer(properties);
      if (typeof properties.replicas === 'number') existing.spec.replicas = properties.replicas;
      await apps.replaceNamespacedDeployment({ name, namespace, body: existing });
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, provider_id, ctx) {
    const start = Date.now();
    const apps = ctx.clients.get('apps') as any;
    if (!apps) return err(name, TYPE, 'delete', start, 'K8s SDK not available');
    try {
      const namespace = extract_namespace_from_provider_id(provider_id, ctx.namespace);
      await apps.deleteNamespacedDeployment({ name, namespace });
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      if (isK8sNotFound(error)) return ok(name, TYPE, 'delete', start);
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
