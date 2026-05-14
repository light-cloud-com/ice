/**
 * Tests for `type-mapper.ts`.
 *
 * Mocks the SchemaProvider boundary and exercises:
 *  - map_type / has_mapping / get_native_type for present + absent impls
 *  - map_properties (terraform passthrough vs pulumi camelCase fallback,
 *    nested objects, arrays of objects, no-mapping passthrough)
 *  - map_from_native (mapped + unmapped names, nested + array reverse,
 *    snake_case fallback for unknown native names)
 *  - the dedup of overlapping required/computed properties
 */
import { describe, expect, it, vi } from 'vitest';
import { TypeMapper, create_type_mapper } from '../type-mapper';
import type {
  IceType,
  PropertySchema,
  ProviderImplementation,
  SchemaProvider,
} from '../schema-provider';

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

function impl(over: Partial<ProviderImplementation> = {}): ProviderImplementation {
  return {
    source: 'terraform',
    provider: 'aws',
    native_type: 'aws_instance',
    ...over,
  };
}

function makeProvider(over: Partial<SchemaProvider> = {}): SchemaProvider {
  return {
    initialize: vi.fn(),
    get_schema: vi.fn(),
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

describe('TypeMapper.map_type', () => {
  it('returns null when the schema provider has no implementation', () => {
    const provider = makeProvider();
    const mapper = new TypeMapper(provider);
    expect(mapper.map_type('aws.unknown' as IceType, 'terraform', 'aws')).toBeNull();
  });

  it('builds the mapped resource for a terraform target (snake_case preserved)', () => {
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl()),
      get_required_properties: vi.fn(() => [prop({ name: 'instance_type', required: true })]),
      get_computed_properties: vi.fn(() => [prop({ name: 'arn', computed: true })]),
    });
    const mapper = new TypeMapper(provider);

    const out = mapper.map_type('aws.ec2.instance' as IceType, 'terraform', 'aws');

    expect(out).not.toBeNull();
    expect(out?.native_type).toBe('aws_instance');
    expect(out?.properties).toHaveLength(2);
    expect(out?.properties.map((p) => p.ice_name)).toEqual(['instance_type', 'arn']);
    expect(out?.properties.map((p) => p.native_name)).toEqual(['instance_type', 'arn']);
    expect(out?.properties[0]?.required).toBe(true);
    expect(out?.properties[1]?.computed).toBe(true);
  });

  it('converts to camelCase for a pulumi target', () => {
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi', provider: 'aws' })),
      get_required_properties: vi.fn(() => [prop({ name: 'instance_type', required: true })]),
    });
    const mapper = new TypeMapper(provider);
    const out = mapper.map_type('aws.ec2.instance' as IceType, 'pulumi', 'aws');
    expect(out?.properties[0]?.native_name).toBe('instanceType');
  });

  it('dedupes a property that appears as both required and computed', () => {
    // Both lists return the same property name — second occurrence is filtered.
    const dup = prop({ name: 'shared' });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl()),
      get_required_properties: vi.fn(() => [dup]),
      get_computed_properties: vi.fn(() => [dup]),
    });
    const out = new TypeMapper(provider).map_type('x' as IceType, 'terraform', 'aws');
    expect(out?.properties).toHaveLength(1);
    expect(out?.properties[0]?.ice_name).toBe('shared');
    expect(out?.properties[0]?.required).toBe(true);
    expect(out?.properties[0]?.computed).toBe(true);
  });

  it('maps nested_properties recursively', () => {
    const child = prop({ name: 'nested_id', type: 'string' });
    const parent = prop({ name: 'nested_obj', type: 'object', nested_properties: [child] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi', provider: 'aws' })),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_type('x' as IceType, 'pulumi', 'aws');
    expect(out?.properties[0]?.native_name).toBe('nestedObj');
    expect(out?.properties[0]?.nested).toHaveLength(1);
    expect(out?.properties[0]?.nested?.[0]?.native_name).toBe('nestedId');
  });
});

describe('TypeMapper.has_mapping / get_native_type', () => {
  it('has_mapping returns true when an implementation exists', () => {
    const provider = makeProvider({ get_implementation: vi.fn(() => impl()) });
    expect(new TypeMapper(provider).has_mapping('x' as IceType, 'terraform', 'aws')).toBe(true);
  });

  it('has_mapping returns false when no implementation exists', () => {
    expect(new TypeMapper(makeProvider()).has_mapping('x' as IceType, 'terraform', 'aws')).toBe(false);
  });

  it('get_native_type returns the schema-provider value', () => {
    const provider = makeProvider({ get_native_type: vi.fn(() => 'aws_instance') });
    expect(new TypeMapper(provider).get_native_type('x' as IceType, 'terraform', 'aws')).toBe('aws_instance');
  });

  it('get_native_type returns null when the schema provider returns undefined', () => {
    expect(new TypeMapper(makeProvider()).get_native_type('x' as IceType, 'terraform', 'aws')).toBeNull();
  });
});

