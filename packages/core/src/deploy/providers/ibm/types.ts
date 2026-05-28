/**
 * IBM Cloud Deployer Types
 *
 * Auth: IAM API key. Resources are scoped to a resource group + MZR
 * region. The deployer takes both at init.
 */

import type { ResourceDeployResult } from '../../types';

export interface IBMCredentials {
  api_key: string;
  account_id?: string;
  resource_group_id?: string;
  region: string;
}

export interface IBMHandlerContext {
  region: string;
  resource_group_id?: string;
  account_id?: string;
  credentials: IBMCredentials;
  /**
   * Lazy-loaded typed IBM Cloud service clients keyed by short-name.
   *   - 'vpc'                — @ibm-cloud/vpc
   *   - 'codeengine'         — @ibm-cloud/code-engine
   *   - 'resourcecontroller' — @ibm-cloud/platform-services (resource instance lifecycle)
   *   - 'iam'                — @ibm-cloud/platform-services
   *   - 'secretsmanager'     — @ibm-cloud/secrets-manager
   *   - 'cos'                — ibm-cos-sdk (S3-compatible)
   *   - 'cloudant'           — @ibm-cloud/cloudant
   *   - 'eventnotifications' — @ibm-cloud/event-notifications
   *   - 'eventstreams'       — @ibm-cloud/event-streams
   *   - 'logdna'             — IBM Log Analysis (REST)
   *   - 'cis'                — @ibm-cloud/networking-services (CIS)
   *   - 'mq'                 — @ibm-cloud/mqcloud-rest-api
   *   - 'iks'                — @ibm-cloud/kubernetes-service
   *   - 'cr'                 — IBM Cloud Container Registry (REST)
   *   - 'appid'              — App ID (REST)
   *   - 'monitoring'         — Sysdig monitoring (REST)
   *   - 'watsonx'            — watsonx.ai
   */
  clients: Map<string, unknown>;
  /** Authenticator returned by ibm-cloud-sdk-core for use with COS / REST clients. */
  authenticator?: unknown;
  on_log?: (message: string) => void;
  on_step?: (resource: string, step: { label: string; index: number; total: number }) => void;
  abort_signal?: AbortSignal;
}

export interface IBMResourceHandler {
  create(name: string, properties: Record<string, unknown>, ctx: IBMHandlerContext): Promise<ResourceDeployResult>;
  update(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    ctx: IBMHandlerContext,
  ): Promise<ResourceDeployResult>;
  delete(name: string, provider_id: string, ctx: IBMHandlerContext): Promise<ResourceDeployResult>;
}
