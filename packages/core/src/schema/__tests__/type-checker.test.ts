/**
 * Tests for `validation/type-checker.ts` (rf-rval-1).
 *
 * Behaviour pinned (preserved from pre-extraction private methods of
 * `ResourceValidator`):
 *  - get_type_name: 'null', 'undefined', 'array', 'NaN', typeof everything else.
 *  - validate_type: TYPE_MISMATCH issue or null. NaN is a number-mismatch.
 *    'object' and 'map' both require non-null non-array objects.
 *    'any' always passes. Unknown expected_type returns null (no issue).
 */
import { describe, expect, it } from 'vitest';
import { get_type_name, validate_type } from '../validation/type-checker.js';

describe('get_type_name', () => {
  it('null -> "null"', () => {
    expect(get_type_name(null)).toBe('null');
  });
  it('undefined -> "undefined"', () => {
    expect(get_type_name(undefined)).toBe('undefined');
  });
  it('array -> "array"', () => {
    expect(get_type_name([1, 2])).toBe('array');
  });
  it('NaN -> "NaN" (not "number")', () => {
    expect(get_type_name(Number.NaN)).toBe('NaN');
  });
  it('plain number -> "number"', () => {
    expect(get_type_name(42)).toBe('number');
  });
  it('string -> "string"', () => {
    expect(get_type_name('foo')).toBe('string');
  });
  it('boolean -> "boolean"', () => {
    expect(get_type_name(true)).toBe('boolean');
  });
  it('plain object -> "object"', () => {
    expect(get_type_name({})).toBe('object');
  });
});

describe('validate_type', () => {
  describe('string', () => {
    it('accepts string', () => {
      expect(validate_type('p', 'hello', 'string')).toBeNull();
    });
    it('rejects number with TYPE_MISMATCH', () => {
      const r = validate_type('p', 42, 'string');
      expect(r?.code).toBe('TYPE_MISMATCH');
      expect(r?.expected).toBe('string');
      expect(r?.actual).toBe('number');
      expect(r?.severity).toBe('error');
    });
  });

  describe('number', () => {
    it('accepts number', () => {
      expect(validate_type('p', 42, 'number')).toBeNull();
    });
    it('rejects string', () => {
      expect(validate_type('p', '42', 'number')?.code).toBe('TYPE_MISMATCH');
    });
    it('rejects NaN', () => {
      const r = validate_type('p', Number.NaN, 'number');
      expect(r?.code).toBe('TYPE_MISMATCH');
      expect(r?.actual).toBe('NaN');
    });
  });

  describe('boolean', () => {
    it('accepts boolean', () => {
      expect(validate_type('p', false, 'boolean')).toBeNull();
    });
    it('rejects string', () => {
      expect(validate_type('p', 'true', 'boolean')?.code).toBe('TYPE_MISMATCH');
    });
  });

  describe('array', () => {
    it('accepts array', () => {
      expect(validate_type('p', [1], 'array')).toBeNull();
    });
    it('rejects object', () => {
      expect(validate_type('p', {}, 'array')?.code).toBe('TYPE_MISMATCH');
    });
  });

  describe('object', () => {
    it('accepts plain object', () => {
      expect(validate_type('p', {}, 'object')).toBeNull();
    });
    it('rejects array (not an object for our purposes)', () => {
      expect(validate_type('p', [1], 'object')?.code).toBe('TYPE_MISMATCH');
    });
    it('rejects null', () => {
      expect(validate_type('p', null, 'object')?.code).toBe('TYPE_MISMATCH');
    });
  });

  describe('map', () => {
    it('accepts plain object (map shares the object check)', () => {
      expect(validate_type('p', { a: 1 }, 'map')).toBeNull();
    });
    it('rejects array', () => {
      expect(validate_type('p', [], 'map')?.code).toBe('TYPE_MISMATCH');
    });
    it('error message says "object" not "map"', () => {
      const r = validate_type('p', null, 'map');
      expect(r?.expected).toBe('object');
      expect(r?.message).toBe('Expected object, got null');
    });
  });

  describe('any', () => {
    it('accepts any value', () => {
      expect(validate_type('p', null, 'any')).toBeNull();
      expect(validate_type('p', undefined, 'any')).toBeNull();
      expect(validate_type('p', 42, 'any')).toBeNull();
      expect(validate_type('p', { foo: 1 }, 'any')).toBeNull();
    });
  });

  describe('unknown expected types', () => {
    it('returns null (no issue) for unrecognised type strings', () => {
      expect(validate_type('p', 42, 'foobar')).toBeNull();
    });
  });

  it('forwards path into the issue', () => {
    const r = validate_type('network.subnet_id', 42, 'string');
    expect(r?.path).toBe('network.subnet_id');
  });
});
