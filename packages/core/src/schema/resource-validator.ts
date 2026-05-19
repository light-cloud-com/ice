/**
 * Resource Validator
 *
 * Validates resource properties against schemas.
 * Provides detailed validation errors with paths and suggestions.
 */

import { ValidationError } from '../types/errors';
import { success, failure } from '../types/result';
import type { IceType, SchemaProvider } from './schema-provider';
import type { Result } from '../types/result';
import { to_validation_error } from './validation/error-conversion';
import { validate_property } from './validation/property-validator';

// Re-export the validation types (extracted in rf-rval-1 to a sibling
// file so the helpers can import without pulling in the orchestrator).
export type {
  ValidationCode,
  ValidationIssue,
  ValidationOptions,
  ValidationResult,
  ValidationSeverity,
} from './resource-validator-types';
import type { ValidationIssue, ValidationOptions, ValidationResult } from './resource-validator-types';

// =============================================================================
// Resource Validator
// =============================================================================

/**
 * Validates resources against their schemas.
 */
export class ResourceValidator {
  constructor(private readonly schema_provider: SchemaProvider) {}

  /**
   * Validate a resource's properties against its schema.
   */
  async validate(
    ice_type: IceType,
    properties: Record<string, unknown>,
    options: ValidationOptions = {},
  ): Promise<Result<ValidationResult, ValidationError>> {
    // Get the schema
    const schema_result = await this.schema_provider.get_schema(ice_type);

    if (!schema_result.ok) {
      return failure(
        new ValidationError(
          `Schema not found: ${ice_type}`,
          [{ path: '', message: `Unknown resource type: ${ice_type}`, code: 'SCHEMA_NOT_FOUND' }],
          'SCHEMA_NOT_FOUND',
        ),
      );
    }

    const schema = schema_result.value;
    const issues: ValidationIssue[] = [];
    const max_depth = options.max_depth ?? 10;
    const skip_set = new Set(options.skip_properties ?? []);

    // Validate each schema property
    for (const prop_schema of schema.properties) {
      if (skip_set.has(prop_schema.name)) continue;

      const prop_issues = validate_property(
        prop_schema.name,
        properties[prop_schema.name],
        prop_schema,
        options,
        0,
        max_depth,
      );
      issues.push(...prop_issues);
    }

    // Check for unknown properties in strict mode
    if (options.strict) {
      const known_props = new Set(schema.properties.map((p) => p.name));
      for (const prop_name of Object.keys(properties)) {
        if (!known_props.has(prop_name) && !skip_set.has(prop_name)) {
          issues.push({
            path: prop_name,
            message: `Unknown property: ${prop_name}`,
            severity: 'warning',
            code: 'UNKNOWN_PROPERTY',
            suggestion: `Remove property or check schema for ${ice_type}`,
          });
        }
      }
    }

    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    const result: ValidationResult = {
      valid: errors.length === 0,
      ice_type,
      issues: options.include_warnings === false ? errors : issues,
      errors,
      warnings,
      validated_at: new Date().toISOString(),
    };

    return success(result);
  }

  /**
   * Convert validation result to ValidationError.
   */
  to_validation_error(result: ValidationResult): ValidationError | null {
    return to_validation_error(result);
  }

  /**
   * Quick validation check (returns boolean only).
   */
  async is_valid(ice_type: IceType, properties: Record<string, unknown>): Promise<boolean> {
    const result = await this.validate(ice_type, properties);
    return result.ok && result.value.valid;
  }

  /**
   * Get validation issues for a specific property.
   */
  async validate_property_value(ice_type: IceType, property_path: string, value: unknown): Promise<ValidationIssue[]> {
    const prop_schema = this.schema_provider.get_property_schema(ice_type, property_path);

    if (!prop_schema) {
      return [
        {
          path: property_path,
          message: `Property not found in schema: ${property_path}`,
          severity: 'error',
          code: 'UNKNOWN_PROPERTY',
        },
      ];
    }

    return validate_property(property_path, value, prop_schema, {}, 0, 10);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a resource validator.
 */
export function create_resource_validator(schema_provider: SchemaProvider): ResourceValidator {
  return new ResourceValidator(schema_provider);
}
