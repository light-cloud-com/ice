/**
 * Alibaba Cloud Deployer — Modular Dispatcher
 *
 * Routes create/update/delete calls to per-service handler modules.
 * Same `HANDLER_REGISTRY` of `{ prefix, handler }` pairs the
 * AWS / Azure / GCP / Kubernetes deployers use, so adding a new
 * Alibaba resource type is a one-file drop + one registry entry.
 *
 * Resource types follow `alibaba.<service>.<resource>` (e.g.
 * `alibaba.ecs.instance`, `alibaba.rds.dbInstance`,
 * `alibaba.oss.bucket`).
 *
 * Auth model: RAM AccessKey ID + AccessKey Secret. Operator-supplied
 * via DeployOptions.alibaba_credentials. STS tokens supported via the
 * optional `security_token` field for short-lived sessions.
 */

import { alidns_record_handler } from './handlers/alidns-record';
import { amqp_instance_handler } from './handlers/amqp-instance';
import { apigateway_api_handler } from './handlers/apigateway-api';
import { cas_certificate_handler } from './handlers/cas-certificate';
import { cdn_domain_handler } from './handlers/cdn-domain';
import { cr_build_task_handler } from './handlers/cr-build-task';
import { cr_instance_handler } from './handlers/cr-instance';
import { cs_managed_cluster_handler } from './handlers/cs-managed-cluster';
import { dds_db_instance_handler } from './handlers/dds-db-instance';
import { eci_container_group_handler } from './handlers/eci-container-group';
import { ecs_instance_handler } from './handlers/ecs-instance';
import { ecs_security_group_handler } from './handlers/ecs-security-group';
import { eventbridge_rule_handler } from './handlers/eventbridge-rule';
import { fc_function_handler } from './handlers/fc-function';
import { kms_secret_handler } from './handlers/kms-secret';
import { kvstore_instance_handler } from './handlers/kvstore-instance';
import { maxcompute_project_handler } from './handlers/maxcompute-project';
import { mns_queue_handler } from './handlers/mns-queue';
import { mns_topic_handler } from './handlers/mns-topic';
import { opensearch_app_handler } from './handlers/opensearch-app';
import { oss_bucket_handler } from './handlers/oss-bucket';
import { pai_eas_service_handler } from './handlers/pai-eas-service';
import { pai_workspace_handler } from './handlers/pai-workspace';
import { privatelink_endpoint_handler } from './handlers/privatelink-endpoint';
import { ram_user_handler } from './handlers/ram-user';
import { rds_db_instance_handler } from './handlers/rds-db-instance';
import { sae_application_handler } from './handlers/sae-application';
import { slb_load_balancer_handler } from './handlers/slb-load-balancer';
import { sls_project_handler } from './handlers/sls-project';
import { vpc_handler } from './handlers/vpc';
import { vpc_vswitch_handler } from './handlers/vpc-vswitch';
import { waf_policy_handler } from './handlers/waf-policy';
import { normalize_region } from './region';
import { initialize_alibaba_clients } from './sdk-loader';
import type { AlibabaCredentials, AlibabaHandlerContext, AlibabaResourceHandler } from './types';
import type { DeployOptions, ProviderDeployer, ResourceDeployResult } from '../../types';

