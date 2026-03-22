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
}
