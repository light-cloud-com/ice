/**
 * Tests for `validation/constraints.ts` (rf-rval-2).
 *
 * Behaviour pinned (preserved verbatim from `validate_constraints` private
 * method of ResourceValidator):
 *  - Enum: VALUE_NOT_ALLOWED with `expected = allowed.join(' | ')` and
 *    `actual = String(value)`. Empty allowed_values list -> no check.
 *  - Pattern: PATTERN_MISMATCH only on string values. Invalid regex string
 *    is silently swallowed (no issue).
 *  - Numeric range: only on numbers. min/max inclusive (`<` / `>`).
 *  - String length: only on strings. min_length / max_length inclusive.
 *  - Array length: only on arrays. Same min_length / max_length fields,
 *    different codes (ARRAY_TOO_SHORT / ARRAY_TOO_LONG).
 *  - Issue ordering: enum, pattern, numeric range, string length,
 *    array length (matches the inlined order of the original method).
 */
import { describe, expect, it } from 'vitest';
import {
  check_array_length,
  check_enum,
  check_numeric_range,
  check_pattern,
  check_string_length,
  validate_constraints,
} from '../validation/constraints.js';

describe('check_enum', () => {
  it('returns null when allowed_values is undefined', () => {
    expect(check_enum('p', 1, {})).toBeNull();
  });
  it('returns null when allowed_values is empty', () => {
    expect(check_enum('p', 1, { allowed_values: [] })).toBeNull();
  });
  it('returns null when value is in allowed_values', () => {
    expect(check_enum('p', 'a', { allowed_values: ['a', 'b'] })).toBeNull();
  });
  it('returns VALUE_NOT_ALLOWED when value is not in list', () => {
    const r = check_enum('p', 'c', { allowed_values: ['a', 'b'] });
    expect(r?.code).toBe('VALUE_NOT_ALLOWED');
    expect(r?.expected).toBe('a | b');
    expect(r?.actual).toBe('c');
    expect(r?.message).toBe('Value not allowed. Must be one of: a, b');
  });
});

describe('check_pattern', () => {
  it('returns null when pattern is unset', () => {
    expect(check_pattern('p', 'foo', {})).toBeNull();
  });
  it('returns null when value is not a string', () => {
    expect(check_pattern('p', 42, { pattern: '^x$' })).toBeNull();
  });
  it('returns null when value matches', () => {
    expect(check_pattern('p', 'abc', { pattern: '^a' })).toBeNull();
  });
  it('returns PATTERN_MISMATCH when value does not match', () => {
    const r = check_pattern('p', 'xyz', { pattern: '^a' });
    expect(r?.code).toBe('PATTERN_MISMATCH');
    expect(r?.expected).toBe('^a');
    expect(r?.actual).toBe('xyz');
  });
  it('silently ignores invalid regex strings', () => {
    expect(check_pattern('p', 'abc', { pattern: '[' })).toBeNull();
  });
});

describe('check_numeric_range', () => {
  it('skips non-numbers', () => {
    expect(check_numeric_range('p', '5', { min: 0 })).toEqual([]);
  });
  it('flags VALUE_TOO_SMALL', () => {
    const r = check_numeric_range('p', 1, { min: 5 });
    expect(r[0]?.code).toBe('VALUE_TOO_SMALL');
    expect(r[0]?.expected).toBe('>= 5');
    expect(r[0]?.actual).toBe('1');
  });
  it('flags VALUE_TOO_LARGE', () => {
    const r = check_numeric_range('p', 10, { max: 5 });
    expect(r[0]?.code).toBe('VALUE_TOO_LARGE');
    expect(r[0]?.expected).toBe('<= 5');
  });
  it('inclusive boundaries pass', () => {
    expect(check_numeric_range('p', 5, { min: 5, max: 5 })).toEqual([]);
  });
  it('reports both min and max in one call', () => {
    const r = check_numeric_range('p', 0, { min: 1, max: -1 });
    expect(r).toHaveLength(2);
    expect(r[0]?.code).toBe('VALUE_TOO_SMALL');
    expect(r[1]?.code).toBe('VALUE_TOO_LARGE');
  });
});

describe('check_string_length', () => {
  it('skips non-strings', () => {
    expect(check_string_length('p', 5, { min_length: 1 })).toEqual([]);
  });
  it('flags STRING_TOO_SHORT', () => {
    const r = check_string_length('p', 'ab', { min_length: 5 });
    expect(r[0]?.code).toBe('STRING_TOO_SHORT');
    expect(r[0]?.expected).toBe('length >= 5');
    expect(r[0]?.actual).toBe('length 2');
  });
  it('flags STRING_TOO_LONG', () => {
    const r = check_string_length('p', 'abcdef', { max_length: 3 });
    expect(r[0]?.code).toBe('STRING_TOO_LONG');
    expect(r[0]?.expected).toBe('length <= 3');
  });
  it('inclusive boundaries pass', () => {
    expect(check_string_length('p', 'ab', { min_length: 2, max_length: 2 })).toEqual([]);
  });
});

describe('check_array_length', () => {
  it('skips non-arrays', () => {
    expect(check_array_length('p', 'abc', { min_length: 5 })).toEqual([]);
  });
  it('flags ARRAY_TOO_SHORT', () => {
    const r = check_array_length('p', [1], { min_length: 3 });
    expect(r[0]?.code).toBe('ARRAY_TOO_SHORT');
    expect(r[0]?.expected).toBe('length >= 3');
    expect(r[0]?.actual).toBe('length 1');
  });
  it('flags ARRAY_TOO_LONG', () => {
    const r = check_array_length('p', [1, 2, 3, 4], { max_length: 2 });
    expect(r[0]?.code).toBe('ARRAY_TOO_LONG');
  });
  it('inclusive boundaries pass', () => {
    expect(check_array_length('p', [1, 2], { min_length: 2, max_length: 2 })).toEqual([]);
  });
});

describe('validate_constraints', () => {
  it('returns canonical issue order: enum, pattern, range, length', () => {
    // Construct a value that breaks every applicable check.
    const issues = validate_constraints('p', 'xyz', {
      allowed_values: ['a', 'b'],
      pattern: '^a',
      min_length: 5,
      max_length: 1,
    });
    const codes = issues.map((i) => i.code);
    // 'xyz' is not allowed (enum), doesn't match '^a' (pattern),
    // length 3 < 5 (string too short), length 3 > 1 (string too long).
    expect(codes).toEqual(['VALUE_NOT_ALLOWED', 'PATTERN_MISMATCH', 'STRING_TOO_SHORT', 'STRING_TOO_LONG']);
  });

  it('runs every applicable check on a number with constraints', () => {
    const issues = validate_constraints('p', 100, { min: 200, max: 50 });
    expect(issues.map((i) => i.code)).toEqual(['VALUE_TOO_SMALL', 'VALUE_TOO_LARGE']);
  });

  it('returns empty array when no constraints apply', () => {
    expect(validate_constraints('p', 5, {})).toEqual([]);
  });
});
