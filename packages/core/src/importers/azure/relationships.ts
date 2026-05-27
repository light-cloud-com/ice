/**
 * Azure Relationship Inference
 *
 * Walks every imported resource's `properties` payload looking for
 * strings that match the Azure resource-ID pattern
 * (`/subscriptions/<sub>/resourceGroups/<rg>/providers/...`). When the
 * referenced ID matches another resource's `azure_id`, the source
 * resource records the target's `azure_id` in its `dependencies` array.
 *
 * Mirror of `importers/gcp/relationships.ts` — same shape, Azure-flavoured
 * reference detection.
 */

import type { AzureImportedResource, AzureImportWarning } from './types';

const RESOURCE_ID_RE = /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\./i;

/**
 * Resource-id-shaped string predicate. Used to skip non-Azure strings
 * when scanning properties for references.
 */
function looks_like_resource_id(value: string): boolean {
  return RESOURCE_ID_RE.test(value);
}

/**
 * Infer dependencies by scanning properties for resource-id references.
 * Mutates `resource.dependencies` in place.
 */
export function infer_relationships(resources: AzureImportedResource[], _warnings: AzureImportWarning[]): void {
  const id_map = new Map<string, AzureImportedResource>();
  for (const r of resources) {
    if (r.azure_id) {
      id_map.set(r.azure_id, r);
      id_map.set(r.azure_id.toLowerCase(), r);
    }
  }

  for (const r of resources) {
    const found = new Set<string>();
    scan_for_references(r.properties, id_map, found, r.azure_id);
    const deps = r.dependencies as string[];
    for (const dep of found) {
      if (!deps.includes(dep)) deps.push(dep);
    }
  }
}

function scan_for_references(
  node: unknown,
  id_map: Map<string, AzureImportedResource>,
  out: Set<string>,
  self_id: string,
): void {
  if (node == null) return;
  if (typeof node === 'string') {
    if (looks_like_resource_id(node)) {
      const hit = id_map.get(node) ?? id_map.get(node.toLowerCase());
      if (hit && hit.azure_id !== self_id) {
        out.add(hit.azure_id);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) scan_for_references(item, id_map, out, self_id);
    return;
  }
  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      scan_for_references(value, id_map, out, self_id);
    }
  }
}
