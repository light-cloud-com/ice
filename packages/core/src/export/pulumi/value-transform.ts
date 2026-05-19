/**
 * Pulumi Exporter — value-transform helpers (rf-pulumi-4).
 *
 * Three property/value helpers extracted from `pulumi-exporter.ts`
 * (pre-extraction L327-355, L363-381). All three are pure
 * transformations with no class-state dependency.
 *
 * Behaviour preserved verbatim:
 *  - `map_properties` — drops keys starting with `_` (internal),
 *    snake_case_to_camelCase the rest, recursively transforms values.
 *  - `transform_value` — null/undefined → `null`; arrays mapped
 *    recursively; plain objects re-keyed via `to_camel_case` AND
 *    values recursively transformed; primitives passed through.
 *  - `build_options` — returns `undefined` for empty deps; otherwise
 *    `{ depends_on: deps }` (no other option fields populated).
 *
 * Cross-helper notes:
 *  - `transform_value` re-keys object values with `to_camel_case`
 *    INDEPENDENTLY of `map_properties` — so a top-level property
 *    `'my_field'` becomes `'myField'` (via map_properties) AND
 *    its nested object's `{nested_key: ...}` ALSO becomes
 *    `{nestedKey: ...}` (via transform_value). The two layers
 *    snake-to-camel together; double-conversion is safe because
 *    `to_camel_case` is a no-op on non-snake-case input.
 *  - `transform_value` does NOT skip `_`-prefixed keys inside
 *    nested objects — only `map_properties` (the top level) does.
 *    Pre-extraction behaviour preserved.
 *  - `transform_value` does NOT preserve `null` returns inside
 *    arrays — `[null]` stays `[null]` because the recursive call
 *    sees `null` and returns `null`. Same for nested objects.
 */

import { to_camel_case } from './case-utils';
import type { PulumiResourceOptions } from './types';

/**
 * Build the resource-options block for a Pulumi resource.
 *
 * Returns `undefined` if there are no deps (preserves the
 * pre-extraction behaviour where `options` was omitted entirely
 * when not needed). Otherwise emits `{ depends_on }`; the other
 * `PulumiResourceOptions` fields (`protect`, `provider`, etc.)
 * are NOT populated by this helper — they are only consumed via
 * the type, never produced by the exporter.
 */
export function build_options(deps: string[]): PulumiResourceOptions | undefined {
  if (deps.length === 0) return undefined;

  return {
    depends_on: deps,
  };
}

/**
 * Map an ICE properties bag to a Pulumi properties bag.
 *
 * Keys starting with `_` are dropped (treated as internal, e.g.
 * `_provider_alias`). Non-internal keys are camelCased; values
 * are recursively transformed via `transform_value`.
 */
export function map_properties(properties: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    // Skip internal properties (starting with _)
    if (key.startsWith('_')) continue;

    // Convert property names to camelCase (Pulumi convention)
    const pulumi_key = to_camel_case(key);
    result[pulumi_key] = transform_value(value);
  }

  return result;
}

/**
 * Recursively transform a value for Pulumi output.
 *
 * - `null` / `undefined` -> `null` (normalised).
 * - Arrays -> mapped element-wise via this same function.
 * - Plain objects -> rekeyed via `to_camel_case` AND recursively
 *   transformed (this is in addition to the `map_properties`
 *   top-level rekey).
 * - Primitives (string, number, boolean) -> passed through.
 *
 * Note: this function does NOT skip `_`-prefixed keys inside
 * nested objects (only `map_properties` does that, at the top
 * level). Behaviour preserved from pre-extraction.
 */
export function transform_value(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((v) => transform_value(v));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[to_camel_case(k)] = transform_value(v);
    }
    return result;
  }

  return value;
}
