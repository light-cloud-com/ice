/**
 * Type Mapper
 *
 * Maps ICE types and properties to native provider types.
 * Handles differences between Terraform and Pulumi naming conventions.
 */

import type { IceType, PropertySchema, ProviderImplementation, SchemaProvider } from './schema-provider.js';

// =============================================================================
// Mapping Types
// =============================================================================

/**
 * Mapped resource for a specific provider.
 */
export interface MappedResource {
  /** ICE type */
  readonly ice_type: IceType;

  /** Target provider source */
  readonly source: 'terraform' | 'pulumi';

  /** Target provider name */
  readonly provider: string;

  /** Native resource type */
  readonly native_type: string;

  /** Mapped properties */
  readonly properties: MappedProperty[];

  /** Provider implementation info */
  readonly implementation: ProviderImplementation;
}

/**
 * Mapped property for a specific provider.
 */
export interface MappedProperty {
  /** ICE property name */
  readonly ice_name: string;

  /** Native property name */
  readonly native_name: string;

  /** Property type */
  readonly type: string;

  /** Whether the property is required */
  readonly required: boolean;

  /** Whether the property is computed */
  readonly computed: boolean;

  /** Whether the property is sensitive */
  readonly sensitive: boolean;

  /** Nested mapped properties */
  readonly nested?: MappedProperty[];
}

/**
 * Property value with transformations applied.
 */
export interface TransformedValue {
  /** Native property name */
  readonly name: string;

  /** Transformed value */
  readonly value: unknown;

  /** Whether transformation was applied */
  readonly transformed: boolean;
}

// =============================================================================
// Type Mapper
// =============================================================================

/**
 * Maps ICE types to native provider types.
 */
export class TypeMapper {
  constructor(private readonly schema_provider: SchemaProvider) {}

  /**
   * Map an ICE type to a native provider type.
   */
  map_type(ice_type: IceType, source: 'terraform' | 'pulumi', provider: string): MappedResource | null {
    const impl = this.schema_provider.get_implementation(ice_type, source, provider);

    if (!impl) {
      return null;
    }

    const required_props = this.schema_provider.get_required_properties(ice_type);
    const computed_props = this.schema_provider.get_computed_properties(ice_type);

    // Build property set for lookup
    const required_set = new Set(required_props.map((p) => p.name));
    const computed_set = new Set(computed_props.map((p) => p.name));

    // Get all properties
    const all_props = [...required_props];
    for (const prop of computed_props) {
      if (!required_set.has(prop.name)) {
        all_props.push(prop);
      }
    }

    const mapped_properties = all_props.map((prop) => this.map_property(prop, source, required_set, computed_set));

    return {
      ice_type,
      source,
      provider,
      native_type: impl.native_type,
      properties: mapped_properties,
      implementation: impl,
    };
  }

  /**
   * Map ICE properties to native provider format.
   */
  map_properties(
    ice_type: IceType,
    properties: Record<string, unknown>,
    source: 'terraform' | 'pulumi',
    provider: string,
  ): Record<string, unknown> {
    const mapped = this.map_type(ice_type, source, provider);

    if (!mapped) {
      // No mapping available, return as-is
      return properties;
    }

    const result: Record<string, unknown> = {};

    for (const [ice_name, value] of Object.entries(properties)) {
      const prop_mapping = mapped.properties.find((p) => p.ice_name === ice_name);

      if (prop_mapping) {
        const transformed = this.transform_value(value, prop_mapping, source);
        result[transformed.name] = transformed.value;
      } else {
        // No mapping, use original name with case conversion
        result[this.convert_property_name(ice_name, source)] = value;
      }
    }

    return result;
  }

  /**
   * Map native provider properties back to ICE format.
   */
  map_from_native(
    ice_type: IceType,
    native_properties: Record<string, unknown>,
    source: 'terraform' | 'pulumi',
    provider: string,
  ): Record<string, unknown> {
    const mapped = this.map_type(ice_type, source, provider);

    if (!mapped) {
      return native_properties;
    }

    const result: Record<string, unknown> = {};

    for (const [native_name, value] of Object.entries(native_properties)) {
      const prop_mapping = mapped.properties.find((p) => p.native_name === native_name);

      if (prop_mapping) {
        result[prop_mapping.ice_name] = this.reverse_transform_value(value, prop_mapping, source);
      } else {
        // No mapping, convert to snake_case
        result[this.to_snake_case(native_name)] = value;
      }
    }

    return result;
  }

