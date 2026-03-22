/**
 * Import Error Classification System
 *
 * Provides consistent error codes and actionable error messages
 * across all importers (GCP, AWS, Azure, Terraform, Pulumi).
 */

// =============================================================================
// Error Codes
// =============================================================================

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

// =============================================================================
// Error Action Types
// =============================================================================

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

// =============================================================================
// Import Error Interface
// =============================================================================

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

// =============================================================================
// Error Classification Helpers
// =============================================================================

/**
 * Classify a GCP error and return a structured ImportError.
 */
export function classifyGCPError(
  error: { code?: number; message?: string; details?: unknown },
  service?: string
): ImportError {
  const message = error.message || String(error);

  // Re-authentication required (invalid_rapt, invalid_grant, token expired)
  // Check for various formats including JSON-encoded errors
  if (
    message.includes('invalid_grant') ||
    message.includes('invalid_rapt') ||
    message.includes('"error":"invalid_grant"') ||
    message.includes('"error_subtype":"invalid_rapt"') ||
    message.includes('Token has been expired') ||
    message.includes('token has expired') ||
    message.includes('refresh token') ||
    message.includes('reauth related error') ||
    message.includes('Getting metadata from plugin failed')
  ) {
    return {
      code: ImportErrorCode.AUTH_REAUTH_REQUIRED,
      message:
        'Authentication session expired. Please re-authenticate with: gcloud auth application-default login',
      recoverable: true,
      service,
      action: {
        type: 'reauth',
        command: 'gcloud auth application-default login',
        url: 'https://support.google.com/a/answer/9368756',
        description: 'Re-authenticate with Google Cloud',
      },
    };
  }

  // Unauthenticated
  if (
    message.includes('UNAUTHENTICATED') ||
    message.includes('Request had invalid authentication credentials') ||
    message.includes('Could not load the default credentials')
  ) {
    return {
      code: ImportErrorCode.AUTH_REQUIRED,
      message: 'Not authenticated. Please authenticate with GCP.',
      recoverable: true,
      service,
      action: {
        type: 'reauth',
        command: 'gcloud auth application-default login',
        description: 'Authenticate with Google Cloud',
      },
    };
  }

  // Permission denied
  if (
    message.includes('PERMISSION_DENIED') ||
    message.includes('does not have') ||
    message.includes('permission') ||
    error.code === 403
  ) {
    return {
      code: ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      message: 'Insufficient permissions to access GCP resources.',
      recoverable: false,
      service,
      action: {
        type: 'grant_permission',
        url: 'https://console.cloud.google.com/iam-admin/iam',
        description: 'Grant required IAM permissions',
      },
    };
  }

  // API not enabled
  if (
    message.includes('API has not been used') ||
    message.includes('has not been enabled') ||
    message.includes('cloudasset.googleapis.com') ||
    message.includes('API is disabled')
  ) {
    return {
      code: ImportErrorCode.API_NOT_ENABLED,
      message: 'Required API is not enabled for this project.',
      recoverable: true,
      service,
      action: {
        type: 'enable_api',
        command: 'gcloud services enable cloudasset.googleapis.com',
        url: 'https://console.cloud.google.com/apis/library',
        description: 'Enable the required API',
      },
    };
  }

  // Quota exceeded
  if (
    message.includes('QUOTA_EXCEEDED') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    error.code === 429
  ) {
    return {
      code: ImportErrorCode.API_RATE_LIMITED,
      message: 'API quota exceeded or rate limited. Try again later.',
      recoverable: true,
      service,
      action: {
        type: 'retry',
        description: 'Wait and retry the operation',
      },
    };
  }

  // Resource not found
  if (message.includes('NOT_FOUND') || error.code === 404) {
    return {
      code: ImportErrorCode.RESOURCE_NOT_FOUND,
      message: 'Resource not found.',
      recoverable: false,
      service,
    };
  }

  // Default: generic API error
  return {
    code: ImportErrorCode.API_ERROR,
    message: `GCP API error: ${message}`,
    recoverable: false,
    service,
  };
}

/**
 * Classify an AWS error and return a structured ImportError.
 */
