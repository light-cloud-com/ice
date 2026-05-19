/**
 * Schema Validators (rf-vval-2)
 *
 * Validators that depend on a `SchemaProvider` for type/property
 * definitions. Extracted from `validators.ts`.
 */

import type { SchemaProvider, IceType } from '../../../schema/schema-provider';
import type { MutableGraph } from '../../mutable-graph';
import type { Validator, ValidationIssue } from '../base-validator';

/**
 * Validates that node types exist in the schema.
 */
export class TypeValidator implements Validator {
  readonly name = 'type';
  readonly description = 'Validates that resource types exist in the schema';

  constructor(private readonly schema_provider?: SchemaProvider) {}

  validate(graph: MutableGraph): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!this.schema_provider) {
      // No schema provider, skip type validation
      return issues;
    }

    for (const node of graph.nodes.values()) {
      if (!this.schema_provider.has_schema(node.type as IceType)) {
        issues.push({
          severity: 'error',
          code: 'UNKNOWN_TYPE',
          message: `Unknown resource type: ${node.type}`,
          node_id: node.id,
          suggestion: `Check that '${node.type}' is a valid ICE resource type`,
        });
      }
    }

    return issues;
  }
}

/**
 * Validates node properties against schema.
 */
export class PropertyValidator implements Validator {
  readonly name = 'property';
  readonly description = 'Validates node properties against their schemas';

  constructor(private readonly schema_provider?: SchemaProvider) {}

  async validate_async(graph: MutableGraph): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    if (!this.schema_provider) {
      return issues;
    }

    for (const node of graph.nodes.values()) {
      const schema_result = await this.schema_provider.get_schema(node.type as IceType);

      if (!schema_result.ok) {
        continue; // Type validation handles unknown types
      }

      const schema = schema_result.value;

      // Check required properties
      for (const prop of schema.properties) {
        if (prop.required && !(prop.name in node.properties)) {
          issues.push({
            severity: 'error',
            code: 'MISSING_REQUIRED',
            message: `Missing required property '${prop.name}' on ${node.type}`,
            node_id: node.id,
            path: prop.name,
          });
        }
      }

      // Check property types
      for (const [key, value] of Object.entries(node.properties)) {
        const prop_schema = schema.properties.find((p) => p.name === key);

        if (!prop_schema) {
          issues.push({
            severity: 'warning',
            code: 'UNKNOWN_PROPERTY',
            message: `Unknown property '${key}' on ${node.type}`,
            node_id: node.id,
            path: key,
          });
          continue;
        }

        // Basic type check
        const type_issues = this.check_type(node.id, key, value, prop_schema.type);
        issues.push(...type_issues);
      }
    }

    return issues;
  }

  validate(graph: MutableGraph): ValidationIssue[] {
    // Synchronous fallback - just check for obvious issues
    const issues: ValidationIssue[] = [];

    for (const node of graph.nodes.values()) {
      // Check that properties is an object
      if (typeof node.properties !== 'object' || node.properties === null || Array.isArray(node.properties)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_PROPERTIES',
          message: `Node properties must be an object`,
          node_id: node.id,
        });
      }
    }

    return issues;
  }

  private check_type(node_id: string, path: string, value: unknown, expected: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const actual = typeof value;

    switch (expected) {
      case 'string':
        if (actual !== 'string') {
          issues.push({
            severity: 'error',
            code: 'TYPE_MISMATCH',
            message: `Expected string for '${path}', got ${actual}`,
            node_id: node_id as any,
            path,
          });
        }
        break;

      case 'number':
        if (actual !== 'number') {
          issues.push({
            severity: 'error',
            code: 'TYPE_MISMATCH',
            message: `Expected number for '${path}', got ${actual}`,
            node_id: node_id as any,
            path,
          });
        }
        break;

      case 'boolean':
        if (actual !== 'boolean') {
          issues.push({
            severity: 'error',
            code: 'TYPE_MISMATCH',
            message: `Expected boolean for '${path}', got ${actual}`,
            node_id: node_id as any,
            path,
          });
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          issues.push({
            severity: 'error',
            code: 'TYPE_MISMATCH',
            message: `Expected array for '${path}', got ${actual}`,
            node_id: node_id as any,
            path,
          });
        }
        break;

      case 'object':
      case 'map':
        if (actual !== 'object' || value === null || Array.isArray(value)) {
          issues.push({
            severity: 'error',
            code: 'TYPE_MISMATCH',
            message: `Expected object for '${path}', got ${actual}`,
            node_id: node_id as any,
            path,
          });
        }
        break;
    }

    return issues;
  }
}
