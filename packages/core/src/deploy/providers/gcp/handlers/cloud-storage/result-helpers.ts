/**
 * Shared helpers for building `ResourceDeployResult` shapes from the
 * Cloud Storage handler. Extracted from `cloud-storage.ts` so the
 * orchestrator and any future per-step modules can share the same
 * success / failure builders without re-implementing the shape.
 *
 * Pattern-identical to `firebase-hosting/result-helpers.ts` but kept
 * separate — different ICE resource type and intentionally not merged
 * (the firebase handler's `TYPE = 'gcp.firebase.hosting'` is a distinct
 * resource type from this handler's `'gcp.storage.bucket'`, and merging
 * would force callers to pass the type as an argument, which is noise
 * for a one-handler-per-file architecture).
 */

import type { ResourceDeployResult } from '../../../../types';

/** ICE resource type emitted by the Cloud Storage handler. */
export const TYPE = 'gcp.storage.bucket';

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
