/**
 * Property extractors for OCI resources (P0).
 */

export function extract_oci_instance_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    availability_domain: data.availability_domain as string | undefined,
    shape: (data.shape as string) || 'VM.Standard.E4.Flex',
    ocpus: (data.ocpus as number) ?? 1,
    memory_gb: (data.memory_gb as number) ?? 4,
    image_id: data.image_id as string | undefined,
    subnet_id: data.subnet_id as string | undefined,
    metadata: data.metadata as Record<string, string> | undefined,
  };
}

export function extract_oci_vcn_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    cidr: (data.cidr as string) || '10.0.0.0/16',
    dns_label: data.dns_label as string | undefined,
  };
}

export function extract_oci_subnet_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    vcn_id: data.vcn_id as string | undefined,
    cidr: (data.cidr as string) || '10.0.1.0/24',
    availability_domain: data.availability_domain as string | undefined,
  };
}

export function extract_oci_nsg_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return { vcn_id: data.vcn_id as string | undefined };
}

export function extract_oci_objectstorage_bucket_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    public_access: (data.public_access as string) || 'NoPublicAccess',
    storage_tier: (data.storage_tier as string) || 'Standard',
  };
}

export function extract_oci_database_autonomous_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    cpu_cores: (data.cpu_cores as number) ?? 1,
    storage_tb: (data.storage_tb as number) ?? 1,
    admin_password: data.admin_password as string | undefined,
    free_tier: (data.free_tier as boolean) ?? false,
    workload: (data.workload as string) || 'OLTP',
  };
}

export function extract_oci_mysql_dbsystem_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    shape: (data.shape as string) || 'MySQL.VM.Standard.E4.1.8GB',
    admin_username: (data.admin_username as string) || 'admin',
    admin_password: data.admin_password as string | undefined,
    subnet_id: data.subnet_id as string | undefined,
    availability_domain: data.availability_domain as string | undefined,
    storage_gb: (data.storage_gb as number) ?? 50,
  };
}

export function extract_oci_psql_dbsystem_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    engine_version: (data.engine_version as string) || '14',
    shape: (data.shape as string) || 'VM.Standard.E4.Flex',
    instance_count: (data.instance_count as number) ?? 1,
    memory_gb: (data.memory_gb as number) ?? 8,
    ocpus: (data.ocpus as number) ?? 2,
    subnet_id: data.subnet_id as string | undefined,
    admin_username: (data.admin_username as string) || 'postgres',
    admin_password: data.admin_password as string | undefined,
  };
}

export function extract_oci_nosql_table_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    ddl: data.ddl as string | undefined,
    read_units: (data.read_units as number) ?? 10,
    write_units: (data.write_units as number) ?? 10,
    storage_gb: (data.storage_gb as number) ?? 1,
  };
}

export function extract_oci_redis_cluster_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    version: (data.version as string) || 'REDIS_7_0',
    subnet_id: data.subnet_id as string | undefined,
    node_count: (data.node_count as number) ?? 1,
    memory_gb: (data.memory_gb as number) ?? 1,
  };
}

export function extract_oci_functions_function_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    application_id: data.application_id as string | undefined,
    image: data.image as string | undefined,
    memory_mb: (data.memory_mb as number) ?? 128,
    timeout_sec: (data.timeout_sec as number) ?? 30,
    env_vars: (data.env_vars as Record<string, string>) ?? {},
  };
}

export function extract_oci_containerinstance_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    image: data.image as string | undefined,
    availability_domain: data.availability_domain as string | undefined,
    shape: (data.shape as string) || 'CI.Standard.E4.Flex',
    ocpus: (data.ocpus as number) ?? 1,
    memory_gb: (data.memory_gb as number) ?? 4,
    subnet_id: data.subnet_id as string | undefined,
    env_vars: (data.env_vars as Record<string, string>) ?? {},
  };
}

