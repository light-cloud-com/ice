/**
 * Property extractors for AWS ancillary services.
 *
 * Resources covered:
 *   - aws.sqs.queue                  (Messaging.Queue)
 *   - aws.sns.topic                  (Messaging.Topic, Messaging.CloudPubSub)
 *   - aws.cognito.userPool           (Security.Identity)
 *   - aws.secretsmanager.secret      (Security.Secret)
 *   - aws.cloudwatch.logGroup        (Monitoring.Log)
 *   - aws.mq.broker                  (Messaging.RabbitMQ)
 */

export function extract_amazon_mq_broker_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    engine_type: (data.engine as string) === 'activemq' ? 'ACTIVEMQ' : 'RABBITMQ',
    engine_version: (data.engine_version as string) || '3.13',
    host_instance_type: (data.host_instance_type as string) || 'mq.t3.micro',
    deployment_mode: data.multi_az === true ? 'CLUSTER_MULTI_AZ' : 'SINGLE_INSTANCE',
    publicly_accessible: data.publicly_accessible !== false,
    admin_username: (data.admin_username as string) || '',
    admin_password: (data.admin_password as string) || '',
    auto_minor_version_upgrade: data.auto_minor_version_upgrade !== false,
    tags: {},
  };
}

/**
 * SQS queue. FIFO vs Standard is inferred from `data.fifo` (which
 * the canvas Messaging.Queue editor sets) — handler appends `.fifo`
 * suffix to the queue name when FIFO is on (AWS requirement).
 */
export function extract_sqs_queue_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  const fifo = data.fifo === true;
  return {
    region,
    fifo,
    // SQS defaults — 4-day retention, 30s visibility timeout, no delay.
    message_retention_seconds: (data.message_retention as number) ?? 345600,
    visibility_timeout_seconds: (data.visibility_timeout as number) ?? 30,
    delay_seconds: (data.delay as number) ?? 0,
    // Content-based dedup is only valid on FIFO queues; standard SQS
    // ignores the field. The handler enforces the constraint.
    ...(fifo && { content_based_deduplication: data.content_based_dedup ?? false }),
    tags: {},
  };
}

/**
 * SNS topic. Standard topics by default; FIFO topics need the `.fifo`
 * suffix that the handler adds.
 */
export function extract_sns_topic_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  const fifo = data.fifo === true;
  return {
    region,
    fifo,
    display_name: (data.display_name as string) || '',
    // KMS at-rest encryption — opt-in (operators provide a KMS key ID
    // or accept the AWS-managed alias).
    kms_master_key_id: (data.kms_master_key_id as string) || undefined,
    tags: {},
  };
}

/**
 * Cognito User Pool. Mirrors the GCP Identity Platform extractor's
 * sign-in / MFA shape so cards stay portable.
 */
export function extract_cognito_user_pool_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    // Default to email auto-verification + password sign-in (the
    // minimum viable Cognito setup).
    auto_verified_attributes: (data.auto_verified_attributes as string[]) || ['email'],
    sign_in_providers: (data.signInProviders as string[]) ||
      (data.sign_in_providers as string[]) || ['email', 'google'],
    mfa_configuration: data.mfaEnabled === true ? 'ON' : (data.mfa_configuration as string) || 'OFF',
    password_policy: {
      minimum_length: (data.password_min_length as number) ?? 8,
      require_uppercase: data.password_require_uppercase ?? true,
      require_lowercase: data.password_require_lowercase ?? true,
      require_numbers: data.password_require_numbers ?? true,
      require_symbols: data.password_require_symbols ?? false,
    },
    tags: {},
  };
}

/**
 * Secrets Manager secret. Parallel to the GCP secret_manager extractor:
 * the canvas `secrets` array (each row a `{key, ref}` binding) is
 * forwarded as `bindings` so the schema-declared deploy-expansion
 * pass can emit one cloud resource per unique ref. Adding AWS Secrets
 * Manager doesn't require translator changes — the same expansion
 * branch fires for any iceType that declares `deployExpansion`.
 */
export function extract_secrets_manager_secret_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    bindings: Array.isArray(data.secrets) ? data.secrets : [],
    // Operators wire automatic rotation via a Lambda ARN. Disabled by
    // default — the canvas doesn't expose rotation today.
    rotation_lambda_arn: (data.rotation_lambda_arn as string) || undefined,
    rotation_days: (data.rotation_days as number) ?? 0,
    // KMS at-rest encryption (defaults to the AWS-managed alias).
    kms_key_id: (data.kms_key_id as string) || undefined,
    tags: {},
  };
}

/**
 * CloudWatch Log Group. Retention is the field most operators care
 * about — 30 days strikes the cost vs. visibility balance most
 * teams ship with.
 */
export function extract_cloudwatch_log_group_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    retention_in_days: (data.retention_in_days as number) ?? (data.retention_days as number) ?? 30,
    kms_key_id: (data.kms_key_id as string) || undefined,
    tags: {},
  };
}
