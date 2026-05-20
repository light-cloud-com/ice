/**
 * Error Type Definitions
 *
 * Hierarchical error classes for the ICE engine.
 * All errors extend IceError for consistent handling.
 */

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Error code categories.
 */
export type ErrorCategory = 'VALIDATION' | 'GRAPH' | 'PROVIDER' | 'DEPLOYMENT' | 'STATE' | 'SECURITY' | 'INTERNAL';

/**
 * All error codes.
 */
export type ErrorCode =
  // Validation errors
  | 'VALIDATION_FAILED'
  | 'INVALID_PROPERTY'
  | 'MISSING_REQUIRED'
  | 'TYPE_MISMATCH'
  | 'CONSTRAINT_VIOLATION'
  | 'SCHEMA_NOT_FOUND'
  // Graph errors
  | 'GRAPH_INVALID'
  | 'NODE_NOT_FOUND'
  | 'EDGE_NOT_FOUND'
  | 'CYCLE_DETECTED'
  | 'DUPLICATE_NODE'
  | 'INVALID_REFERENCE'
  | 'ORPHANED_NODE'
  // Provider errors
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'RESOURCE_NOT_SUPPORTED'
  | 'API_ERROR'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  // Deployment errors
  | 'DEPLOYMENT_FAILED'
  | 'OPERATION_TIMEOUT'
  | 'ROLLBACK_FAILED'
  | 'PLAN_INVALID'
  | 'STATE_LOCKED'
  // State errors
  | 'STATE_CORRUPTED'
  | 'STATE_CONFLICT'
  | 'DRIFT_DETECTED'
  | 'STATE_NOT_FOUND'
  // Security errors
  | 'SECURITY_VIOLATION'
  | 'POLICY_DENIED'
  | 'CREDENTIAL_INVALID'
  | 'ACCESS_DENIED'
  // Internal errors
  | 'INTERNAL_ERROR'
  | 'NOT_IMPLEMENTED';

// =============================================================================
// Base Error Class
// =============================================================================

/**
 * Base error class for all ICE errors.
 */
export abstract class IceError extends Error {
  /** Error category */
  abstract readonly category: ErrorCategory;

  /** Specific error code */
  abstract readonly code: ErrorCode;

  /** HTTP-style status code */
  abstract readonly status_code: number;

  /** Additional context */
  readonly context: Record<string, unknown>;

  /** Original error if wrapped */
  readonly cause?: Error;

  constructor(message: string, context: Record<string, unknown> = {}, cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to JSON for serialization.
   */
  toJSON(): ErrorJson {
    return {
      name: this.name,
      category: this.category,
      code: this.code,
      message: this.message,
      status_code: this.status_code,
      context: this.context,
      stack: this.stack,
      cause: this.cause?.message,
    };
  }

  /**
   * Create a string representation.
   */
  toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

/**
 * JSON representation of an error.
 */
export interface ErrorJson {
  readonly name: string;
  readonly category: ErrorCategory;
  readonly code: ErrorCode;
  readonly message: string;
  readonly status_code: number;
  readonly context: Record<string, unknown>;
  readonly stack?: string;
  readonly cause?: string;
}

// =============================================================================
// Validation Errors
// =============================================================================

/**
 * Validation error for invalid data.
 */
export class ValidationError extends IceError {
  readonly category = 'VALIDATION' as const;
  readonly code: ErrorCode;
  readonly status_code = 400;

  /** Validation violations */
  readonly violations: ValidationViolation[];

  constructor(
    message: string,
    violations: ValidationViolation[] = [],
    code: ErrorCode = 'VALIDATION_FAILED',
    context: Record<string, unknown> = {},
  ) {
    super(message, { ...context, violations });
    this.code = code;
    this.violations = violations;
  }
}

/**
 * Single validation violation.
 */
export interface ValidationViolation {
  readonly path: string;
  readonly message: string;
  readonly code: string;
  readonly value?: unknown;
}

// =============================================================================
// Graph Errors
// =============================================================================

/**
 * Error related to graph operations.
 */
export class GraphError extends IceError {
  readonly category = 'GRAPH' as const;
  readonly code: ErrorCode;
  readonly status_code = 400;

  constructor(
    message: string,
    code: ErrorCode = 'GRAPH_INVALID',
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, context, cause);
    this.code = code;
  }
}

/**
 * Node not found error.
 */
export class NodeNotFoundError extends GraphError {
  constructor(node_id: string, context: Record<string, unknown> = {}) {
    super(`Node not found: ${node_id}`, 'NODE_NOT_FOUND', { node_id, ...context });
  }
}

/**
 * Cycle detected in graph.
 */
export class CycleDetectedError extends GraphError {
  readonly cycle: string[];

