/**
 * Property extractors for Alibaba Cloud resources.
 *
 * Resources covered (P0):
 *   - alibaba.ecs.instance              (Compute.BackendAPI on VMs)
 *   - alibaba.ecs.securityGroup         (Network.SecurityGroup)
 *   - alibaba.sae.application           (Compute.Container — managed)
 *   - alibaba.fc.function               (Compute.ServerlessFunction)
 *   - alibaba.eventbridge.rule          (Compute.CronJob)
 *   - alibaba.eci.containerGroup        (Compute.Container — serverless)
 *   - alibaba.rds.dbInstance            (Database.PostgreSQL / MySQL)
 *   - alibaba.dds.dbInstance            (Database.MongoDB)
 *   - alibaba.kvstore.instance          (Database.Redis / Cache)
 *   - alibaba.oss.bucket                (Storage.Bucket)
 *   - alibaba.mns.queue                 (Messaging.Queue)
 *   - alibaba.mns.topic                 (Messaging.Topic)
 *   - alibaba.vpc.vpc                   (Network.VPC)
 *   - alibaba.vpc.vSwitch               (Network.Subnet)
 *   - alibaba.kms.secret                (Security.Secret)
 */

export function extract_alibaba_ecs_instance_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    image_id: data.image_id as string | undefined,
    instance_type: (data.instance_type as string) || 'ecs.t6-c1m2.large',
    security_group_id: data.security_group_id as string | undefined,
    vswitch_id: data.vswitch_id as string | undefined,
    password: data.password as string | undefined,
    internet_bandwidth_mbps: (data.internet_bandwidth_mbps as number) ?? 0,
    disk_category: (data.disk_category as string) || 'cloud_efficiency',
    disk_gb: (data.disk_gb as number) ?? 40,
  };
}

export function extract_alibaba_ecs_security_group_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    vpc_id: data.vpc_id as string | undefined,
    description: data.description as string | undefined,
    inbound_rules: (data.inbound_rules as unknown[]) ?? [],
  };
}

export function extract_alibaba_sae_application_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    namespace_id: data.namespace_id as string | undefined,
    vswitch_id: data.vswitch_id as string | undefined,
    vpc_id: data.vpc_id as string | undefined,
    image: data.image as string | undefined,
    replicas: (data.replicas as number) ?? 1,
    cpu_milli: (data.cpu_milli as number) ?? 1000,
    memory_mb: (data.memory_mb as number) ?? 2048,
  };
}

export function extract_alibaba_fc_function_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    runtime: (data.runtime as string) || 'nodejs20',
    handler: (data.handler as string) || 'index.handler',
    memory_mb: (data.memory_mb as number) || 512,
    timeout_sec: (data.timeout_sec as number) || 30,
    code_zip_base64: data.code_zip_base64 as string | undefined,
    env_vars: (data.env_vars as Record<string, string>) ?? {},
  };
}

export function extract_alibaba_eventbridge_rule_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    event_bus: (data.event_bus as string) || 'default',
    schedule_expression: data.schedule_expression as string | undefined,
    description: data.description as string | undefined,
  };
}

export function extract_alibaba_eci_container_group_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    security_group_id: data.security_group_id as string | undefined,
    vswitch_id: data.vswitch_id as string | undefined,
    cpu_cores: (data.cpu_cores as number) || 1,
    memory_gb: (data.memory_gb as number) || 2,
    image: data.image as string | undefined,
  };
}

export function extract_alibaba_rds_db_instance_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    engine: (data.engine as string) || 'postgres',
    engine_version: data.engine_version as string | undefined,
    instance_class: data.instance_class as string | undefined,
    storage_gb: (data.storage_gb as number) ?? 20,
    network_type: (data.network_type as string) || 'Internet',
    allowed_cidrs: (data.allowed_cidrs as string) || '0.0.0.0/0',
  };
}

export function extract_alibaba_dds_db_instance_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    engine_version: (data.engine_version as string) || '6.0',
    instance_class: data.instance_class as string | undefined,
    storage_gb: (data.storage_gb as number) ?? 10,
  };
}

export function extract_alibaba_kvstore_instance_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    instance_class: data.instance_class as string | undefined,
    engine_version: (data.engine_version as string) || '7.0',
  };
}

export function extract_alibaba_oss_bucket_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    acl: (data.acl as string) || 'private',
    storage_class: (data.storage_class as string) || 'Standard',
  };
}

export function extract_alibaba_mns_queue_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    visibility_timeout_sec: (data.visibility_timeout_sec as number) ?? 30,
    max_message_bytes: (data.max_message_bytes as number) ?? 65536,
    retention_sec: (data.retention_sec as number) ?? 345600,
    delay_sec: (data.delay_sec as number) ?? 0,
    polling_wait_sec: (data.polling_wait_sec as number) ?? 0,
  };
}

export function extract_alibaba_mns_topic_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    max_message_bytes: (data.max_message_bytes as number) ?? 65536,
  };
}

export function extract_alibaba_vpc_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    cidr: (data.cidr as string) || '10.0.0.0/16',
    description: data.description as string | undefined,
  };
}

export function extract_alibaba_vswitch_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    vpc_id: data.vpc_id as string | undefined,
    zone_id: data.zone_id as string | undefined,
    cidr: (data.cidr as string) || '10.0.1.0/24',
    description: data.description as string | undefined,
  };
}

export function extract_alibaba_kms_secret_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    value: data.value as string | undefined,
    description: data.description as string | undefined,
  };
}
