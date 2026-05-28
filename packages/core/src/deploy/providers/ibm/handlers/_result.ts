/**
 * Shared result builders for IBM Cloud resource handlers.
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
 * IBM SDK throws errors with `status` (HTTP) + `errors[{code,message}]`.
 * 404 / 410 / `not_found` codes treated as benign on delete.
 */
export function isIbmNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    errors?: Array<{ code?: string; message?: string }>;
  };
  const status = e.status ?? e.statusCode;
  if (status === 404 || status === 410) return true;
  if (typeof e.code === 'string' && e.code.includes('not_found')) return true;
  if (Array.isArray(e.errors)) {
    for (const err of e.errors) {
      if (typeof err.code === 'string' && err.code.includes('not_found')) return true;
    }
  }
  return false;
}

export function isIbmAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: number; statusCode?: number; code?: string };
  const status = e.status ?? e.statusCode;
  if (status === 409 || status === 422) return true;
  if (typeof e.code === 'string' && (e.code.includes('already_exists') || e.code.includes('conflict'))) return true;
  return false;
}