  /**
   * Get the native type for an ICE type.
   */
  get_native_type(ice_type: IceType, source: 'terraform' | 'pulumi', provider: string): string | null {
    return this.schema_provider.get_native_type(ice_type, source, provider) ?? null;
  }

  /**
   * Check if a mapping exists for an ICE type.
   */
  has_mapping(ice_type: IceType, source: 'terraform' | 'pulumi', provider: string): boolean {
    return this.schema_provider.get_implementation(ice_type, source, provider) !== undefined;
  }

  /**
   * Map a property to native format.
   */
  private map_property(
    prop: PropertySchema,
    source: 'terraform' | 'pulumi',
    required_set: Set<string>,
    computed_set: Set<string>,
  ): MappedProperty {
    const native_name = this.convert_property_name(prop.name, source);

    return {
      ice_name: prop.name,
      native_name,
      type: prop.type,
      required: required_set.has(prop.name),
      computed: computed_set.has(prop.name),
      sensitive: prop.sensitive,
      nested: prop.nested_properties?.map((nested) => this.map_property(nested, source, new Set(), new Set())),
    };
  }

  /**
   * Convert ICE property name to native format.
   */
  private convert_property_name(ice_name: string, source: 'terraform' | 'pulumi'): string {
    // ICE uses snake_case
    // Terraform uses snake_case
    // Pulumi uses camelCase

    if (source === 'terraform') {
      return ice_name; // Already snake_case
    }

    // Convert to camelCase for Pulumi
    return this.to_camel_case(ice_name);
  }

  /**
   * Transform a value for the target provider.
   */
  private transform_value(value: unknown, mapping: MappedProperty, source: 'terraform' | 'pulumi'): TransformedValue {
    let transformed_value = value;
    let was_transformed = false;

    // Handle nested objects
    if (mapping.nested && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const transformed_obj: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(obj)) {
        const nested_mapping = mapping.nested.find((n) => n.ice_name === key);
        if (nested_mapping) {
          const result = this.transform_value(val, nested_mapping, source);
          transformed_obj[result.name] = result.value;
          was_transformed = was_transformed || result.transformed;
        } else {
          transformed_obj[this.convert_property_name(key, source)] = val;
        }
      }

      transformed_value = transformed_obj;
      was_transformed = true;
    }

    // Handle arrays of objects
    if (mapping.nested && Array.isArray(value)) {
      transformed_value = value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const transformed_obj: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(item)) {
            const nested_mapping = mapping.nested?.find((n) => n.ice_name === key);
            if (nested_mapping) {
              const result = this.transform_value(val, nested_mapping, source);
              transformed_obj[result.name] = result.value;
            } else {
              transformed_obj[this.convert_property_name(key, source)] = val;
            }
          }
          return transformed_obj;
        }
        return item;
      });
      was_transformed = true;
    }

    return {
      name: mapping.native_name,
      value: transformed_value,
      transformed: was_transformed,
    };
  }

  /**
   * Reverse transform a value from native format.
   */
  private reverse_transform_value(value: unknown, mapping: MappedProperty, source: 'terraform' | 'pulumi'): unknown {
    // Handle nested objects
    if (mapping.nested && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(obj)) {
        const nested_mapping = mapping.nested.find((n) => n.native_name === key);
        if (nested_mapping) {
          result[nested_mapping.ice_name] = this.reverse_transform_value(val, nested_mapping, source);
        } else {
          result[this.to_snake_case(key)] = val;
        }
      }

      return result;
    }

    // Handle arrays of objects
    if (mapping.nested && Array.isArray(value)) {
      return value.map((item) => {
        if (typeof item === 'object' && item !== null) {
          const result: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(item)) {
            const nested_mapping = mapping.nested?.find((n) => n.native_name === key);
            if (nested_mapping) {
              result[nested_mapping.ice_name] = this.reverse_transform_value(val, nested_mapping, source);
            } else {
              result[this.to_snake_case(key)] = val;
            }
          }
          return result;
        }
        return item;
      });
    }

    return value;
  }

  /**
   * Convert snake_case to camelCase.
   */
  private to_camel_case(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Convert camelCase to snake_case.
   */
  private to_snake_case(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a type mapper.
 */
export function create_type_mapper(schema_provider: SchemaProvider): TypeMapper {
  return new TypeMapper(schema_provider);
}
