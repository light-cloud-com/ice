/**
 * Tests for `pulumi/value-transform.ts` (rf-pulumi-4).
 *
 * Pure-function helpers, hit 100% with explicit pinning. Behaviour
 * preserved verbatim from pre-extraction L327-355, L363-381 of
 * `pulumi-exporter.ts`.
 *
 * Asymmetries pinned explicitly:
 *  - `map_properties` skips `_`-prefixed keys at the TOP level.
 *  - `transform_value` does NOT skip `_`-prefixed keys inside
 *    nested objects — only the top-level reducer does.
 *  - Both helpers run `to_camel_case` on keys, but at DIFFERENT
 *    layers — top-level via `map_properties`, nested via the
 *    object-branch of `transform_value`.
 */
import { describe, expect, it } from 'vitest';
import {
  build_options,
  map_properties,
  transform_value,
} from '../value-transform';

describe('build_options', () => {
  it('returns undefined when deps is empty', () => {
    expect(build_options([])).toBeUndefined();
  });

  it('returns { depends_on } when deps is non-empty', () => {
    expect(build_options(['a'])).toEqual({ depends_on: ['a'] });
    expect(build_options(['a', 'b'])).toEqual({ depends_on: ['a', 'b'] });
  });

  it('does NOT populate the other PulumiResourceOptions fields', () => {
    const opts = build_options(['a'])!;
    expect(opts.protect).toBeUndefined();
    expect(opts.provider).toBeUndefined();
    expect(opts.parent).toBeUndefined();
    expect(opts.delete_before_replace).toBeUndefined();
    expect(opts.ignore_changes).toBeUndefined();
  });

  it('preserves dep array reference (no copy)', () => {
    // Pre-extraction: returns { depends_on: deps } — direct reference.
    // Pin so a future "defensive copy" change is intentional.
    const deps = ['a', 'b'];
    expect(build_options(deps)?.depends_on).toBe(deps);
  });
});

describe('map_properties', () => {
  it('camelCases snake_case keys', () => {
    expect(map_properties({ machine_type: 'e2-medium' })).toEqual({
      machineType: 'e2-medium',
    });
  });

  it('drops keys starting with underscore', () => {
    expect(map_properties({ _internal: 'x', visible: 'y' })).toEqual({
      visible: 'y',
    });
  });

  it('preserves non-snake-case keys unchanged', () => {
    expect(map_properties({ region: 'us', tags: ['a'] })).toEqual({
      region: 'us',
      tags: ['a'],
    });
  });

  it('recursively transforms nested object values via transform_value', () => {
    expect(
      map_properties({ network_config: { subnet_id: 'abc' } }),
    ).toEqual({
      networkConfig: { subnetId: 'abc' },
    });
  });

  it('recursively transforms array values', () => {
    expect(map_properties({ tags: ['a', 'b'] })).toEqual({ tags: ['a', 'b'] });
  });

  it('passes through null and undefined as null', () => {
    // map_properties → transform_value → null/undefined → null
    expect(map_properties({ a: null, b: undefined })).toEqual({ a: null, b: null });
  });

  it('handles empty object', () => {
    expect(map_properties({})).toEqual({});
  });

  it('preserves multi-segment snake_case in keys', () => {
    expect(
      map_properties({ very_long_property_name: 1 }),
    ).toEqual({ veryLongPropertyName: 1 });
  });
});

describe('transform_value — primitives', () => {
  it('returns null for null', () => {
    expect(transform_value(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(transform_value(undefined)).toBeNull();
  });

  it('passes through strings', () => {
    expect(transform_value('hello')).toBe('hello');
  });

  it('passes through numbers', () => {
    expect(transform_value(42)).toBe(42);
    expect(transform_value(3.14)).toBe(3.14);
    expect(transform_value(0)).toBe(0);
  });

  it('passes through booleans', () => {
    expect(transform_value(true)).toBe(true);
    expect(transform_value(false)).toBe(false);
  });
});

describe('transform_value — arrays', () => {
  it('maps each element recursively', () => {
    expect(transform_value([1, 'a', null])).toEqual([1, 'a', null]);
  });

  it('handles empty array', () => {
    expect(transform_value([])).toEqual([]);
  });

  it('recursively re-keys objects inside arrays', () => {
    expect(transform_value([{ snake_key: 1 }])).toEqual([{ snakeKey: 1 }]);
  });

  it('handles arrays of arrays', () => {
    expect(transform_value([[1, 2], [3]])).toEqual([[1, 2], [3]]);
  });
});

describe('transform_value — objects', () => {
  it('camelCases all top-level keys', () => {
    expect(transform_value({ snake_key: 1 })).toEqual({ snakeKey: 1 });
  });

  it('camelCases nested keys recursively', () => {
    expect(transform_value({ outer_key: { inner_key: 1 } })).toEqual({
      outerKey: { innerKey: 1 },
    });
  });

  it('handles empty object', () => {
    expect(transform_value({})).toEqual({});
  });

  it('does NOT skip _-prefixed keys, but to_camel_case rewrites them (unlike map_properties)', () => {
    // transform_value, unlike map_properties, doesn't filter underscore-prefixed keys.
    // map_properties skips _-prefixed keys at the top level; transform_value processes them.
    // The to_camel_case regex /_([a-z])/g consumes the leading underscore: '_internal' -> 'Internal'.
    expect(transform_value({ _internal: 1, visible: 2 })).toEqual({
      Internal: 1,
      visible: 2,
    });
  });

  it('processes object values that are themselves arrays', () => {
    expect(
      transform_value({ tag_list: ['a_1', 'b_2'] }),
    ).toEqual({ tagList: ['a_1', 'b_2'] });
  });

  it('chains key-rewrites and value-rewrites simultaneously', () => {
    expect(
      transform_value({ outer_key: { mid_key: { inner_key: 'value' } } }),
    ).toEqual({ outerKey: { midKey: { innerKey: 'value' } } });
  });
});

describe('map_properties + transform_value composition', () => {
  it('top-level skip + nested no-skip is the documented asymmetry', () => {
    // _internal at top level: dropped by map_properties.
    // _kept_inside inside nested object: kept by transform_value, but
    // to_camel_case rewrites '_kept_inside' -> 'KeptInside' (regex
    // /_([a-z])/g consumes the leading underscore).
    expect(
      map_properties({
        _internal: 'dropped',
        visible: { _kept_inside: 'preserved' },
      }),
    ).toEqual({
      visible: { KeptInside: 'preserved' },
    });
  });

  it('top-level snake_case keys are camelCased once, not twice', () => {
    // map_properties converts snake_to_camel; the value's nested
    // object (if present) also gets snake_to_camel via transform_value.
    expect(
      map_properties({ machine_config: { cpu_count: 4 } }),
    ).toEqual({ machineConfig: { cpuCount: 4 } });
  });
});
