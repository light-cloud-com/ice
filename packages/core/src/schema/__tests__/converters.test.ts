/**
 * Tests for `embedded/converters.ts` (rf-esp-1).
 *
 * Behaviour pinned (preserved verbatim from pre-extraction methods of
 * `EmbeddedSchemaProvider`):
 *  - convert_resource_to_schema reads `get_properties` and `get_implementations`
 *    from the registry; on null registry both default to `[]`.
 *  - description nulls -> empty string. docs_url nulls -> undefined.
 *  - convert_property maps SQLite validation row to PropertySchema.validation
 *    with enum_values -> allowed_values, min_value -> min, max_value -> max,
 *    nullable fields -> undefined; nested_properties recurses.
 *  - to_sqlite_query forwards every field; source cast is preserved.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  convert_property,
  convert_resource_to_schema,
} from '../embedded/converters.js';
import { to_sqlite_query } from '../embedded/sqlite-types.js';
import type {
  SqliteImplementation,
  SqliteProperty,
  SqliteResourceType,
  SqliteSchemaRegistry,
} from '../embedded/sqlite-types.js';

function makeRegistry(
  props: SqliteProperty[] = [],
  impls: SqliteImplementation[] = [],
): SqliteSchemaRegistry {
  return {
    get_properties: vi.fn(() => props),
    get_implementations: vi.fn(() => impls),
  } as unknown as SqliteSchemaRegistry;
}

function baseProp(overrides: Partial<SqliteProperty> = {}): SqliteProperty {
  return {
    id: 1,
    resource_type_id: 1,
    name: 'p',
    type: 'string',
    description: null,
    required: false,
    computed: false,
    sensitive: false,
    deprecated: false,
    default_value: null,
    parent_property_id: null,
    element_type: null,
    ...overrides,
  };
}

function baseResource(overrides: Partial<SqliteResourceType> = {}): SqliteResourceType {
  return {
    id: 1,
    ice_type: 'aws.ec2.instance',
    display_name: 'EC2 Instance',
    description: null,
    category: 'compute',
    icon: null,
    source: 'terraform',
    deprecated: false,
    deprecation_message: null,
    ...overrides,
  };
}

describe('convert_property', () => {
  it('maps the basic fields verbatim', () => {
    const p = baseProp({
      name: 'instance_type',
      type: 'string',
      description: 'EC2 type',
      required: true,
      computed: false,
      sensitive: false,
    });
    const out = convert_property(p);
    expect(out.name).toBe('instance_type');
    expect(out.type).toBe('string');
    expect(out.description).toBe('EC2 type');
    expect(out.required).toBe(true);
    expect(out.computed).toBe(false);
    expect(out.sensitive).toBe(false);
  });

  it('null description becomes empty string', () => {
    const out = convert_property(baseProp({ description: null }));
    expect(out.description).toBe('');
  });

  it('returns undefined validation when not provided', () => {
    const out = convert_property(baseProp({ validation: undefined }));
    expect(out.validation).toBeUndefined();
  });

  it('maps validation fields with null -> undefined and enum_values -> allowed_values', () => {
    const out = convert_property(
      baseProp({
        validation: {
          pattern: '^foo$',
          min_value: 1,
          max_value: 10,
          min_length: 3,
          max_length: 12,
          enum_values: ['a', 'b'],
        },
      }),
    );
    expect(out.validation).toEqual({
      pattern: '^foo$',
      allowed_values: ['a', 'b'],
      min: 1,
      max: 10,
      min_length: 3,
      max_length: 12,
    });
  });

  it('null validation sub-fields map to undefined', () => {
    const out = convert_property(
      baseProp({
        validation: {
          pattern: null,
          min_value: null,
          max_value: null,
          min_length: null,
          max_length: null,
        },
      }),
    );
    expect(out.validation).toEqual({
      pattern: undefined,
      allowed_values: undefined,
      min: undefined,
      max: undefined,
      min_length: undefined,
      max_length: undefined,
    });
  });

  it('recurses nested_properties', () => {
    const out = convert_property(
      baseProp({
        type: 'object',
        nested_properties: [
          baseProp({ name: 'child_a' }),
          baseProp({ name: 'child_b' }),
        ],
      }),
    );
    expect(out.nested_properties).toHaveLength(2);
    expect(out.nested_properties?.[0]?.name).toBe('child_a');
    expect(out.nested_properties?.[1]?.name).toBe('child_b');
  });

  it('omits nested_properties when undefined on the row', () => {
    const out = convert_property(baseProp({ nested_properties: undefined }));
    expect(out.nested_properties).toBeUndefined();
  });
});

describe('convert_resource_to_schema', () => {
  it('returns an empty properties/implementations schema when registry is null', () => {
    const out = convert_resource_to_schema(null, baseResource());
    expect(out.properties).toEqual([]);
    expect(out.implementations).toEqual([]);
  });

  it('forwards display_name, category, ice_type', () => {
    const out = convert_resource_to_schema(
      makeRegistry(),
      baseResource({ ice_type: 'aws.s3.bucket', display_name: 'S3 Bucket', category: 'storage' }),
    );
    expect(out.ice_type).toBe('aws.s3.bucket');
    expect(out.display_name).toBe('S3 Bucket');
    expect(out.category).toBe('storage');
  });

  it('null description on resource becomes empty string', () => {
    const out = convert_resource_to_schema(makeRegistry(), baseResource({ description: null }));
    expect(out.description).toBe('');
  });

  it('forwards properties through the converter', () => {
    const reg = makeRegistry([baseProp({ name: 'tag' })]);
    const out = convert_resource_to_schema(reg, baseResource());
    expect(out.properties).toHaveLength(1);
    expect(out.properties[0]?.name).toBe('tag');
  });

  it('maps implementations and normalises null docs_url to undefined', () => {
    const reg = makeRegistry(
      [],
      [
        {
          id: 1,
          resource_type_id: 1,
          source: 'terraform',
          provider_name: 'aws',
          native_type: 'aws_instance',
          docs_url: null,
          provider_version: null,
        },
      ],
    );
    const out = convert_resource_to_schema(reg, baseResource());
    expect(out.implementations).toEqual([
      {
        source: 'terraform',
        provider: 'aws',
        native_type: 'aws_instance',
        docs_url: undefined,
      },
    ]);
  });
});

describe('to_sqlite_query', () => {
  it('forwards every field verbatim', () => {
    const out = to_sqlite_query({
      ice_type: 't',
      category: 'c',
      provider: 'aws',
      source: 'terraform',
      search: 'q',
      limit: 10,
      offset: 5,
    });
    expect(out).toEqual({
      ice_type: 't',
      category: 'c',
      provider: 'aws',
      source: 'terraform',
      search: 'q',
      limit: 10,
      offset: 5,
    });
  });

  it('preserves undefined fields', () => {
    const out = to_sqlite_query({});
    expect(out).toEqual({
      ice_type: undefined,
      category: undefined,
      provider: undefined,
      source: undefined,
      search: undefined,
      limit: undefined,
      offset: undefined,
    });
  });
});
