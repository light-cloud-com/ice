/**
 * Shared result builders for Alibaba Cloud resource handlers. Mirror
 * of `aws/handlers/_result.ts`, `azure/handlers/_result.ts`, and
 * `kubernetes/handlers/_result.ts`.
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
 * Alibaba APIs frequently throw with a `code` field for `EntityNotExist.*`
 * or `InvalidParameter.NotFound` family. Treat delete-side not-found as
 * benign.
 */
export function isAlibabaNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; statusCode?: number; data?: { Code?: string } };
  const code = e.code ?? e.data?.Code ?? '';
  if (typeof code === 'string') {
    if (code.includes('NotFound') || code.includes('NotExist')) return true;
    if (code === 'NoSuchBucket' || code === 'NoSuchKey') return true;
  }
  if (e.statusCode === 404) return true;
  return false;
}

/** Treat 409 / "already exists" as benign on create so re-runs are idempotent. */
export function isAlibabaAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; statusCode?: number };
  if (typeof e.code === 'string') {
    if (e.code.includes('AlreadyExists') || e.code === 'BucketAlreadyExists') return true;
    if (e.code === 'InvalidParameter.Duplicated') return true;
  }
  if (e.statusCode === 409) return true;
  return false;
}
