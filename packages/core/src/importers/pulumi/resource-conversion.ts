/**
 * Pulumi Resource Conversion
 *
 * Converts a single `PulumiResource` (from a state file) into the
 * provider-agnostic `PulumiImportedResource` used by the rest of the
 * importer pipeline.  Handles property descent, secret masking, and
 * dependency aggregation (explicit deps + parent).
 */

import { extract_name_from_urn, is_secret_value, unwrap_secret } from './parsing';
import { get_ice_type, get_provider_from_type, parse_urn } from './type-mapper';
import type { PulumiImportOptions } from './state-importer';
import type { PulumiResource, PulumiImportedResource, PulumiImportWarning } from './types';

type ResolvedOptions = Required<Omit<PulumiImportOptions, 'target_graph'>>;

/**
 * Process properties, handling secrets.
 *
 * Recursively walks a property tree:
 *   - Secret-tagged values are unwrapped (when `include_secrets`) or replaced
 *     with the literal string `'***SECRET***'`.
 *   - Plain object values descend recursively.
 *   - Arrays and primitives pass through unchanged.
 *
 * Pure: no side effects, no graph mutation.
 */
export function process_properties(props: Record<string, unknown>, options: ResolvedOptions): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (is_secret_value(value)) {
      result[key] = options.include_secrets ? unwrap_secret(value) : '***SECRET***';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = process_properties(value as Record<string, unknown>, options);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Import a single Pulumi resource.
 *
 * Mirrors the source-state shape into an `PulumiImportedResource`:
 *   - URN parsing (with `extract_name_from_urn` fallback) supplies `name`,
 *     prefixed by `options.name_prefix` when configured.
 *   - Property source priority is `outputs` -> `inputs` (with NO_OUTPUTS
 *     warning).  Empty objects when neither is present.
 *   - Dependencies = explicit `resource.dependencies` ++ `resource.parent`
 *     when present (parent appended last, in source order).
 *   - `secret_outputs` mirrors `additional_secret_outputs`.
 *
 * `warnings` is mutated to record any NO_OUTPUTS emission.
 */
export function import_resource(
  resource: PulumiResource,
  options: ResolvedOptions,
  warnings: PulumiImportWarning[],
): PulumiImportedResource {
  const pulumi_type = resource.type;
  const ice_type = get_ice_type(pulumi_type);
  const provider = get_provider_from_type(pulumi_type);

  // Parse the URN to get name
  const parsed_urn = parse_urn(resource.urn);
  let name = parsed_urn?.name ?? extract_name_from_urn(resource.urn);

  // Apply name prefix
  if (options.name_prefix) {
    name = `${options.name_prefix}${name}`;
  }

  // Process properties from outputs (the actual state) or inputs
  let properties: Record<string, unknown> = {};
  if (resource.outputs) {
    properties = process_properties(resource.outputs, options);
  } else if (resource.inputs) {
    properties = process_properties(resource.inputs, options);
    warnings.push({
      code: 'NO_OUTPUTS',
      message: 'Resource has no outputs, using inputs instead',
      resource: resource.urn,
    });
  }

  // Extract dependencies
  const dependencies: string[] = [];
  if (resource.dependencies) {
    dependencies.push(...resource.dependencies);
  }
  if (resource.parent) {
    dependencies.push(resource.parent);
  }

  // Extract secret outputs
  const secret_outputs: string[] = [];
  if (resource.additional_secret_outputs) {
    secret_outputs.push(...resource.additional_secret_outputs);
  }

  return {
    pulumi_urn: resource.urn,
    pulumi_type,
    ice_type,
    name,
    id: resource.id,
    properties,
    dependencies,
    provider,
    parent: resource.parent,
    protect: resource.protect ?? false,
    external: resource.external ?? false,
    secret_outputs,
  };
}
