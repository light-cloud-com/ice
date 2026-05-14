/**
 * Tests for `validation/error-conversion.ts` (rf-rval-3).
 *
 * Behaviour pinned (preserved from
 * `ResourceValidator.to_validation_error`):
 *  - valid result -> null.
 *  - errors only (warnings excluded) -> ValidationError with violations
 *    that map issue.actual -> violation.value.
 *  - top-level message format: "Validation failed for <ice_type>:
 *    <count> error(s)".
 */
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../types/errors';
import { to_validation_error } from '../validation/error-conversion';
import type { ValidationResult } from '../resource-validator-types';
import type { IceType } from '../schema-provider';

function makeResult(over: Partial<ValidationResult> = {}): ValidationResult {
  return {
    valid: false,
    ice_type: 'aws.ec2.instance' as IceType,
    issues: [],
    errors: [],
    warnings: [],
    validated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('to_validation_error', () => {
  it('returns null when result is valid', () => {
    expect(to_validation_error(makeResult({ valid: true }))).toBeNull();
  });

  it('returns ValidationError when result has errors', () => {
    const r = makeResult({
      ice_type: 'aws.s3.bucket' as IceType,
      errors: [
        {
          path: 'name',
          message: 'Required property name is missing',
          severity: 'error',
          code: 'MISSING_REQUIRED',
          actual: undefined,
        },
      ],
    });
    const out = to_validation_error(r);
    expect(out).toBeInstanceOf(ValidationError);
    expect(out?.message).toBe('Validation failed for aws.s3.bucket: 1 error(s)');
  });

  it('counts error count in message', () => {
    const r = makeResult({
      errors: [
        { path: 'a', message: 'bad', severity: 'error', code: 'TYPE_MISMATCH' },
        { path: 'b', message: 'bad', severity: 'error', code: 'TYPE_MISMATCH' },
        { path: 'c', message: 'bad', severity: 'error', code: 'TYPE_MISMATCH' },
      ],
    });
    expect(to_validation_error(r)?.message).toBe('Validation failed for aws.ec2.instance: 3 error(s)');
  });

  it('maps issue.actual to violation.value', () => {
    const r = makeResult({
      errors: [
        {
          path: 'instance_type',
          message: 'mismatch',
          severity: 'error',
          code: 'TYPE_MISMATCH',
          actual: 'banana',
        },
      ],
    });
    const out = to_validation_error(r) as ValidationError;
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]?.path).toBe('instance_type');
    expect(out.violations[0]?.code).toBe('TYPE_MISMATCH');
    expect(out.violations[0]?.value).toBe('banana');
  });

  it('does not include warnings in violations', () => {
    const r = makeResult({
      errors: [{ path: 'a', message: 'e', severity: 'error', code: 'TYPE_MISMATCH' }],
      warnings: [{ path: 'b', message: 'w', severity: 'warning', code: 'UNKNOWN_PROPERTY' }],
    });
    const out = to_validation_error(r) as ValidationError;
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0]?.path).toBe('a');
  });
});
