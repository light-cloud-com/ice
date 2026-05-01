/**
 * Structure Validators (rf-vval-1)
 *
 * Validators that operate on graph topology and naming — independent
 * of the schema provider. Extracted from `validators.ts` to keep the
 * orchestrator under the 500 LOC ceiling.
 */

import { has_cycle, find_cycles } from '../../algorithms.js';
import type { Validator, ValidationIssue } from '../base-validator.js';
import type { MutableGraph } from '../../mutable-graph.js';

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
