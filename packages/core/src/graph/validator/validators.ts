/**
 * Built-in Validators
 *
 * Standard validators for graph validation.
 */

import type { Validator, ValidationIssue, ValidationOptions } from './base-validator.js';
import type { MutableGraph } from '../mutable-graph.js';
import type { SchemaProvider, IceType } from '../../schema/schema-provider.js';
import { has_cycle, find_cycles } from '../algorithms.js';

// =============================================================================
// Structure Validators
// =============================================================================

/**
 * Validates that the graph has no cycles.
 */
export class CycleValidator implements Validator {
  readonly name = 'cycle';
  readonly description = 'Detects dependency cycles in the graph';

  validate(graph: MutableGraph): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (has_cycle(graph)) {
      const cycles = find_cycles(graph);

      for (const cycle of cycles) {
        issues.push({
          severity: 'error',
          code: 'CYCLE_DETECTED',
          message: `Dependency cycle detected: ${cycle.join(' -> ')}`,
          context: { cycle },
        });
      }
    }

    return issues;
  }
}

/**
 * Validates that all edge targets exist.
 */
export class ReferenceValidator implements Validator {
  readonly name = 'reference';
  readonly description = 'Validates that all references point to existing nodes';

  validate(graph: MutableGraph): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const edge of graph.edges.values()) {
      if (!graph.has_node(edge.source)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_SOURCE',
          message: `Edge references non-existent source node: ${edge.source}`,
          edge_id: edge.id,
          context: { source: edge.source, target: edge.target },
        });
      }

      if (!graph.has_node(edge.target)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_TARGET',
          message: `Edge references non-existent target node: ${edge.target}`,
          edge_id: edge.id,
          context: { source: edge.source, target: edge.target },
        });
      }
    }

    return issues;
  }
}

/**
 * Validates node naming conventions.
 */
export class NamingValidator implements Validator {
  readonly name = 'naming';
  readonly description = 'Validates node naming conventions';

  private readonly name_pattern = /^[a-z][a-z0-9_]*$/;
  private readonly reserved_names = new Set([
    'count',
    'depends_on',
    'for_each',
    'lifecycle',
    'provider',
    'provisioner',
  ]);

  validate(graph: MutableGraph): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const node of graph.nodes.values()) {
      // Check naming pattern
      if (!this.name_pattern.test(node.name)) {
        issues.push({
          severity: 'warning',
          code: 'INVALID_NAME_FORMAT',
          message: `Node name '${node.name}' should be lowercase with underscores`,
          node_id: node.id,
          suggestion: `Rename to '${node.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}'`,
        });
      }

      // Check reserved names
      if (this.reserved_names.has(node.name)) {
        issues.push({
          severity: 'error',
          code: 'RESERVED_NAME',
          message: `Node name '${node.name}' is a reserved keyword`,
          node_id: node.id,
        });
      }

      // Check for duplicate names within same type
      const same_type_nodes = graph.get_nodes_by_type(node.type);
      const duplicates = same_type_nodes.filter((n) => n.name === node.name && n.id !== node.id);

      if (duplicates.length > 0) {
        issues.push({
          severity: 'error',
          code: 'DUPLICATE_NAME',
          message: `Duplicate node name '${node.name}' for type '${node.type}'`,
          node_id: node.id,
        });
      }
    }

    return issues;
  }
}

/**
 * Validates graph connectivity.
 */
export class ConnectivityValidator implements Validator {
  readonly name = 'connectivity';
  readonly description = 'Checks for orphaned nodes and connectivity issues';

  validate(graph: MutableGraph): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const node of graph.nodes.values()) {
      const incoming = graph.get_incoming_edges(node.id);
      const outgoing = graph.get_outgoing_edges(node.id);

      // Warn about isolated nodes
      if (incoming.length === 0 && outgoing.length === 0) {
        issues.push({
          severity: 'info',
          code: 'ISOLATED_NODE',
          message: `Node '${node.name}' has no connections`,
          node_id: node.id,
        });
      }
    }

    return issues;
  }
}

