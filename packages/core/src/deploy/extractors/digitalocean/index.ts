/**
 * Property extractors for DigitalOcean resources.
 */

export function extract_do_droplet_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region: (data.region as string) || region || 'nyc3',
    size: (data.size as string) || 's-1vcpu-1gb',
    image: (data.image as string) || 'ubuntu-22-04-x64',
    ssh_keys: (data.ssh_keys as string[]) ?? [],
    vpc_uuid: data.vpc_uuid as string | undefined,
    user_data: data.user_data as string | undefined,
  };
}

export function extract_do_apps_app_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region: (data.region as string) || region || 'nyc3',
    spec: data.spec as Record<string, unknown> | undefined,
    instance_size: (data.instance_size as string) || 'basic-xxs',
    instance_count: (data.instance_count as number) ?? 1,
    github: data.github,
    git: data.git,
  };
}

export function extract_do_databases_cluster_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    engine: (data.engine as string) || 'postgres',
    engine_version: data.engine_version as string | undefined,
    size: (data.size as string) || 'db-s-1vcpu-1gb',
    region: (data.region as string) || region || 'nyc3',
    num_nodes: (data.num_nodes as number) ?? 1,
  };
}

export function extract_do_spaces_bucket_properties(
  _data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {};
}

export function extract_do_loadbalancer_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region: (data.region as string) || region || 'nyc3',
    size_unit: (data.size_unit as number) ?? 1,
    vpc_uuid: data.vpc_uuid as string | undefined,
    droplet_ids: (data.droplet_ids as number[]) ?? [],
    forwarding_rules: (data.forwarding_rules as unknown[]) ?? [],
  };
}

export function extract_do_apps_envvar_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    app_id: data.app_id as string | undefined,
    value: data.value as string | undefined,
    type: (data.type as string) || 'SECRET',
    scope: (data.scope as string) || 'RUN_TIME',
  };
}

export function extract_do_functions_namespace_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return { region: (data.region as string) || region || 'nyc3' };
}

export function extract_do_functions_function_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return { namespace_id: data.namespace_id as string | undefined };
}

export function extract_do_vpc_network_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region: (data.region as string) || region || 'nyc3',
    ip_range: (data.ip_range as string) || '10.10.0.0/16',
    description: data.description as string | undefined,
  };
}

export function extract_do_domain_record_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    domain: data.domain as string | undefined,
    subdomain: (data.subdomain as string) || '@',
    record_type: (data.record_type as string) || 'A',
    value: data.value as string | undefined,
    ttl_sec: (data.ttl_sec as number) ?? 1800,
  };
}

export function extract_do_firewall_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    inbound_rules: (data.inbound_rules as unknown[]) ?? [],
    outbound_rules: (data.outbound_rules as unknown[]) ?? [],
    droplet_ids: (data.droplet_ids as number[]) ?? [],
  };
}

export function extract_do_kubernetes_cluster_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region: (data.region as string) || region || 'nyc3',
    version: (data.version as string) || 'latest',
    vpc_uuid: data.vpc_uuid as string | undefined,
    node_pools: data.node_pools as unknown[] | undefined,
    node_size: (data.node_size as string) || 's-1vcpu-2gb',
    node_count: (data.node_count as number) ?? 2,
  };
}

export function extract_do_container_registry_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    tier: (data.tier as string) || 'basic',
    region: (data.region as string) || region || 'nyc3',
  };
}

export function extract_do_apps_static_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region: (data.region as string) || region || 'nyc3',
    github: data.github,
    git: data.git,
    build_command: data.build_command as string | undefined,
    output_dir: (data.output_dir as string) || 'dist',
    environment_slug: (data.environment_slug as string) || 'node-js',
  };
}

export function extract_do_volume_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    size_gb: (data.size_gb as number) ?? 10,
    region: (data.region as string) || region || 'nyc3',
    filesystem_type: (data.filesystem_type as string) || 'ext4',
  };
}

export function extract_do_snapshot_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return { droplet_id: data.droplet_id as string | number | undefined };
}

export function extract_do_monitoring_alertpolicy_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    metric: (data.metric as string) || 'v1/insights/droplet/cpu',
    compare: (data.compare as string) || 'GreaterThan',
    threshold: (data.threshold as number) ?? 80,
    window: (data.window as string) || '5m',
    email_alerts: (data.email_alerts as string[]) ?? [],
    slack_alerts: (data.slack_alerts as unknown[]) ?? [],
    entities: (data.entities as string[]) ?? [],
  };
}

export function extract_do_reserved_ip_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region: (data.region as string) || region || 'nyc3',
    droplet_id: data.droplet_id as string | number | undefined,
  };
}
