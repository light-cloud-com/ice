/**
 * Generic CRD helper for Kubernetes handlers. Wraps CustomObjectsApi
 * so per-CRD handlers stay tiny.
 *
 * The K8s API for CRDs takes (group, version, namespace, plural,
 * name?, body?) — every CRD-backed handler in this codebase follows
 * the same shape.
 */

import type { KubernetesHandlerContext } from '../types';

export interface CrdRef {
  group: string;
  version: string;
  plural: string;
}

export async function createCrd(
  ctx: KubernetesHandlerContext,
  ref: CrdRef,
  namespace: string,
  body: unknown,
): Promise<{ id: string }> {
  const custom = ctx.clients.get('custom') as any;
  if (!custom) throw new Error('CustomObjectsApi not available — install @kubernetes/client-node');
  try {
    await custom.createNamespacedCustomObject({
      group: ref.group,
      version: ref.version,
      namespace,
      plural: ref.plural,
      body,
    });
  } catch (error) {
    const code = (error as { statusCode?: number })?.statusCode ?? (error as { code?: number }).code;
    if (code !== 409) throw error;
  }
  const name = (body as { metadata?: { name?: string } }).metadata?.name ?? '';
  return { id: `${ref.group}/${ref.version}/${ref.plural}/${namespace}/${name}` };
}

export async function replaceCrd(
  ctx: KubernetesHandlerContext,
  ref: CrdRef,
  namespace: string,
  name: string,
  body: unknown,
): Promise<void> {
  const custom = ctx.clients.get('custom') as any;
  if (!custom) throw new Error('CustomObjectsApi not available');
  await custom.replaceNamespacedCustomObject({
    group: ref.group,
    version: ref.version,
    namespace,
    plural: ref.plural,
    name,
    body,
  });
}

export async function deleteCrd(
  ctx: KubernetesHandlerContext,
  ref: CrdRef,
  namespace: string,
  name: string,
): Promise<void> {
  const custom = ctx.clients.get('custom') as any;
  if (!custom) throw new Error('CustomObjectsApi not available');
  await custom.deleteNamespacedCustomObject({
    group: ref.group,
    version: ref.version,
    namespace,
    plural: ref.plural,
    name,
  });
}

/** Parse provider_id of shape `<group>/<version>/<plural>/<namespace>/<name>`. */
export function parseCrdProviderId(
  provider_id: string,
  fallbackNamespace: string,
): { namespace: string; name: string } {
  const parts = provider_id.split('/');
  if (parts.length === 5) return { namespace: parts[3] ?? fallbackNamespace, name: parts[4] ?? '' };
  return { namespace: fallbackNamespace, name: parts.pop() ?? '' };
}
