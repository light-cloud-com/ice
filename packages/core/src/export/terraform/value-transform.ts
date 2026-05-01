/**
 * Terraform Exporter — value-transform helpers (rf-tfexp-4).
 *
 * Three property/value helpers extracted from `terraform-exporter.ts`
 * (pre-extraction L367-418). All three are pure transformations
 * with no class-state dependency.
 *
 * Behaviour preserved verbatim:
 *  - `map_properties` — drops keys starting with `_` (internal),
 *    keeps the rest as-is (Terraform uses snake_case, so 1:1).
 *    Recursively transforms values.
 *  - `transform_value` — null/undefined → `null`; arrays mapped
 *    recursively; plain objects re-keyed AS-IS (no rename) AND
 *    values recursively transformed; primitives passed through.
 *  - `format_dependencies` — returns `undefined` for empty deps;
 *    otherwise emits `# ${dep}` placeholders (the pre-extraction
 *    behaviour was to use commented placeholders since the proper
 *    `${type.name}` reference lookup wasn't implemented).
 *
 * Cross-helper notes:
 *  - Unlike the Pulumi `transform_value`, this one preserves keys
 *    AS-IS (Terraform uses snake_case natively).
 *  - `transform_value` does NOT skip `_`-prefixed keys inside
 *    nested objects — only `map_properties` (the top level) does.
 *    Pre-extraction behaviour preserved.
 *  - `format_dependencies` second arg `_provider` is unused but
 *    kept in the signature for API parity with the class method.
 */

/**
 * Map ICE properties to Terraform properties.
 *
 * Keys starting with `_` are dropped (treated as internal, e.g.
 * `_provider_alias`). Non-internal keys are kept AS-IS (Terraform
 * uses snake_case, so 1:1); values are recursively transformed
 * via `transform_value`.
 */
export function map_properties(
  properties: Record<string, unknown>,
  _terraform_type: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    // Skip internal properties (starting with _)
    if (key.startsWith('_')) continue;

    // Convert property names from snake_case to Terraform convention
    // (Terraform uses snake_case, so usually it's 1:1)
    const tf_key = key;

    // Handle special value transformations
    result[tf_key] = transform_value(value);
  }

  return result;
}

/**
 * Recursively transform a value for Terraform output.
 *
 * - `null` / `undefined` -> `null` (normalised).
 * - Arrays -> mapped element-wise via this same function.
 * - Plain objects -> rekeyed AS-IS AND recursively transformed
 *   (Terraform uses snake_case natively; no rename needed).
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
      result[k] = transform_value(v);
    }
    return result;
  }

  return value;
}

/**
 * Format dependency references.
 *
 * Returns `undefined` if there are no deps (preserves the
 * pre-extraction behaviour where `depends_on` was omitted entirely
 * when not needed). Otherwise emits `# ${dep}` placeholders
 * (pre-extraction had a TODO comment about looking up the actual
 * resource type and name; preserved verbatim).
 */
export function format_dependencies(deps: string[], _provider: string): string[] | undefined {
  if (deps.length === 0) return undefined;

  // Format as Terraform references
  // Note: In a real implementation, we'd need to look up the actual
  // resource type and name for each dependency
  return deps.map((dep) => `# ${dep}`); // Placeholder
}
