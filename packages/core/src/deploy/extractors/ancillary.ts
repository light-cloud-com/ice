/**
 * Property extractors for ancillary services on the card-to-graph translator.
 *
 * Each extractor maps a canvas node's `data` payload to the deployer-handler
 * input shape for a specific GCP resource type. The translator's dispatch
 * table looks up the right extractor by resolved `resource_type`.
 *
 * Loose `Record<string, unknown>` types on the parameter and return value
 * are intentional — handlers further down the pipeline coerce per-resource.
 */

export function extract_secret_manager_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    replication_type: data.replicationType || 'automatic',
    labels: {},
  };
}

export function extract_identity_platform_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    sign_in_providers: data.signInProviders || ['email', 'google'],
    mfa_enabled: data.mfaEnabled ?? false,
  };
}

export function extract_bigquery_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    location: region,
    default_table_expiration_ms: data.tableExpirationMs,
    labels: {},
  };
}

export function extract_logging_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    filter: data.filter || '',
    destination_type: data.destinationType || 'logging.googleapis.com',
    labels: {},
  };
}

export function extract_vertex_ai_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    display_name: data.label || 'vertex-endpoint',
    labels: {},
  };
}

export function extract_dataflow_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    template_type: data.templateType || 'streaming',
    labels: {},
  };
}

export function extract_discovery_engine_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    location: region,
    solution_type: 'SOLUTION_TYPE_SEARCH',
    labels: {},
  };
}

export function extract_gke_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    location: region,
    initial_node_count: data.nodeCount || 3,
    machine_type: data.machineType || 'e2-standard-2',
    labels: {},
  };
}

export function extract_domain_mapping_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    domain: [data.subdomain, data.hostname].filter(Boolean).join('.') || (data.hostname as string) || '',
    hostname: (data.hostname as string) || '',
    subdomain: (data.subdomain as string) || '',
    ssl_mode: (data.sslMode as string) || 'auto',
    region,
    labels: {},
  };
}

export function extract_custom_domain_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  const domain = String(data.domain || '').trim();
  const auto_provision = data.autoProvisionCert !== false;
  return {
    // Phase 8 — managed SSL certificate properties. The handler reads
    // `managed: true` + `domains: [...]` to decide between GCP-managed
    // and bring-your-own cert paths.
    managed: auto_provision,
    domains: domain ? [domain] : [],
    ssl_certificate_id: (data.sslCertificateId as string) || '',
    enable_https: data.enableHttps !== false,
    redirect_http: data.redirectHttpToHttps !== false,
    labels: {},
  };
}

export function extract_backend_bucket_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    bucket_name: (data.bucket_name as string) || (data.name as string) || '',
    enable_cdn: data.enable_cdn !== false,
    labels: {},
  };
}

export function extract_firebase_hosting_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  // Firebase Hosting only needs a few fields:
  //   - domain (optional): user's custom domain. Registered with
  //     Firebase Hosting which provisions a managed SSL cert.
  //   - repository / branch / output_directory / build_command:
  //     populated by Pass 1.4 from the connected Source.Repository.
  //     The handler uses these to download the GitHub repo and upload
  //     its files to Hosting (skipping the placeholder).
  //   - source.repo / source.branch: legacy structured form, kept as
  //     a fallback.
  const domain = String(data.domain || '').trim();
  const sourceObj = (data.source as { repo?: string; branch?: string } | undefined) || {};
  const repository = String(data.repository || sourceObj.repo || '').trim();
  const branch = String(data.branch || sourceObj.branch || '').trim();
  return {
    domain: domain && domain !== 'example.com' ? domain : undefined,
    repository: repository || undefined,
    branch: branch || 'main',
    output_directory: String(data.output_directory || data.outputDirectory || '').trim() || undefined,
    build_command: String(data.build_command || data.buildCommand || '').trim() || undefined,
    source_path: String(data.source_path || data.path || '').trim() || undefined,
    labels: {},
  };
}
