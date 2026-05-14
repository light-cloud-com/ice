/**
 * Pulumi Type Mapper — mapping + utility helpers (rf-pmap-3).
 *
 * Eight helpers extracted from `type-mapper.ts` (pre-extraction
 * L422-527). All consume the lookup tables exported from
 * `./data.ts` and the parsers from `./parse.ts`.
 *
 * Helpers:
 *  - `get_ice_type(pulumi_type)` — TYPE_MAP lookup with fallback
 *    to a parse_type-derived synthesis. Falls through to the input
 *    with `:` -> `.` substitution and lowercasing if no match.
 *  - `get_ice_provider(pulumi_provider)` — accepts a URN or a
 *    raw type string; returns the ICE provider name. Tries URN
 *    parse first, then type parse, then a simple-name match.
 *  - `get_provider_from_type(pulumi_type)` — extract provider from
 *    a type string only (no URN handling).
 *  - `is_type_supported(pulumi_type)` — direct TYPE_MAP membership.
 *  - `get_supported_types()` — Object.keys(TYPE_MAP).
 *  - `get_supported_ice_types()` — deduped Object.values(TYPE_MAP).
 *  - `get_name_from_urn(urn)` — extract name from URN; falls back
 *    to the last `::`-separated segment if URN parse fails.
 *  - `is_provider_resource(type)` / `is_stack_resource(type)` —
 *    one-line predicates for the special resource types.
 *
 * Plus one private helper `to_snake_case(str)` — PascalCase to
 * snake_case for resource_class normalisation in get_ice_type.
 *
 * Pre-extraction quirks preserved verbatim:
 *  - `get_ice_type` falls through to `pulumi_type.replace(/:/g, '.').toLowerCase()`
 *    when neither TYPE_MAP nor parse_type can produce a result.
 *  - `get_ice_provider` returns `'unknown'` only when both URN
 *    parse + type parse + simple-name match all fail.
 *  - `to_snake_case` strips a leading underscore via
 *    `.replace(/^_/, '')` — input `'AWS'` becomes `'aws'`, NOT
 *    `'_aws'` (the leading underscore from the first uppercase
 *    capture is dropped).
 */

import { PROVIDER_MAP, TYPE_MAP } from './data';
import { parse_type, parse_urn } from './parse';

// =============================================================================
// Mapping Functions
// =============================================================================

/**
 * Get the ICE type for a Pulumi resource type.
 *
 * Priority order:
 *  1. Direct TYPE_MAP lookup (table hit) — return verbatim mapping.
 *  2. parse_type + synthesise — `{ice_provider}.{module}.{snake(class)}`.
 *  3. Last-resort: replace colons with dots, lowercase the whole thing.
 *
 * The "last-resort" branch is hit for malformed inputs that don't
 * match the four-segment standard form OR the three-segment
 * alternative form. The lowercase output is what makes this a
 * fallthrough rather than a "best-effort" — it intentionally loses
 * fidelity (e.g. `'foo:Bar'` -> `'foo.bar'`) so the caller can
 * detect it's been mangled.
 */
export function get_ice_type(pulumi_type: string): string {
  // Check direct mapping first
  if (TYPE_MAP[pulumi_type]) {
    return TYPE_MAP[pulumi_type]!;
  }

  // Fall back to converting the pulumi type format
  const parsed = parse_type(pulumi_type);
  if (parsed.provider && parsed.module && parsed.resource_class) {
    const ice_provider = PROVIDER_MAP[parsed.provider] ?? parsed.provider;
    const resource = to_snake_case(parsed.resource_class);
    return `${ice_provider}.${parsed.module}.${resource}`;
  }

  // Return as-is if no mapping found
  return pulumi_type.replace(/:/g, '.').toLowerCase();
}

/**
 * Get the ICE provider name from a Pulumi provider string.
 *
 * Three-stage fallback:
 *  1. parse_urn — for full URNs.
 *  2. parse_type — for raw type strings.
 *  3. Simple-name regex — for plain provider tokens (e.g. `'aws'`).
 *
 * Returns `'unknown'` if all three stages fail.
 */
export function get_ice_provider(pulumi_provider: string): string {
  // Extract provider from URN or type
  const parsed = parse_urn(pulumi_provider) ?? { type: pulumi_provider };
  const type_info = parse_type(parsed.type ?? pulumi_provider);

  if (type_info.provider) {
    return PROVIDER_MAP[type_info.provider] ?? type_info.provider;
  }

  // Try to extract from simple name
  const simple_match = pulumi_provider.match(/^([^:]+)/);
  if (simple_match && simple_match[1]) {
    return PROVIDER_MAP[simple_match[1]] ?? simple_match[1];
  }

  return 'unknown';
}

/**
 * Get provider name from resource type.
 *
 * Subset of get_ice_provider — type-string only, no URN parsing.
 * Returns `'unknown'` if parse_type can't extract a provider.
 */
export function get_provider_from_type(pulumi_type: string): string {
  const parsed = parse_type(pulumi_type);
  if (parsed.provider) {
    return PROVIDER_MAP[parsed.provider] ?? parsed.provider;
  }
  return 'unknown';
}

/**
 * Check if a Pulumi type is supported.
 *
 * Direct TYPE_MAP membership check. Note: types that fall through
 * to the synthesised path in get_ice_type are NOT considered
 * "supported" by this predicate — only explicit table entries.
 */
export function is_type_supported(pulumi_type: string): boolean {
  return pulumi_type in TYPE_MAP;
}

/**
 * Get all supported Pulumi types.
 *
 * Returns the keys of TYPE_MAP in insertion order.
 */
export function get_supported_types(): string[] {
  return Object.keys(TYPE_MAP);
}

/**
 * Get all supported ICE types.
 *
 * Returns deduped values of TYPE_MAP. Multiple Pulumi types can
 * map to the same ICE type (e.g. `aws:s3/bucket:Bucket` and
 * `aws:s3/bucketV2:BucketV2` both → `aws.s3.bucket`); the Set
 * dedup collapses these.
 */
export function get_supported_ice_types(): string[] {
  return [...new Set(Object.values(TYPE_MAP))];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert a PascalCase string to snake_case.
 *
 * `'EC2Instance'` -> `'ec2_instance'`. Strips a leading underscore
 * via `.replace(/^_/, '')` — without this, `'EC2'` would become
 * `'_e_c_2'`, which the strip turns into `'e_c_2'` (still wrong;
 * but the strip removes the most obvious surface artefact for
 * normal PascalCase input like `'Instance'` -> `'_instance'` →
 * `'instance'`).
 */
function to_snake_case(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Extract the resource name from a URN.
 *
 * Falls back to the last `::`-separated segment if parse_urn
 * fails (e.g. for malformed URNs that still have the right
 * shape). Last-resort fallthrough returns the input verbatim.
 */
export function get_name_from_urn(urn: string): string {
  const parsed = parse_urn(urn);
  return parsed?.name ?? urn.split('::').pop() ?? urn;
}

/**
 * Check if a resource is a provider resource.
 *
 * Provider resources are Pulumi's per-provider configuration
 * objects (e.g. `pulumi:providers:aws`).
 */
export function is_provider_resource(type: string): boolean {
  return type.startsWith('pulumi:providers:');
}

/**
 * Check if a resource is a stack resource.
 *
 * The stack resource is the singleton root of every Pulumi
 * stack (`pulumi:pulumi:Stack`).
 */
export function is_stack_resource(type: string): boolean {
  return type === 'pulumi:pulumi:Stack';
}
