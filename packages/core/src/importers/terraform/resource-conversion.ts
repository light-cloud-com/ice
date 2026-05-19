/**
 * Terraform Resource Conversion
 *
 * Converts a single Terraform `(resource, instance)` pair into the
 * provider-agnostic `ImportedResource`, plus the post-pass that infers
 * cross-resource dependencies from in-property ID/ARN strings.
 */

import { mask_sensitive_attributes } from './sensitive';
import { get_ice_type, get_ice_provider, map_properties } from './type-mapper';
import type { TerraformImportOptions } from './state-importer';
import type { TerraformResource, TerraformResourceInstance, ImportedResource, ImportWarning } from './types';

type ResolvedOptions = Required<Omit<TerraformImportOptions, 'target_graph'>>;

/**
 * Import a single resource instance.
 *
 * Builds the Terraform address from `module.type.name[index_key]`
 * (each component optional) and an ICE name with the same suffix when
 * the instance carries an index_key.
 *
 * Property processing:
 *   - Runs `map_properties(type, attributes)` to apply provider-specific
 *     attribute renames.
 *   - When `sensitive_attributes` is non-empty AND
 *     `options.include_sensitive` is false, runs the masker and emits a
 *     SENSITIVE_MASKED warning.
 *   - Explicit `instance.dependencies` are passed through verbatim
 *     (the inferred-deps pass adds the rest).
 *
 * `warnings` is mutated to record SENSITIVE_MASKED.
 */
export function import_resource_instance(
  resource: TerraformResource,
  instance: TerraformResourceInstance,
  options: ResolvedOptions,
  warnings: ImportWarning[],
): ImportedResource {
  const terraform_type = resource.type;
  const ice_type = get_ice_type(terraform_type);
  const provider = get_ice_provider(resource.provider);

  // Build the Terraform address
  let address = `${resource.type}.${resource.name}`;
  if (resource.module) {
    address = `${resource.module}.${address}`;
  }
  if (instance.index_key !== undefined) {
    address = `${address}[${JSON.stringify(instance.index_key)}]`;
  }

  // Build the ICE name
  let name = resource.name;
  if (options.name_prefix) {
    name = `${options.name_prefix}${name}`;
  }
  if (instance.index_key !== undefined) {
    name = `${name}_${instance.index_key}`;
  }

  // Process attributes
  let properties = map_properties(terraform_type, instance.attributes);

  // Handle sensitive attributes
  const sensitive_attributes = instance.sensitive_attributes ?? [];
  if (!options.include_sensitive && sensitive_attributes.length > 0) {
    properties = mask_sensitive_attributes(properties, sensitive_attributes);
    if (sensitive_attributes.length > 0) {
      warnings.push({
        code: 'SENSITIVE_MASKED',
        message: `Masked ${sensitive_attributes.length} sensitive attributes`,
        resource: address,
      });
    }
  }

  // Extract explicit dependencies
  const dependencies = (instance.dependencies ?? []).map((dep) => {
    // Convert Terraform address to ICE reference format
    return dep;
  });

  return {
    terraform_address: address,
    terraform_type,
    ice_type,
    name,
    properties,
    dependencies,
    provider,
    module: resource.module,
    index_key: instance.index_key,
    sensitive_attributes,
  };
}

/**
 * Infer dependencies from attribute references.
 *
 * Builds a lookup of `id` and `arn` -> `terraform_address`, then walks
 * each resource's properties looking for string values that match a
 * known ID/ARN.  Matched references become entries in
 * `resource.dependencies`, dedup'd via a Set seeded from the existing
 * explicit dependencies.
 *
 * Mutates each resource's `dependencies` array in place (drains the
 * existing entries and rewrites with the deduped union of explicit +
 * inferred).
 */
export function infer_dependencies(resources: ImportedResource[], _warnings: ImportWarning[]): void {
  // Build a lookup map of resource addresses and their IDs
  const resource_lookup = new Map<string, string>();
  const id_lookup = new Map<string, string>();

  for (const resource of resources) {
    resource_lookup.set(resource.terraform_address, resource.name);

    // Also index by various ID fields
    const id = resource.properties['id'] as string | undefined;
    if (id) {
      id_lookup.set(id, resource.terraform_address);
    }

    // AWS-specific IDs
    const arn = resource.properties['arn'] as string | undefined;
    if (arn) {
      id_lookup.set(arn, resource.terraform_address);
    }
  }

  // Scan properties for references
  for (const resource of resources) {
    const inferred_deps = new Set(resource.dependencies);

    scan_for_references(resource.properties, id_lookup, inferred_deps);

    // Update dependencies
    resource.dependencies.length = 0;
    resource.dependencies.push(...inferred_deps);
  }
}

/**
 * Scan an object for ID references.
 *
 * Recursive walker over a property tree.  String leaves are matched
 * against `id_lookup` and the corresponding terraform_address is added
 * to `deps`.  Arrays and plain objects descend; null/undefined and
 * non-string primitives are no-ops.
 */
export function scan_for_references(obj: unknown, id_lookup: Map<string, string>, deps: Set<string>): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    // Check if this string matches any known ID
    const ref = id_lookup.get(obj);
    if (ref) {
      deps.add(ref);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      scan_for_references(item, id_lookup, deps);
    }
  } else if (typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      scan_for_references(value, id_lookup, deps);
    }
  }
}
