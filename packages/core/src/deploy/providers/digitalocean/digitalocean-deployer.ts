/**
 * DigitalOcean Deployer — Modular Dispatcher
 *
 * Routes `digitalocean.<service>.<resource>` types to per-service
 * handlers. Auth: single PAT (Bearer). Spaces uses S3-compatible auth.
 */

import { apps_app_handler } from './handlers/apps-app';
import { apps_envvar_handler } from './handlers/apps-envvar';
import { apps_static_site_handler } from './handlers/apps-static';
import { container_registry_handler } from './handlers/container-registry';
import { databases_cluster_handler } from './handlers/databases-cluster';
import { domain_record_handler } from './handlers/domain-record';
import { droplet_handler } from './handlers/droplet';
import { firewall_handler } from './handlers/firewall';
import { functions_function_handler } from './handlers/functions-function';
import { functions_namespace_handler } from './handlers/functions-namespace';
import { kubernetes_cluster_handler } from './handlers/kubernetes-cluster';
import { loadbalancer_handler } from './handlers/loadbalancer';
import { monitoring_alertpolicy_handler } from './handlers/monitoring-alertpolicy';
import { reserved_ip_handler } from './handlers/reserved-ip';
import { snapshot_handler } from './handlers/snapshot';
import { spaces_bucket_handler } from './handlers/spaces-bucket';
import { volume_handler } from './handlers/volume';
import { vpc_network_handler } from './handlers/vpc-network';
import { initialize_digitalocean_client, initialize_spaces_client } from './sdk-loader';
import type { DOCredentials, DOHandlerContext, DOResourceHandler } from './types';
import type { DeployOptions, ProviderDeployer, ResourceDeployResult } from '../../types';

const HANDLER_REGISTRY: Array<{ prefix: string; handler: DOResourceHandler }> = [
  // P0 (10)
  { prefix: 'digitalocean.droplet.instance', handler: droplet_handler },
  { prefix: 'digitalocean.apps.app', handler: apps_app_handler },
  { prefix: 'digitalocean.databases.cluster', handler: databases_cluster_handler },
  { prefix: 'digitalocean.spaces.bucket', handler: spaces_bucket_handler },
  { prefix: 'digitalocean.loadbalancer.loadbalancer', handler: loadbalancer_handler },
  { prefix: 'digitalocean.apps.envvar', handler: apps_envvar_handler },
  { prefix: 'digitalocean.functions.namespace', handler: functions_namespace_handler },
  { prefix: 'digitalocean.functions.function', handler: functions_function_handler },
  // P1 (6)
  { prefix: 'digitalocean.vpc.network', handler: vpc_network_handler },
  { prefix: 'digitalocean.domain.record', handler: domain_record_handler },
  { prefix: 'digitalocean.firewall.firewall', handler: firewall_handler },
  { prefix: 'digitalocean.kubernetes.cluster', handler: kubernetes_cluster_handler },
  { prefix: 'digitalocean.containerregistry.registry', handler: container_registry_handler },
  { prefix: 'digitalocean.apps.staticSite', handler: apps_static_site_handler },
  // P2 (4)
  { prefix: 'digitalocean.volume.volume', handler: volume_handler },
  { prefix: 'digitalocean.droplet.snapshot', handler: snapshot_handler },
  { prefix: 'digitalocean.monitoring.alertpolicy', handler: monitoring_alertpolicy_handler },
  { prefix: 'digitalocean.reservedip.reservedip', handler: reserved_ip_handler },
];

function resolve_handler(type: string): DOResourceHandler | undefined {
  for (const entry of HANDLER_REGISTRY) {
    if (type.startsWith(entry.prefix)) return entry.handler;
  }
  return undefined;
}

function unsupported(
  name: string,
  type: string,
  action: 'create' | 'update' | 'delete',
  start: number,
): ResourceDeployResult {
  const phrase = action === 'create' ? 'creation' : action === 'delete' ? 'deletion' : 'update';
  return {
    resource_id: name,
    name,
    type,
    action,
    success: false,
    error: `Unsupported resource type for ${phrase}: ${type}`,
    duration_ms: Date.now() - start,
  };
}

export interface DODeployOptions extends DeployOptions {
  digitalocean_credentials?: DOCredentials;
  /** Single deploy region. Falls back to DIGITALOCEAN_REGION, then the default. */
  region?: string;
}

export class DigitalOceanDeployer implements ProviderDeployer {
  provider = 'digitalocean';

  private ctx: DOHandlerContext = {
    region: 'nyc3',
    credentials: { access_token: '', region: 'nyc3' },
    client: null,
  };

  async initialize(options: DeployOptions): Promise<void> {
    const opts = options as DODeployOptions;
    const creds = opts.digitalocean_credentials ?? {
      access_token: process.env.DIGITALOCEAN_TOKEN ?? '',
      region: process.env.DIGITALOCEAN_REGION ?? opts.region ?? 'nyc3',
      spaces_access_key: process.env.DO_SPACES_ACCESS_KEY,
      spaces_secret_key: process.env.DO_SPACES_SECRET_KEY,
    };
    const { client } = await initialize_digitalocean_client(creds);
    const spaces_client = await initialize_spaces_client(creds);
    this.ctx = {
      region: creds.region,
      credentials: creds,
      client,
      spaces_client: spaces_client ?? undefined,
      on_log: opts.on_log,
      on_step: opts.on_progress
        ? (resource, step) => opts.on_progress?.(resource, 'running', 'in-progress', { step })
        : undefined,
    };
  }

  async cleanup(): Promise<void> {}

  async create(
    type: string,
    name: string,
    properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'create', start);
    const result = await handler.create(name, properties, this.ctx);
    return { ...result, type };
  }

  async update(
    type: string,
    name: string,
    provider_id: string,
    properties: Record<string, unknown>,
    current_properties: Record<string, unknown>,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'update', start);
    const result = await handler.update(name, provider_id, properties, current_properties, this.ctx);
    return { ...result, type };
  }

  async delete(
    type: string,
    name: string,
    provider_id: string,
    _options: Record<string, unknown>,
  ): Promise<ResourceDeployResult> {
    const start = Date.now();
    const handler = resolve_handler(type);
    if (!handler) return unsupported(name, type, 'delete', start);
    const result = await handler.delete(name, provider_id, this.ctx);
    return { ...result, type };
  }
}

export function create_digitalocean_deployer(): DigitalOceanDeployer {
  return new DigitalOceanDeployer();
}

export { HANDLER_REGISTRY };
