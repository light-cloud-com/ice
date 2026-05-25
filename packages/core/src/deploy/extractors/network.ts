/**
 * Property extractors for network and storage-adjacent services on the
 * card-to-graph translator.
 *
 * Each extractor maps a canvas node's `data` payload to the deployer-handler
 * input shape for a specific GCP resource type. The translator's dispatch
 * table looks up the right extractor by resolved `resource_type`.
 *
 * Loose `Record<string, unknown>` types on the parameter and return value
 * are intentional — handlers further down the pipeline coerce per-resource.
 */

import { createHash } from 'crypto';
import { hasBlockRole } from '@ice/constants';

export function extract_storage_bucket_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  // Phase 8 — when the source block is flagged with `publicWebsiteSource`
  // (today: Compute.StaticSite on providers that compile it to a bucket
  // such as AWS S3), the handler needs to make the bucket publicly
  // readable and enable static website hosting (index.html / 404.html)
  // so the LB backend bucket can serve it to the internet. Plain
  // Storage.Bucket blocks stay private. Cardinal-rule schema-driven:
  // the iceType-specific check is replaced by a role lookup in the
  // shared classifier table.
  const iceType = String(data.iceType || '');
  const isPublicWebsite = hasBlockRole(iceType, 'publicWebsiteSource');
  return {
    location: region.toUpperCase().split('-').slice(0, 1).join('') || 'US',
    storage_class: data.storageClass || 'STANDARD',
    versioning: data.versioning ?? false,
    public_access: isPublicWebsite || data.public_access === true,
    website_hosting: isPublicWebsite || data.website_hosting === true,
    index_page: (data.index_page as string) || 'index.html',
    not_found_page: (data.not_found_page as string) || '404.html',
    labels: {},
  };
}

export function extract_pubsub_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  return {
    message_retention_duration: data.retentionDuration || '604800s',
    labels: {},
  };
}

export function extract_api_gateway_properties(data: Record<string, unknown>, region: string): Record<string, unknown> {
  return {
    region,
    labels: {},
  };
}

export function extract_load_balancer_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  const ssl_certificate = (data.sslCertificate as string | undefined) || (data.ssl_certificate as string | undefined);
  const explicit_protocol = (data.protocol as string | undefined)?.toUpperCase();
  const has_cert = Boolean(ssl_certificate);
  const protocol =
    explicit_protocol === 'HTTPS' || explicit_protocol === 'HTTP' ? explicit_protocol : has_cert ? 'HTTPS' : 'HTTP';
  return {
    scheme: 'EXTERNAL',
    port_range: data.port || (protocol === 'HTTPS' ? '443' : '80'),
    protocol,
    ssl_certificate,
    labels: {},
  };
}

export function extract_vpc_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  // PrivateNetwork → auto-mode (GCP creates per-region /20 subnets so the
  // user doesn't need explicit Subnet blocks). VPC → custom-mode (each
  // Network.Subnet block deploys its own subnetwork). Both default can be
  // overridden via data.auto_create_subnets.
  const is_private_network = data.iceType === 'Network.PrivateNetwork';
  const auto_create_subnets =
    typeof data.auto_create_subnets === 'boolean' ? data.auto_create_subnets : is_private_network;
  return {
    routing_mode: typeof data.routing_mode === 'string' ? data.routing_mode : 'GLOBAL',
    description: typeof data.description === 'string' ? data.description : undefined,
    auto_create_subnets,
    labels: {},
  };
}

export function extract_subnet_properties(
  data: Record<string, unknown>,
  region: string,
  node_id?: string,
): Record<string, unknown> {
  // Auto-allocate a unique /24 from the node id when the user hasn't set
  // one explicitly. Two subnets in the same VPC must have different
  // CIDRs; defaulting both to 10.0.0.0/24 (as we did initially) makes
  // the second subnet's create call fail with INVALID_USAGE.
  //
  // Hash bytes give us a deterministic, conflict-tolerant allocation
  // across the 10.X.Y.0/24 space (256 × 256 = 65 536 distinct ranges).
  // Skip 10.0.0.0/24 specifically because GCP's "default" network often
  // reserves it.
  let cidr = typeof data.ip_cidr_range === 'string' ? data.ip_cidr_range : '';
  if (!cidr) {
    if (node_id) {
      // GCP auto-mode networks reserve 10.128.0.0/9 for their own
      // auto-allocated subnets. To stay safe regardless of whether the
      // subnet ends up in a custom VPC or the default auto-mode network,
      // clamp the first octet to 1..127 (10.0.0.0/9, non-reserved).
      // Skip 10.0.x as the literal `default` network often uses it.
      const hash = createHash('sha256').update(node_id).digest();
      const x = ((hash[0] ?? 0) % 127) + 1; // 1..127
      const y = hash[1] ?? 0; // 0..255
      cidr = `10.${x}.${y}.0/24`;
    } else {
      cidr = '10.10.0.0/24';
    }
  }
  // The translator wires `network` from the parent VPC's resource name when
  // the canvas links Subnet → VPC; falls back to 'default' if unwired.
  return {
    region,
    network: typeof data.network === 'string' ? data.network : 'default',
    ip_cidr_range: cidr,
    private_ip_google_access: data.private_ip_google_access === true,
    description: typeof data.description === 'string' ? data.description : undefined,
    labels: {},
  };
}

export function extract_cloud_armor_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  // Pass user-defined rules through verbatim; the handler injects the
  // mandatory default (priority 2147483647) when the user hasn't supplied one.
  return {
    rules: Array.isArray(data.rules) ? data.rules : [],
    description: typeof data.description === 'string' ? data.description : undefined,
    labels: {},
  };
}
