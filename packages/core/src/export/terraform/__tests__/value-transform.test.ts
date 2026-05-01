/**
 * Tests for `terraform/value-transform.ts` (rf-tfexp-4).
 *
 * Pure-function helpers, hit 100% with input/output pinning.
 * Behaviour preserved verbatim from pre-extraction L367-418 of
 * `terraform-exporter.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  format_dependencies,
  map_properties,
  transform_value,
} from '../value-transform.js';

describe('map_properties', () => {
  it('passes through ordinary keys verbatim (snake_case preserved)', () => {
    expect(map_properties({ foo_bar: 1, baz_qux: 'hi' }, 'tf_resource')).toEqual({
      foo_bar: 1,
      baz_qux: 'hi',
    });
  });

  it('drops keys starting with underscore', () => {
    expect(map_properties({ _internal: 'hidden', foo: 1 }, 'tf_resource')).toEqual({
      foo: 1,
    });
  });

  it('returns empty object for all-underscore keys', () => {
    expect(map_properties({ _a: 1, _b: 2 }, 'tf_resource')).toEqual({});
  });

  it('handles empty input', () => {
    expect(map_properties({}, 'tf_resource')).toEqual({});
  });

  it('recursively transforms nested values', () => {
    expect(map_properties({ outer: { inner: 'hi', _kept: 1 } }, 'tf_resource')).toEqual({
      // _kept is preserved inside nested objects (transform_value doesn't strip)
      outer: { inner: 'hi', _kept: 1 },
    });
  });

  it('normalises null/undefined values to null', () => {
    expect(map_properties({ a: null, b: undefined }, 'tf_resource')).toEqual({
      a: null,
      b: null,
    });
  });

  it('preserves arrays', () => {
    expect(map_properties({ list: [1, 2, 3] }, 'tf_resource')).toEqual({
      list: [1, 2, 3],
    });
  });

  it('ignores second argument terraform_type', () => {
    // The terraform_type parameter is unused (preserved for API parity).
    expect(map_properties({ a: 1 }, 'foo')).toEqual(map_properties({ a: 1 }, 'bar'));
  });
});

describe('transform_value', () => {
  it('converts null to null', () => {
    expect(transform_value(null)).toBe(null);
  });

  it('converts undefined to null', () => {
    expect(transform_value(undefined)).toBe(null);
  });

  it('passes through strings', () => {
    expect(transform_value('hello')).toBe('hello');
  });

  it('passes through numbers', () => {
    expect(transform_value(42)).toBe(42);
    expect(transform_value(0)).toBe(0);
    expect(transform_value(-1.5)).toBe(-1.5);
  });

  it('passes through booleans', () => {
    expect(transform_value(true)).toBe(true);
    expect(transform_value(false)).toBe(false);
  });

  it('recursively transforms arrays', () => {
    expect(transform_value([1, 2, null, 'x'])).toEqual([1, 2, null, 'x']);
  });

  it('recursively transforms nested arrays', () => {
    expect(transform_value([[1, 2], [3, null]])).toEqual([
      [1, 2],
      [3, null],
    ]);
  });

  it('preserves keys verbatim in nested objects (no rename)', () => {
    expect(transform_value({ snake_case_key: 'val' })).toEqual({
      snake_case_key: 'val',
    });
  });

  it('does NOT skip _-prefixed keys in nested objects (cf. map_properties)', () => {
    // map_properties strips _-prefixed keys at top level only;
    // transform_value lets them through.
    expect(transform_value({ _internal: 1, foo: 2 })).toEqual({
      _internal: 1,
      foo: 2,
    });
  });

  it('handles deeply nested structures', () => {
    expect(transform_value({ a: { b: { c: [1, { d: null }] } } })).toEqual({
      a: { b: { c: [1, { d: null }] } },
    });
  });

  it('converts undefined inside arrays to null', () => {
    expect(transform_value([1, undefined, 3])).toEqual([1, null, 3]);
  });
});

describe('format_dependencies', () => {
  it('returns undefined for empty deps', () => {
    expect(format_dependencies([], 'gcp')).toBeUndefined();
  });

  it('formats single dep as # placeholder', () => {
    expect(format_dependencies(['node-1'], 'gcp')).toEqual(['# node-1']);
  });

  it('formats multiple deps as # placeholders', () => {
    expect(format_dependencies(['a', 'b', 'c'], 'aws')).toEqual(['# a', '# b', '# c']);
  });

  it('ignores provider argument', () => {
    // provider is unused (preserved for API parity).
    expect(format_dependencies(['x'], 'gcp')).toEqual(format_dependencies(['x'], 'aws'));
  });

  it('preserves order of deps', () => {
    expect(format_dependencies(['z', 'a', 'm'], 'gcp')).toEqual(['# z', '# a', '# m']);
  });
});
