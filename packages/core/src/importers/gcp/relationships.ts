/**
 * GCP Relationship Inference
 *
 * Infers dependencies between GCP resources based on property references.
 */

import type { GCPImportedResource, GCPImportWarning } from './types.js';

// =============================================================================
// Relationship Inference
// =============================================================================

/**
 * Infer dependencies between resources by scanning properties for self_link references.
 */
export function infer_relationships(
  resources: GCPImportedResource[],
  warnings: GCPImportWarning[]
): void {
  // Build self_link lookup map
  const self_link_map = new Map<string, GCPImportedResource>();
  for (const resource of resources) {
    if (resource.gcp_self_link) {
      self_link_map.set(resource.gcp_self_link, resource);

      // Also add partial self_link (without https://... prefix) for matching
      const partial = extract_partial_self_link(resource.gcp_self_link);
      if (partial) {
        self_link_map.set(partial, resource);
      }
    }
  }

  // Scan each resource for dependencies
  for (const resource of resources) {
    const inferred_deps = new Set<string>();

    // Scan properties for self_link references
    scan_for_self_links(resource.properties, self_link_map, inferred_deps);

    // Update dependencies array (cast to mutable)
    const deps = resource.dependencies as string[];
    for (const dep of inferred_deps) {
      if (!deps.includes(dep)) {
        deps.push(dep);
      }
    }
  }
}

/**
 * Recursively scan properties for self_link references.
 */
function scan_for_self_links(
  obj: unknown,
  self_link_map: Map<string, GCPImportedResource>,
  deps: Set<string>
): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    // Check if this string looks like a GCP self_link or resource reference
    if (is_gcp_reference(obj)) {
      // Try to find the resource this references
      const resource = self_link_map.get(obj);
      if (resource) {
        deps.add(resource.gcp_self_link);
      } else {
        // Try partial match
        const partial = extract_partial_self_link(obj);
        if (partial) {
          const resource_by_partial = self_link_map.get(partial);
          if (resource_by_partial) {
            deps.add(resource_by_partial.gcp_self_link);
          }
        }
      }
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      scan_for_self_links(item, self_link_map, deps);
    }
  } else if (typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      scan_for_self_links(value, self_link_map, deps);
    }
  }
}

/**
 * Check if a string looks like a GCP resource reference.
 */
function is_gcp_reference(value: string): boolean {
  return (
    value.includes('compute.googleapis.com') ||
    value.includes('storage.googleapis.com') ||
    value.includes('sqladmin.googleapis.com') ||
    value.includes('container.googleapis.com') ||
    value.includes('iam.googleapis.com') ||
    value.startsWith('projects/') ||
    value.startsWith('https://www.googleapis.com')
  );
}

/**
 * Extract partial self_link for matching.
 * Converts full URL to projects/... format.
 */
function extract_partial_self_link(self_link: string): string | null {
  // Already in partial format
  if (self_link.startsWith('projects/')) {
    return self_link;
  }

  // Extract from full URL
  const match = self_link.match(/\/projects\/(.+)$/);
  if (match) {
    return `projects/${match[1]}`;
  }

  return null;
}

// =============================================================================
// Relationship Type Detection
// =============================================================================

/**
 * Get the relationship type between two resource kinds.
 */
export function get_relationship_type(
  source_kind: string,
  target_kind: string
): 'depends_on' | 'references' | 'contains' {
  // Instance dependencies
  if (source_kind === 'compute#instance') {
    if (target_kind === 'compute#network' || target_kind === 'compute#subnetwork') {
      return 'depends_on';
    }
    if (target_kind === 'compute#disk') {
      return 'depends_on';
    }
  }

  // Subnetwork -> Network
  if (source_kind === 'compute#subnetwork' && target_kind === 'compute#network') {
    return 'depends_on';
  }

  // Firewall -> Network
  if (source_kind === 'compute#firewall' && target_kind === 'compute#network') {
    return 'depends_on';
  }

  // GKE Cluster dependencies
  if (source_kind === 'container#cluster') {
    if (target_kind === 'compute#network' || target_kind === 'compute#subnetwork') {
      return 'depends_on';
    }
  }

  // Default to references
  return 'references';
}
