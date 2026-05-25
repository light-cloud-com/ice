/**
 * AWS Deployer Types
 *
 * Shared interfaces for all AWS resource handlers. Parallel to the
 * GCP equivalents in `../gcp/types.ts`. Adopting the same shape lets
 * the AWS deployer benefit from the same per-handler patterns:
 *
 *   - lazy SDK client pool (clients fetched once, reused per deploy)
 *   - sub-step progress reporting for long-running creates
 *   - user-cancel via AbortSignal
 *   - on_log callback for handlers that stream provider-side output
 */

import type { AccountIdResolver } from './account';
import type { ResourceDeployResult } from '../../types';

/**
 * Context passed to every AWS resource handler.
 */
export interface AWSHandlerContext {
  /** Default AWS region (e.g. `us-east-1`). Single-region deploys today. */
  region: string;
  /**
   * Lazy-loaded SDK clients keyed by AWS service short-name (`ec2`,
   * `s3`, `lambda`, `rds`, …). Handlers `ctx.clients.get('s3')` to
   * read theirs. Returns `undefined` when the SDK package isn't
   * installed — handlers must guard with a friendly error.
   */
  clients: Map<string, unknown>;
  /**
   * Memoised AWS account id (via STS GetCallerIdentity). Fetched on
   * first call and cached for the deploy's lifetime. Used by S3 to
   * suffix bucket names + by ECS to build ecsTaskExecutionRole ARNs.
   * Throws when the STS SDK isn't installed.
   */
  ensure_account_id: AccountIdResolver;
  /** Optional log callback for progress messages. */
  on_log?: (message: string) => void;
  /**
   * Optional sub-step progress reporter. Handlers that chain multiple
   * long-running AWS operations (RDS provisioning, CloudFront, etc.)
   * call this between sub-operations so the UI can show fractional
   * progress instead of a 0 → 100% jump.
   */
  on_step?: (resource: string, step: { label: string; index: number; total: number }) => void;
  /**
   * User-cancel signal from the per-card deploy lock. Handlers with
   * long polls (RDS create polling, CloudFront distribution propagation,
   * etc.) honour this so a cancel actually stops the remote work.
   */
  abort_signal?: AbortSignal;
}

/**
 * Interface every AWS resource handler implements. Mirrors
 * `GCPResourceHandler` so a future shared dispatch surface can treat
 * both providers uniformly.
 */
export interface AWSResourceHandler {
  /** Create a new resource. Returns the deploy result with `provider_id`. */
  create(name: string, properties: Record<string, unknown>, ctx: AWSHandlerContext): Promise<ResourceDeployResult>;

  /** Update an existing resource. */
  update(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    ctx: AWSHandlerContext,
  ): Promise<ResourceDeployResult>;

  /** Delete a resource. */
  delete(name: string, provider_id: string, ctx: AWSHandlerContext): Promise<ResourceDeployResult>;
}
