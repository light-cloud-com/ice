/**
 * Terraform Sensitive-Attribute Masking & Empty Metadata
 *
 * Helpers for traversing Terraform's `sensitive_attributes` paths and
 * masking the corresponding leaf values, plus the empty-metadata
 * sentinel used when a state file is missing or unparseable.
 */

import type { ImportMetadata } from './types';

/**
 * Mask sensitive attributes in properties.
 *
 * Terraform's `sensitive_attributes` field is a list of dotted/bracketed
 * paths into the resource's `attributes` object (e.g. `password` or
 * `connection[0].password`).  This walks each path and replaces the leaf
 * with the literal string `'***SENSITIVE***'`.  Returns a shallow copy
 * with the masked leaves; non-targeted leaves alias their inputs.
 */
export function mask_sensitive_attributes(
  properties: Record<string, unknown>,
  sensitive_paths: string[],
): Record<string, unknown> {
  const result = { ...properties };

  for (const path of sensitive_paths) {
    // Parse the path (handles array notation like "password" or "connection[0].password")
    const parts = path.split(/\.|\[|\]/).filter(Boolean);
    mask_path(result, parts);
  }

  return result;
}

/**
 * Mask a specific path in an object.
 *
 * Recursive walker.  At the leaf (when `path.length === 1`) it overwrites
 * the value with `'***SENSITIVE***'`.  For intermediate steps, it descends
 * only when the next slot is a non-null object — array indices and object
 * keys are conflated (Terraform paths are pre-tokenised by the caller).
 *
 * Mutates `obj` in place.
 */
export function mask_path(obj: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) return;

  const [first, ...rest] = path;
  if (!first || !(first in obj)) return;

  if (rest.length === 0) {
    obj[first] = '***SENSITIVE***';
  } else {
    const next = obj[first];
    if (typeof next === 'object' && next !== null) {
      mask_path(next as Record<string, unknown>, rest);
    }
  }
}

/**
 * Create empty metadata for error cases.
 *
 * Used when the state file is missing/malformed and we have no real
 * Terraform state to summarise.
 */
export function create_empty_metadata(): ImportMetadata {
  return {
    terraform_version: 'unknown',
    state_version: 0,
    serial: 0,
    lineage: '',
    resource_count: 0,
    output_count: 0,
    imported_at: new Date().toISOString(),
  };
}
