/**
 * Property extractors for AWS network services.
 *
 * Resources covered:
 *   - aws.s3.bucket                  (Storage.Bucket, Storage.ObjectStorage, Compute.StaticSite)
 *   - aws.apigateway.restApi         (Network.Gateway)
 *   - aws.cloudfront.distribution    (Network.PublicEndpoint, Network.CustomDomain)
 *   - aws.elbv2.loadBalancer         (Network.LoadBalancer)
 */

import { hasBlockRole } from '@ice/constants';

/**
 * S3 bucket. Compute.StaticSite carries the `publicWebsiteSource`
 * role so the handler flips bucket policy + website hosting (mirrors
 * the GCP storage extractor's matching branch). Plain Storage.Bucket
 * stays private.
 */
export function extract_s3_bucket_properties(data: Record<string, unknown>, _region: string): Record<string, unknown> {
  const iceType = String(data.iceType || '');
  const isPublicWebsite = hasBlockRole(iceType, 'publicWebsiteSource');
  return {
    // No `region` field — S3 buckets are technically global names with
    // a region attribute, set by the handler via LocationConstraint.
    storage_class: (data.storageClass as string) || 'STANDARD',
    versioning: data.versioning ?? false,
    public_access: isPublicWebsite || data.public_access === true,
    website_hosting: isPublicWebsite || data.website_hosting === true,
    index_page: (data.index_page as string) || 'index.html',
    not_found_page: (data.not_found_page as string) || '404.html',
    block_public_acls: !isPublicWebsite && (data.block_public_acls ?? true),
    encryption: (data.encryption as string) || 'AES256',
    tags: {},
  };
}

/**
 * API Gateway REST API. Defaults to a regional endpoint (cheaper +
 * lower latency than EDGE). Operators wanting a CloudFront-fronted
 * edge endpoint set `endpoint_type: 'EDGE'`.
 */
export function extract_api_gateway_rest_api_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    endpoint_type: (data.endpoint_type as string) || 'REGIONAL',
    description: (data.description as string) || '',
    api_key_required: data.api_key_required ?? false,
    // Stage / deployment created lazily by the handler when a backing
    // Lambda or ECS service is wired in via outgoing edges.
    stage_name: (data.stage_name as string) || 'prod',
    binary_media_types: (data.binary_media_types as string[]) || [],
    tags: {},
  };
}

/**
 * CloudFront distribution — backs both Network.PublicEndpoint AND
 * Network.CustomDomain (when nested inside a PrivateNetwork). The
 * extractor lays down origins + cache behaviours; the handler
 * synthesises the CloudFront-required ACM cert in us-east-1 and
 * wires it onto the distribution.
 */
export function extract_cloudfront_distribution_properties(
  data: Record<string, unknown>,
  _region: string,
): Record<string, unknown> {
  return {
    enableHttps: data.enableHttps ?? true,
    auto_provision_cert: data.autoProvisionCert ?? true,
    redirect_http_to_https: data.redirectHttpToHttps ?? true,
    // Single root domain on this block — per-subdomain mapping comes
    // from outgoing-edge propagation (see pass-1-5-endpoint-wiring).
    domain: (data.domain as string) || '',
    // Cache + origin policy presets. Most users stay on the defaults
    // (CachingOptimized + CORS-S3Origin); the handler resolves the
    // managed-policy IDs by name.
    cache_policy_name: (data.cache_policy_name as string) || 'CachingOptimized',
    origin_request_policy_name: (data.origin_request_policy_name as string) || 'CORS-S3Origin',
    price_class: (data.price_class as string) || 'PriceClass_100',
    tags: {},
  };
}

/**
 * Application Load Balancer (ELBv2). Sized for HTTPS by default; the
 * handler attaches a default target group when no compute backend is
 * wired (silent until the user connects something).
 */
export function extract_elbv2_load_balancer_properties(
  data: Record<string, unknown>,
  region: string,
): Record<string, unknown> {
  return {
    region,
    scheme: data.internal === true ? 'internal' : 'internet-facing',
    type: (data.lb_type as string) || 'application',
    ip_address_type: (data.ip_address_type as string) || 'ipv4',
    enable_deletion_protection: data.enable_deletion_protection ?? false,
    // Listener port (HTTPS by default, HTTP fallback when cert not set).
    listener_port: data.listener_port ?? (data.enable_https !== false ? 443 : 80),
    listener_protocol: data.listener_protocol ?? (data.enable_https !== false ? 'HTTPS' : 'HTTP'),
    target_group_port: data.target_group_port ?? 80,
    target_group_protocol: data.target_group_protocol ?? 'HTTP',
    tags: {},
  };
}