const HANDLER_REGISTRY: Array<{ prefix: string; handler: AlibabaResourceHandler }> = [
  // P0 — must-have (14)
  { prefix: 'alibaba.ecs.instance', handler: ecs_instance_handler },
  { prefix: 'alibaba.ecs.securityGroup', handler: ecs_security_group_handler },
  { prefix: 'alibaba.sae.application', handler: sae_application_handler },
  { prefix: 'alibaba.fc.function', handler: fc_function_handler },
  { prefix: 'alibaba.eventbridge.rule', handler: eventbridge_rule_handler },
  { prefix: 'alibaba.eci.containerGroup', handler: eci_container_group_handler },
  { prefix: 'alibaba.rds.dbInstance', handler: rds_db_instance_handler },
  { prefix: 'alibaba.dds.dbInstance', handler: dds_db_instance_handler },
  { prefix: 'alibaba.kvstore.instance', handler: kvstore_instance_handler },
  { prefix: 'alibaba.oss.bucket', handler: oss_bucket_handler },
  { prefix: 'alibaba.mns.queue', handler: mns_queue_handler },
  { prefix: 'alibaba.mns.topic', handler: mns_topic_handler },
  { prefix: 'alibaba.vpc.vpc', handler: vpc_handler },
  { prefix: 'alibaba.vpc.vSwitch', handler: vpc_vswitch_handler },
  { prefix: 'alibaba.kms.secret', handler: kms_secret_handler },
  // P1 — important (11)
  { prefix: 'alibaba.slb.loadBalancer', handler: slb_load_balancer_handler },
  { prefix: 'alibaba.alidns.domainRecord', handler: alidns_record_handler },
  { prefix: 'alibaba.privatelink.endpoint', handler: privatelink_endpoint_handler },
  { prefix: 'alibaba.apigateway.api', handler: apigateway_api_handler },
  { prefix: 'alibaba.cs.managedCluster', handler: cs_managed_cluster_handler },
  { prefix: 'alibaba.cr.instance', handler: cr_instance_handler },
  { prefix: 'alibaba.cdn.domain', handler: cdn_domain_handler },
  { prefix: 'alibaba.ram.user', handler: ram_user_handler },
  { prefix: 'alibaba.cas.certificate', handler: cas_certificate_handler },
  { prefix: 'alibaba.waf.policy', handler: waf_policy_handler },
  { prefix: 'alibaba.sls.project', handler: sls_project_handler },
  // P2 — long tail (6)
  { prefix: 'alibaba.amqp.instance', handler: amqp_instance_handler },
  { prefix: 'alibaba.maxcompute.project', handler: maxcompute_project_handler },
  { prefix: 'alibaba.opensearch.app', handler: opensearch_app_handler },
  { prefix: 'alibaba.paieas.service', handler: pai_eas_service_handler },
  { prefix: 'alibaba.pai.workspace', handler: pai_workspace_handler },
  { prefix: 'alibaba.cr.buildTask', handler: cr_build_task_handler },
  // Skipped: alibaba.datahub.topic + alibaba.ots.instance — community
  // SDKs (no `@alicloud/*` v3 package); revisit when official SDKs ship.
];

function resolve_handler(type: string): AlibabaResourceHandler | undefined {
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

export interface AlibabaDeployOptions extends DeployOptions {
  alibaba_credentials?: AlibabaCredentials;
  /** Single deploy region. Falls back to ALIBABA_CLOUD_REGION, then the default. */
  region?: string;
}

export class AlibabaDeployer implements ProviderDeployer {
  provider = 'alibaba';

  private ctx: AlibabaHandlerContext = {
    region: 'cn-hangzhou',
    credentials: { access_key_id: '', access_key_secret: '', region: 'cn-hangzhou' },
    clients: new Map(),
  };

  async initialize(options: DeployOptions): Promise<void> {
    const opts = options as AlibabaDeployOptions;
    const creds = opts.alibaba_credentials ?? {
      access_key_id: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? '',
      access_key_secret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? '',
      security_token: process.env.ALIBABA_CLOUD_SECURITY_TOKEN,
      region: process.env.ALIBABA_CLOUD_REGION ?? opts.region ?? 'cn-hangzhou',
    };
    creds.region = normalize_region(creds.region);
    const { clients } = await initialize_alibaba_clients(creds);
    this.ctx = {
      region: creds.region,
      credentials: creds,
      clients,
      on_log: opts.on_log,
      on_step: opts.on_progress
        ? (resource, step) => opts.on_progress?.(resource, 'running', 'in-progress', { step })
        : undefined,
    };
  }

  async cleanup(): Promise<void> {
    // Alibaba SDK clients hold no long-lived sockets; nothing to release.
  }

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

export function create_alibaba_deployer(): AlibabaDeployer {
  return new AlibabaDeployer();
}

export { HANDLER_REGISTRY };
