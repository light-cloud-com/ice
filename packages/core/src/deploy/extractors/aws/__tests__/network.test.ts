/**
 * Tests for AWS network extractors.
 */

import { describe, it, expect } from 'vitest';
import {
  extract_s3_bucket_properties,
  extract_api_gateway_rest_api_properties,
  extract_cloudfront_distribution_properties,
  extract_elbv2_load_balancer_properties,
} from '../network';

describe('extract_s3_bucket_properties', () => {
  it('returns private-bucket defaults for an empty data object', () => {
    expect(extract_s3_bucket_properties({}, 'us-east-1')).toEqual({
      storage_class: 'STANDARD',
      versioning: false,
      public_access: false,
      website_hosting: false,
      index_page: 'index.html',
      not_found_page: '404.html',
      block_public_acls: true,
      encryption: 'AES256',
      tags: {},
    });
  });

  it('flips public + website hosting when iceType has publicWebsiteSource role (Compute.StaticSite)', () => {
    const result = extract_s3_bucket_properties({ iceType: 'Compute.StaticSite' }, 'us-east-1');
    expect(result.public_access).toBe(true);
    expect(result.website_hosting).toBe(true);
    expect(result.block_public_acls).toBe(false);
  });

  it('plain Storage.Bucket stays private', () => {
    const result = extract_s3_bucket_properties({ iceType: 'Storage.Bucket' }, 'us-east-1');
    expect(result.public_access).toBe(false);
    expect(result.website_hosting).toBe(false);
  });
});

describe('extract_api_gateway_rest_api_properties', () => {
  it('defaults to REGIONAL + stage "prod"', () => {
    expect(extract_api_gateway_rest_api_properties({}, 'eu-west-1')).toEqual({
      region: 'eu-west-1',
      endpoint_type: 'REGIONAL',
      description: '',
      api_key_required: false,
      stage_name: 'prod',
      binary_media_types: [],
      tags: {},
    });
  });

  it('honours endpoint_type=EDGE override', () => {
    expect(extract_api_gateway_rest_api_properties({ endpoint_type: 'EDGE' }, 'us-east-1').endpoint_type).toBe('EDGE');
  });
});

describe('extract_cloudfront_distribution_properties', () => {
  it('defaults to HTTPS + auto-cert + PriceClass_100', () => {
    expect(extract_cloudfront_distribution_properties({}, 'us-east-1')).toMatchObject({
      enableHttps: true,
      auto_provision_cert: true,
      redirect_http_to_https: true,
      domain: '',
      cache_policy_name: 'CachingOptimized',
      origin_request_policy_name: 'CORS-S3Origin',
      price_class: 'PriceClass_100',
    });
  });

  it('passes the user-supplied root domain through', () => {
    expect(extract_cloudfront_distribution_properties({ domain: 'example.com' }, 'us-east-1').domain).toBe(
      'example.com',
    );
  });
});

describe('extract_elbv2_load_balancer_properties', () => {
  it('defaults to internet-facing ALB on HTTPS:443', () => {
    expect(extract_elbv2_load_balancer_properties({}, 'us-east-1')).toMatchObject({
      region: 'us-east-1',
      scheme: 'internet-facing',
      type: 'application',
      listener_port: 443,
      listener_protocol: 'HTTPS',
      target_group_port: 80,
      target_group_protocol: 'HTTP',
    });
  });

  it('flips to internal scheme when internal=true', () => {
    expect(extract_elbv2_load_balancer_properties({ internal: true }, 'us-east-1').scheme).toBe('internal');
  });

  it('drops to HTTP:80 listener when enable_https=false', () => {
    const result = extract_elbv2_load_balancer_properties({ enable_https: false }, 'us-east-1');
    expect(result.listener_port).toBe(80);
    expect(result.listener_protocol).toBe('HTTP');
  });
});