// =============================================================================
// Schema Validators
// =============================================================================

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

// =============================================================================
// Security Validators
// =============================================================================

/**
 * Validates that sensitive data is properly marked.
 */
export class SensitiveDataValidator implements Validator {
  readonly name = 'sensitive';
  readonly description = 'Checks for potentially sensitive data in properties';

  private readonly sensitive_patterns = [
    /password/i,
    /secret/i,
    /key/i,
    /token/i,
    /credential/i,
    /api[_-]?key/i,
    /private[_-]?key/i,
    /access[_-]?key/i,
  ];

  private readonly sensitive_value_patterns = [
    /^[A-Za-z0-9+/]{20,}={0,2}$/, // Base64
    /^[A-Fa-f0-9]{32,}$/, // Hex strings
    /^-----BEGIN/, // PEM format
  ];

  validate(graph: MutableGraph): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const node of graph.nodes.values()) {
      this.check_properties(node.id as string, '', node.properties, issues);
    }

    return issues;
  }

  private check_properties(
    node_id: string,
    prefix: string,
    obj: Record<string, unknown>,
    issues: ValidationIssue[],
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      // Check property name
      for (const pattern of this.sensitive_patterns) {
        if (pattern.test(key)) {
          issues.push({
            severity: 'warning',
            code: 'POTENTIAL_SENSITIVE_PROPERTY',
            message: `Property '${path}' may contain sensitive data`,
            node_id: node_id as any,
            path,
            suggestion: 'Mark as sensitive or use a secret manager',
          });
          break;
        }
      }

      // Check property value
      if (typeof value === 'string') {
        for (const pattern of this.sensitive_value_patterns) {
          if (pattern.test(value)) {
            issues.push({
              severity: 'warning',
              code: 'POTENTIAL_HARDCODED_SECRET',
              message: `Property '${path}' may contain a hardcoded secret`,
              node_id: node_id as any,
              path,
              suggestion: 'Use a secret manager or environment variable',
            });
            break;
          }
        }
      }

      // Recurse into nested objects
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.check_properties(node_id, path, value as Record<string, unknown>, issues);
      }
    }
  }
}

/**
 * Validates resource constraints and best practices.
 */
export class BestPracticesValidator implements Validator {
  readonly name = 'best-practices';
  readonly description = 'Checks for common best practice violations';

  validate(graph: MutableGraph): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const node of graph.nodes.values()) {
      // Check for missing tags
      if (!('tags' in node.properties) || this.is_empty(node.properties.tags)) {
        issues.push({
          severity: 'info',
          code: 'MISSING_TAGS',
          message: `Resource '${node.name}' has no tags`,
          node_id: node.id,
          suggestion: 'Add tags for cost allocation and resource management',
        });
      }

      // Check for missing description in metadata
      if (!node.metadata.annotations?.description) {
        issues.push({
          severity: 'info',
          code: 'MISSING_DESCRIPTION',
          message: `Resource '${node.name}' has no description`,
          node_id: node.id,
          suggestion: 'Add a description to explain the purpose of this resource',
        });
      }
    }

    return issues;
  }

  private is_empty(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'object') {
      return Object.keys(value).length === 0;
    }
    return false;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create all built-in validators.
 */
export function create_builtin_validators(schema_provider?: SchemaProvider): Validator[] {
  return [
    new CycleValidator(),
    new ReferenceValidator(),
    new NamingValidator(),
    new ConnectivityValidator(),
    new TypeValidator(schema_provider),
    new PropertyValidator(schema_provider),
    new SensitiveDataValidator(),
    new BestPracticesValidator(),
  ];
}

/**
 * Create a configured graph validator with all built-in validators.
 */
export function create_configured_validator(
  schema_provider?: SchemaProvider,
): import('./base-validator.js').GraphValidator {
  const { create_graph_validator } = require('./base-validator.js');
  const validator = create_graph_validator();

  for (const v of create_builtin_validators(schema_provider)) {
    validator.register(v);
  }

  return validator;
}
