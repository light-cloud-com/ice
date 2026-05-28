/**
 * Shared result builders for OCI resource handlers.
 */

import type { ResourceDeployResult } from '../../../types';

export type DeployAction = 'create' | 'update' | 'delete';

export function ok(
  name: string,
  type: string,
  action: DeployAction,
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

export function err(
  name: string,
  type: string,
  action: DeployAction,
  start: number,
  message: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: false,
    error: message,
    duration_ms: Date.now() - start,
  };
}

export function sdkMissing(
  name: string,
  type: string,
  action: DeployAction,
  start: number,
  service_display: string,
  package_name: string,
): ResourceDeployResult {
  return err(name, type, action, start, `${service_display} SDK not available. Install ${package_name}`);
}

/**
 * OCI throws errors with `statusCode` (HTTP) + `serviceCode` (e.g.
 * `NotAuthorizedOrNotFound`). Treat 404 / "NotFound" as benign on
 * delete.
 */
export function isOciNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { statusCode?: number; serviceCode?: string };
  if (e.statusCode === 404) return true;
  if (typeof e.serviceCode === 'string' && e.serviceCode.includes('NotFound')) return true;
  if (typeof e.serviceCode === 'string' && e.serviceCode === 'NotAuthorizedOrNotFound') return true;
  return false;
}

export function isOciAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { statusCode?: number; serviceCode?: string };
  if (e.statusCode === 409) return true;
  if (typeof e.serviceCode === 'string' && e.serviceCode.includes('AlreadyExist')) return true;
  return false;
}
