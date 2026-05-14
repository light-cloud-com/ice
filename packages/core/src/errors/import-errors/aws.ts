/**
 * AWS Error Classification (rf-ierr-3)
 *
 * Maps AWS SDK errors (`{ name, code, message, $metadata }`) to
 * structured `ImportError` objects. Behavior preserved verbatim from
 * `import-errors.ts`.
 */

import { ImportErrorCode, type ImportError } from './types';

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
  service?: string,
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
