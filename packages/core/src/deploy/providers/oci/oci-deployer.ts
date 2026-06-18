/**
 * OCI (Oracle Cloud Infrastructure) Deployer — Modular Dispatcher
 *
 * Routes `oci.<service>.<resource>` types to per-service handlers.
 * Compartment-scoped — every resource lives in a compartment OCID
 * supplied via DeployOptions.oci_credentials.compartment_id.
 */

import { analytics_instance_handler } from './handlers/analytics-instance';
import { apigateway_gateway_handler } from './handlers/apigateway-gateway';
import { artifacts_repository_handler } from './handlers/artifacts-repository';
import { certificates_certificate_handler } from './handlers/certificates-certificate';
import { containerengine_cluster_handler } from './handlers/containerengine-cluster';
import { containerinstance_handler } from './handlers/containerinstance';
import { core_instance_handler } from './handlers/core-instance';
import { core_nsg_handler } from './handlers/core-nsg';
import { core_privateaccessgateway_handler } from './handlers/core-privateaccessgateway';
import { core_subnet_handler } from './handlers/core-subnet';
import { core_vcn_handler } from './handlers/core-vcn';
import { database_autonomous_handler } from './handlers/database-autonomous';
import { datascience_modeldeployment_handler } from './handlers/datascience-modeldeployment';
import { dns_zone_handler } from './handlers/dns-zone';
import { functions_function_handler } from './handlers/functions-function';
import { generativeai_endpoint_handler } from './handlers/generativeai-endpoint';
import { identitydomains_user_handler } from './handlers/identitydomains-user';
import { loadbalancer_handler } from './handlers/loadbalancer';
import { logging_loggroup_handler } from './handlers/logging-loggroup';
import { monitoring_alarm_handler } from './handlers/monitoring-alarm';
import { mysql_dbsystem_handler } from './handlers/mysql-dbsystem';
import { nosql_table_handler } from './handlers/nosql-table';
import { objectstorage_bucket_handler } from './handlers/objectstorage-bucket';
import { ons_topic_handler } from './handlers/ons-topic';
import { psql_dbsystem_handler } from './handlers/psql-dbsystem';
import { queue_handler } from './handlers/queue';
import { redis_cluster_handler } from './handlers/redis-cluster';
import { resourcescheduler_schedule_handler } from './handlers/resourcescheduler';
import { streaming_stream_handler } from './handlers/streaming-stream';
import { vault_secret_handler } from './handlers/vault-secret';
import { waf_policy_handler } from './handlers/waf-policy';
import { initialize_oci_clients } from './sdk-loader';
import type { OCICredentials, OCIHandlerContext, OCIResourceHandler } from './types';
import type { DeployOptions, ProviderDeployer, ResourceDeployResult } from '../../types';

const HANDLER_REGISTRY: Array<{ prefix: string; handler: OCIResourceHandler }> = [
  // P0 (14)
  { prefix: 'oci.core.instance', handler: core_instance_handler },
  { prefix: 'oci.core.vcn', handler: core_vcn_handler },
  { prefix: 'oci.core.subnet', handler: core_subnet_handler },
  { prefix: 'oci.core.networksecuritygroup', handler: core_nsg_handler },
  { prefix: 'oci.containerinstance.instance', handler: containerinstance_handler },
  { prefix: 'oci.functions.function', handler: functions_function_handler },
  { prefix: 'oci.resourcescheduler.schedule', handler: resourcescheduler_schedule_handler },
  { prefix: 'oci.psql.dbsystem', handler: psql_dbsystem_handler },
  { prefix: 'oci.mysql.dbsystem', handler: mysql_dbsystem_handler },
  { prefix: 'oci.database.autonomousdatabase', handler: database_autonomous_handler },
  { prefix: 'oci.nosql.table', handler: nosql_table_handler },
  { prefix: 'oci.redis.cluster', handler: redis_cluster_handler },
  { prefix: 'oci.objectstorage.bucket', handler: objectstorage_bucket_handler },
  { prefix: 'oci.vault.secret', handler: vault_secret_handler },
  // P1 (10)
  { prefix: 'oci.loadbalancer.loadbalancer', handler: loadbalancer_handler },
  { prefix: 'oci.dns.zone', handler: dns_zone_handler },
  { prefix: 'oci.apigateway.gateway', handler: apigateway_gateway_handler },
  { prefix: 'oci.core.privateaccessgateway', handler: core_privateaccessgateway_handler },
  { prefix: 'oci.containerengine.cluster', handler: containerengine_cluster_handler },
  { prefix: 'oci.artifacts.repository', handler: artifacts_repository_handler },
  { prefix: 'oci.identitydomains.user', handler: identitydomains_user_handler },
  { prefix: 'oci.certificates.certificate', handler: certificates_certificate_handler },
  { prefix: 'oci.waf.policy', handler: waf_policy_handler },
  { prefix: 'oci.logging.loggroup', handler: logging_loggroup_handler },
  // P2 (7)
  { prefix: 'oci.queue.queue', handler: queue_handler },
  { prefix: 'oci.streaming.stream', handler: streaming_stream_handler },
  { prefix: 'oci.ons.topic', handler: ons_topic_handler },
  { prefix: 'oci.analytics.instance', handler: analytics_instance_handler },
  { prefix: 'oci.monitoring.alarm', handler: monitoring_alarm_handler },
  { prefix: 'oci.generativeai.endpoint', handler: generativeai_endpoint_handler },
  { prefix: 'oci.datascience.modeldeployment', handler: datascience_modeldeployment_handler },
];

function resolve_handler(type: string): OCIResourceHandler | undefined {
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

export interface OCIDeployOptions extends DeployOptions {
  oci_credentials?: OCICredentials;
  /** Single deploy region. Falls back to OCI_REGION, then the default. */
  region?: string;
}

export class OCIDeployer implements ProviderDeployer {
  provider = 'oci';

  private ctx: OCIHandlerContext = {
    region: 'us-ashburn-1',
    compartment_id: '',
    credentials: { compartment_id: '', region: 'us-ashburn-1' },
    clients: new Map(),
  };

  async initialize(options: DeployOptions): Promise<void> {
    const opts = options as OCIDeployOptions;
    const creds = opts.oci_credentials ?? {
      config_path: process.env.OCI_CONFIG_FILE,
      profile: process.env.OCI_CONFIG_PROFILE ?? 'DEFAULT',
      compartment_id: process.env.OCI_COMPARTMENT_ID ?? '',
      region: process.env.OCI_REGION ?? opts.region ?? 'us-ashburn-1',
      auth_mode: (process.env.OCI_AUTH_MODE as OCICredentials['auth_mode']) ?? 'config-file',
    };
    const { clients } = await initialize_oci_clients(creds);
    this.ctx = {
      region: creds.region,
      compartment_id: creds.compartment_id,
      credentials: creds,
      clients,
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

export function create_oci_deployer(): OCIDeployer {
  return new OCIDeployer();
}

export { HANDLER_REGISTRY };
