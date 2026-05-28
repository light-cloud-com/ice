/**
 * Property extractors for IBM Cloud resources.
 *
 * Two factory functions back the repetitive shapes:
 *   - DB-engine variants reuse extract_ibm_databases_properties
 *   - Resource Controller-managed services reuse extract_ibm_rc_properties
 */

export function extract_ibm_codeengine_application_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    project_id: data.project_id as string | undefined,
    image: data.image as string | undefined,
    min_instances: (data.min_instances as number) ?? 0,
    max_instances: (data.max_instances as number) ?? 10,
    cpu_cores: (data.cpu_cores as string) || '1',
    memory: (data.memory as string) || '2G',
    env_vars: (data.env_vars as Array<{ name: string; value: string }>) ?? [],
  };
}

export function extract_ibm_codeengine_function_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    project_id: data.project_id as string | undefined,
    runtime: (data.runtime as string) || 'nodejs-20',
    handler: (data.handler as string) || 'main',
    cpu_cores: (data.cpu_cores as string) || '1',
    memory: (data.memory as string) || '512M',
  };
}

export function extract_ibm_codeengine_job_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    project_id: data.project_id as string | undefined,
    image: data.image as string | undefined,
    cpu_cores: (data.cpu_cores as string) || '1',
    memory: (data.memory as string) || '2G',
    array_spec: (data.array_spec as string) || '0',
  };
}

export function extract_ibm_vpc_instance_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    vpc_id: data.vpc_id as string | undefined,
    subnet_id: data.subnet_id as string | undefined,
    image_id: data.image_id as string | undefined,
    zone: data.zone as string | undefined,
    profile: (data.profile as string) || 'bx2-2x8',
    ssh_key_ids: (data.ssh_key_ids as string[]) ?? [],
  };
}

export function extract_ibm_databases_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    engine_version: data.engine_version as string | undefined,
    memory_mb: (data.memory_mb as number) ?? 1024,
    disk_mb: (data.disk_mb as number) ?? 5120,
    plan_id: data.plan_id as string | undefined,
  };
}

export function extract_ibm_cos_bucket_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    cos_instance_crn: data.cos_instance_crn as string | undefined,
  };
}

export function extract_ibm_vpc_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    address_prefix_management: (data.address_prefix_management as string) || 'auto',
    classic_access: (data.classic_access as boolean) ?? false,
  };
}

export function extract_ibm_vpc_subnet_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    vpc_id: data.vpc_id as string | undefined,
    zone: data.zone as string | undefined,
    cidr: (data.cidr as string) || '10.10.1.0/24',
  };
}

export function extract_ibm_vpc_securitygroup_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    vpc_id: data.vpc_id as string | undefined,
    rules: (data.rules as unknown[]) ?? [],
  };
}

export function extract_ibm_vpc_loadbalancer_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    is_public: (data.is_public as boolean) ?? true,
    subnet_ids: (data.subnet_ids as string[]) ?? [],
    profile: (data.profile as string) || 'application',
  };
}

export function extract_ibm_secret_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    secret_type: (data.secret_type as string) || 'arbitrary',
    value: data.value as string | undefined,
    secret_group_id: (data.secret_group_id as string) || 'default',
    description: data.description as string | undefined,
  };
}

/**
 * RC-managed pass-through extractor for blocks that just need a name +
 * region. Each RC handler has the same shape; this single fn maps to
 * every RC resource extractor entry below.
 */
export function extract_ibm_rc_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    plan_id: data.plan_id as string | undefined,
    parameters: data.parameters as Record<string, unknown> | undefined,
  };
}
