/**
 * Property extractors for AWS compute services on the card-to-graph
 * translator.
 *
 * Each extractor maps a canvas node's `data` payload to the
 * deployer-handler input shape for a specific AWS compute resource
 * type. The translator's dispatch table looks up the right extractor
 * by resolved `resource_type`.
 *
 * Resources covered:
 *   - aws.ecs.service           (Compute.Container, BackendAPI, SSRSite, Worker)
 *   - aws.lambda.function       (Compute.ServerlessFunction)
 *   - aws.events.rule           (Compute.CronJob)
 *
 * Loose `Record<string, unknown>` types on the parameter and return
 * value are intentional — handlers further down the pipeline coerce
 * per-resource. The extractor lays down everything the handler needs
 * to drive the AWS SDK call; provider-specific defaults that vary
 * per resource (instance class, runtime, etc.) live here, not in the
 * handler.
 */

import { parse_exposed_ports } from '../compute';

/**
 * ECS service — backs Compute.Container / Compute.BackendAPI /
 * Compute.SSRSite / Compute.Worker on AWS. The handler will create a
 * task definition + service. Multi-port `exposed_ports` is parsed via
 * the shared compute helper so the shape matches what GCP Cloud Run
 * sees today.
 */
export function extract_ecs_service_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  const ports = parse_exposed_ports(data);
  const primaryPort = ports[0]?.port ?? (data.port as number | undefined) ?? 8080;
  return {
    region,
    image: (data.image as string) || '',
    repository: (data.repository as string) || '',
    branch: (data.branch as string) || 'main',
    port: primaryPort,
    ...(ports.length > 0 && { additional_ports: ports }),
    // ECS scaling — desired_count + min/max capacity. Mirrors GCP's
    // `min_instances`/`max_instances` semantics; auto-scaling policy
    // creation is the handler's job.
    desired_count: data.minInstances ?? 1,
    min_capacity: data.minInstances ?? 1,
    max_capacity: data.maxInstances ?? 3,
    // Fargate uses CPU/memory as integers (CPU units, MiB). Defaults
    // match the smallest Fargate task size — 256 CPU + 512 MiB.
    cpu: data.cpu || '256',
    memory: data.memory || '512',
    // Service-level network mode. Public assignment is decided by the
    // INTERNAL_INGRESS_OVERRIDES table at translator time when nested
    // in an isolation container.
    assign_public_ip: data.assign_public_ip ?? true,
    internal: data.internal ?? false,
    env_vars: data.envVars || {},
    tags: {},
  };
}

/**
 * Worker-mode ECS service — backs Compute.Worker. Differs from the
 * standard service in three ways:
 *
 *  - `service_type: 'worker'` flag the handler reads to skip the
 *    load-balancer target-group attachment and the listener wiring.
 *  - Public IP defaults OFF (workers usually live in private subnets
 *    and reach the world via NAT / VPC Endpoint).
 *  - Port defaults are dropped (workers consume queues, don't serve
 *    HTTP). Operators can still set `port` if the worker exposes a
 *    health-check endpoint.
 *
 * Resolves to the same `aws.ecs.service` handler — the worker shape
 * is a property variant, not a separate resource.
 */
export function extract_ecs_worker_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    service_type: 'worker',
    image: (data.image as string) || '',
    repository: (data.repository as string) || '',
    branch: (data.branch as string) || 'main',
    port: (data.port as number) || undefined,
    desired_count: data.minInstances ?? 1,
    min_capacity: data.minInstances ?? 1,
    max_capacity: data.maxInstances ?? 3,
    cpu: data.cpu || '256',
    memory: data.memory || '512',
    assign_public_ip: data.assign_public_ip === true,
    internal: true,
    env_vars: data.envVars || {},
    tags: {},
  };
}

/**
 * Lambda function. The handler accepts the S3-ref code source today
 * (`code: { s3Bucket, s3Key }`); auto-build from a connected
 * Source.Repository ships in commit #28 (Phase 3).
 */
export function extract_lambda_function_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  const code = (data.code as { s3Bucket?: string; s3Key?: string } | undefined) ?? {};
  return {
    region,
    runtime: (data.runtime as string) || 'nodejs20.x',
    handler: (data.handler as string) || 'index.handler',
    memory_size: (data.memory as number) || 128,
    timeout: (data.timeout as number) || 30,
    // S3-ref code source — handler reads `s3_bucket` + `s3_key`.
    // Auto-build flow (commit #28) sets these after uploading the zip.
    s3_bucket: code.s3Bucket || (data.s3_bucket as string) || '',
    s3_key: code.s3Key || (data.s3_key as string) || '',
    // IAM execution role; ECS-style auto-provisioning of a default
    // role is not yet wired for Lambda — operators supply the ARN.
    role: (data.role as string) || '',
    description: (data.description as string) || '',
    repository: (data.repository as string) || '',
    branch: (data.branch as string) || 'main',
    environment: data.envVars || {},
    tags: {},
  };
}

/**
 * EventBridge rule — backs Compute.CronJob on AWS. The cron expression
 * is normalised the same way GCP's cloud_scheduler extractor handles
 * the named "daily" / "hourly" / "weekly" / "monthly" presets, so
 * project portability is preserved.
 */
export function extract_events_rule_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  // EventBridge uses `cron(min hour day-of-month month day-of-week year)`
  // (6 fields, not the 5-field unix cron). The named presets map to
  // EventBridge expressions directly.
  const schedule_map: Record<string, string> = {
    daily: 'cron(0 0 * * ? *)',
    hourly: 'cron(0 * * * ? *)',
    weekly: 'cron(0 0 ? * SUN *)',
    monthly: 'cron(0 0 1 * ? *)',
  };
  const schedule = (data.schedule as string) || 'daily';
  return {
    region,
    schedule_expression: schedule_map[schedule] || schedule,
    description: (data.description as string) || '',
    state: data.enabled === false ? 'DISABLED' : 'ENABLED',
    target_type: (data.targetType as string) || 'lambda',
    target_arn: (data.targetArn as string) || '',
    tags: {},
  };
}
