/**
 * AWS Deployer — Modular Dispatcher
 *
 * Routes create/update/delete calls to per-service handler modules.
 * Replaces the monolithic aws-deployer.ts with the same dispatch
 * shape the GCP deployer uses. Adding a new AWS service =
 * register an entry in HANDLER_REGISTRY + add a file under
 * `handlers/<service>.ts`.
 *
 * Cardinal-rule schema-driven: HANDLER_REGISTRY is the single
 * declarative fact for "which handler runs for which resource type".
 * The dispatcher iterates it generically — no `if (type === 'aws.X')`
 * branches.
 */

import { create_account_id_resolver } from './account';
import { cloudwatch_logs_handler } from './handlers/cloudwatch-logs';
import { ec2_handler } from './handlers/ec2';
import { lambda_handler } from './handlers/lambda';
import { s3_handler } from './handlers/s3';
import { secrets_manager_handler } from './handlers/secrets-manager';
import { sqs_handler } from './handlers/sqs';
import { destroy_aws_clients, initialize_aws_clients } from './sdk-loader';
import type { AWSHandlerContext, AWSResourceHandler } from './types';
import type { DeployOptions, ResourceDeployResult, ProviderDeployer } from '../../types';

// =============================================================================
// Handler registry — maps type prefixes to handlers
// =============================================================================
//
// Ordering matters when prefixes overlap (longer / more-specific
// prefixes go first). At present every AWS resource type is unique
// at the `aws.<service>.<resource>` granularity so order is not yet
// meaningful — kept consistent with the GCP shape for symmetry.

const HANDLER_REGISTRY: Array<{ prefix: string; handler: AWSResourceHandler }> = [
  { prefix: 'aws.ec2.instance', handler: ec2_handler },
  { prefix: 'aws.s3.bucket', handler: s3_handler },
  { prefix: 'aws.lambda.function', handler: lambda_handler },
  { prefix: 'aws.cloudwatch.logGroup', handler: cloudwatch_logs_handler },
  { prefix: 'aws.secretsmanager.secret', handler: secrets_manager_handler },
  { prefix: 'aws.sqs.queue', handler: sqs_handler },
];

function resolve_handler(type: string): AWSResourceHandler | undefined {
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
  // Preserve the original wording verbatim — the test suite pins these
  // exact strings and consumer dashboards may key off them.
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

/**
 * AWS resource deployer.
 *
 * Holds an AWSHandlerContext that's reused for every create/update/
 * delete call within a single `initialize`/`cleanup` cycle. Per-
 * handler logic lives in `./handlers/<service>.ts`.
 */
export class AWSDeployer implements ProviderDeployer {
  provider = 'aws';

  private ctx: AWSHandlerContext = {
    region: 'us-east-1',
    clients: new Map(),
    // Stub resolver until initialize() replaces it. Throws if a
    // handler tries to use account id before the deployer's
    // initialise() ran (shouldn't happen in practice but fails
    // loudly if it ever does).
    ensure_account_id: async () => {
      throw new Error('AWSDeployer.ensure_account_id called before initialize()');
    },
  };

  async initialize(options: DeployOptions): Promise<void> {
    const region = options.regions?.[0] || 'us-east-1';
    try {
      const clients = await initialize_aws_clients(region);
      this.ctx = {
        region,
        clients,
        ensure_account_id: create_account_id_resolver(region),
      };
    } catch (error) {
      throw new Error(`Failed to initialize AWS SDK: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  async cleanup(): Promise<void> {
    destroy_aws_clients(this.ctx.clients);
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
    return handler.create(name, properties, this.ctx);
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
    return handler.update(name, provider_id, properties, current_properties, this.ctx);
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
    return handler.delete(name, provider_id, this.ctx);
  }
}

/**
 * Create an AWS deployer instance.
 */
export function create_aws_deployer(): AWSDeployer {
  return new AWSDeployer();
}
