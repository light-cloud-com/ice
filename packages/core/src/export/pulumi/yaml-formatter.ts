/**
 * Pulumi Exporter — YAML formatter (rf-pulumi-5).
 *
 * Two helpers extracted from `pulumi-exporter.ts` (pre-extraction
 * L393-501). Pure functions; no class state.
 *
 * The output format is byte-identical to the pre-extraction class
 * methods. Particularly load-bearing details preserved verbatim:
 *  - Top-level `lines.push('')` after the name/runtime/description
 *    block, AND after the config block — produces blank-line
 *    separators between sections.
 *  - Resources section: blank line AFTER each resource (inside the
 *    loop), but no leading blank line before `resources:`.
 *  - Outputs section: NO trailing blank line after the last entry.
 *  - String quoting heuristic: only quote when the value contains
 *    `:`, `#`, or `\n` (NOT when it contains `-`, `[`, etc).
 *  - Null/undefined return literal `'null'` (no quotes).
 *  - Arrays: empty -> `'[]'`, non-empty -> leading newline + each
 *    item on its own line with `  - ` prefix.
 *  - Objects: empty -> `'{}'`, non-empty -> leading newline + each
 *    entry on its own line.
 *  - Indent values match pre-extraction: top-level config uses
 *    indent=4 (the helper uses `indent`-spaces of indent for the
 *    array/object hyphen marker; entries use indent+2 spaces).
 *  - Resource properties use indent=8.
 *  - Booleans -> `'true'` / `'false'` (lowercase).
 *  - The `dependsOn` block uses `${name}` interpolation syntax
 *    (Pulumi resource references); preserved verbatim.
 *
 * The two helpers depend on each other but neither depends on
 * `to_camel_case` / `sanitize_*` — the formatter assumes its
 * input is already-canonical (camelCased keys, sanitised resource
 * names) coming from `map_properties` / `sanitize_name`.
 */

import type { PulumiExportOptions, PulumiProgram } from './types.js';

/**
 * Format a value for YAML output.
 *
 * - `null` / `undefined` -> `'null'` (the literal four-letter word).
 * - Strings: quoted with backslash-escapes only when they contain
 *   `:`, `#`, or `\n`; otherwise emitted unquoted.
 * - Numbers -> `String(value)` (exponential, infinity, etc all
 *   handled by JS's default coercion).
 * - Booleans -> `'true'` / `'false'`.
 * - Arrays: empty -> `'[]'`; non-empty -> leading newline + each
 *   item on its own line, prefixed with `${indent} spaces + '- '`.
 *   Nested values get `indent + 4` to align with the next level.
 * - Objects: empty -> `'{}'`; non-empty -> leading newline + each
 *   entry as `${indent} spaces + '${key}: ${formatted-value}'`.
 *   Nested values get `indent + 2`.
 * - Anything else -> `String(value)` (handles BigInt, Symbol, etc).
 */
export function format_yaml_value(value: unknown, indent: number = 0): string {
  const spaces = ' '.repeat(indent);

  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    // Check if string needs quoting
    if (value.includes(':') || value.includes('#') || value.includes('\n')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';

    const items = value.map((v) => `${spaces}  - ${format_yaml_value(v, indent + 4)}`);
    return `\n${items.join('\n')}`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';

    const formatted = entries.map(([k, v]) => {
      const formattedValue = format_yaml_value(v, indent + 2);
      return `${spaces}  ${k}: ${formattedValue}`;
    });
    return `\n${formatted.join('\n')}`;
  }

  return String(value);
}

/**
 * Convert a Pulumi program to YAML format.
 *
 * The byte layout is preserved verbatim from pre-extraction
 * `pulumi-exporter.ts::toYAML` (L393-454). Section order:
 * name → runtime → description? → blank → config?(+blank) →
 * resources?(+blank-after-each) → outputs?
 *
 * The outputs section does NOT add a trailing blank line; if a
 * future caller appends to the YAML they should add their own
 * separator. (Resources DO add a trailing blank line via the
 * intra-loop push, which can leave a residual blank line at the
 * end of the resources section if no outputs follow — preserved
 * pre-extraction behaviour.)
 */
export function to_yaml(program: PulumiProgram, options: PulumiExportOptions): string {
  const lines: string[] = [];

  lines.push(`name: ${program.name}`);
  lines.push(`runtime: ${program.runtime}`);

  if (program.description) {
    lines.push(`description: ${program.description}`);
  }

  lines.push('');

  // Configuration
  if (program.config && Object.keys(program.config).length > 0) {
    lines.push('config:');
    for (const [key, value] of Object.entries(program.config)) {
      lines.push(`  ${key}: ${format_yaml_value(value, 4)}`);
    }
    lines.push('');
  }

  // Resources
  if (program.resources.length > 0) {
    lines.push('resources:');
    for (const resource of program.resources) {
      if (options.include_comments) {
        lines.push(`  # ${resource.name}`);
      }
      lines.push(`  ${resource.name}:`);
      lines.push(`    type: ${resource.type}`);

      if (Object.keys(resource.properties).length > 0) {
        lines.push('    properties:');
        for (const [key, value] of Object.entries(resource.properties)) {
          if (value !== null && value !== undefined) {
            lines.push(`      ${key}: ${format_yaml_value(value, 8)}`);
          }
        }
      }

      if (resource.options?.depends_on && resource.options.depends_on.length > 0) {
        lines.push('    options:');
        lines.push('      dependsOn:');
        for (const dep of resource.options.depends_on) {
          lines.push(`        - \${${dep}}`);
        }
      }

      lines.push('');
    }
  }

  // Outputs
  if (program.outputs && Object.keys(program.outputs).length > 0) {
    lines.push('outputs:');
    for (const [key, value] of Object.entries(program.outputs)) {
      lines.push(`  ${key}: ${format_yaml_value(value, 4)}`);
    }
  }

  return lines.join('\n');
}
