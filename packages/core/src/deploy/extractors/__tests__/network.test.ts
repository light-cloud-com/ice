/**
 * Tests for `extractors/network.ts` — property extractors for GCP network
 * and storage-adjacent services on the card-to-graph translator.
 *
 * Covers each of the seven extractors, exercising:
 *   - default values for missing fields
 *   - pass-through of user-supplied values
 *   - the nullish-coalescing (`??`) vs short-circuit (`||`) semantics
 *   - `extract_storage_bucket_properties` upgrades public + website
 *     when iceType === 'Compute.StaticSite'
 *   - `extract_load_balancer_properties` resolves protocol from explicit
 *     value, presence of an SSL cert, or default HTTP
 *   - `extract_vpc_properties` defaults `auto_create_subnets` from the
 *     iceType (PrivateNetwork → true, VPC → false)
 *   - **RISK #4**: `extract_subnet_properties` auto-allocates a /24 CIDR
 *     deterministically from `node_id` via `createHash('sha256')`. The
 *     formula `10.{(hash[0] % 127) + 1}.{hash[1]}.0/24` is byte-pinned
 *     here so any future arithmetic change shifts allocations on existing
 *     deployments and trips the test.
 */
import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';
import {
  extract_storage_bucket_properties,
  extract_pubsub_properties,
  extract_api_gateway_properties,
  extract_load_balancer_properties,
  extract_vpc_properties,
  extract_subnet_properties,
  extract_cloud_armor_properties,
} from '../network';

