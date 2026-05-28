/**
 * OCI Deployer Types
 *
 * Auth model: 4 modes — config file (~/.oci/config), instance
 * principal (in-OCI VMs), resource principal (in-OCI functions /
 * container instances), or explicit credentials. The sdk-loader picks
 * based on `OCI_AUTH_MODE` env var; default is config file at
 * ~/.oci/config.
 *
 * Compartment: every resource lives in a compartment (OCID). The
 * deployer takes `compartment_id` as a required init arg; handlers
 * read it via `ctx.compartment_id`.
 */

import type { ResourceDeployResult } from '../../types';

export interface OCICredentials {
  config_path?: string;
  profile?: string;
  compartment_id: string;
  region: string;
  auth_mode?: 'config-file' | 'instance-principal' | 'resource-principal' | 'session-token';
}

export interface OCIHandlerContext {
  region: string;
  compartment_id: string;
  credentials: OCICredentials;
  /**
   * Lazy-loaded typed OCI service clients keyed by short-name:
   *   - 'core' (oci-core: VMs, VCN, Subnet, NSG)
   *   - 'database' (Autonomous DB)
   *   - 'mysql' (HeatWave MDS)
   *   - 'objectstorage' (Object Storage buckets)
   *   - 'functions' (OCI Functions)
   *   - 'vault' (secrets)
   *   - 'loadbalancer', 'dns', 'apigateway', 'containerengine',
   *     'artifacts', 'identitydomains', 'certificatesmanagement', 'waf',
   *     'logging', 'queue', 'streaming', 'ons', 'analytics',
   *     'monitoring', 'generativeai', 'datascience'
   * Returns `undefined` when the matching `oci-<svc>` package isn't installed.
   */
  clients: Map<string, unknown>;
  /** Object Storage namespace (tenancy-scoped). Resolved on init. */
  objectstorage_namespace?: string;
  on_log?: (message: string) => void;
  on_step?: (resource: string, step: { label: string; index: number; total: number }) => void;
  abort_signal?: AbortSignal;
}

export interface OCIResourceHandler {
  create(name: string, properties: Record<string, unknown>, ctx: OCIHandlerContext): Promise<ResourceDeployResult>;
  update(
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    ctx: OCIHandlerContext,
  ): Promise<ResourceDeployResult>;
  delete(name: string, provider_id: string, ctx: OCIHandlerContext): Promise<ResourceDeployResult>;
}
