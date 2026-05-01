/**
 * Terraform Exporter — name sanitisation utilities (rf-tfexp-2).
 *
 * Single helper extracted from `terraform-exporter.ts`
 * (pre-extraction L420-428). The helper is a verbatim port of the
 * original private method; no semantic changes, only relocation.
 *
 * Naming-rule summary (preserved verbatim):
 *  - `sanitize_name` keeps `[A-Za-z0-9_-]` + replaces other chars
 *    with `_`; if the first char is a digit it gets a `_` prefix.
 *
 * Note: Terraform identifiers must start with a letter or underscore
 * and contain only letters, digits, underscores, hyphens. This is
 * different from the Pulumi `sanitize_name` (`r-` prefix) — kept
 * separate to avoid coupling.
 */

/**
 * Sanitize a name for use as a Terraform identifier.
 *
 * Terraform resource names must:
 *  - Start with letter or underscore
 *  - Contain only letters, digits, underscores, hyphens
 *
 * Replaces invalid characters with `_`. If the first character is
 * a digit, prefixes with `_` (e.g. `'1web'` -> `'_1web'`).
 */
export function sanitize_name(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^([0-9])/, '_$1');
}
