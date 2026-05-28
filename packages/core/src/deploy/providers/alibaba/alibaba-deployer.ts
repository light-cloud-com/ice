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

import { dds_db_instance_handler } from './handlers/dds-db-instance';
import { eci_container_group_handler } from './handlers/eci-container-group';
import { ecs_instance_handler } from './handlers/ecs-instance';
import { ecs_security_group_handler } from './handlers/ecs-security-group';
import { eventbridge_rule_handler } from './handlers/eventbridge-rule';
import { fc_function_handler } from './handlers/fc-function';
import { kms_secret_handler } from './handlers/kms-secret';
import { kvstore_instance_handler } from './handlers/kvstore-instance';
import { mns_queue_handler } from './handlers/mns-queue';
import { mns_topic_handler } from './handlers/mns-topic';
import { oss_bucket_handler } from './handlers/oss-bucket';
import { rds_db_instance_handler } from './handlers/rds-db-instance';
import { sae_application_handler } from './handlers/sae-application';
import { vpc_handler } from './handlers/vpc';
import { vpc_vswitch_handler } from './handlers/vpc-vswitch';
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
