/**
 * Kubernetes namespace bootstrap.
 *
 * Every K8s resource lives inside a namespace. The deployer creates
 * `ice-deploy` on demand (parallel to Azure's ice-default-rg quirk).
 */

import type { KubernetesHandlerContext } from './types';

const DEFAULT_NAMESPACE = 'ice-deploy';

/**
 * Ensure a namespace exists. Returns the resolved name so callers can
 * store it back on the context.
 */
export async function ensure_namespace(ctx: KubernetesHandlerContext): Promise<string> {
  const coreApi = ctx.clients.get('core') as any;
  if (!coreApi) throw new Error('K8s SDK not available — install @kubernetes/client-node');

  const name = ctx.namespace || DEFAULT_NAMESPACE;
  try {
    await coreApi.readNamespace({ name });
    return name;
  } catch (error) {
    const code = (error as { statusCode?: number; code?: number })?.statusCode ?? (error as { code?: number }).code;
    if (code !== 404) throw error;
  }

  ctx.on_log?.(`Creating namespace ${name}`);
  await coreApi.createNamespace({
    body: {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name,
        labels: { 'app.kubernetes.io/managed-by': 'ice' },
      },
    },
  });
  return name;
}

/**
 * Extract the namespace name from a Kubernetes-style provider_id of the
 * shape `<group>/<kind>/<namespace>/<name>` (the deployer's convention,
 * since K8s resources don't have a single global ID like ARM ids).
 */
export function extract_namespace_from_provider_id(provider_id: string, fallback: string): string {
  const parts = provider_id.split('/');
  // shape: <group>/<kind>/<namespace>/<name>
  if (parts.length === 4) return parts[2];
  return fallback;
}

export { DEFAULT_NAMESPACE };
