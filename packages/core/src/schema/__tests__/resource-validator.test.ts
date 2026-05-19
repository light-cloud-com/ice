/**
 * Tests for `resource-validator.ts`.
 *
 * The orchestrator wraps property-validator + error-conversion. We mock
 * the SchemaProvider boundary and exercise:
 *  - schema-not-found short-circuit (failure)
 *  - happy path (per-property validation, errors/warnings split)
 *  - skip_properties skips by name
 *  - strict mode flags unknown properties as warnings
 *  - include_warnings: false collapses issues to errors only
 *  - is_valid convenience method (true / false / failure)
 *  - validate_property_value (known + unknown property paths)
 *  - to_validation_error proxy
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ValidationError } from '../../types/errors';
import { failure, success } from '../../types/result';
import { ResourceValidator, create_resource_validator } from '../resource-validator';
import type { IceType, PropertySchema, ResourceSchema, SchemaProvider } from '../schema-provider';

function prop(over: Partial<PropertySchema> = {}): PropertySchema {
  return {
    name: 'p',
    type: 'string',
    description: '',
    required: false,
    computed: false,
    sensitive: false,
    ...over,
  };
}

function schema(over: Partial<ResourceSchema> = {}): ResourceSchema {
  return {
    ice_type: 'aws.ec2.instance' as IceType,
    display_name: 'EC2',
    description: '',
    category: 'compute',
    properties: [],
    implementations: [],
    ...over,
  };
}

function makeProvider(over: Partial<SchemaProvider> = {}): SchemaProvider {
  return {
    initialize: vi.fn(),
    get_schema: vi.fn(async () => failure(new ValidationError('no', [], 'SCHEMA_NOT_FOUND'))),
    has_schema: vi.fn(() => false),
    query: vi.fn(),
    get_categories: vi.fn(() => []),
    get_providers: vi.fn(() => []),
    get_implementation: vi.fn(() => undefined),
    get_native_type: vi.fn(() => undefined),
    get_property_schema: vi.fn(() => undefined),
    get_required_properties: vi.fn(() => []),
    get_computed_properties: vi.fn(() => []),
    get_stats: vi.fn(),
    ...over,
  } as SchemaProvider;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResourceValidator.validate', () => {
  it('returns failure when schema lookup fails', async () => {
    const v = new ResourceValidator(makeProvider());
    const r = await v.validate('x' as IceType, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(ValidationError);
      expect(r.error.code).toBe('SCHEMA_NOT_FOUND');
      expect(r.error.message).toContain('Schema not found: x');
    }
  });

  it('returns valid result when no issues found on a populated payload', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [prop({ name: 'name', required: true })] }))),
    });
    const r = await new ResourceValidator(provider).validate('aws.ec2.instance' as IceType, { name: 'instance-1' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.valid).toBe(true);
      expect(r.value.errors).toEqual([]);
      expect(r.value.warnings).toEqual([]);
      expect(r.value.ice_type).toBe('aws.ec2.instance');
      // validated_at is an ISO8601 timestamp
      expect(typeof r.value.validated_at).toBe('string');
    }
  });

  it('returns invalid result when a required property is missing', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [prop({ name: 'name', required: true })] }))),
    });
    const r = await new ResourceValidator(provider).validate('aws.ec2.instance' as IceType, {});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.valid).toBe(false);
      expect(r.value.errors).toHaveLength(1);
      expect(r.value.errors[0]?.code).toBe('MISSING_REQUIRED');
    }
  });

  it('skips properties listed in skip_properties option', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () =>
        success(
          schema({
            properties: [prop({ name: 'a', required: true }), prop({ name: 'b', required: true })],
          }),
        ),
      ),
    });
    const r = await new ResourceValidator(provider).validate(
      'aws.ec2.instance' as IceType,
      {},
      { skip_properties: ['a'] },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Only 'b' is checked
      expect(r.value.errors).toHaveLength(1);
      expect(r.value.errors[0]?.message).toContain("'b'");
    }
  });

  it('emits warnings for unknown properties in strict mode', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [prop({ name: 'name' })] }))),
    });
    const r = await new ResourceValidator(provider).validate(
      'aws.ec2.instance' as IceType,
      { name: 'x', extra: 'oops' },
      { strict: true },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.warnings).toHaveLength(1);
      expect(r.value.warnings[0]?.code).toBe('UNKNOWN_PROPERTY');
      expect(r.value.warnings[0]?.path).toBe('extra');
      // warning shouldn't make valid:false
      expect(r.value.valid).toBe(true);
    }
  });

  it('does not flag skipped properties as unknown in strict mode', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [prop({ name: 'name' })] }))),
    });
    const r = await new ResourceValidator(provider).validate(
      'aws.ec2.instance' as IceType,
      { name: 'x', extra: 'allowed' },
      { strict: true, skip_properties: ['extra'] },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.warnings).toEqual([]);
    }
  });

  it('does not run unknown-property check when strict is false', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [prop({ name: 'name' })] }))),
    });
    const r = await new ResourceValidator(provider).validate('aws.ec2.instance' as IceType, {
      name: 'x',
      extra: 'whatever',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.warnings).toEqual([]);
  });

  it('drops warnings from issues when include_warnings is false', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [prop({ name: 'name' })] }))),
    });
    const r = await new ResourceValidator(provider).validate(
      'aws.ec2.instance' as IceType,
      { name: 'x', extra: 'oops' },
      { strict: true, include_warnings: false },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.issues).toEqual([]); // warning-only payload, errors empty
      expect(r.value.warnings).toHaveLength(1); // warnings list still populated
    }
  });

  it('passes the configured max_depth into property validation', async () => {
    // max_depth = 0 short-circuits any nested checks. Build a structure that
    // would otherwise produce a nested issue.
    const child = prop({ name: 'inner', required: true });
    const parent = prop({ name: 'outer', type: 'object', nested_properties: [child] });
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [parent] }))),
    });
    const r = await new ResourceValidator(provider).validate(
      'aws.ec2.instance' as IceType,
      { outer: {} },
      { max_depth: 0 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.errors).toEqual([]); // no nested recursion
  });
});

describe('ResourceValidator.is_valid', () => {
  it('returns true when validation passes', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [prop({ name: 'name' })] }))),
    });
    expect(await new ResourceValidator(provider).is_valid('x' as IceType, { name: 'a' })).toBe(true);
  });

  it('returns false when validation reports errors', async () => {
    const provider = makeProvider({
      get_schema: vi.fn(async () => success(schema({ properties: [prop({ name: 'name', required: true })] }))),
    });
    expect(await new ResourceValidator(provider).is_valid('x' as IceType, {})).toBe(false);
  });

  it('returns false when schema lookup fails', async () => {
    expect(await new ResourceValidator(makeProvider()).is_valid('x' as IceType, {})).toBe(false);
  });
});

describe('ResourceValidator.validate_property_value', () => {
  it('returns an UNKNOWN_PROPERTY issue when property schema is not found', async () => {
    const provider = makeProvider({
      get_property_schema: vi.fn(() => undefined),
    });
    const issues = await new ResourceValidator(provider).validate_property_value('x' as IceType, 'missing', 'value');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('UNKNOWN_PROPERTY');
    expect(issues[0]?.path).toBe('missing');
  });

  it('returns issues from validate_property when property schema is found', async () => {
    const provider = makeProvider({
      get_property_schema: vi.fn(() => prop({ name: 'name', type: 'string' })),
    });
    const issues = await new ResourceValidator(provider).validate_property_value(
      'x' as IceType,
      'name',
      42, // wrong type
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('TYPE_MISMATCH');
  });

  it('returns no issues for a valid value', async () => {
    const provider = makeProvider({
      get_property_schema: vi.fn(() => prop({ name: 'name', type: 'string' })),
    });
    const issues = await new ResourceValidator(provider).validate_property_value('x' as IceType, 'name', 'ok');
    expect(issues).toEqual([]);
  });
});

describe('ResourceValidator.to_validation_error', () => {
  it('proxies to the validation/error-conversion helper', () => {
    const v = new ResourceValidator(makeProvider());
    expect(
      v.to_validation_error({
        valid: true,
        ice_type: 'x' as IceType,
        issues: [],
        errors: [],
        warnings: [],
        validated_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toBeNull();

    const err = v.to_validation_error({
      valid: false,
      ice_type: 'x' as IceType,
      issues: [{ path: 'p', message: 'm', severity: 'error', code: 'TYPE_MISMATCH' }],
      errors: [{ path: 'p', message: 'm', severity: 'error', code: 'TYPE_MISMATCH' }],
      warnings: [],
      validated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(err).toBeInstanceOf(ValidationError);
  });
});

describe('create_resource_validator', () => {
  it('returns a ResourceValidator bound to the given provider', () => {
    expect(create_resource_validator(makeProvider())).toBeInstanceOf(ResourceValidator);
  });
});
