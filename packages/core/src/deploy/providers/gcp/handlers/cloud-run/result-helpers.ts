/**
 * Shared helpers for building `ResourceDeployResult` shapes from the
 * Cloud Run handler. Extracted from `cloud-run.ts` so the orchestrator
 * and per-method modules can share the same success / failure builders
 * without re-implementing the shape.
 *
 * Different from `cloud-storage/result-helpers.ts` and
 * `firebase-hosting/result-helpers.ts`: the Cloud Run handler emits
 * TWO ICE resource types (`gcp.run.service` and `gcp.run.job`)
 * depending on whether the deployed resource is a service or a job, so
 * the `type` parameter is required at every call site rather than
 * being a constant.
 */
import type { ResourceDeployResult } from '../../../../types.js';

/** ICE resource type emitted by the Cloud Run handler when deploying a service. */
export const TYPE_SERVICE = 'gcp.run.service';

/** ICE resource type emitted by the Cloud Run handler when deploying a job. */
export const TYPE_JOB = 'gcp.run.job';

/**
 * Build a successful `ResourceDeployResult`. `name` is reused as the
 * `resource_id`. `overrides` shallow-merges over the base shape so
 * callers can attach `provider_id`, `outputs`, etc.
 */
export function result(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
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

/**
 * Build a failed `ResourceDeployResult`. Mirrors `result()` but flips
 * `success: false` and surfaces the error message.
 */
export function fail(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
  error: string,
): ResourceDeployResult {
  return {
    resource_id: name,
    name,
    type,
    action,
    success: false,
    error,
    duration_ms: Date.now() - start,
  };
}