  constructor(cycle: string[], context: Record<string, unknown> = {}) {
    super(`Cycle detected in graph: ${cycle.join(' -> ')}`, 'CYCLE_DETECTED', {
      cycle,
      ...context,
    });
    this.cycle = cycle;
  }
}

// =============================================================================
// Provider Errors
// =============================================================================

/**
 * Error from a cloud provider.
 */
export class ProviderError extends IceError {
  readonly category = 'PROVIDER' as const;
  readonly code: ErrorCode;
  readonly status_code: number;

  /** Provider name */
  readonly provider: string;

  /** Whether the error is retryable */
  readonly retryable: boolean;

  constructor(
    message: string,
    provider: string,
    code: ErrorCode = 'API_ERROR',
    status_code = 500,
    retryable = false,
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, { provider, ...context }, cause);
    this.code = code;
    this.status_code = status_code;
    this.provider = provider;
    this.retryable = retryable;
  }
}

/**
 * Authentication failed.
 */
export class AuthenticationError extends ProviderError {
  constructor(provider: string, message?: string, context: Record<string, unknown> = {}) {
    super(
      message ?? `Authentication failed for provider: ${provider}`,
      provider,
      'PROVIDER_AUTH_FAILED',
      401,
      false,
      context,
    );
  }
}

/**
 * Rate limited by provider.
 */
export class RateLimitError extends ProviderError {
  readonly retry_after_ms?: number;

  constructor(provider: string, retry_after_ms?: number, context: Record<string, unknown> = {}) {
    super(`Rate limited by provider: ${provider}`, provider, 'RATE_LIMITED', 429, true, {
      retry_after_ms,
      ...context,
    });
    this.retry_after_ms = retry_after_ms;
  }
}

// =============================================================================
// Deployment Errors
// =============================================================================

/**
 * Error during deployment.
 */
export class DeploymentError extends IceError {
  readonly category = 'DEPLOYMENT' as const;
  readonly code: ErrorCode;
  readonly status_code = 500;

  /** Affected node IDs */
  readonly affected_nodes: string[];

  constructor(
    message: string,
    affected_nodes: string[] = [],
    code: ErrorCode = 'DEPLOYMENT_FAILED',
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, { affected_nodes, ...context }, cause);
    this.code = code;
    this.affected_nodes = affected_nodes;
  }
}

// =============================================================================
// Security Errors
// =============================================================================

/**
 * Security policy violation.
 */
export class SecurityError extends IceError {
  readonly category = 'SECURITY' as const;
  readonly code: ErrorCode;
  readonly status_code = 403;

  /** Policy that was violated */
  readonly policy?: string;

  constructor(
    message: string,
    code: ErrorCode = 'SECURITY_VIOLATION',
    policy?: string,
    context: Record<string, unknown> = {},
  ) {
    super(message, { policy, ...context });
    this.code = code;
    this.policy = policy;
  }
}

// =============================================================================
// Internal Errors
// =============================================================================

/**
 * Internal engine error.
 */
export class InternalError extends IceError {
  readonly category = 'INTERNAL' as const;
  readonly code: ErrorCode;
  readonly status_code = 500;

  constructor(
    message: string,
    code: ErrorCode = 'INTERNAL_ERROR',
    context: Record<string, unknown> = {},
    cause?: Error,
  ) {
    super(message, context, cause);
    this.code = code;
  }
}

/**
 * Feature not implemented.
 */
export class NotImplementedError extends InternalError {
  constructor(feature: string, context: Record<string, unknown> = {}) {
    super(`Feature not implemented: ${feature}`, 'NOT_IMPLEMENTED', {
      feature,
      ...context,
    });
  }
}

// =============================================================================
// Error Utilities
// =============================================================================

/**
 * Check if an error is an ICE error.
 */
export function is_ice_error(error: unknown): error is IceError {
  return error instanceof IceError;
}

/**
 * Check if an error is retryable.
 */
export function is_retryable(error: unknown): boolean {
  if (error instanceof ProviderError) {
    return error.retryable;
  }
  if (error instanceof RateLimitError) {
    return true;
  }
  return false;
}

/**
 * Wrap an unknown error in an ICE error.
 */
export function wrap_error(error: unknown, message?: string): IceError {
  if (is_ice_error(error)) {
    return error;
  }

  const err = error instanceof Error ? error : new Error(String(error));
  return new InternalError(message ?? err.message, 'INTERNAL_ERROR', {}, err);
}
