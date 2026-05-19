/**
 * Tests for `validation/property-validator.ts` (rf-rval-3).
 *
 * Behaviour pinned (preserved from `validate_property` private method of
 * ResourceValidator):
 *  - Required missing on a required schema -> single MISSING_REQUIRED, no
 *    further checks (early return).
 *  - Optional missing -> no issues (early return).
 *  - Type mismatch -> single TYPE_MISMATCH, skips constraint and nested.
 *  - Constraints invoked when schema.validation is set.
 *  - Nested object: recurses into each child with `${path}.${child.name}`.
 *  - Nested array: walks each item; only object items receive nested checks.
 *  - depth >= max_depth halts nested recursion (top-level still validated).
 */
import { describe, expect, it } from 'vitest';
import { validate_property } from '../validation/property-validator';
import type { PropertySchema } from '../schema-provider';

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

describe('validate_property — top-level', () => {
  it('returns MISSING_REQUIRED when required and value is undefined', () => {
    const r = validate_property('p', undefined, prop({ required: true }), {}, 0, 10);
    expect(r).toHaveLength(1);
    expect(r[0]?.code).toBe('MISSING_REQUIRED');
    expect(r[0]?.message).toBe(`Required property 'p' is missing`);
    expect(r[0]?.expected).toBe('string');
  });

  it('returns MISSING_REQUIRED when required and value is null', () => {
    const r = validate_property('p', null, prop({ required: true }), {}, 0, 10);
    expect(r[0]?.code).toBe('MISSING_REQUIRED');
  });

  it('returns no issues for optional missing property', () => {
    expect(validate_property('p', undefined, prop({ required: false }), {}, 0, 10)).toEqual([]);
  });

  it('flags type mismatch and skips constraint checks', () => {
    const r = validate_property(
      'p',
      42, // wrong type
      prop({ type: 'string', validation: { min_length: 100 } }),
      {},
      0,
      10,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.code).toBe('TYPE_MISMATCH');
  });

  it('runs constraint checks when type matches', () => {
    const r = validate_property('p', 'ab', prop({ type: 'string', validation: { min_length: 5 } }), {}, 0, 10);
    expect(r).toHaveLength(1);
    expect(r[0]?.code).toBe('STRING_TOO_SHORT');
  });
});

describe('validate_property — nested object', () => {
  it('recurses into child properties with dotted paths', () => {
    const schema = prop({
      type: 'object',
      nested_properties: [prop({ name: 'child', required: true })],
    });
    const r = validate_property('parent', {}, schema, {}, 0, 10);
    expect(r).toHaveLength(1);
    expect(r[0]?.code).toBe('MISSING_REQUIRED');
    expect(r[0]?.path).toBe('parent.child');
  });

  it('passes value through to child', () => {
    const schema = prop({
      type: 'object',
      nested_properties: [prop({ name: 'child', type: 'number' })],
    });
    const r = validate_property('parent', { child: 'oops' }, schema, {}, 0, 10);
    expect(r[0]?.code).toBe('TYPE_MISMATCH');
    expect(r[0]?.path).toBe('parent.child');
  });

  it('does not descend into objects when type is not object', () => {
    // type: 'string' but with nested_properties — original code only
    // recurses for object/array.
    const schema = prop({
      type: 'string',
      nested_properties: [prop({ name: 'child', required: true })],
    });
    const r = validate_property('parent', 'plain', schema, {}, 0, 10);
    expect(r).toEqual([]);
  });
});

describe('validate_property — nested array', () => {
  it('walks each array item and applies nested schema', () => {
    const schema = prop({
      type: 'array',
      nested_properties: [prop({ name: 'item_id', required: true })],
    });
    const r = validate_property('items', [{ item_id: 'a' }, {}], schema, {}, 0, 10);
    // First item: child present, no issue. Second: missing -> issue.
    expect(r).toHaveLength(1);
    expect(r[0]?.path).toBe('items[1].item_id');
    expect(r[0]?.code).toBe('MISSING_REQUIRED');
  });

  it('skips non-object array items', () => {
    const schema = prop({
      type: 'array',
      nested_properties: [prop({ name: 'name', required: true })],
    });
    // primitives in array: nested checks not applied.
    const r = validate_property('xs', ['a', null, undefined, 1], schema, {}, 0, 10);
    expect(r).toEqual([]);
  });
});

describe('validate_property — depth limit', () => {
  it('does not recurse past max_depth', () => {
    const inner = prop({ name: 'inner', required: true });
    const middle = prop({ name: 'middle', type: 'object', nested_properties: [inner] });
    const outer = prop({ name: 'outer', type: 'object', nested_properties: [middle] });

    // max_depth = 1: only the first level of nested recursion runs.
    const r = validate_property('outer', { middle: {} }, outer, {}, 0, 1);
    // Recursion at outer is depth=0, then recurses into middle (depth=1).
    // At depth=1 the recursion is allowed (depth < max_depth would be
    // 1 < 1 -> false, so it does NOT descend further from middle).
    // Therefore no MISSING_REQUIRED for inner.
    expect(r).toEqual([]);
  });

  it('produces nested issues when depth budget allows', () => {
    const inner = prop({ name: 'inner', required: true });
    const middle = prop({ name: 'middle', type: 'object', nested_properties: [inner] });
    const outer = prop({ name: 'outer', type: 'object', nested_properties: [middle] });

    const r = validate_property('outer', { middle: {} }, outer, {}, 0, 10);
    expect(r).toHaveLength(1);
    expect(r[0]?.path).toBe('outer.middle.inner');
  });
});
