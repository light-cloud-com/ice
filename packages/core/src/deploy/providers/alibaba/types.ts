/**
 * Alibaba Cloud Deployer Types
 *
 * Parallel to AWS / Azure / GCP / Kubernetes shape — same dispatch
 * surface so the orchestrator doesn't care which provider routes the
 * call.
 *
 * Auth model: AccessKey ID + AccessKey Secret (RAM keys). STS tokens
 * supported via the optional `security_token` field on the loader.
 *
 * Regions: identified by IDs like `cn-hangzhou`, `ap-southeast-1`,
 * `us-west-1`. Endpoint per region per service — the sdk-loader picks
 * the correct host for each `@alicloud/<service>` package.
 */

import type { ResourceDeployResult } from '../../types';

export interface AlibabaCredentials {
  access_key_id: string;
  access_key_secret: string;
  security_token?: string;
  region: string;
}

export interface AlibabaHandlerContext {
  region: string;
  credentials: AlibabaCredentials;
  /**
   * Lazy-loaded typed Alibaba clients keyed by short-name (e.g. `ecs`,
   * `rds`, `oss`, `vpc`). Handlers do `ctx.clients.get('rds')` and the
   * loader instantiates the right `@alicloud/<svc>` client per region.
   * Returns `undefined` when the SDK package isn't installed.
   */
  clients: Map<string, unknown>;
  on_log?: (message: string) => void;
  on_step?: (resource: string, step: { label: string; index: number; total: number }) => void;
  abort_signal?: AbortSignal;
}

export interface AlibabaResourceHandler {
  create(name: string, properties: Record<string, unknown>, ctx: AlibabaHandlerContext): Promise<ResourceDeployResult>;
  update(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    ctx: AlibabaHandlerContext,
  ): Promise<ResourceDeployResult>;
  delete(name: string, provider_id: string, ctx: AlibabaHandlerContext): Promise<ResourceDeployResult>;
}
