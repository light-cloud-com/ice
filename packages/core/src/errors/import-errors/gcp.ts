/**
 * GCP Error Classification (rf-ierr-2)
 *
 * Maps raw GCP errors (`{ code, message, details }`) to structured
 * `ImportError` objects with recovery actions. Behavior preserved
 * verbatim — the substring tests + error.code mapping ladder is the
 * authoritative form consumed by `gcp-importer.ts` and the
 * Asset-Inventory service.
 */

import { ImportErrorCode, type ImportError } from './types.js';

/**
 * Classify a GCP error and return a structured ImportError.
 */
export function classifyGCPError(
  error: { code?: number; message?: string; details?: unknown },
  service?: string,
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
      message: 'Authentication session expired. Please re-authenticate with: gcloud auth application-default login',
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
