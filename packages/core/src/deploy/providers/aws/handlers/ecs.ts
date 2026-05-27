/**
 * ECS Handler
 *
 * Handles: aws.ecs.service
 *
 * Auto-bootstraps the operator's environment so Compute.Container
 * "just works" out of the box, mirroring the GCP Cloud Run UX:
 *
 *   1. ensureEcsTaskExecutionRole() — idempotently creates
 *      `ecsTaskExecutionRole` with the standard managed policy.
 *   2. ensureDefaultCluster() — creates `ice-default-cluster` if it
 *      doesn't exist.
 *   3. RegisterTaskDefinition with the user's image/cpu/memory.
 *   4. CreateService backed by the new task definition.
 *
 * Steps 1 and 2 fail closed if the IAM/ECS SDK isn't installed —
 * the user sees a clear "install the SDK" message rather than a
 * cryptic AWS error.
 */

import { ensureEcsTaskExecutionRole } from '../iam-roles';
import { resolve_aws_network_refs } from '../network-resolver';
import { load_aws_sdk } from '../sdk-loader';
import { err, ok, sdkMissing } from './_result';
import type { AWSHandlerContext, AWSResourceHandler } from '../types';

const TYPE = 'aws.ecs.service';
const SDK = '@aws-sdk/client-ecs';
const DEFAULT_CLUSTER = 'ice-default-cluster';

async function ensureDefaultCluster(client: any, ecs: any, ctx: AWSHandlerContext): Promise<void> {
  const desc = await client.send(new ecs.DescribeClustersCommand({ clusters: [DEFAULT_CLUSTER] }));
  const existing = desc?.clusters?.find((c: any) => c.clusterName === DEFAULT_CLUSTER && c.status === 'ACTIVE');
  if (existing) return;
  ctx.on_log?.(`Creating default ECS cluster ${DEFAULT_CLUSTER}`);
  await client.send(new ecs.CreateClusterCommand({ clusterName: DEFAULT_CLUSTER }));
}

export const ecs_handler: AWSResourceHandler = {
  async create(name, properties, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ecs') as any;
    if (!client) return sdkMissing(name, TYPE, 'create', start, 'ECS', SDK);

    try {
      const ecs = await load_aws_sdk(SDK);
      if (!ecs) return sdkMissing(name, TYPE, 'create', start, 'ECS', SDK);

      ctx.on_step?.(name, { label: 'Ensuring ECS task execution role', index: 0, total: 4 });
      const executionRoleArn = await ensureEcsTaskExecutionRole(ctx.region);

      ctx.on_step?.(name, { label: 'Ensuring default ECS cluster', index: 1, total: 4 });
      await ensureDefaultCluster(client, ecs, ctx);

      // Resolve canvas-driven Network.Subnet / Network.SecurityGroup
      // references to actual subnet-… / sg-… ids via DescribeSubnets /
      // DescribeSecurityGroups. Operator-supplied raw arrays still
      // pass through; canvas-driven entries are appended.
      const network = await resolve_aws_network_refs(properties, ctx);

      // Worker-mode services skip portMappings (they're queue
      // consumers, not HTTP servers) unless an explicit port is set
      // for a health-check endpoint.
      const isWorker = properties.service_type === 'worker';
      const port = properties.port as number | undefined;
      const portMappings =
        port && !isWorker ? [{ containerPort: port }] : isWorker && port ? [{ containerPort: port }] : undefined;

      ctx.on_step?.(name, { label: 'Registering task definition', index: 2, total: 4 });
      const taskDef = await client.send(
        new ecs.RegisterTaskDefinitionCommand({
          family: name,
          executionRoleArn,
          networkMode: 'awsvpc',
          requiresCompatibilities: ['FARGATE'],
          cpu: String(properties.cpu ?? '256'),
          memory: String(properties.memory ?? '512'),
          containerDefinitions: [
            {
              name,
              image: properties.image as string,
              portMappings,
              environment: Object.entries((properties.env_vars as Record<string, string>) || {}).map(([k, v]) => ({
                name: k,
                value: v,
              })),
            },
          ],
        }),
      );
      const taskDefArn = taskDef?.taskDefinition?.taskDefinitionArn;

      ctx.on_step?.(name, { label: 'Creating ECS service', index: 3, total: 4 });
      const service = await client.send(
        new ecs.CreateServiceCommand({
          serviceName: name,
          cluster: DEFAULT_CLUSTER,
          taskDefinition: taskDefArn,
          desiredCount: (properties.desired_count as number) ?? 1,
          launchType: 'FARGATE',
          networkConfiguration: {
            awsvpcConfiguration: {
              assignPublicIp: properties.assign_public_ip === false ? 'DISABLED' : 'ENABLED',
              subnets: network.subnets,
              securityGroups: network.security_groups,
            },
          },
        }),
      );

      return ok(name, TYPE, 'create', start, {
        provider_id: service?.service?.serviceArn || `arn:aws:ecs:${ctx.region}:*:service/${DEFAULT_CLUSTER}/${name}`,
      });
    } catch (error) {
      return err(name, TYPE, 'create', start, error instanceof Error ? error.message : String(error));
    }
  },

  async update(name, provider_id, properties, _current, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ecs') as any;
    if (!client) return err(name, TYPE, 'update', start, 'ECS SDK not available');

    try {
      const ecs = await load_aws_sdk(SDK);
      if (!ecs) return err(name, TYPE, 'update', start, 'ECS SDK not available');

      await client.send(
        new ecs.UpdateServiceCommand({
          service: name,
          cluster: DEFAULT_CLUSTER,
          desiredCount: properties.desired_count as number,
        }),
      );
      return ok(name, TYPE, 'update', start, { provider_id });
    } catch (error) {
      return err(name, TYPE, 'update', start, error instanceof Error ? error.message : String(error));
    }
  },

  async delete(name, _provider_id, ctx) {
    const start = Date.now();
    const client = ctx.clients.get('ecs') as any;
    if (!client) return err(name, TYPE, 'delete', start, 'ECS SDK not available');

    try {
      const ecs = await load_aws_sdk(SDK);
      if (!ecs) return err(name, TYPE, 'delete', start, 'ECS SDK not available');

      // Scale to zero before delete; AWS rejects DeleteService on
      // services with desiredCount > 0.
      try {
        await client.send(new ecs.UpdateServiceCommand({ service: name, cluster: DEFAULT_CLUSTER, desiredCount: 0 }));
      } catch {
        /* may not exist; fall through to delete */
      }
      await client.send(new ecs.DeleteServiceCommand({ service: name, cluster: DEFAULT_CLUSTER, force: true }));
      return ok(name, TYPE, 'delete', start);
    } catch (error) {
      return err(name, TYPE, 'delete', start, error instanceof Error ? error.message : String(error));
    }
  },
};
