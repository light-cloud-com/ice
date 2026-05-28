/**
 * DigitalOcean Deployer Types
 *
 * Auth: single Personal Access Token (Bearer). Spaces uses a separate
 * S3-compatible access key + secret (the AWS SDK reused with a DO
 * endpoint override).
 */

import type { ResourceDeployResult } from '../../types';

export interface DOCredentials {
  access_token: string;
  region: string;
  spaces_access_key?: string;
  spaces_secret_key?: string;
}

export interface DOHandlerContext {
  region: string;
  credentials: DOCredentials;
  /** dots-wrapper API client (single instance). */
  client: any;
  /** S3-compatible Spaces client lazy-loaded via @aws-sdk/client-s3. */
  spaces_client?: any;
  on_log?: (message: string) => void;
  on_step?: (resource: string, step: { label: string; index: number; total: number }) => void;
  abort_signal?: AbortSignal;
}

export interface DOResourceHandler {
  create(name: string, properties: Record<string, unknown>, ctx: DOHandlerContext): Promise<ResourceDeployResult>;
  update(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    ctx: DOHandlerContext,
  ): Promise<ResourceDeployResult>;
  delete(name: string, provider_id: string, ctx: DOHandlerContext): Promise<ResourceDeployResult>;
}