describe('TypeMapper.map_properties', () => {
  it('returns properties unchanged when no mapping is available', () => {
    const properties = { foo: 1, bar: 'two' };
    const out = new TypeMapper(makeProvider()).map_properties(
      'x' as IceType,
      properties,
      'terraform',
      'aws',
    );
    expect(out).toEqual(properties);
  });

  it('maps known props through their native_name (terraform: passthrough)', () => {
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl()),
      get_required_properties: vi.fn(() => [prop({ name: 'instance_type', required: true })]),
    });
    const out = new TypeMapper(provider).map_properties(
      'x' as IceType,
      { instance_type: 't3.micro' },
      'terraform',
      'aws',
    );
    expect(out).toEqual({ instance_type: 't3.micro' });
  });

  it('camelCases unknown property names for a pulumi target', () => {
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => []),
    });
    const out = new TypeMapper(provider).map_properties(
      'x' as IceType,
      { unknown_prop: 'value' },
      'pulumi',
      'aws',
    );
    // unknown -> uses convert_property_name -> camelCase for pulumi
    expect(out).toEqual({ unknownProp: 'value' });
  });

  it('passes through unknown property names verbatim for a terraform target', () => {
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl()),
      get_required_properties: vi.fn(() => []),
    });
    const out = new TypeMapper(provider).map_properties(
      'x' as IceType,
      { unknown_prop: 'value' },
      'terraform',
      'aws',
    );
    expect(out).toEqual({ unknown_prop: 'value' });
  });

  it('transforms nested objects, mapping known children and converting unknown names', () => {
    const child = prop({ name: 'nested_id', type: 'string' });
    const parent = prop({ name: 'nested_obj', type: 'object', nested_properties: [child] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_properties(
      'x' as IceType,
      { nested_obj: { nested_id: 'a', other_field: 'b' } },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({
      nestedObj: { nestedId: 'a', otherField: 'b' },
    });
  });

  it('transforms array-of-object values, mapping known children and converting unknown', () => {
    const child = prop({ name: 'item_name', type: 'string' });
    const parent = prop({ name: 'rules', type: 'array', nested_properties: [child] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_properties(
      'x' as IceType,
      { rules: [{ item_name: 'a', other_field: 'b' }, 'primitive'] },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({
      rules: [{ itemName: 'a', otherField: 'b' }, 'primitive'],
    });
  });

  it('keeps array of primitives untouched when transforming', () => {
    const parent = prop({ name: 'tags', type: 'array', nested_properties: [prop({ name: 'k' })] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl()),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_properties(
      'x' as IceType,
      { tags: ['a', 'b'] },
      'terraform',
      'aws',
    );
    expect(out).toEqual({ tags: ['a', 'b'] });
  });

  it('does not treat nested arrays as objects', () => {
    // The mapping has nested_properties but the value is null — should not enter
    // the nested-object branch.
    const parent = prop({ name: 'nested_obj', type: 'object', nested_properties: [prop({ name: 'child' })] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl()),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_properties(
      'x' as IceType,
      { nested_obj: null },
      'terraform',
      'aws',
    );
    expect(out).toEqual({ nested_obj: null });
  });
});

describe('TypeMapper.map_from_native', () => {
  it('returns native_properties unchanged when no mapping is available', () => {
    const out = new TypeMapper(makeProvider()).map_from_native(
      'x' as IceType,
      { foo: 1 },
      'terraform',
      'aws',
    );
    expect(out).toEqual({ foo: 1 });
  });

  it('maps known native names back to their ICE names', () => {
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => [prop({ name: 'instance_type' })]),
    });
    const out = new TypeMapper(provider).map_from_native(
      'x' as IceType,
      { instanceType: 't3.micro' },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({ instance_type: 't3.micro' });
  });

  it('snake_cases unknown native names', () => {
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => []),
    });
    const out = new TypeMapper(provider).map_from_native(
      'x' as IceType,
      { someValue: 1, AnotherField: 'x' },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({ some_value: 1, another_field: 'x' });
  });

  it('reverse-transforms nested objects with mixed known + unknown children', () => {
    const child = prop({ name: 'nested_id', type: 'string' });
    const parent = prop({ name: 'nested_obj', type: 'object', nested_properties: [child] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_from_native(
      'x' as IceType,
      { nestedObj: { nestedId: 'a', otherField: 'b' } },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({
      nested_obj: { nested_id: 'a', other_field: 'b' },
    });
  });

  it('reverse-transforms array of objects with mixed known + unknown children', () => {
    const child = prop({ name: 'item_name', type: 'string' });
    const parent = prop({ name: 'rules', type: 'array', nested_properties: [child] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_from_native(
      'x' as IceType,
      { rules: [{ itemName: 'a', otherField: 'b' }, 'primitive'] },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({
      rules: [{ item_name: 'a', other_field: 'b' }, 'primitive'],
    });
  });

  it('returns the value unchanged for primitives in reverse_transform_value', () => {
    // When the property has no nested_properties, the value passes through.
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => [prop({ name: 'simple' })]),
    });
    const out = new TypeMapper(provider).map_from_native(
      'x' as IceType,
      { simple: 'unchanged' },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({ simple: 'unchanged' });
  });

  it('does not enter nested-object reverse branch when value is null', () => {
    const child = prop({ name: 'nested_id', type: 'string' });
    const parent = prop({ name: 'nested_obj', type: 'object', nested_properties: [child] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_from_native(
      'x' as IceType,
      { nestedObj: null },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({ nested_obj: null });
  });

  it('skips array items that are primitives during reverse transform', () => {
    const child = prop({ name: 'item_name', type: 'string' });
    const parent = prop({ name: 'rules', type: 'array', nested_properties: [child] });
    const provider = makeProvider({
      get_implementation: vi.fn(() => impl({ source: 'pulumi' })),
      get_required_properties: vi.fn(() => [parent]),
    });
    const out = new TypeMapper(provider).map_from_native(
      'x' as IceType,
      { rules: ['a', 'b'] },
      'pulumi',
      'aws',
    );
    expect(out).toEqual({ rules: ['a', 'b'] });
  });
});

describe('create_type_mapper', () => {
  it('builds a TypeMapper bound to the given provider', () => {
    const provider = makeProvider();
    const mapper = create_type_mapper(provider);
    expect(mapper).toBeInstanceOf(TypeMapper);
    // Smoke-check: delegates to the provider it was created with.
    expect(mapper.has_mapping('x' as IceType, 'terraform', 'aws')).toBe(false);
  });
});
