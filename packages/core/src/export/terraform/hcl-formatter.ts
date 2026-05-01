/**
 * Terraform Exporter — HCL formatter (rf-tfexp-5).
 *
 * Two helpers extracted from `terraform-exporter.ts` (pre-extraction
 * L433-545). Pure functions; no class state.
 *
 * The output format is byte-identical to the pre-extraction class
 * methods. Particularly load-bearing details preserved verbatim:
 *  - Top-level `lines.push('')` after each top-level block (terraform,
 *    provider, resource) — produces blank-line separators.
 *  - Resource blocks: `# Resource: ${name}` comment IF
 *    `options.include_comments` is set; otherwise no comment.
 *  - Resource property emission: `if (value !== null && value !==
 *    undefined)` — null/undefined properties are SKIPPED, not emitted
 *    as `key = null`. This preserves Terraform's "absent means
 *    default" semantics.
 *  - depends_on block: emitted only if non-empty; `,` after each
 *    item; trailing newline before closing `]`.
 *  - String quoting: backslashes escaped first, then double-quotes
 *    escaped. Order matters — escaping doublequote-first would
 *    re-escape the backslashes added in the next pass.
 *  - Numbers: `String(value)` (handles bigint/exponential/etc).
 *  - Booleans: lowercase `'true'` / `'false'`.
 *  - Arrays: empty -> `'[]'`, non-empty -> leading newline + each
 *    item on its own line (NOT comma-separated; HCL uses newlines).
 *  - Objects: empty -> `'{}'`, non-empty -> leading newline + each
 *    entry as `${spaces} ${key} = ${value}` (NOT JSON-style
 *    `key: value`).
 *  - Indent values match pre-extraction: top-level provider/resource
 *    uses indent=2 (default), nested values get indent+2.
 *  - JSON output uses `JSON.stringify(config, null, 2)`.
 */

import type { TerraformConfig, TerraformExportOptions } from './types.js';

/**
 * Format a value for HCL output.
 *
 * - `null` / `undefined` -> `'null'` (the literal four-letter word).
 * - Strings: backslash-escape any `\`, then escape any `"`, then
 *   wrap in double-quotes. Order matters.
 * - Numbers -> `String(value)` (exponential, infinity, etc all
 *   handled by JS's default coercion).
 * - Booleans -> `'true'` / `'false'` (lowercase).
 * - Arrays: empty -> `'[]'`; non-empty -> leading newline + each
 *   item on its own line, prefixed with `${indent + 2} spaces`.
 *   Items separated by `,` plus newline+spaces.
 * - Objects: empty -> `'{}'`; non-empty -> leading newline + each
 *   entry as `${spaces}  ${key} = ${formatted-value}`.
 *   Nested values get `indent + 2`.
 * - Anything else -> `String(value)` (handles BigInt, Symbol, etc).
 */
export function format_hcl_value(value: unknown, indent: number = 2): string {
  const spaces = ' '.repeat(indent);

  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    // Escape special characters and wrap in quotes
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';

    const items = value.map((v) => format_hcl_value(v, indent + 2));
    return `[\n${spaces}  ${items.join(`,\n${spaces}  `)}\n${spaces}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';

    const formatted = entries.map(([k, v]) => {
      const formattedValue = format_hcl_value(v, indent + 2);
      return `${spaces}  ${k} = ${formattedValue}`;
    });
    return `{\n${formatted.join('\n')}\n${spaces}}`;
  }

  return String(value);
}

/**
 * Convert a Terraform config to HCL format.
 *
 * The byte layout is preserved verbatim from pre-extraction
 * `terraform-exporter.ts::toHCL` (L433-495). Section order:
 * terraform? → blank → providers* → blank → resources*
 *
 * Each top-level block is separated by a blank line. The resource
 * loop also emits a trailing blank line per resource, matching
 * pre-extraction layout. The terraform block is omitted entirely
 * if it has no fields populated.
 */
export function to_hcl(config: TerraformConfig, options: TerraformExportOptions): string {
  const lines: string[] = [];

  // Terraform block
  if (config.terraform) {
    lines.push('terraform {');
    if (config.terraform.required_version) {
      lines.push(`  required_version = "${config.terraform.required_version}"`);
    }
    if (config.terraform.required_providers) {
      lines.push('  required_providers {');
      for (const [name, prov] of Object.entries(config.terraform.required_providers)) {
        lines.push(`    ${name} = {`);
        lines.push(`      source  = "${prov.source}"`);
        if (prov.version) {
          lines.push(`      version = "${prov.version}"`);
        }
        lines.push('    }');
      }
      lines.push('  }');
    }
    lines.push('}');
    lines.push('');
  }

  // Provider blocks
  for (const provider of config.providers) {
    lines.push(`provider "${provider.name}" {`);
    for (const [key, value] of Object.entries(provider.config)) {
      lines.push(`  ${key} = ${format_hcl_value(value)}`);
    }
    lines.push('}');
    lines.push('');
  }

  // Resource blocks
  for (const resource of config.resources) {
    if (options.include_comments) {
      lines.push(`# Resource: ${resource.name}`);
    }
    lines.push(`resource "${resource.type}" "${resource.name}" {`);

    for (const [key, value] of Object.entries(resource.properties)) {
      if (value !== null && value !== undefined) {
        lines.push(`  ${key} = ${format_hcl_value(value)}`);
      }
    }

    if (resource.depends_on && resource.depends_on.length > 0) {
      lines.push('');
      lines.push('  depends_on = [');
      for (const dep of resource.depends_on) {
        lines.push(`    ${dep},`);
      }
      lines.push('  ]');
    }

    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert config to JSON format.
 *
 * Pre-extraction `toJSON` (L544-546) — straight pass-through to
 * `JSON.stringify` with 2-space indent.
 */
export function to_json(config: TerraformConfig): string {
  return JSON.stringify(config, null, 2);
}
