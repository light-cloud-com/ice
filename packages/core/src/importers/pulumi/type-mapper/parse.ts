/**
 * Pulumi Type Mapper — URN/type parsing helpers (rf-pmap-2).
 *
 * Two parsers extracted from `type-mapper.ts` (pre-extraction
 * L19-49 parse_urn, L56-86 parse_type). Pure string parsers; no
 * data-table dependency.
 *
 * Pulumi URN format: `urn:pulumi:<stack>::<project>::<type>::<name>`
 *  - The `::` separator (double colon) is critical — single `:`
 *    appears within the type segment.
 *  - Exactly four `::`-separated parts after the `urn:pulumi:` prefix.
 *
 * Pulumi type format: `<provider>:<module>/<resource>:<ResourceClass>`
 *  - Standard form: `aws:s3/bucket:Bucket`.
 *  - Alternative form: `<provider>:<module>:<Class>` (no resource
 *    segment) — used by `azure-native` and `pulumi:providers:*`.
 *  - Special forms: `pulumi:pulumi:Stack` (the stack root resource),
 *    `pulumi:providers:<Name>` (provider configuration resource).
 *
 * Pre-extraction quirks preserved verbatim:
 *  - `parse_urn` returns `null` for any input not starting with
 *    `urn:pulumi:` OR not having exactly four `::`-separated parts
 *    OR any of those parts being empty.
 *  - `parse_type` returns `{}` (empty object) on no match — the
 *    caller pattern `if (parsed.provider && parsed.module && ...)`
 *    treats undefined fields as fall-through.
 *  - The standard-form regex `^([^:]+):([^/]+)\/([^:]+):(.+)$` is
 *    greedy on the trailing class segment; any `:` inside the
 *    class name is captured (no escaping needed in practice
 *    because Pulumi class names don't contain `:`).
 */

import type { ParsedUrn } from '../types';

// =============================================================================
// URN Parsing
// =============================================================================

/**
 * Parse a Pulumi URN into its components.
 * Format: urn:pulumi:<stack>::<project>::<type>::<name>
 *
 * Returns `null` for any input that doesn't match the expected
 * shape. The 4-part check is strict — extra `::` separators in
 * the name segment will cause this to return null even if the
 * input is otherwise valid.
 */
export function parse_urn(urn: string): ParsedUrn | null {
  // URN uses '::' as separator between components
  // We need to split on '::' after the 'urn:pulumi:' prefix
  if (!urn.startsWith('urn:pulumi:')) {
    return null;
  }

  const rest = urn.slice('urn:pulumi:'.length);
  const parts = rest.split('::');

  // Expect exactly 4 parts: stack, project, type, name
  if (parts.length !== 4) {
    return null;
  }

  const [stack, project, type, name] = parts;
  if (!stack || !project || !type || !name) {
    return null;
  }

  // Parse the type component
  const type_info = parse_type(type);

  return {
    stack,
    project,
    type,
    name,
    ...type_info,
  };
}

/**
 * Parse a Pulumi type string.
 * Format: <provider>:<module>/<resource>:<ResourceClass>
 * Example: aws:s3/bucket:Bucket
 *
 * Three branches in priority order:
 *  1. `pulumi:pulumi:Stack` -> root stack resource (special).
 *  2. `pulumi:providers:<Name>` -> provider config (special).
 *  3. Standard form regex -> {provider, module, resource_type, resource_class}.
 *  4. Alternative form regex -> {provider, module, resource_class}
 *     (no resource_type — used by azure-native and similar).
 *  5. No match -> empty object {}.
 *
 * The two regexes are tried in order; the standard form must come
 * first (`<provider>:<module>/<resource>:<Class>`) because the
 * alternative form (`<provider>:<module>:<Class>`) would match
 * the standard form but with `module/resource` captured as a
 * single module group.
 */
export function parse_type(type: string): {
  provider?: string;
  module?: string;
  resource_type?: string;
  resource_class?: string;
} {
  // Handle special types
  if (type === 'pulumi:pulumi:Stack') {
    return { provider: 'pulumi', module: 'pulumi', resource_class: 'Stack' };
  }
  if (type.startsWith('pulumi:providers:')) {
    const provider = type.replace('pulumi:providers:', '');
    return { provider: 'pulumi', module: 'providers', resource_class: provider };
  }

  // Standard format: provider:module/resource:Class
  const match = type.match(/^([^:]+):([^/]+)\/([^:]+):(.+)$/);
  if (match) {
    const [, provider, module, resource_type, resource_class] = match;
    return { provider, module, resource_type, resource_class };
  }

  // Alternative format: provider:module:Class
  const alt_match = type.match(/^([^:]+):([^:]+):(.+)$/);
  if (alt_match) {
    const [, provider, module, resource_class] = alt_match;
    return { provider, module, resource_class };
  }

  return {};
}
