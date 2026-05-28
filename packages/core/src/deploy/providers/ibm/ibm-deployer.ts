/**
 * IBM Cloud Deployer — Modular Dispatcher
 *
 * Routes `ibm.<service>.<resource>` types to per-service handlers.
 * Resource-group + MZR region scoped. Most managed services land via
 * the Resource Controller; a single helper in handlers/resource-instance.ts
 * covers them.
 */

import { codeengine_application_handler } from './handlers/codeengine-application';
import { codeengine_function_handler } from './handlers/codeengine-function';
import { codeengine_job_handler } from './handlers/codeengine-job';
import { cos_bucket_handler } from './handlers/cos-bucket';
import {
  databases_mongodb_handler,
  databases_mysql_handler,
  databases_postgresql_handler,
  databases_redis_handler,
} from './handlers/databases-instance';
import {
  appid_instance_handler,
  cis_wafrule_handler,
  cis_zone_handler,
  cloudant_database_handler,
  containerregistry_namespace_handler,
  containers_cluster_handler,
  eventnotifications_instance_handler,
  eventstreams_topic_handler,
  logging_instance_handler,
  monitoring_alert_handler,
  mq_queuemanager_handler,
  secretsmanager_importedcert_handler,
  watsonx_deployment_handler,
} from './handlers/resource-instance';
import { secretsmanager_secret_handler } from './handlers/secretsmanager-secret';
import { vpc_handler } from './handlers/vpc';
import { vpc_instance_handler } from './handlers/vpc-instance';
import { vpc_loadbalancer_handler } from './handlers/vpc-loadbalancer';
import { vpc_securitygroup_handler } from './handlers/vpc-securitygroup';
import { vpc_subnet_handler } from './handlers/vpc-subnet';
import { initialize_ibm_clients } from './sdk-loader';
import type { IBMCredentials, IBMHandlerContext, IBMResourceHandler } from './types';
import type { DeployOptions, ProviderDeployer, ResourceDeployResult } from '../../types';

const HANDLER_REGISTRY: Array<{ prefix: string; handler: IBMResourceHandler }> = [
  // P0 (12)
  { prefix: 'ibm.codeengine.application', handler: codeengine_application_handler },
  { prefix: 'ibm.codeengine.function', handler: codeengine_function_handler },
  { prefix: 'ibm.codeengine.job', handler: codeengine_job_handler },
  { prefix: 'ibm.vpc.instance', handler: vpc_instance_handler },
  { prefix: 'ibm.databases.postgresql', handler: databases_postgresql_handler },
  { prefix: 'ibm.databases.mysql', handler: databases_mysql_handler },
  { prefix: 'ibm.databases.mongodb', handler: databases_mongodb_handler },
  { prefix: 'ibm.databases.redis', handler: databases_redis_handler },
  { prefix: 'ibm.cos.bucket', handler: cos_bucket_handler },
  { prefix: 'ibm.vpc.vpc', handler: vpc_handler },
  { prefix: 'ibm.vpc.subnet', handler: vpc_subnet_handler },
  { prefix: 'ibm.secretsmanager.secret', handler: secretsmanager_secret_handler },
  // P1 (9)
  { prefix: 'ibm.vpc.securitygroup', handler: vpc_securitygroup_handler },
  { prefix: 'ibm.vpc.loadbalancer', handler: vpc_loadbalancer_handler },
  { prefix: 'ibm.cis.zone', handler: cis_zone_handler },
  { prefix: 'ibm.cis.wafrule', handler: cis_wafrule_handler },
  { prefix: 'ibm.containers.cluster', handler: containers_cluster_handler },
  { prefix: 'ibm.containerregistry.namespace', handler: containerregistry_namespace_handler },
  { prefix: 'ibm.appid.instance', handler: appid_instance_handler },
  { prefix: 'ibm.secretsmanager.importedcert', handler: secretsmanager_importedcert_handler },
  { prefix: 'ibm.logging.instance', handler: logging_instance_handler },
  // P2 (6)
  { prefix: 'ibm.cloudant.database', handler: cloudant_database_handler },
  { prefix: 'ibm.eventstreams.topic', handler: eventstreams_topic_handler },
  { prefix: 'ibm.mq.queuemanager', handler: mq_queuemanager_handler },
  { prefix: 'ibm.eventnotifications.instance', handler: eventnotifications_instance_handler },
  { prefix: 'ibm.watsonx.deployment', handler: watsonx_deployment_handler },
  { prefix: 'ibm.monitoring.alert', handler: monitoring_alert_handler },
];

function resolve_handler(type: string): IBMResourceHandler | undefined {
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

export interface IBMDeployOptions extends DeployOptions {
  ibm_credentials?: IBMCredentials;
}

export class IBMDeployer implements ProviderDeployer {
  provider = 'ibm';

  private ctx: IBMHandlerContext = {
    region: 'us-south',
    credentials: { api_key: '', region: 'us-south' },
    clients: new Map(),
  };

  async initialize(options: DeployOptions): Promise<void> {
    const opts = options as IBMDeployOptions;
    const creds = opts.ibm_credentials ?? {
      api_key: process.env.IBMCLOUD_API_KEY ?? '',
      account_id: process.env.IBMCLOUD_ACCOUNT_ID,
      resource_group_id: process.env.IBMCLOUD_RESOURCE_GROUP_ID,
      region: process.env.IBMCLOUD_REGION ?? opts.region ?? 'us-south',
    };
    const { clients, authenticator } = await initialize_ibm_clients(creds);
    this.ctx = {
      region: creds.region,
      resource_group_id: creds.resource_group_id,
      account_id: creds.account_id,
      credentials: creds,
      clients,
      authenticator: authenticator ?? undefined,
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

export function create_ibm_deployer(): IBMDeployer {
  return new IBMDeployer();
}

export { HANDLER_REGISTRY };
