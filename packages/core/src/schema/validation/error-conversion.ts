/**
 * Convert a `ValidationResult` to a `ValidationError`.
 *
 * Extracted from `ResourceValidator.to_validation_error` (rf-rval-3).
 *
 * Behaviour preserved verbatim:
 *  - Returns null when `result.valid` is true.
 *  - Maps each `errors[*]` (warnings excluded) into a `ValidationViolation`
 *    with `path`, `message`, `code`, and `value = issue.actual`.
 *  - Top-level error message format: "Validation failed for <ice_type>:
 *    <count> error(s)".
 */
import { ValidationError } from '../../types/errors.js';
import type { ValidationViolation } from '../../types/errors.js';
import type { ValidationResult } from '../resource-validator-types.js';

export function to_validation_error(result: ValidationResult): ValidationError | null {
  if (result.valid) return null;

  const violations: ValidationViolation[] = result.errors.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
    value: issue.actual,
  }));

  return new ValidationError(
    `Validation failed for ${result.ice_type}: ${result.errors.length} error(s)`,
    violations,
    'VALIDATION_FAILED',
  );
}
