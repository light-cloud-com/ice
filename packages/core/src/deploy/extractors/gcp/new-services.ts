/**
 * Property extractors for GCP services added in the cross-cloud parity
 * push: Artifact Registry, Cloud Build, Cloud Monitoring, Cloud DNS,
 * Compute Engine (firewall + instance + Private Service Connect).
 *
 * These extractors keep the cross-cloud abstract blocks (container-
 * registry, source-build, alert, dns-zone, virtual-machine,
 * firewall, private-network) wired through on GCP.
 */

export function extract_gcp_artifact_registry_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    format: (data.format as string) || 'DOCKER',
    mode: (data.mode as string) || 'STANDARD_REPOSITORY',
    description: (data.description as string) || '',
    labels: {},
  };
}

export function extract_gcp_cloud_build_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    description: (data.description as string) || '',
    repository: (data.repository as string) || (data.source_location as string) || '',
    branch: (data.branch as string) || 'main',
    buildspec_file: (data.buildspec_file as string) || (data.buildspec as string) || 'cloudbuild.yaml',
    labels: {},
  };
}

export function extract_gcp_monitoring_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    combiner: (data.combiner as string) || 'OR',
    filter: (data.filter as string) || 'metric.type="compute.googleapis.com/instance/cpu/utilization"',
    comparison: (data.comparison as string) || 'COMPARISON_GT',
    threshold: (data.threshold as number) ?? 0.8,
    duration_seconds: (data.duration_seconds as number) ?? 300,
    enabled: data.enabled !== false,
    labels: {},
  };
}

export function extract_gcp_cloud_dns_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    dns_name: (data.dns_name as string) || (data.domain as string) || '',
    description: (data.description as string) || '',
    labels: {},
  };
}

export function extract_gcp_compute_instance_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    zone: (data.zone as string) || `${region}-a`,
    machine_type: (data.machine_type as string) || (data.size as string) || 'e2-micro',
    image: (data.image as string) || 'projects/debian-cloud/global/images/family/debian-12',
    labels: {},
  };
}

export function extract_gcp_compute_firewall_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    network: (data.network as string) || 'global/networks/default',
    direction: (data.direction as string) || 'INGRESS',
    priority: (data.priority as number) ?? 1000,
    allowed: (data.allowed as unknown[]) || (data.rules as unknown[]) || [],
    source_ranges: (data.source_ranges as string[]) || ['0.0.0.0/0'],
    labels: {},
  };
}

export function extract_gcp_psc_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    target_service_attachment: (data.target_service_attachment as string) || (data.target_resource_id as string) || '',
    network: (data.network as string) || 'global/networks/default',
    subnetwork: (data.subnetwork as string) || '',
    labels: {},
  };
}