export function classifyAWSError(
  error: {
    name?: string;
    code?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  },
  service?: string
): ImportError {
  const message = error.message || String(error);
  const code = error.code || error.name || '';
  const httpCode = error.$metadata?.httpStatusCode;

  // Credential errors
  if (
    code === 'ExpiredTokenException' ||
    code === 'ExpiredToken' ||
    message.includes('token has expired') ||
    message.includes('Security token expired')
  ) {
    return {
      code: ImportErrorCode.AUTH_EXPIRED,
      message: 'AWS credentials have expired. Please refresh credentials.',
      recoverable: true,
      service,
      action: {
        type: 'reauth',
        command: 'aws sso login',
        description: 'Refresh AWS credentials',
      },
    };
  }

  // Invalid credentials
  if (
    code === 'InvalidClientTokenId' ||
    code === 'SignatureDoesNotMatch' ||
    code === 'InvalidAccessKeyId' ||
    code === 'CredentialsError' ||
    message.includes('Unable to locate credentials')
  ) {
    return {
      code: ImportErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'Invalid or missing AWS credentials.',
      recoverable: true,
      service,
      action: {
        type: 'reauth',
        command: 'aws configure',
        description: 'Configure AWS credentials',
      },
    };
  }

  // Access denied
  if (
    code === 'AccessDeniedException' ||
    code === 'AccessDenied' ||
    code === 'UnauthorizedAccess' ||
    httpCode === 403
  ) {
    return {
      code: ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      message: 'Insufficient permissions to access AWS resources.',
      recoverable: false,
      service,
      action: {
        type: 'grant_permission',
        url: 'https://console.aws.amazon.com/iam',
        description: 'Grant required IAM permissions',
      },
    };
  }

  // Resource Explorer not enabled
  if (
    code === 'ResourceExplorerNotEnabledException' ||
    message.includes('Resource Explorer') ||
    message.includes('not enabled')
  ) {
    return {
      code: ImportErrorCode.RESOURCE_EXPLORER_NOT_ENABLED,
      message: 'AWS Resource Explorer is not enabled.',
      recoverable: true,
      service,
      action: {
        type: 'enable_service',
        command: 'aws resource-explorer-2 create-index --type AGGREGATOR',
        url: 'https://console.aws.amazon.com/resource-explorer',
        description: 'Enable AWS Resource Explorer',
      },
    };
  }

  // Throttling
  if (
    code === 'Throttling' ||
    code === 'ThrottlingException' ||
    code === 'TooManyRequestsException' ||
    httpCode === 429
  ) {
    return {
      code: ImportErrorCode.API_RATE_LIMITED,
      message: 'AWS API rate limit exceeded. Try again later.',
      recoverable: true,
      service,
      action: {
        type: 'retry',
        description: 'Wait and retry the operation',
      },
    };
  }

  // Resource not found
  if (code === 'ResourceNotFoundException' || httpCode === 404) {
    return {
      code: ImportErrorCode.RESOURCE_NOT_FOUND,
      message: 'Resource not found.',
      recoverable: false,
      service,
    };
  }

  // Default: generic API error
  return {
    code: ImportErrorCode.API_ERROR,
    message: `AWS API error: ${message}`,
    recoverable: false,
    service,
  };
}

/**
 * Classify an Azure error and return a structured ImportError.
 */
export function classifyAzureError(
  error: { code?: string; message?: string; statusCode?: number },
  service?: string
): ImportError {
  const message = error.message || String(error);
  const code = error.code || '';
  const statusCode = error.statusCode;

  // Authentication errors
  if (
    code === 'AuthenticationFailed' ||
    code === 'InvalidAuthenticationToken' ||
    code === 'ExpiredAuthenticationToken' ||
    message.includes('AADSTS') ||
    message.includes('token has expired') ||
    message.includes('authentication')
  ) {
    return {
      code: ImportErrorCode.AUTH_REAUTH_REQUIRED,
      message: 'Azure authentication failed or expired.',
      recoverable: true,
      service,
      action: {
        type: 'reauth',
        command: 'az login',
        description: 'Authenticate with Azure',
      },
    };
  }

  // No credentials
  if (
    code === 'CredentialUnavailable' ||
    message.includes('DefaultAzureCredential') ||
    message.includes('Unable to find credential')
  ) {
    return {
      code: ImportErrorCode.AUTH_REQUIRED,
      message: 'Azure credentials not found.',
      recoverable: true,
      service,
      action: {
        type: 'reauth',
        command: 'az login',
        description: 'Authenticate with Azure',
      },
    };
  }

  // Authorization errors
  if (code === 'AuthorizationFailed' || code === 'Forbidden' || statusCode === 403) {
    return {
      code: ImportErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
      message: 'Insufficient permissions to access Azure resources.',
      recoverable: false,
      service,
      action: {
        type: 'grant_permission',
        url: 'https://portal.azure.com/#blade/Microsoft_Azure_Policy/PolicyMenuBlade/Assignments',
        description: 'Grant required Azure RBAC permissions',
      },
    };
  }

  // Subscription not found
  if (code === 'SubscriptionNotFound' || message.includes('subscription was not found')) {
    return {
      code: ImportErrorCode.RESOURCE_NOT_FOUND,
      message: 'Azure subscription not found or not accessible.',
      recoverable: false,
      service,
    };
  }

  // Rate limiting
  if (code === 'TooManyRequests' || statusCode === 429) {
    return {
      code: ImportErrorCode.API_RATE_LIMITED,
      message: 'Azure API rate limit exceeded. Try again later.',
      recoverable: true,
      service,
      action: {
        type: 'retry',
        description: 'Wait and retry the operation',
      },
    };
  }

  // Resource not found
  if (code === 'ResourceNotFound' || statusCode === 404) {
    return {
      code: ImportErrorCode.RESOURCE_NOT_FOUND,
      message: 'Resource not found.',
      recoverable: false,
      service,
    };
  }

  // Default: generic API error
  return {
    code: ImportErrorCode.API_ERROR,
    message: `Azure API error: ${message}`,
    recoverable: false,
    service,
  };
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format an ImportError for display in CLI.
 */
export function formatImportError(error: ImportError): string {
  let output = `[${error.code}] ${error.message}`;

  if (error.action) {
    output += '\n';
    if (error.action.description) {
      output += `  Action: ${error.action.description}\n`;
    }
    if (error.action.command) {
      output += `  Run: ${error.action.command}\n`;
    }
    if (error.action.url) {
      output += `  See: ${error.action.url}\n`;
    }
  }

  return output;
}

/**
 * Check if an error indicates re-authentication is required.
 */
export function isReauthRequired(error: ImportError): boolean {
  return (
    error.code === ImportErrorCode.AUTH_REAUTH_REQUIRED ||
    error.code === ImportErrorCode.AUTH_EXPIRED ||
    error.code === ImportErrorCode.AUTH_REQUIRED ||
    error.action?.type === 'reauth'
  );
}

/**
 * Check if an error is recoverable.
 */
export function isRecoverable(error: ImportError): boolean {
  return error.recoverable;
}
