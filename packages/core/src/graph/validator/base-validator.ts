/**
 * Base Validator
 *
 * Foundation for graph validation with composable rules.
 */

import type { NodeId, Node, Edge, Graph } from '../../types/graph.js';
import type { MutableGraph } from '../mutable-graph.js';

// =============================================================================
// Validation Types
// =============================================================================

/**
 * Severity level for validation issues.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation issue.
 */
export interface ValidationIssue {
  /** Issue severity */
  readonly severity: ValidationSeverity;

  /** Issue code for programmatic handling */
  readonly code: string;

  /** Human-readable message */
  readonly message: string;

  /** Related node ID */
  readonly node_id?: NodeId;

  /** Related edge ID */
  readonly edge_id?: string;

  /** Property path if applicable */
  readonly path?: string;

  /** Suggested fix */
  readonly suggestion?: string;

  /** Additional context */
  readonly context?: Record<string, unknown>;
}

/**
 * Result of validation.
 */
export interface GraphValidationResult {
  /** Whether validation passed (no errors) */
  readonly valid: boolean;

  /** All issues found */
  readonly issues: readonly ValidationIssue[];

  /** Just errors */
  readonly errors: readonly ValidationIssue[];

  /** Just warnings */
  readonly warnings: readonly ValidationIssue[];

  /** Just info messages */
  readonly info: readonly ValidationIssue[];

  /** Validation timestamp */
  readonly validated_at: string;

  /** Which validators ran */
  readonly validators: string[];
}

/**
 * Options for validation.
 */
export interface ValidationOptions {
  /** Stop on first error */
  readonly fail_fast?: boolean;

  /** Skip certain validators */
  readonly skip_validators?: string[];

  /** Only run certain validators */
  readonly only_validators?: string[];

  /** Treat warnings as errors */
  readonly strict?: boolean;

  /** Maximum issues to collect */
  readonly max_issues?: number;

  /** Additional context */
  readonly context?: Record<string, unknown>;
}

// =============================================================================
// Validator Interface
// =============================================================================

/**
 * Interface for individual validators.
 */
export interface Validator {
  /** Unique validator name */
  readonly name: string;

  /** Validator description */
  readonly description: string;

  /**
   * Validate the graph and return issues.
   */
  validate(graph: MutableGraph, options?: ValidationOptions): ValidationIssue[];
}

// =============================================================================
// Validation Context
// =============================================================================

/**
 * Context passed to validators during validation.
 */
export class ValidationContext {
  private issues: ValidationIssue[] = [];
  readonly graph: MutableGraph;
  readonly options: ValidationOptions;

  constructor(graph: MutableGraph, options: ValidationOptions = {}) {
    this.graph = graph;
    this.options = options;
  }

  /**
   * Add an error.
   */
  error(
    code: string,
    message: string,
    details?: Partial<Omit<ValidationIssue, 'severity' | 'code' | 'message'>>,
  ): void {
    this.add_issue('error', code, message, details);
  }

  /**
   * Add a warning.
   */
  warning(
    code: string,
    message: string,
    details?: Partial<Omit<ValidationIssue, 'severity' | 'code' | 'message'>>,
  ): void {
    this.add_issue('warning', code, message, details);
  }

  /**
   * Add an info message.
   */
  info(code: string, message: string, details?: Partial<Omit<ValidationIssue, 'severity' | 'code' | 'message'>>): void {
    this.add_issue('info', code, message, details);
  }

  /**
   * Add an issue.
   */
  private add_issue(
    severity: ValidationSeverity,
    code: string,
    message: string,
    details?: Partial<Omit<ValidationIssue, 'severity' | 'code' | 'message'>>,
  ): void {
    const max = this.options.max_issues ?? Infinity;
    if (this.issues.length >= max) return;

    this.issues.push({
      severity,
      code,
      message,
      ...details,
    });
  }

  /**
   * Check if validation should stop.
   */
  should_stop(): boolean {
    if (this.options.fail_fast) {
      return this.issues.some((i) => i.severity === 'error');
    }
    return false;
  }

  /**
   * Get all issues.
   */
  get_issues(): ValidationIssue[] {
    return this.issues;
  }

  /**
   * Check if there are any errors.
   */
  has_errors(): boolean {
    return this.issues.some((i) => i.severity === 'error');
  }
}

// =============================================================================
// Graph Validator
// =============================================================================

/**
 * Main graph validator that orchestrates multiple validators.
 */
export class GraphValidator {
  private validators: Map<string, Validator> = new Map();

  /**
   * Register a validator.
   */
  register(validator: Validator): void {
    this.validators.set(validator.name, validator);
  }

  /**
   * Unregister a validator.
   */
  unregister(name: string): void {
    this.validators.delete(name);
  }

  /**
   * Get a validator by name.
   */
  get(name: string): Validator | undefined {
    return this.validators.get(name);
  }

  /**
   * List all registered validators.
   */
  list(): string[] {
    return Array.from(this.validators.keys());
  }

  /**
   * Validate a graph.
   */
  validate(graph: MutableGraph, options: ValidationOptions = {}): GraphValidationResult {
    const context = new ValidationContext(graph, options);
    const ran_validators: string[] = [];

    // Determine which validators to run
    let validators_to_run = Array.from(this.validators.values());

    if (options.only_validators && options.only_validators.length > 0) {
      validators_to_run = validators_to_run.filter((v) => options.only_validators!.includes(v.name));
    }

    if (options.skip_validators && options.skip_validators.length > 0) {
      validators_to_run = validators_to_run.filter((v) => !options.skip_validators!.includes(v.name));
    }

    // Run validators
    for (const validator of validators_to_run) {
      try {
        const issues = validator.validate(graph, options);
        for (const issue of issues) {
          if (issue.severity === 'error') {
            context.error(issue.code, issue.message, issue);
          } else if (issue.severity === 'warning') {
            context.warning(issue.code, issue.message, issue);
          } else {
            context.info(issue.code, issue.message, issue);
          }
        }
        ran_validators.push(validator.name);

        if (context.should_stop()) {
          break;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        context.error('VALIDATOR_ERROR', `Validator '${validator.name}' failed: ${err.message}`);
      }
    }

    const issues = context.get_issues();
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');
    const info = issues.filter((i) => i.severity === 'info');

    return {
      valid: options.strict ? errors.length === 0 && warnings.length === 0 : errors.length === 0,
      issues,
      errors,
      warnings,
      info,
      validated_at: new Date().toISOString(),
      validators: ran_validators,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new graph validator.
 */
export function create_graph_validator(): GraphValidator {
  return new GraphValidator();
}

/**
 * Create a simple validator from a function.
 */
export function create_validator(
  name: string,
  description: string,
  validate_fn: (graph: MutableGraph, options?: ValidationOptions) => ValidationIssue[],
): Validator {
  return {
    name,
    description,
    validate: validate_fn,
  };
}
