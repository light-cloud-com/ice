/**
 * Pulumi Exporter — TypeScript formatter (rf-pulumi-6).
 *
 * Two helpers extracted from `pulumi-exporter.ts` (pre-extraction
 * L506-576, L620-648). Pure functions; no class state.
 *
 * The output format is byte-identical to the pre-extraction class
 * methods. Particularly load-bearing details preserved verbatim:
 *  - Always emits `import * as pulumi from "@pulumi/pulumi";` first
 *    (even when the program has zero resources).
 *  - Provider imports use the underscore-substituted alias name
 *    (e.g. `azure-native` -> `azure_native`) but the package path
 *    uses the npm package name (`@pulumi/azure-native`).
 *  - Config block: string values use `config.require("...")`,
 *    everything else uses `config.requireObject("...")` — no other
 *    Pulumi config-getter is referenced.
 *  - Each resource is `const var = new ClassPath("name", { ... });`.
 *  - Resource properties: 4-space indent, trailing comma after each
 *    line, terminating `});` line, then a blank line between resources.
 *  - The provider_alias from parse_resource_type is destructured
 *    but discarded (`_provider_alias`); only class_path is used.
 *  - Property keys are emitted as-is (NOT re-camelCased) — by the
 *    time the formatter sees them, `map_properties` has already
 *    rewritten the keys.
 *  - `format_ts_value` strings: backslash-escape FIRST, then
 *    quote-escape — order matters because `\\` insertions affect
 *    subsequent quote scans. `"foo"` -> `"\"foo\""`; `\foo` ->
 *    `"\\foo"`; `\\foo` -> `"\\\\foo"`.
 *  - Arrays/objects use single-line concise form: `[a, b]` /
 *    `{ k: v, k2: v2 }` (no newlines). Distinct from the YAML
 *    formatter which uses multi-line block form.
 */

import { sanitize_var_name, to_camel_case } from './case-utils';
import { get_package_name, parse_resource_type } from './type-mapping';
import type { PulumiExportOptions, PulumiProgram } from './types';

/**
 * Format a value for TypeScript output.
 *
 * - `null` / `undefined` -> `'undefined'` (the literal nine-letter word).
 * - Strings: backslash- and quote-escaped, wrapped in double quotes.
 * - Numbers / booleans -> `String(value)`.
 * - Arrays: empty -> `'[]'`; non-empty -> `[a, b, c]` (single line).
 * - Objects: empty -> `'{}'`; non-empty -> `{ k: v, k2: v2 }`
 *   (single line, with surrounding spaces).
 *
 * The escape order (backslash first, then quote) is preserved
 * verbatim — reversing it would double-escape backslashes that
 * happen to precede quotes (`\"` -> `\\"` -> `\\\\\"`).
 */
export function format_ts_value(value: unknown): string {
  if (value === null || value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => format_ts_value(v));
    return `[${items.join(', ')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';

    const formatted = entries.map(([k, v]) => `${k}: ${format_ts_value(v)}`);
    return `{ ${formatted.join(', ')} }`;
  }

  return String(value);
}

/**
 * Convert a Pulumi program to TypeScript format.
 *
 * Pre-extraction `pulumi-exporter.ts::toTypeScript` (L506-571).
 * Section order: imports → config? → resources(+blank-after-each)
 *  → outputs?
 *
 * The provider set is collected up-front by regex-matching the
 * `provider:...` prefix on each resource type. The `pulumi`
 * import is unconditionally first; provider imports follow in
 * Set iteration order (insertion order — determined by resource
 * traversal order, which matches the pre-extraction class).
 */
export function to_typescript(program: PulumiProgram, options: PulumiExportOptions): string {
  const lines: string[] = [];

  // Imports
  const providers = new Set<string>();
  for (const resource of program.resources) {
    const match = resource.type.match(/^([^:]+):/);
    if (match) {
      providers.add(match[1]!);
    }
  }

  lines.push('import * as pulumi from "@pulumi/pulumi";');
  for (const provider of providers) {
    const package_name = get_package_name(provider);
    lines.push(`import * as ${provider.replace(/-/g, '_')} from "@pulumi/${package_name}";`);
  }
  lines.push('');

  // Configuration
  if (program.config && Object.keys(program.config).length > 0) {
    lines.push('// Configuration');
    lines.push('const config = new pulumi.Config();');
    for (const [key, value] of Object.entries(program.config)) {
      if (typeof value === 'string') {
        lines.push(`const ${to_camel_case(key)} = config.require("${key}");`);
      } else {
        lines.push(`const ${to_camel_case(key)} = config.requireObject("${key}");`);
      }
    }
    lines.push('');
  }

  // Resources
  if (options.include_comments) {
    lines.push('// Resources');
  }

  for (const resource of program.resources) {
    const { provider_alias: _provider_alias, class_path } = parse_resource_type(resource.type);

    if (options.include_comments) {
      lines.push(`// ${resource.name}`);
    }

    lines.push(`const ${sanitize_var_name(resource.name)} = new ${class_path}("${resource.name}", {`);

    for (const [key, value] of Object.entries(resource.properties)) {
      if (value !== null && value !== undefined) {
        lines.push(`    ${key}: ${format_ts_value(value)},`);
      }
    }

    lines.push('});');
    lines.push('');
  }

  // Outputs
  if (program.outputs && Object.keys(program.outputs).length > 0) {
    lines.push('// Outputs');
    for (const [key, value] of Object.entries(program.outputs)) {
      lines.push(`export const ${to_camel_case(key)} = ${format_ts_value(value)};`);
    }
  }

  return lines.join('\n');
}
