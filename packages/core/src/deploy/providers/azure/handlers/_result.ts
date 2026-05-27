/**
 * Shared result builders for Azure resource handlers. Mirror of
 * `aws/handlers/_result.ts`.
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
