/**
 * Import Error types (rf-ierr-1)
 *
 * Shared types and the `ImportErrorCode` enum used by every per-cloud
 * classifier (`classifyGCPError`, `classifyAWSError`,
 * `classifyAzureError`). Extracted from `import-errors.ts` so each
 * classifier can compile against the type/enum surface without pulling
 * in sibling classifier code.
 */

/**
 * Import error codes organized by category.
 */
export enum ImportErrorCode {
  // Authentication errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_REAUTH_REQUIRED = 'AUTH_REAUTH_REQUIRED',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',

  // API errors
  API_NOT_ENABLED = 'API_NOT_ENABLED',
  API_QUOTA_EXCEEDED = 'API_QUOTA_EXCEEDED',
  API_RATE_LIMITED = 'API_RATE_LIMITED',
  API_ERROR = 'API_ERROR',
  API_UNAVAILABLE = 'API_UNAVAILABLE',

  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ACCESS_DENIED = 'RESOURCE_ACCESS_DENIED',
  RESOURCE_INVALID = 'RESOURCE_INVALID',

  // Mapping errors
  TYPE_UNMAPPED = 'TYPE_UNMAPPED',
  PROPERTY_UNMAPPED = 'PROPERTY_UNMAPPED',

  // Initialization errors
  INIT_ERROR = 'INIT_ERROR',
  SDK_NOT_INSTALLED = 'SDK_NOT_INSTALLED',

  // Service-specific errors
  RESOURCE_EXPLORER_NOT_ENABLED = 'RESOURCE_EXPLORER_NOT_ENABLED',
  CONFIG_ERROR = 'CONFIG_ERROR',
  RESOURCE_GRAPH_ERROR = 'RESOURCE_GRAPH_ERROR',
}

/**
 * Action type for error recovery.
 */
export type ImportErrorActionType =
  | 'reauth'
  | 'enable_api'
  | 'grant_permission'
  | 'retry'
  | 'install_sdk'
  | 'enable_service';

/**
 * Action to take to resolve an import error.
 */
export interface ImportErrorAction {
  /** Type of action */
  type: ImportErrorActionType;

  /** CLI command to run (if applicable) */
  command?: string;

  /** URL for more information or to perform action */
  url?: string;

  /** Human-readable description of what to do */
  description?: string;
}

/**
 * Structured import error with actionable information.
 */
export interface ImportError {
  /** Error code from ImportErrorCode */
  code: ImportErrorCode | string;

  /** Human-readable error message */
  message: string;

  /** Whether this error is recoverable */
  recoverable: boolean;

  /** Action to take to resolve the error */
  action?: ImportErrorAction;

  /** Service that generated the error */
  service?: string;

  /** Resource that caused the error (if applicable) */
  resource?: string;

  /** Additional context/details */
  details?: Record<string, unknown>;
}

/**
 * Import warning (non-fatal issue).
 */
export interface ImportWarning {
  /** Warning code */
  code: string;

  /** Human-readable warning message */
  message: string;

  /** Service that generated the warning */
  service?: string;

  /** Resource related to the warning */
  resource?: string;
}
