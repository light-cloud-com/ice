/**
 * Recursive property validator.
 *
 * Pure function extracted from `ResourceValidator.validate_property`
 * (rf-rval-3). Walks a single property + its nested children, returning
 * issues in canonical order: required-missing -> type -> constraints ->
 * nested. Recurses into objects and array items.
 *
 * Behaviour preserved verbatim:
 *  - Required missing (`undefined` or `null` on a `required: true` schema)
 *    -> MISSING_REQUIRED. Returns immediately; no further checks.
 *  - Optional missing (undefined / null, not required) -> no issues.
 *  - Type mismatch -> single TYPE_MISMATCH; returns immediately (wrong
 *    type -> skip constraint and nested checks).
 *  - Constraint issues are appended in `validate_constraints`'s order.
 *  - Nested object: type === 'object' AND typeof value === 'object' AND
 *    value !== null. Recurses with `${path}.${child_name}`.
 *  - Nested array: type === 'array' AND Array.isArray(value). Walks each
 *    item with `${path}[${i}]`; item must be a non-null object for the
 *    nested_properties schema to apply.
 *  - Recursion stops at depth >= max_depth (no nested checks beyond).
 */
import { validate_constraints } from './constraints';
import { validate_type } from './type-checker';
import type { ValidationIssue, ValidationOptions } from '../resource-validator-types';
import type { PropertySchema } from '../schema-provider';

export function validate_property(
  path: string,
  value: unknown,
  schema: PropertySchema,
  options: ValidationOptions,
  depth: number,
  max_depth: number,
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
  const type_issue = validate_type(path, value, schema.type);
  if (type_issue) {
    issues.push(type_issue);
    return issues; // Wrong type, skip further validation
  }

  // Constraint validation
  if (schema.validation) {
    const constraint_issues = validate_constraints(path, value, schema.validation);
    issues.push(...constraint_issues);
  }

  // Nested property validation
  if (schema.nested_properties && schema.nested_properties.length > 0 && depth < max_depth) {
    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
      const nested = value as Record<string, unknown>;
      for (const nested_schema of schema.nested_properties) {
        const nested_path = `${path}.${nested_schema.name}`;
        const nested_issues = validate_property(
          nested_path,
          nested[nested_schema.name],
          nested_schema,
          options,
          depth + 1,
          max_depth,
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
            const nested_issues = validate_property(
              nested_path,
              item[nested_schema.name],
              nested_schema,
              options,
              depth + 1,
              max_depth,
            );
            issues.push(...nested_issues);
          }
        }
      }
    }
  }

  return issues;
}
