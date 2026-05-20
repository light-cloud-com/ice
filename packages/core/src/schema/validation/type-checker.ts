/**
 * Type checking helpers.
 *
 * Pure functions extracted from `ResourceValidator` (rf-rval-1):
 *   - `get_type_name` (was the private method of the same name)
 *   - `validate_type` (was the private method of the same name)
 *
 * Behaviour preserved verbatim:
 *  - get_type_name returns 'null', 'undefined', 'array', 'NaN', or
 *    `typeof value` for everything else.
 *  - validate_type matches one of: 'string', 'number', 'boolean', 'array',
 *    'object', 'map', 'any'. 'object' and 'map' share the same check
 *    (must be a non-null, non-array object). 'any' always validates.
 *    Unknown expected_type strings fall through and return null (no issue).
 *  - For 'number', NaN is treated as a type mismatch (matches the original
 *    `Number.isNaN(value)` check after `typeof value !== 'number'`).
 */
import type { ValidationCode, ValidationIssue, ValidationSeverity } from '../resource-validator-types';

/**
 * Get human-readable type name for a value.
 */
export function get_type_name(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  if (Number.isNaN(value)) return 'NaN';
  return typeof value;
}

/**
 * Validate that `value` matches `expected_type`. Returns a TYPE_MISMATCH
 * issue when it does not, or null on success.
 */
export function validate_type(path: string, value: unknown, expected_type: string): ValidationIssue | null {
  const actual_type = get_type_name(value);

  switch (expected_type) {
    case 'string':
      if (typeof value !== 'string') {
        return mismatch(path, 'string', actual_type);
      }
      break;

    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return mismatch(path, 'number', actual_type);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        return mismatch(path, 'boolean', actual_type);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        return mismatch(path, 'array', actual_type);
      }
      break;

    case 'object':
    case 'map':
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return mismatch(path, 'object', actual_type);
      }
      break;

    case 'any':
      // Any type is always valid
      break;
  }

  return null;
}

function mismatch(path: string, expected: string, actual: string): ValidationIssue {
  return {
    path,
    message: `Expected ${expected}, got ${actual}`,
    severity: 'error' satisfies ValidationSeverity,
    code: 'TYPE_MISMATCH' satisfies ValidationCode,
    expected,
    actual,
  };
}
