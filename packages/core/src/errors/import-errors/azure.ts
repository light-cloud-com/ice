/**
 * Azure Error Classification (rf-ierr-4)
 *
 * Maps Azure SDK errors (`{ code, message, statusCode }`) to structured
 * `ImportError` objects. Behavior preserved verbatim from
 * `import-errors.ts`.
 */

import { ImportErrorCode, type ImportError } from './types';

/**
 * Classify an Azure error and return a structured ImportError.
 */
export function classifyAzureError(
  error: { code?: string; message?: string; statusCode?: number },
  service?: string,
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
