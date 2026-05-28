/**
 * Shared result builders for Kubernetes resource handlers. Mirror of
 * `aws/handlers/_result.ts` and `azure/handlers/_result.ts`.
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
 * Treat 404 / "not found" K8s API errors as benign on delete — the
 * goal is "make the resource gone" and it already is. Other handlers
 * call this to centralize the heuristic.
 */
export function isK8sNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { statusCode?: number; code?: number; body?: { code?: number; reason?: string } };
  if (e.statusCode === 404 || e.code === 404 || e.body?.code === 404) return true;
  if (e.body?.reason === 'NotFound') return true;
  return false;
}
