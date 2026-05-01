/**
 * Validation result + option types for `resource-validator`.
 *
 * Extracted (rf-rval-1) so that the `validation/*` helpers can import
 * the types without needing to import the orchestrator class. The public
 * shim file `resource-validator.ts` still re-exports every type from
 * here so consumer code is unaffected.
 */
import type { IceType } from './schema-provider.js';

/**
 * Validation severity level.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

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
