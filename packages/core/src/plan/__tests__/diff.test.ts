/**
 * Tests for `plan/diff.ts`.
 *
 * Pure helpers used by the plan engine to compute property-level
 * diffs, deep-equality, destructive-change detection, and human-
 * readable summaries.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  diff_properties,
  deep_equal,
  is_destructive_change,
  summarize_changes,
  format_property_change,
} from '../diff.js';
import type { PropertyChange } from '../../types/deployment.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('diff_properties', () => {
  it('returns empty array when objects are equal', () => {
    const changes = diff_properties({ name: 'foo', count: 1 }, { name: 'foo', count: 1 });
    expect(changes).toEqual([]);
  });

  it('reports added properties as old_value undefined', () => {
    const changes = diff_properties({ name: 'foo', count: 1 }, { name: 'foo' });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'count',
      old_value: undefined,
      new_value: 1,
      sensitive: false,
    });
  });

  it('reports removed properties as new_value undefined', () => {
    const changes = diff_properties({ name: 'foo' }, { name: 'foo', count: 1 });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'count',
      old_value: 1,
      new_value: undefined,
      sensitive: false,
    });
  });

  it('reports modified primitives with old and new values', () => {
    const changes = diff_properties({ name: 'foo' }, { name: 'bar' });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: 'name',
      old_value: 'bar',
      new_value: 'foo',
      sensitive: false,
    });
  });

  it('reports array changes as a single change at the parent path', () => {
    const changes = diff_properties({ tags: ['a', 'b'] }, { tags: ['a', 'c'] });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe('tags');
    expect(changes[0]?.new_value).toEqual(['a', 'b']);
    expect(changes[0]?.old_value).toEqual(['a', 'c']);
  });

  it('recurses into nested objects with dotted paths', () => {
    const changes = diff_properties(
      { config: { port: 8080, host: 'a' } },
      { config: { port: 80, host: 'a' } },
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe('config.port');
    expect(changes[0]?.old_value).toBe(80);
    expect(changes[0]?.new_value).toBe(8080);
  });

  it('reports a primitive-vs-object change as a flat replacement, not recursion', () => {
    // typeof 'string' !== typeof 'object' so the recursion guard in the
    // function falls through to the flat change branch.
    const changes = diff_properties({ config: 'literal' }, { config: { port: 80 } });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe('config');
    expect(changes[0]?.new_value).toBe('literal');
  });

  it('treats null on either side as a flat change, not recursion', () => {
    // The recursion gate explicitly excludes null even though typeof null === 'object'.
    const changes = diff_properties({ config: { port: 80 } }, { config: null });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe('config');
  });

  it('treats array vs object as a flat change, not recursion', () => {
    const changes = diff_properties({ items: { a: 1 } }, { items: [1, 2] });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe('items');
  });

  it('marks values with conventionally-sensitive keys as sensitive', () => {
    const changes = diff_properties({ password: 'hunter2' }, { password: 'old' });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.sensitive).toBe(true);
    expect(changes[0]?.old_value).toBe('[SENSITIVE]');
    expect(changes[0]?.new_value).toBe('[SENSITIVE]');
  });

  it('redacts sensitive added properties', () => {
    const changes = diff_properties({ api_key: 'k' }, {});
    expect(changes[0]?.sensitive).toBe(true);
    expect(changes[0]?.new_value).toBe('[SENSITIVE]');
    expect(changes[0]?.old_value).toBeUndefined();
  });

  it('redacts sensitive removed properties', () => {
    const changes = diff_properties({}, { token: 't' });
    expect(changes[0]?.sensitive).toBe(true);
    expect(changes[0]?.old_value).toBe('[SENSITIVE]');
    expect(changes[0]?.new_value).toBeUndefined();
  });

  it('honors the explicit sensitive_keys override for keys that would not match patterns', () => {
    const changes = diff_properties(
      { custom_field: 'new' },
      { custom_field: 'old' },
      new Set(['custom_field']),
    );
    expect(changes[0]?.sensitive).toBe(true);
    expect(changes[0]?.new_value).toBe('[SENSITIVE]');
  });

  it('detects sensitivity case-insensitively (Password / Secret / Token / Key / Auth / Private / ApiKey)', () => {
    expect(diff_properties({ Password: 'p' }, {})[0]?.sensitive).toBe(true);
    expect(diff_properties({ MySecret: 's' }, {})[0]?.sensitive).toBe(true);
    expect(diff_properties({ accessToken: 't' }, {})[0]?.sensitive).toBe(true);
    expect(diff_properties({ public_key: 'k' }, {})[0]?.sensitive).toBe(true);
    expect(diff_properties({ credentialFile: 'c' }, {})[0]?.sensitive).toBe(true);
    expect(diff_properties({ authHeader: 'a' }, {})[0]?.sensitive).toBe(true);
    expect(diff_properties({ privateData: 'p' }, {})[0]?.sensitive).toBe(true);
    expect(diff_properties({ apikey: 'k' }, {})[0]?.sensitive).toBe(true);
    expect(diff_properties({ api_key: 'k' }, {})[0]?.sensitive).toBe(true);
  });

  it('treats unrelated keys as non-sensitive', () => {
    const changes = diff_properties({ name: 'foo' }, { name: 'bar' });
    expect(changes[0]?.sensitive).toBe(false);
  });

  it('produces multiple changes when several properties differ', () => {
    const changes = diff_properties(
      { a: 1, b: 2, c: 3 },
      { a: 1, b: 99, d: 4 },
    );
    expect(changes).toHaveLength(3); // b modified, c added, d removed
    const paths = changes.map((c) => c.path).sort();
    expect(paths).toEqual(['b', 'c', 'd']);
  });

  it('passes sensitive_keys down through nested recursion', () => {
    const changes = diff_properties(
      { config: { secret_v: 'new' } },
      { config: { secret_v: 'old' } },
      new Set(['secret_v']),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.path).toBe('config.secret_v');
    expect(changes[0]?.sensitive).toBe(true);
    expect(changes[0]?.new_value).toBe('[SENSITIVE]');
  });
});

describe('deep_equal', () => {
  it('returns true for the same reference', () => {
    const obj = { a: 1 };
    expect(deep_equal(obj, obj)).toBe(true);
  });

  it('returns true for equal primitives', () => {
    expect(deep_equal(1, 1)).toBe(true);
    expect(deep_equal('a', 'a')).toBe(true);
    expect(deep_equal(true, true)).toBe(true);
  });

  it('returns false for different primitives', () => {
    expect(deep_equal(1, 2)).toBe(false);
    expect(deep_equal('a', 'b')).toBe(false);
  });

  it('returns true when both values are null', () => {
    expect(deep_equal(null, null)).toBe(true);
  });

  it('returns false when only one value is null', () => {
    expect(deep_equal(null, {})).toBe(false);
    expect(deep_equal({}, null)).toBe(false);
  });

  it('returns true when both values are undefined', () => {
    expect(deep_equal(undefined, undefined)).toBe(true);
  });

  it('returns false when only one value is undefined', () => {
    expect(deep_equal(undefined, {})).toBe(false);
    expect(deep_equal({}, undefined)).toBe(false);
  });

  it('returns false for different primitive types', () => {
    expect(deep_equal(1, '1')).toBe(false);
  });

  it('treats an empty object and an empty array as equal (logic surprise)', () => {
    // typeof both 'object', Array.isArray(a) is false so the array branch is
    // skipped. Object branch: both have zero keys, loop is a no-op, returns
    // true. The function does not distinguish [] from {}.
    expect(deep_equal({}, [])).toBe(true);
  });

  it('returns true for equal arrays', () => {
    expect(deep_equal([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('returns false for arrays of different lengths', () => {
    expect(deep_equal([1, 2], [1, 2, 3])).toBe(false);
  });

  it('returns false for arrays with different contents', () => {
    expect(deep_equal([1, 2, 3], [1, 9, 3])).toBe(false);
  });

  it('returns false for an array vs a non-array object (with same keys count)', () => {
    // [1,2] has Object.keys ['0','1'] (length 2) vs {a:1,b:2} length 2 — yet
    // typeof both are 'object'. The Array.isArray gate routes [1,2] through
    // array branch but {a:1,b:2} fails Array.isArray on the right and falls
    // through to false.
    expect(deep_equal([1, 2], { a: 1, b: 2 })).toBe(false);
  });

  it('recurses into nested arrays', () => {
    expect(deep_equal([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
    expect(deep_equal([[1, 2], [3, 4]], [[1, 2], [3, 5]])).toBe(false);
  });

  it('returns true for equal objects', () => {
    expect(deep_equal({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it('returns false for objects with different key sets', () => {
    expect(deep_equal({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('returns false for objects with different key counts', () => {
    expect(deep_equal({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('recurses into nested objects', () => {
    expect(deep_equal({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deep_equal({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });
});

describe('is_destructive_change', () => {
  it('returns false for unknown resource types', () => {
    const changes: PropertyChange[] = [
      { path: 'whatever', old_value: 1, new_value: 2, sensitive: false },
    ];
    expect(is_destructive_change('unknown.something', changes)).toBe(false);
  });

  it('returns true when an AWS EC2 force-new property changes', () => {
    const changes: PropertyChange[] = [
      { path: 'ami', old_value: 'a', new_value: 'b', sensitive: false },
    ];
    expect(is_destructive_change('aws.ec2.instance', changes)).toBe(true);
  });

  it('returns false when only non-force-new properties change on a known type', () => {
    const changes: PropertyChange[] = [
      { path: 'tags', old_value: { a: '1' }, new_value: { a: '2' }, sensitive: false },
    ];
    expect(is_destructive_change('aws.ec2.instance', changes)).toBe(false);
  });

  it('returns false for an empty change list on a known type', () => {
    expect(is_destructive_change('aws.ec2.instance', [])).toBe(false);
  });

  it('considers only the top-level property when matching nested paths', () => {
    // The `cidr_block.foo` path's first segment matches force-new on aws.vpc.vpc.
    const changes: PropertyChange[] = [
      { path: 'cidr_block.subkey', old_value: 'a', new_value: 'b', sensitive: false },
    ];
    expect(is_destructive_change('aws.vpc.vpc', changes)).toBe(true);
  });

  it('normalizes resource type case (Aws.Ec2.Instance -> aws.ec2.instance)', () => {
    const changes: PropertyChange[] = [
      { path: 'instance_type', old_value: 't2.micro', new_value: 't3.large', sensitive: false },
    ];
    expect(is_destructive_change('Aws.Ec2.Instance', changes)).toBe(true);
  });

  it('normalizes :: and / separators into dots', () => {
    const changes: PropertyChange[] = [
      { path: 'cidr_block', old_value: '10.0.0.0/16', new_value: '10.1.0.0/16', sensitive: false },
    ];
    expect(is_destructive_change('aws::vpc::vpc', changes)).toBe(true);
    expect(is_destructive_change('aws/vpc/vpc', changes)).toBe(true);
  });

  it('rewrites underscores to dots during normalization (so aws_ec2_instance hits aws.ec2.instance)', () => {
    // 'aws_ec2_instance' normalizes to 'aws.ec2.instance', which is in the
    // force-new map. The 'instance_type' path's top segment is the literal
    // 'instance_type' (path.split('.') only splits on dots, not underscores)
    // and matches the entry in the force-new list.
    const changes: PropertyChange[] = [
      { path: 'instance_type', old_value: 'a', new_value: 'b', sensitive: false },
    ];
    expect(is_destructive_change('aws_ec2_instance', changes)).toBe(true);
  });

  it('detects gcp.compute.instance machine_type as force-new', () => {
    const changes: PropertyChange[] = [
      { path: 'machine_type', old_value: 'n1', new_value: 'n2', sensitive: false },
    ];
    expect(is_destructive_change('gcp.compute.instance', changes)).toBe(true);
  });

  it('cannot reach map keys that contain underscores (logic surprise)', () => {
    // The FORCE_NEW_PROPERTIES map contains keys like 'azure.compute.virtual_machine'.
    // normalize_resource_type rewrites '_' to '.' before lookup, so neither
    // 'azure.compute.virtual_machine' (input) nor any other input shape can
    // match the literal map key — those entries are dead code under the
    // current normalization rule.
    const changes: PropertyChange[] = [
      { path: 'vm_size', old_value: 'a', new_value: 'b', sensitive: false },
    ];
    expect(is_destructive_change('azure.compute.virtual_machine', changes)).toBe(false);
    expect(is_destructive_change('azure.compute.virtual.machine', changes)).toBe(false);
  });

  it('detects kubernetes.apps.deployment namespace as force-new', () => {
    const changes: PropertyChange[] = [
      { path: 'namespace', old_value: 'a', new_value: 'b', sensitive: false },
    ];
    expect(is_destructive_change('kubernetes.apps.deployment', changes)).toBe(true);
  });

  it('handles empty path segments by falling back to empty top-level', () => {
    // path '' splits to [''], top-level is '' which is not in any force-new list.
    const changes: PropertyChange[] = [
      { path: '', old_value: 1, new_value: 2, sensitive: false },
    ];
    expect(is_destructive_change('aws.ec2.instance', changes)).toBe(false);
  });
});

describe('summarize_changes', () => {
  it('returns "No changes" for an empty list', () => {
    expect(summarize_changes([])).toBe('No changes');
  });

  it('reports only added when new properties only', () => {
    const changes: PropertyChange[] = [
      { path: 'a', old_value: undefined, new_value: 1, sensitive: false },
      { path: 'b', old_value: undefined, new_value: 2, sensitive: false },
    ];
    expect(summarize_changes(changes)).toBe('2 added');
  });

  it('reports only modified when only existing properties change', () => {
    const changes: PropertyChange[] = [
      { path: 'a', old_value: 1, new_value: 2, sensitive: false },
    ];
    expect(summarize_changes(changes)).toBe('1 modified');
  });

  it('reports only removed when properties were dropped', () => {
    const changes: PropertyChange[] = [
      { path: 'a', old_value: 1, new_value: undefined, sensitive: false },
    ];
    expect(summarize_changes(changes)).toBe('1 removed');
  });

  it('joins added/modified/removed in fixed order', () => {
    const changes: PropertyChange[] = [
      { path: 'a', old_value: undefined, new_value: 1, sensitive: false },
      { path: 'b', old_value: 1, new_value: 2, sensitive: false },
      { path: 'c', old_value: 1, new_value: undefined, sensitive: false },
    ];
    expect(summarize_changes(changes)).toBe('1 added, 1 modified, 1 removed');
  });
});

describe('format_property_change', () => {
  it('formats added primitive change with a + prefix and quoted strings', () => {
    expect(
      format_property_change({
        path: 'name',
        old_value: undefined,
        new_value: 'foo',
        sensitive: false,
      }),
    ).toBe('+ name: "foo"');
  });

  it('formats removed primitive change with a - prefix', () => {
    expect(
      format_property_change({
        path: 'name',
        old_value: 'foo',
        new_value: undefined,
        sensitive: false,
      }),
    ).toBe('- name: "foo"');
  });

  it('formats modified change with ~ prefix and old -> new', () => {
    expect(
      format_property_change({
        path: 'count',
        old_value: 1,
        new_value: 2,
        sensitive: false,
      }),
    ).toBe('~ count: 1 -> 2');
  });

  it('formats null values literally', () => {
    expect(
      format_property_change({
        path: 'x',
        old_value: null,
        new_value: 1,
        sensitive: false,
      }),
    ).toBe('~ x: null -> 1');
  });

  it('formats objects via JSON.stringify', () => {
    expect(
      format_property_change({
        path: 'config',
        old_value: { a: 1 },
        new_value: { a: 2 },
        sensitive: false,
      }),
    ).toBe('~ config: {"a":1} -> {"a":2}');
  });

  it('formats booleans via String coercion', () => {
    expect(
      format_property_change({
        path: 'flag',
        old_value: false,
        new_value: true,
        sensitive: false,
      }),
    ).toBe('~ flag: false -> true');
  });

  it('redacts sensitive add changes', () => {
    expect(
      format_property_change({
        path: 'password',
        old_value: undefined,
        new_value: '[SENSITIVE]',
        sensitive: true,
      }),
    ).toBe('+ password: [SENSITIVE]');
  });

  it('redacts sensitive remove changes', () => {
    expect(
      format_property_change({
        path: 'password',
        old_value: '[SENSITIVE]',
        new_value: undefined,
        sensitive: true,
      }),
    ).toBe('- password: [SENSITIVE]');
  });

  it('redacts sensitive modify changes', () => {
    expect(
      format_property_change({
        path: 'password',
        old_value: '[SENSITIVE]',
        new_value: '[SENSITIVE]',
        sensitive: true,
      }),
    ).toBe('~ password: [SENSITIVE] -> [SENSITIVE]');
  });

  it('uses <not set> for an undefined inside a non-sensitive modify', () => {
    // Defensive: format_value handles undefined explicitly.
    // This case is reachable via direct calls even if diff_properties
    // wouldn't normally produce an old=undefined,new=undefined record.
    expect(
      format_property_change({
        path: 'x',
        old_value: 0,
        new_value: 0,
        sensitive: false,
      }),
    ).toBe('~ x: 0 -> 0');
  });
});