describe('extract_storage_bucket_properties', () => {
  it('returns defaults for an empty data object', () => {
    const result = extract_storage_bucket_properties({}, 'us-central1');
    expect(result).toEqual({
      location: 'US',
      storage_class: 'STANDARD',
      versioning: false,
      public_access: false,
      website_hosting: false,
      index_page: 'index.html',
      not_found_page: '404.html',
      labels: {},
    });
  });

  it('derives location from the region prefix (uppercased first segment)', () => {
    const result = extract_storage_bucket_properties({}, 'europe-west1');
    expect(result.location).toBe('EUROPE');
  });

  it('falls back to "US" when region is empty', () => {
    const result = extract_storage_bucket_properties({}, '');
    expect(result.location).toBe('US');
  });

  it('passes storageClass through and uses ?? on versioning so explicit false stays', () => {
    const result = extract_storage_bucket_properties({ storageClass: 'NEARLINE', versioning: false }, 'us-central1');
    expect(result.storage_class).toBe('NEARLINE');
    expect(result.versioning).toBe(false);
  });

  it('uses ?? on versioning so explicit true passes through', () => {
    const result = extract_storage_bucket_properties({ versioning: true }, 'us-central1');
    expect(result.versioning).toBe(true);
  });

  it('flips public_access and website_hosting when iceType is Compute.StaticSite', () => {
    const result = extract_storage_bucket_properties({ iceType: 'Compute.StaticSite' }, 'us-central1');
    expect(result.public_access).toBe(true);
    expect(result.website_hosting).toBe(true);
  });

  it('passes explicit public_access / website_hosting === true even when not StaticSite', () => {
    const result = extract_storage_bucket_properties({ public_access: true, website_hosting: true }, 'us-central1');
    expect(result.public_access).toBe(true);
    expect(result.website_hosting).toBe(true);
  });

  it('keeps public_access false when only "truthy-but-not-true" is supplied', () => {
    // The check is === true, not just truthy.
    const result = extract_storage_bucket_properties({ public_access: 'yes' as unknown as boolean }, 'us-central1');
    expect(result.public_access).toBe(false);
  });

  it('passes through index_page and not_found_page', () => {
    const result = extract_storage_bucket_properties(
      { index_page: 'home.html', not_found_page: 'oops.html' },
      'us-central1',
    );
    expect(result.index_page).toBe('home.html');
    expect(result.not_found_page).toBe('oops.html');
  });

  it('always returns labels: {}', () => {
    const result = extract_storage_bucket_properties({ labels: { keep: 'me' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });
});

describe('extract_pubsub_properties', () => {
  it('returns defaults for an empty data object', () => {
    const result = extract_pubsub_properties({}, 'us-central1');
    expect(result).toEqual({
      message_retention_duration: '604800s',
      labels: {},
    });
  });

  it('passes through retentionDuration', () => {
    const result = extract_pubsub_properties({ retentionDuration: '86400s' }, 'us-central1');
    expect(result.message_retention_duration).toBe('86400s');
  });

  it('always returns labels: {}', () => {
    const result = extract_pubsub_properties({ labels: { x: 'y' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });
});

describe('extract_api_gateway_properties', () => {
  it('returns just region + empty labels', () => {
    const result = extract_api_gateway_properties({}, 'us-central1');
    expect(result).toEqual({ region: 'us-central1', labels: {} });
  });

  it('passes the region through verbatim', () => {
    const result = extract_api_gateway_properties({}, 'europe-west1');
    expect(result.region).toBe('europe-west1');
  });
});

describe('extract_load_balancer_properties', () => {
  it('defaults to HTTP scheme=EXTERNAL with port_range=80 and no cert', () => {
    const result = extract_load_balancer_properties({}, 'us-central1');
    expect(result).toEqual({
      scheme: 'EXTERNAL',
      port_range: '80',
      protocol: 'HTTP',
      ssl_certificate: undefined,
      labels: {},
    });
  });

  it('flips to HTTPS / port 443 when an sslCertificate is supplied', () => {
    const result = extract_load_balancer_properties({ sslCertificate: 'cert-1' }, 'us-central1');
    expect(result.protocol).toBe('HTTPS');
    expect(result.port_range).toBe('443');
    expect(result.ssl_certificate).toBe('cert-1');
  });

  it('also accepts the snake_case ssl_certificate key', () => {
    const result = extract_load_balancer_properties({ ssl_certificate: 'cert-2' }, 'us-central1');
    expect(result.protocol).toBe('HTTPS');
    expect(result.ssl_certificate).toBe('cert-2');
  });

  it('honors an explicit HTTPS protocol over the default HTTP', () => {
    const result = extract_load_balancer_properties({ protocol: 'https' }, 'us-central1');
    expect(result.protocol).toBe('HTTPS');
    expect(result.port_range).toBe('443');
  });

  it('honors an explicit HTTP protocol even when an SSL cert is present', () => {
    const result = extract_load_balancer_properties({ protocol: 'http', sslCertificate: 'cert-x' }, 'us-central1');
    expect(result.protocol).toBe('HTTP');
    expect(result.port_range).toBe('80');
    expect(result.ssl_certificate).toBe('cert-x');
  });

  it('falls back to HTTPS when explicit protocol is unrecognized but cert is present', () => {
    const result = extract_load_balancer_properties({ protocol: 'tcp', sslCertificate: 'cert-y' }, 'us-central1');
    expect(result.protocol).toBe('HTTPS');
    expect(result.port_range).toBe('443');
  });

  it('passes user-supplied port through (overrides default)', () => {
    const result = extract_load_balancer_properties({ port: '8443' }, 'us-central1');
    expect(result.port_range).toBe('8443');
  });
});

describe('extract_vpc_properties', () => {
  it('returns defaults: GLOBAL routing, no description, auto_create=false', () => {
    const result = extract_vpc_properties({}, 'us-central1');
    expect(result).toEqual({
      routing_mode: 'GLOBAL',
      description: undefined,
      auto_create_subnets: false,
      labels: {},
    });
  });

  it('defaults auto_create_subnets to true for Network.PrivateNetwork', () => {
    const result = extract_vpc_properties({ iceType: 'Network.PrivateNetwork' }, 'us-central1');
    expect(result.auto_create_subnets).toBe(true);
  });

  it('honors explicit auto_create_subnets=false even on PrivateNetwork', () => {
    const result = extract_vpc_properties(
      { iceType: 'Network.PrivateNetwork', auto_create_subnets: false },
      'us-central1',
    );
    expect(result.auto_create_subnets).toBe(false);
  });

  it('honors explicit auto_create_subnets=true on a regular VPC', () => {
    const result = extract_vpc_properties({ auto_create_subnets: true }, 'us-central1');
    expect(result.auto_create_subnets).toBe(true);
  });

  it('passes routing_mode and description through when strings', () => {
    const result = extract_vpc_properties({ routing_mode: 'REGIONAL', description: 'my vpc' }, 'us-central1');
    expect(result.routing_mode).toBe('REGIONAL');
    expect(result.description).toBe('my vpc');
  });

  it('falls back to GLOBAL routing when routing_mode is not a string', () => {
    const result = extract_vpc_properties({ routing_mode: 42 as unknown as string }, 'us-central1');
    expect(result.routing_mode).toBe('GLOBAL');
  });

  it('drops description when not a string', () => {
    const result = extract_vpc_properties({ description: 99 as unknown as string }, 'us-central1');
    expect(result.description).toBeUndefined();
  });
});

describe('extract_subnet_properties (RISK #4 — hash-CIDR pin)', () => {
  it('returns the explicit ip_cidr_range when supplied (no hashing)', () => {
    const result = extract_subnet_properties({ ip_cidr_range: '10.50.0.0/24' }, 'us-central1', 'node-1');
    expect(result.ip_cidr_range).toBe('10.50.0.0/24');
  });

  it('falls back to 10.10.0.0/24 when neither cidr nor node_id is supplied', () => {
    const result = extract_subnet_properties({}, 'us-central1');
    expect(result.ip_cidr_range).toBe('10.10.0.0/24');
  });

  it('PINS the hash formula: CIDR = 10.{(sha256(node_id)[0] % 127) + 1}.{[1]}.0/24', () => {
    const node_id = 'gcp.compute.subnetwork:ice-foo-prod-subnet-abc123';
    const hash = createHash('sha256').update(node_id).digest();
    const expected_x = ((hash[0] ?? 0) % 127) + 1;
    const expected_y = hash[1] ?? 0;
    const expected = `10.${expected_x}.${expected_y}.0/24`;

    const result = extract_subnet_properties({}, 'us-central1', node_id);
    expect(result.ip_cidr_range).toBe(expected);
  });

  it('different node_ids produce different CIDRs (deterministic but distinct)', () => {
    const a = extract_subnet_properties({}, 'us-central1', 'node-a');
    const b = extract_subnet_properties({}, 'us-central1', 'node-b');
    expect(a.ip_cidr_range).not.toBe(b.ip_cidr_range);
  });

  it('same node_id produces the same CIDR across calls (deterministic)', () => {
    const a = extract_subnet_properties({}, 'us-central1', 'stable-node');
    const b = extract_subnet_properties({}, 'us-central1', 'stable-node');
    expect(a.ip_cidr_range).toBe(b.ip_cidr_range);
  });

  it('x-octet stays in [1, 127] across many node_ids (no reserved 10.128.0.0/9)', () => {
    // Sample a wide spread of node_ids and confirm the x-octet never escapes
    // the [1, 127] band. This guards the `(hash[0] % 127) + 1` clamp.
    for (let i = 0; i < 256; i++) {
      const result = extract_subnet_properties({}, 'us-central1', `node-${i}`);
      const cidr = result.ip_cidr_range as string;
      const match = cidr.match(/^10\.(\d+)\.(\d+)\.0\/24$/);
      expect(match).not.toBeNull();
      const x = Number(match![1]);
      const y = Number(match![2]);
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(127);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(255);
    }
  });

  it('defaults network to "default" when not supplied', () => {
    const result = extract_subnet_properties({}, 'us-central1', 'node-1');
    expect(result.network).toBe('default');
  });

  it('passes parent VPC name through when network is a string', () => {
    const result = extract_subnet_properties({ network: 'my-vpc' }, 'us-central1', 'node-1');
    expect(result.network).toBe('my-vpc');
  });

  it('falls back to "default" when network is not a string', () => {
    const result = extract_subnet_properties({ network: 123 as unknown as string }, 'us-central1', 'node-1');
    expect(result.network).toBe('default');
  });

  it('region is passed through verbatim', () => {
    const result = extract_subnet_properties({}, 'europe-west1', 'node-1');
    expect(result.region).toBe('europe-west1');
  });

  it('private_ip_google_access requires === true (not just truthy)', () => {
    const off = extract_subnet_properties(
      { private_ip_google_access: 1 as unknown as boolean },
      'us-central1',
      'node-1',
    );
    expect(off.private_ip_google_access).toBe(false);

    const on = extract_subnet_properties({ private_ip_google_access: true }, 'us-central1', 'node-1');
    expect(on.private_ip_google_access).toBe(true);
  });

  it('description passes through when string, drops otherwise', () => {
    const yes = extract_subnet_properties({ description: 'private subnet' }, 'us-central1', 'node-1');
    expect(yes.description).toBe('private subnet');

    const no = extract_subnet_properties({ description: 42 as unknown as string }, 'us-central1', 'node-1');
    expect(no.description).toBeUndefined();
  });

  it('always returns labels: {}', () => {
    const result = extract_subnet_properties({ labels: { keep: 'me' } }, 'us-central1', 'node-1');
    expect(result.labels).toEqual({});
  });
});

describe('extract_cloud_armor_properties', () => {
  it('returns defaults: empty rules, no description, empty labels', () => {
    const result = extract_cloud_armor_properties({}, 'us-central1');
    expect(result).toEqual({
      rules: [],
      description: undefined,
      labels: {},
    });
  });

  it('passes a user-defined rules array through verbatim', () => {
    const rules = [{ priority: 1000, action: 'deny(403)' }];
    const result = extract_cloud_armor_properties({ rules }, 'us-central1');
    expect(result.rules).toBe(rules);
  });

  it('falls back to [] when rules is not an array', () => {
    const result = extract_cloud_armor_properties({ rules: 'not-an-array' as unknown as unknown[] }, 'us-central1');
    expect(result.rules).toEqual([]);
  });

  it('passes description through when a string, drops otherwise', () => {
    const yes = extract_cloud_armor_properties({ description: 'block bad bots' }, 'us-central1');
    expect(yes.description).toBe('block bad bots');

    const no = extract_cloud_armor_properties({ description: 1 as unknown as string }, 'us-central1');
    expect(no.description).toBeUndefined();
  });

  it('always returns labels: {}', () => {
    const result = extract_cloud_armor_properties({ labels: { keep: 'me' } }, 'us-central1');
    expect(result.labels).toEqual({});
  });
});
