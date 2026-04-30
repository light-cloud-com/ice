/**
 * Shared helpers for building `ResourceDeployResult` shapes from the
 * Firebase Hosting handler. Extracted from `firebase-hosting.ts` so the
 * orchestrator and any future per-step modules can share the same
 * success / failure builders without re-implementing the shape.
 */

import type { ResourceDeployResult } from '../../../../types.js';

/** ICE resource type emitted by the Firebase Hosting handler. */
export const TYPE = 'gcp.firebase.hosting';

/**
 * Build a successful `ResourceDeployResult`. `name` is reused as the
 * `resource_id`. `overrides` shallow-merges over the base shape so
 * callers can attach `provider_id`, `outputs`, etc.
 */
export function result(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  overrides: Partial<ResourceDeployResult> = {},
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: true,
    duration_ms: Date.now() - start,
    ...overrides,
  };
}

/**
 * Build a failed `ResourceDeployResult`. Mirrors `result()` but flips
 * `success: false` and surfaces the error message.
 */
export function fail(
  name: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type: TYPE,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}
