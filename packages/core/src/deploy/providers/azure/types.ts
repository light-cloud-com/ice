/**
 * Azure Deployer Types
 *
 * Shared interfaces for all Azure resource handlers. Parallel to the
 * AWS equivalents in `../aws/types.ts`. Adopting the same shape keeps
 * dispatch + tests + JSONL events uniform across providers.
 */

import type { ResourceDeployResult } from '../../types';

/**
 * Context passed to every Azure resource handler.
 */
export interface AzureHandlerContext {
  /** Operator's Azure subscription id. */
  subscription_id: string;
  /** Default Azure tenant id (often unused once SDK clients are built). */
  tenant_id?: string;
  /** Default location (e.g. `eastus`). Operator-supplied via DeployOptions.regions[0]. */
  location: string;
  /** Default resource group — auto-created via `ensure_resource_group` if missing. */
  resource_group: string;
  /**
   * Lazy-loaded ARM clients keyed by service short-name (`compute`,
   * `storage`, `web`, `network`, `keyvault`, etc.). Handlers
   * `ctx.clients.get('compute')` to read theirs. Returns `undefined`
   * when the SDK package isn't installed — handlers guard with a
   * friendly error.
   */
  clients: Map<string, unknown>;
  /** Lazy-loaded shared credential (DefaultAzureCredential). */
  credential: unknown;
  /** Optional log callback. */
  on_log?: (message: string) => void;
  /** Optional sub-step progress reporter for long-running ARM ops. */
  on_step?: (resource: string, step: { label: string; index: number; total: number }) => void;
  /** User-cancel signal from the per-card deploy lock. */
  abort_signal?: AbortSignal;
}

/**
 * Interface every Azure resource handler implements. Mirrors the AWS
 * + GCP shape so a future shared dispatch surface can treat any
 * provider uniformly.
 */
export interface AzureResourceHandler {
  create(name: string, properties: Record<string, unknown>, ctx: AzureHandlerContext): Promise<ResourceDeployResult>;
  update(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    ctx: AzureHandlerContext,
  ): Promise<ResourceDeployResult>;
  delete(name: string, provider_id: string, ctx: AzureHandlerContext): Promise<ResourceDeployResult>;
}
