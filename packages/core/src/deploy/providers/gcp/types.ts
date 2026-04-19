/**
 * GCP Deployer Types
 *
 * Shared interfaces for all GCP resource handlers.
 */

import type { ResourceDeployResult } from '../../types.js';

/**
 * Context passed to every GCP resource handler.
 */
export interface GCPHandlerContext {
  /** GCP project ID */
  project: string;
  /** Default region */
  region: string;
  /** Lazy-loaded SDK clients */
  clients: Map<string, unknown>;
  /** REST API helper for services without Node.js SDKs */
  rest_client: GCPRestClient;
  /** Optional log callback for progress messages (Cloud Build, etc.) */
  on_log?: (message: string) => void;
  /**
   * Phase 2 — optional sub-step progress reporter. Handlers that chain
   * multiple long-running GCP operations (load balancer, cloud sql, etc.)
   * should call this between sub-operations so the UI can show fractional
   * progress instead of a 0 → 100% jump.
   */
  on_step?: (resource: string, step: { label: string; index: number; total: number }) => void;
  /**
   * User-cancel signal from the per-card deploy lock. Handlers with long
   * polls (Cloud Build, SQL ops) should honour this so a cancel actually
   * stops the remote work instead of only the local loop.
   */
  abort_signal?: AbortSignal;
}

/**
 * REST client interface for GCP APIs without official Node.js SDKs.
 */
export interface GCPRestClient {
  /** Make an authenticated GET request */
  get(url: string): Promise<unknown>;
  /** Make an authenticated POST request */
  post(url: string, body: unknown): Promise<unknown>;
  /** Make an authenticated PATCH request */
  patch(url: string, body: unknown): Promise<unknown>;
  /** Make an authenticated DELETE request */
  delete(url: string): Promise<unknown>;
}

/**
 * Phase 7 — describe result for drift detection.
 *
 * Returned by the optional `describe` method. `exists: false` means the
 * resource is gone (GCP returned 404); `properties` is the normalized
 * subset of fields ICE manages, suitable for direct comparison against
 * the desired graph's property bag.
 */
export interface ResourceDescribeResult {
  exists: boolean;
  /** Raw GCP response (preserved for debugging). */
  raw?: unknown;
  /** Normalized properties comparable with the desired graph. */
  properties?: Record<string, unknown>;
  /** Error message if describe failed for a non-404 reason. */
  error?: string;
}

/**
 * Interface that every GCP resource handler must implement.
 */
export interface GCPResourceHandler {
  /** Create a new resource. Returns the deploy result with provider_id. */
  create(name: string, properties: Record<string, unknown>, ctx: GCPHandlerContext): Promise<ResourceDeployResult>;

  /** Update an existing resource. */
  update(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    ctx: GCPHandlerContext,
  ): Promise<ResourceDeployResult>;

  /** Delete a resource. */
  delete(name: string, provider_id: string, ctx: GCPHandlerContext): Promise<ResourceDeployResult>;

  /**
   * Phase 7 — optional. Fetch the real resource from GCP and return a
   * normalized property bag for drift comparison. Handlers that don't
   * implement this opt out of drift detection for their resource type.
   */
  describe?(
    name: string,
    provider_id: string,
    ctx: GCPHandlerContext,
  ): Promise<ResourceDescribeResult>;
}
