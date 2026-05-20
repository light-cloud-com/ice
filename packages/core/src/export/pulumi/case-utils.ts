/**
 * Pulumi Exporter — case + name utilities (rf-pulumi-2).
 *
 * Four small string helpers extracted from `pulumi-exporter.ts`
 * (pre-extraction L317-326, L356-358, L386-388, L613-615). Each
 * function is a verbatim port of the corresponding private method;
 * no semantic changes, only relocation. None of them depend on
 * class state, so they take primitive `string` inputs and return
 * primitive outputs — easy to unit-test in isolation.
 *
 * Naming-rule summary (preserved verbatim):
 *  - `to_pascal_case` splits on `-` or `_` and TitleCases each word.
 *  - `to_camel_case` lowercases the first letter after every `_`,
 *    stripping the underscore. (No-op for non-snake-case input.)
 *  - `sanitize_name` keeps `[A-Za-z0-9_-]` + replaces other chars
 *    with `-`; if the first char is a digit it gets a `r-` prefix.
 *  - `sanitize_var_name` keeps `[A-Za-z0-9_]` + replaces other chars
 *    with `_`; digit-leading names get a `_` prefix.
 *
 * The two sanitisers differ on (a) which separator they preserve
 * (`-` vs `_`) and (b) the leading-digit prefix (`r-` vs `_`); they
 * are NOT interchangeable. `sanitize_name` produces YAML-resource
 * keys; `sanitize_var_name` produces TypeScript identifiers.
 */

/**
 * Convert string to PascalCase.
 *
 * Splits on `-` or `_`, capitalises the first letter of each
 * word, lower-cases the rest. `''` returns `''` (empty input has
 * no words to lowercase, which the .charAt path handles cleanly).
 */
export function to_pascal_case(str: string): string {
  return str
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert string to camelCase.
 *
 * `_x` -> `X` (uppercases the next char and drops the underscore).
 * Leading character is left alone — `'foo_bar'` becomes `'fooBar'`,
 * `'_foo_bar'` becomes `'FooBar'` (the leading underscore is
 * consumed and the F is uppercased).
 */
export function to_camel_case(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Sanitize a name for use as a Pulumi YAML resource identifier.
 *
 * Preserves `-`, `_`, alphanumerics; replaces everything else
 * with `-`. Names that start with a digit get a `r-` prefix
 * (e.g. `'1web'` -> `'r-1web'`).
 */
export function sanitize_name(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^([0-9])/, 'r-$1');
}

/**
 * Sanitize a variable name for TypeScript output.
 *
 * Preserves `_` and alphanumerics; replaces everything else
 * (including `-`) with `_`. Names that start with a digit get
 * a `_` prefix (e.g. `'1web'` -> `'_1web'`).
 */
export function sanitize_var_name(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
}
