/**
 * Resource Validator
 *
 * Validates resource properties against schemas.
 * Provides detailed validation errors with paths and suggestions.
 */

import type {
  IceType,
  PropertySchema,
  PropertyValidation,
  SchemaProvider,
} from './schema-provider.js';
import type { Result } from '../types/result.js';
import { success, failure } from '../types/result.js';
import { ValidationError } from '../types/errors.js';
import type { ValidationViolation } from '../types/errors.js';

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Validation severity level.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Single validation issue.
 */
export interface ValidationIssue {
  /** Property path (e.g., "network.subnet_id") */
  readonly path: string;

  /** Issue message */
  readonly message: string;

  /** Severity level */
  readonly severity: ValidationSeverity;

  /** Error code for programmatic handling */
  readonly code: ValidationCode;

  /** Expected value or type */
  readonly expected?: string;

  /** Actual value or type */
  readonly actual?: string;

  /** Suggested fix */
  readonly suggestion?: string;
}

/**
 * Validation error codes.
 */
export type ValidationCode =
  | 'MISSING_REQUIRED'
  | 'TYPE_MISMATCH'
  | 'PATTERN_MISMATCH'
  | 'VALUE_NOT_ALLOWED'
  | 'VALUE_TOO_SMALL'
  | 'VALUE_TOO_LARGE'
  | 'STRING_TOO_SHORT'
  | 'STRING_TOO_LONG'
  | 'ARRAY_TOO_SHORT'
  | 'ARRAY_TOO_LONG'
  | 'UNKNOWN_PROPERTY'
  | 'SCHEMA_NOT_FOUND'
  | 'NESTED_VALIDATION';

/**
 * Complete validation result.
 */
export interface ValidationResult {
  /** Whether validation passed (no errors) */
  readonly valid: boolean;

  /** ICE type that was validated */
  readonly ice_type: IceType;

  /** All validation issues */
  readonly issues: readonly ValidationIssue[];

  /** Just errors */
  readonly errors: readonly ValidationIssue[];

  /** Just warnings */
  readonly warnings: readonly ValidationIssue[];

  /** Validation timestamp */
  readonly validated_at: string;
}

/**
 * Options for validation.
 */
export interface ValidationOptions {
  /** Whether to report unknown properties */
  readonly strict?: boolean;

  /** Whether to include warnings */
  readonly include_warnings?: boolean;

  /** Maximum depth for nested validation */
  readonly max_depth?: number;

