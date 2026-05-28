/**
 * Shared result builders for DigitalOcean resource handlers.
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
 * DO API throws AxiosError-shaped errors with `response.status` and a
 * JSON body containing `id` / `message`. 404 / "not_found" / 422 for
 * "already_exists" / 409.
 */
export function isDoNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { response?: { status?: number; data?: { id?: string } }; status?: number };
  const status = e.response?.status ?? e.status;
  if (status === 404) return true;
  const id = e.response?.data?.id;
  if (typeof id === 'string' && id.includes('not_found')) return true;
  return false;
}

export function isDoAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { response?: { status?: number; data?: { id?: string } } };
  const status = e.response?.status;
  if (status === 409 || status === 422) return true;
  const id = e.response?.data?.id;
  if (typeof id === 'string' && (id.includes('already_exists') || id.includes('conflict'))) return true;
  return false;
}