export function extract_oci_resourcescheduler_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    description: data.description as string | undefined,
    action: (data.action as string) || 'START_RESOURCE',
    cron_expression: (data.cron_expression as string) || '0 0 * * *',
    start_at: data.start_at as string | undefined,
    target_resources: (data.target_resources as unknown[]) ?? [],
  };
}

export function extract_oci_vault_secret_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    vault_id: data.vault_id as string | undefined,
    kms_key_id: data.kms_key_id as string | undefined,
    value: data.value as string | undefined,
    description: data.description as string | undefined,
  };
}

// ─── P1 extractors ───────────────────────────────────────────────────

export function extract_oci_loadbalancer_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    shape: (data.shape as string) || 'flexible',
    is_private: (data.is_private as boolean) ?? false,
    subnet_ids: (data.subnet_ids as string[]) ?? [],
  };
}

export function extract_oci_dns_zone_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    zone_type: (data.zone_type as string) || 'PRIMARY',
    scope: (data.scope as string) || 'GLOBAL',
  };
}

export function extract_oci_apigateway_gateway_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    endpoint_type: (data.endpoint_type as string) || 'PUBLIC',
    subnet_id: data.subnet_id as string | undefined,
  };
}

export function extract_oci_privateaccessgateway_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    vcn_id: data.vcn_id as string | undefined,
    services: (data.services as unknown[]) ?? [],
  };
}

export function extract_oci_containerengine_cluster_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    vcn_id: data.vcn_id as string | undefined,
    version: (data.version as string) || 'v1.30.1',
    cluster_type: (data.cluster_type as string) || 'BASIC_CLUSTER',
  };
}

export function extract_oci_artifacts_repository_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    public: (data.public as boolean) ?? false,
    immutable: (data.immutable as boolean) ?? false,
  };
}

export function extract_oci_identitydomains_user_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    given_name: data.given_name as string | undefined,
    email: data.email as string | undefined,
  };
}

export function extract_oci_certificates_certificate_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    cert_pem: data.cert_pem as string | undefined,
    key_pem: data.key_pem as string | undefined,
  };
}

export function extract_oci_waf_policy_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    actions: (data.actions as unknown[]) ?? [],
  };
}

export function extract_oci_logging_loggroup_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    description: data.description as string | undefined,
  };
}

// ─── P2 extractors ───────────────────────────────────────────────────

export function extract_oci_queue_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    retention_sec: (data.retention_sec as number) ?? 604800,
    visibility_sec: (data.visibility_sec as number) ?? 30,
    poll_timeout_sec: (data.poll_timeout_sec as number) ?? 30,
  };
}

export function extract_oci_streaming_stream_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    partitions: (data.partitions as number) ?? 1,
    retention_hours: (data.retention_hours as number) ?? 24,
  };
}

export function extract_oci_ons_topic_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    description: data.description as string | undefined,
  };
}

export function extract_oci_analytics_instance_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    feature_set: (data.feature_set as string) || 'ENTERPRISE_ANALYTICS',
    capacity_type: (data.capacity_type as string) || 'OLPU_COUNT',
    capacity: (data.capacity as number) ?? 2,
    license_type: (data.license_type as string) || 'LICENSE_INCLUDED',
    idcs_access_token: data.idcs_access_token as string | undefined,
  };
}

export function extract_oci_monitoring_alarm_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    metric_namespace: data.metric_namespace as string | undefined,
    query: data.query as string | undefined,
    severity: (data.severity as string) || 'WARNING',
    notification_topic_ids: (data.notification_topic_ids as string[]) ?? [],
  };
}

export function extract_oci_generativeai_endpoint_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    model_id: data.model_id as string | undefined,
    dedicated_ai_cluster_id: data.dedicated_ai_cluster_id as string | undefined,
  };
}

export function extract_oci_datascience_modeldeployment_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    model_id: data.model_id as string | undefined,
    project_id: data.project_id as string | undefined,
    shape: (data.shape as string) || 'VM.Standard.E4.Flex',
    replicas: (data.replicas as number) ?? 1,
    bandwidth_mbps: (data.bandwidth_mbps as number) ?? 10,
  };
}
