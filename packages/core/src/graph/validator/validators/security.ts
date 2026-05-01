/**
 * Security Validators (rf-vval-3)
 *
 * Validators that check for sensitive data and best-practice
 * violations. Extracted from `validators.ts`.
 */

import type { Validator, ValidationIssue } from '../base-validator.js';
import type { MutableGraph } from '../../mutable-graph.js';

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
