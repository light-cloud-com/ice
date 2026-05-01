/**
 * SQLite -> Public schema converters.
 *
 * Pure functions extracted from `EmbeddedSchemaProvider` (rf-esp-1):
 *   - `convert_resource_to_schema` (was the private method of the same name)
 *   - `convert_property` (was the private method of the same name)
 *
 * Conversion is byte-identical to the pre-extraction class methods. Tests
 * pin the exact field shapes for both nested and validation cases.
 */
import type { IceType, PropertySchema, ResourceSchema } from '../schema-provider.js';
import type { SqliteProperty, SqliteResourceType, SqliteSchemaRegistry } from './sqlite-types.js';

/**
 * Convert a `SqliteResourceType` row + its child properties/implementations
 * into the public `ResourceSchema` shape.
 *
 * Reads from the registry to pull `get_properties` and `get_implementations`
 * for the resource. If the registry is null, both arrays default to `[]`,
 * preserving the original behaviour where a missing registry produced
 * an empty schema rather than throwing.
 */
export function convert_resource_to_schema(
  registry: SqliteSchemaRegistry | null,
  resource: SqliteResourceType,
): ResourceSchema {
  const properties = registry?.get_properties(resource.ice_type) ?? [];
  const implementations = registry?.get_implementations(resource.ice_type) ?? [];

  return {
    ice_type: resource.ice_type as IceType,
    display_name: resource.display_name,
    description: resource.description ?? '',
    category: resource.category,
    properties: properties.map((p) => convert_property(p)),
    implementations: implementations.map((i) => ({
      source: i.source as 'terraform' | 'pulumi',
      provider: i.provider_name,
      native_type: i.native_type,
      docs_url: i.docs_url ?? undefined,
    })),
  };
}

/**
 * Convert a `SqliteProperty` row into the public `PropertySchema` shape.
 * Recurses for `nested_properties`. Validation fields are nullable in
 * SQLite and are normalised to `undefined` to match the original contract.
 */
export function convert_property(prop: SqliteProperty): PropertySchema {
  return {
    name: prop.name,
    type: prop.type as PropertySchema['type'],
    description: prop.description ?? '',
    required: prop.required,
    computed: prop.computed,
    sensitive: prop.sensitive,
    validation: prop.validation
      ? {
          pattern: prop.validation.pattern ?? undefined,
          allowed_values: prop.validation.enum_values,
          min: prop.validation.min_value ?? undefined,
          max: prop.validation.max_value ?? undefined,
          min_length: prop.validation.min_length ?? undefined,
          max_length: prop.validation.max_length ?? undefined,
        }
      : undefined,
    nested_properties: prop.nested_properties?.map((p) => convert_property(p)),
  };
}
