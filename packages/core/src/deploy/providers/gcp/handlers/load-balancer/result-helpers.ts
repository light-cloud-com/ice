/**
 * Shared helpers for building `ResourceDeployResult` shapes from the
 * Cloud Load Balancing handler. Extracted from `load-balancer.ts`
 * (rf-lbal-1) so the orchestrator and per-step modules can share the
 * same success / failure builders without re-implementing the shape.
 *
 * Pattern-identical to `cloud-storage/result-helpers.ts` and
 * `firebase-hosting/result-helpers.ts`.
 */
import type { ResourceDeployResult } from '../../../../types';

/** ICE resource type emitted by the Load Balancer handler. */
export const TYPE = 'gcp.compute.globalForwardingRule';

/** Compute Engine REST API base URL. */
export const BASE_URL = 'https://compute.googleapis.com/compute/v1';

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
