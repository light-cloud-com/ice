/**
 * Constraint validation helpers.
 *
 * Pure function extracted from `ResourceValidator.validate_constraints`
 * (rf-rval-2). Splits the four constraint families into named helpers
 * that the orchestrator composes; this preserves the original ordering
 * of issues (enum, pattern, range, length).
 *
 * Behaviour preserved verbatim:
 *  - Enum: VALUE_NOT_ALLOWED when allowed_values is non-empty AND
 *    `value` not in the list. Empty allowed_values list -> no check.
 *  - Pattern: PATTERN_MISMATCH when regex compiles AND test fails on
 *    string value. Invalid regex -> swallowed silently (no issue).
 *  - Numeric range: only when typeof value === 'number'. min/max are
 *    inclusive boundaries (>= and <=).
 *  - String length: only when typeof value === 'string'. Inclusive.
 *  - Array length: only when Array.isArray(value). Inclusive. Uses the
 *    same min_length / max_length fields as strings.
 */
import type { ValidationIssue } from '../resource-validator-types';
import type { PropertyValidation } from '../schema-provider';

/**
 * Run every constraint check applicable to the given value+validation.
 * Returns issues in canonical order: enum, pattern, range, length.
 */
export function validate_constraints(path: string, value: unknown, validation: PropertyValidation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  push_if(issues, check_enum(path, value, validation));
  push_if(issues, check_pattern(path, value, validation));
  issues.push(...check_numeric_range(path, value, validation));
  issues.push(...check_string_length(path, value, validation));
  issues.push(...check_array_length(path, value, validation));

  return issues;
}

function push_if(out: ValidationIssue[], maybe: ValidationIssue | null): void {
  if (maybe) out.push(maybe);
}

/**
 * Allowed_values list check. Returns null when allowed_values is empty
 * or when the value is in the list; an issue otherwise.
 */
export function check_enum(path: string, value: unknown, validation: PropertyValidation): ValidationIssue | null {
  if (!validation.allowed_values || validation.allowed_values.length === 0) {
    return null;
  }
  if (validation.allowed_values.includes(value as string | number | boolean)) {
    return null;
  }
  return {
    path,
    message: `Value not allowed. Must be one of: ${validation.allowed_values.join(', ')}`,
    severity: 'error',
    code: 'VALUE_NOT_ALLOWED',
    expected: validation.allowed_values.join(' | '),
    actual: String(value),
  };
}

/**
 * Regex pattern check. Only runs on string values when a pattern is set.
 * Invalid regex strings are silently ignored (matches the original
 * try/catch + comment "Invalid regex pattern in schema, skip validation").
 */
export function check_pattern(path: string, value: unknown, validation: PropertyValidation): ValidationIssue | null {
  if (!validation.pattern || typeof value !== 'string') {
    return null;
  }
  try {
    const regex = new RegExp(validation.pattern);
    if (regex.test(value)) {
      return null;
    }
    return {
      path,
      message: `Value does not match pattern: ${validation.pattern}`,
      severity: 'error',
      code: 'PATTERN_MISMATCH',
      expected: validation.pattern,
      actual: value,
    };
  } catch {
    return null;
  }
}

/**
 * Numeric min/max bounds. Only runs on number values. Boundaries are
 * inclusive (`<` for min, `>` for max).
 */
export function check_numeric_range(path: string, value: unknown, validation: PropertyValidation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof value !== 'number') return issues;
  if (validation.min !== undefined && value < validation.min) {
    issues.push({
      path,
      message: `Value ${value} is less than minimum ${validation.min}`,
      severity: 'error',
      code: 'VALUE_TOO_SMALL',
      expected: `>= ${validation.min}`,
      actual: String(value),
    });
  }
  if (validation.max !== undefined && value > validation.max) {
    issues.push({
      path,
      message: `Value ${value} is greater than maximum ${validation.max}`,
      severity: 'error',
      code: 'VALUE_TOO_LARGE',
      expected: `<= ${validation.max}`,
      actual: String(value),
    });
  }
  return issues;
}

/**
 * String min_length / max_length bounds. Only runs on string values.
 */
export function check_string_length(path: string, value: unknown, validation: PropertyValidation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (typeof value !== 'string') return issues;
  if (validation.min_length !== undefined && value.length < validation.min_length) {
    issues.push({
      path,
      message: `String length ${value.length} is less than minimum ${validation.min_length}`,
      severity: 'error',
      code: 'STRING_TOO_SHORT',
      expected: `length >= ${validation.min_length}`,
      actual: `length ${value.length}`,
    });
  }
  if (validation.max_length !== undefined && value.length > validation.max_length) {
    issues.push({
      path,
      message: `String length ${value.length} is greater than maximum ${validation.max_length}`,
      severity: 'error',
      code: 'STRING_TOO_LONG',
      expected: `length <= ${validation.max_length}`,
      actual: `length ${value.length}`,
    });
  }
  return issues;
}

/**
 * Array min_length / max_length bounds. Only runs on array values.
 * Uses the same min_length / max_length fields as the string check.
 */
export function check_array_length(path: string, value: unknown, validation: PropertyValidation): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(value)) return issues;
  if (validation.min_length !== undefined && value.length < validation.min_length) {
    issues.push({
      path,
      message: `Array length ${value.length} is less than minimum ${validation.min_length}`,
      severity: 'error',
      code: 'ARRAY_TOO_SHORT',
      expected: `length >= ${validation.min_length}`,
      actual: `length ${value.length}`,
    });
  }
  if (validation.max_length !== undefined && value.length > validation.max_length) {
    issues.push({
      path,
      message: `Array length ${value.length} is greater than maximum ${validation.max_length}`,
      severity: 'error',
      code: 'ARRAY_TOO_LONG',
      expected: `length <= ${validation.max_length}`,
      actual: `length ${value.length}`,
    });
  }
  return issues;
}