  /** Properties to skip validation for */
  readonly skip_properties?: string[];
}

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
    options: ValidationOptions = {}
  ): Promise<Result<ValidationResult, ValidationError>> {
    // Get the schema
    const schema_result = await this.schema_provider.get_schema(ice_type);

    if (!schema_result.ok) {
      return failure(
        new ValidationError(
          `Schema not found: ${ice_type}`,
          [{ path: '', message: `Unknown resource type: ${ice_type}`, code: 'SCHEMA_NOT_FOUND' }],
          'SCHEMA_NOT_FOUND'
        )
      );
    }

    const schema = schema_result.value;
    const issues: ValidationIssue[] = [];
    const max_depth = options.max_depth ?? 10;
    const skip_set = new Set(options.skip_properties ?? []);

    // Validate each schema property
    for (const prop_schema of schema.properties) {
      if (skip_set.has(prop_schema.name)) continue;

      const prop_issues = this.validate_property(
        prop_schema.name,
        properties[prop_schema.name],
        prop_schema,
        options,
        0,
        max_depth
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
   * Validate a single property.
   */
  private validate_property(
    path: string,
    value: unknown,
    schema: PropertySchema,
    options: ValidationOptions,
    depth: number,
    max_depth: number
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check required
    if (schema.required && (value === undefined || value === null)) {
      issues.push({
        path,
        message: `Required property '${schema.name}' is missing`,
        severity: 'error',
        code: 'MISSING_REQUIRED',
        expected: schema.type,
      });
      return issues; // No further validation if missing
    }

    // Skip validation if value is undefined and not required
    if (value === undefined || value === null) {
      return issues;
    }

    // Type validation
    const type_issue = this.validate_type(path, value, schema.type);
    if (type_issue) {
      issues.push(type_issue);
      return issues; // Wrong type, skip further validation
    }

    // Constraint validation
    if (schema.validation) {
      const constraint_issues = this.validate_constraints(path, value, schema.validation);
      issues.push(...constraint_issues);
    }

    // Nested property validation
    if (schema.nested_properties && schema.nested_properties.length > 0 && depth < max_depth) {
      if (schema.type === 'object' && typeof value === 'object' && value !== null) {
        const nested = value as Record<string, unknown>;
        for (const nested_schema of schema.nested_properties) {
          const nested_path = `${path}.${nested_schema.name}`;
          const nested_issues = this.validate_property(
            nested_path,
            nested[nested_schema.name],
            nested_schema,
            options,
            depth + 1,
            max_depth
          );
          issues.push(...nested_issues);
        }
      }

      if (schema.type === 'array' && Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item_path = `${path}[${i}]`;
          // For arrays, nested_properties typically describe the item schema
          if (typeof value[i] === 'object' && value[i] !== null) {
            for (const nested_schema of schema.nested_properties) {
              const item = value[i] as Record<string, unknown>;
              const nested_path = `${item_path}.${nested_schema.name}`;
              const nested_issues = this.validate_property(
                nested_path,
                item[nested_schema.name],
                nested_schema,
                options,
                depth + 1,
                max_depth
              );
              issues.push(...nested_issues);
            }
          }
        }
      }
    }

    return issues;
  }

  /**
   * Validate value type.
   */
  private validate_type(
    path: string,
    value: unknown,
    expected_type: string
  ): ValidationIssue | null {
    const actual_type = this.get_type_name(value);

    switch (expected_type) {
      case 'string':
        if (typeof value !== 'string') {
          return {
            path,
            message: `Expected string, got ${actual_type}`,
            severity: 'error',
            code: 'TYPE_MISMATCH',
            expected: 'string',
            actual: actual_type,
          };
        }
        break;

      case 'number':
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return {
            path,
            message: `Expected number, got ${actual_type}`,
            severity: 'error',
            code: 'TYPE_MISMATCH',
            expected: 'number',
            actual: actual_type,
          };
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          return {
            path,
            message: `Expected boolean, got ${actual_type}`,
            severity: 'error',
            code: 'TYPE_MISMATCH',
            expected: 'boolean',
            actual: actual_type,
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return {
            path,
            message: `Expected array, got ${actual_type}`,
            severity: 'error',
            code: 'TYPE_MISMATCH',
            expected: 'array',
            actual: actual_type,
          };
        }
        break;

      case 'object':
      case 'map':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return {
            path,
            message: `Expected object, got ${actual_type}`,
            severity: 'error',
            code: 'TYPE_MISMATCH',
            expected: 'object',
            actual: actual_type,
          };
        }
        break;

      case 'any':
        // Any type is always valid
        break;
    }

    return null;
  }

  /**
   * Validate value against constraints.
   */
  private validate_constraints(
    path: string,
    value: unknown,
    validation: PropertyValidation
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Enum validation
    if (validation.allowed_values && validation.allowed_values.length > 0) {
      if (!validation.allowed_values.includes(value as string | number | boolean)) {
        issues.push({
          path,
          message: `Value not allowed. Must be one of: ${validation.allowed_values.join(', ')}`,
          severity: 'error',
          code: 'VALUE_NOT_ALLOWED',
          expected: validation.allowed_values.join(' | '),
          actual: String(value),
        });
      }
    }

    // Pattern validation
    if (validation.pattern && typeof value === 'string') {
      try {
        const regex = new RegExp(validation.pattern);
        if (!regex.test(value)) {
          issues.push({
            path,
            message: `Value does not match pattern: ${validation.pattern}`,
            severity: 'error',
            code: 'PATTERN_MISMATCH',
            expected: validation.pattern,
            actual: value,
          });
        }
      } catch {
        // Invalid regex pattern in schema, skip validation
      }
    }

    // Numeric range validation
    if (typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        issues.push({
          path,
          message: `Value ${value} is less than minimum ${validation.min}`,
          severity: 'error',
          code: 'VALUE_TOO_SMALL',
          expected: `>= ${validation.min}`,
          actual: String(value),
        });
      }

      if (validation.max !== undefined && value > validation.max) {
        issues.push({
          path,
          message: `Value ${value} is greater than maximum ${validation.max}`,
          severity: 'error',
          code: 'VALUE_TOO_LARGE',
          expected: `<= ${validation.max}`,
          actual: String(value),
        });
      }
    }

    // String length validation
    if (typeof value === 'string') {
      if (validation.min_length !== undefined && value.length < validation.min_length) {
        issues.push({
          path,
          message: `String length ${value.length} is less than minimum ${validation.min_length}`,
          severity: 'error',
          code: 'STRING_TOO_SHORT',
          expected: `length >= ${validation.min_length}`,
          actual: `length ${value.length}`,
        });
      }

      if (validation.max_length !== undefined && value.length > validation.max_length) {
        issues.push({
          path,
          message: `String length ${value.length} is greater than maximum ${validation.max_length}`,
          severity: 'error',
          code: 'STRING_TOO_LONG',
          expected: `length <= ${validation.max_length}`,
          actual: `length ${value.length}`,
        });
      }
    }

    // Array length validation
    if (Array.isArray(value)) {
      if (validation.min_length !== undefined && value.length < validation.min_length) {
        issues.push({
          path,
          message: `Array length ${value.length} is less than minimum ${validation.min_length}`,
          severity: 'error',
          code: 'ARRAY_TOO_SHORT',
          expected: `length >= ${validation.min_length}`,
          actual: `length ${value.length}`,
        });
      }

      if (validation.max_length !== undefined && value.length > validation.max_length) {
        issues.push({
          path,
          message: `Array length ${value.length} is greater than maximum ${validation.max_length}`,
          severity: 'error',
          code: 'ARRAY_TOO_LONG',
          expected: `length <= ${validation.max_length}`,
          actual: `length ${value.length}`,
        });
      }
    }

    return issues;
  }

  /**
   * Get human-readable type name.
   */
  private get_type_name(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (Number.isNaN(value)) return 'NaN';
    return typeof value;
  }

  /**
   * Convert validation result to ValidationError.
   */
  to_validation_error(result: ValidationResult): ValidationError | null {
    if (result.valid) return null;

    const violations: ValidationViolation[] = result.errors.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
      value: issue.actual,
    }));

    return new ValidationError(
      `Validation failed for ${result.ice_type}: ${result.errors.length} error(s)`,
      violations,
      'VALIDATION_FAILED'
    );
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
  async validate_property_value(
    ice_type: IceType,
    property_path: string,
    value: unknown
  ): Promise<ValidationIssue[]> {
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

    return this.validate_property(property_path, value, prop_schema, {}, 0, 10);
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
