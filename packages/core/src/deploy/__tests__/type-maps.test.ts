/**
 * Tests for `type-maps.ts` — provider iceType→deployer-type maps + dispatcher.
 *
 * Covers:
 *   - Each Record<string, string> map: entry counts + sample mappings.
 *   - Cross-map disjointness: when an iceType key appears in two maps,
 *     the resolved values are provider-prefixed and never collide.
 *   - `DESIGN_ONLY_PROVIDERS` membership.
 *   - `get_type_map` reference equality for the three known providers and
 *     the default branch (any other value → empty object, NOT a fall-through
 *     to GCP). The default returns `{}` per the original switch statement.
 */
import { describe, it, expect } from 'vitest';
import {
  GCP_TYPE_MAP,
  AWS_TYPE_MAP,
  AZURE_TYPE_MAP,
  DESIGN_ONLY_PROVIDERS,
  get_type_map,
} from '../type-maps';
import type { DeployProvider } from '../card-translator';

describe('GCP_TYPE_MAP', () => {
  it('exposes 32 iceType entries', () => {
    expect(Object.keys(GCP_TYPE_MAP)).toHaveLength(32);
  });

  it('maps Compute.StaticSite → gcp.firebase.hosting (Firebase Hosting choice)', () => {
    expect(GCP_TYPE_MAP['Compute.StaticSite']).toBe('gcp.firebase.hosting');
  });

  it('maps Network.PublicEndpoint → gcp.compute.globalForwardingRule', () => {
    expect(GCP_TYPE_MAP['Network.PublicEndpoint']).toBe('gcp.compute.globalForwardingRule');
  });

  it('maps Storage.Bucket → gcp.storage.bucket', () => {
    expect(GCP_TYPE_MAP['Storage.Bucket']).toBe('gcp.storage.bucket');
  });

  it('maps Database.Redis → gcp.redis.instance', () => {
    expect(GCP_TYPE_MAP['Database.Redis']).toBe('gcp.redis.instance');
  });

  it('every value is a non-empty string with a `gcp.` prefix', () => {
    for (const [iceType, resourceType] of Object.entries(GCP_TYPE_MAP)) {
      expect(resourceType, iceType).toMatch(/^gcp\.[a-zA-Z]+\.[a-zA-Z]+$/);
    }
  });
});

describe('AWS_TYPE_MAP', () => {
  it('exposes 27 iceType entries', () => {
    expect(Object.keys(AWS_TYPE_MAP)).toHaveLength(27);
  });

  it('maps Compute.Container → aws.ecs.service', () => {
    expect(AWS_TYPE_MAP['Compute.Container']).toBe('aws.ecs.service');
  });

  it('maps Compute.ServerlessFunction → aws.lambda.function', () => {
    expect(AWS_TYPE_MAP['Compute.ServerlessFunction']).toBe('aws.lambda.function');
  });

  it('maps Storage.Bucket → aws.s3.bucket', () => {
    expect(AWS_TYPE_MAP['Storage.Bucket']).toBe('aws.s3.bucket');
  });

  it('every value is a non-empty string with an `aws.` prefix', () => {
    for (const [iceType, resourceType] of Object.entries(AWS_TYPE_MAP)) {
      expect(resourceType, iceType).toMatch(/^aws\.[a-zA-Z0-9]+\.[a-zA-Z]+$/);
    }
  });
});

describe('AZURE_TYPE_MAP', () => {
  it('exposes 26 iceType entries', () => {
    expect(Object.keys(AZURE_TYPE_MAP)).toHaveLength(26);
  });

  it('maps Storage.Bucket → azure.storage.storageAccount', () => {
    expect(AZURE_TYPE_MAP['Storage.Bucket']).toBe('azure.storage.storageAccount');
  });

  it('maps Compute.Container → azure.containerapp.containerApp', () => {
    expect(AZURE_TYPE_MAP['Compute.Container']).toBe('azure.containerapp.containerApp');
  });

  it('maps Database.Redis → azure.cache.redis', () => {
    expect(AZURE_TYPE_MAP['Database.Redis']).toBe('azure.cache.redis');
  });

  it('every value is a non-empty string with an `azure.` prefix', () => {
    for (const [iceType, resourceType] of Object.entries(AZURE_TYPE_MAP)) {
      expect(resourceType, iceType).toMatch(/^azure\.[a-zA-Z]+\.[a-zA-Z]+$/);
    }
  });
});

describe('cross-map disjointness — same iceType across providers maps to provider-prefixed values', () => {
  it('Compute.Container resolves to a different value per provider', () => {
    const gcp = GCP_TYPE_MAP['Compute.Container'];
    const aws = AWS_TYPE_MAP['Compute.Container'];
    const azure = AZURE_TYPE_MAP['Compute.Container'];
    expect(gcp).toBe('gcp.run.service');
    expect(aws).toBe('aws.ecs.service');
    expect(azure).toBe('azure.containerapp.containerApp');
    expect(new Set([gcp, aws, azure]).size).toBe(3);
  });

  it('Storage.Bucket resolves to a different value per provider', () => {
    const gcp = GCP_TYPE_MAP['Storage.Bucket'];
    const aws = AWS_TYPE_MAP['Storage.Bucket'];
    const azure = AZURE_TYPE_MAP['Storage.Bucket'];
    expect(gcp).toBe('gcp.storage.bucket');
    expect(aws).toBe('aws.s3.bucket');
    expect(azure).toBe('azure.storage.storageAccount');
    expect(new Set([gcp, aws, azure]).size).toBe(3);
  });

  it('Database.PostgreSQL resolves to a different value per provider', () => {
    const gcp = GCP_TYPE_MAP['Database.PostgreSQL'];
    const aws = AWS_TYPE_MAP['Database.PostgreSQL'];
    const azure = AZURE_TYPE_MAP['Database.PostgreSQL'];
    expect(gcp).toBe('gcp.sql.databaseInstance');
    expect(aws).toBe('aws.rds.dbInstance');
    expect(azure).toBe('azure.dbforpostgresql.server');
    expect(new Set([gcp, aws, azure]).size).toBe(3);
  });
});

describe('DESIGN_ONLY_PROVIDERS', () => {
  it('contains exactly 3 entries', () => {
    expect(DESIGN_ONLY_PROVIDERS.size).toBe(3);
  });

  it('lists alibaba, digitalocean, and kubernetes', () => {
    expect([...DESIGN_ONLY_PROVIDERS].sort()).toEqual([
      'alibaba',
      'digitalocean',
      'kubernetes',
    ]);
  });

  it('has(alibaba) → true', () => {
    expect(DESIGN_ONLY_PROVIDERS.has('alibaba')).toBe(true);
  });

  it('has(digitalocean) → true', () => {
    expect(DESIGN_ONLY_PROVIDERS.has('digitalocean')).toBe(true);
  });

  it('has(kubernetes) → true', () => {
    expect(DESIGN_ONLY_PROVIDERS.has('kubernetes')).toBe(true);
  });

  it('has(gcp) → false (real deployer-supported provider)', () => {
    expect(DESIGN_ONLY_PROVIDERS.has('gcp')).toBe(false);
  });

  it('has(aws) → false (real deployer-supported provider)', () => {
    expect(DESIGN_ONLY_PROVIDERS.has('aws')).toBe(false);
  });

  it('has(azure) → false (real deployer-supported provider)', () => {
    expect(DESIGN_ONLY_PROVIDERS.has('azure')).toBe(false);
  });
});

describe('get_type_map', () => {
  it('"gcp" → returns GCP_TYPE_MAP by reference', () => {
    expect(get_type_map('gcp')).toBe(GCP_TYPE_MAP);
  });

  it('"aws" → returns AWS_TYPE_MAP by reference', () => {
    expect(get_type_map('aws')).toBe(AWS_TYPE_MAP);
  });

  it('"azure" → returns AZURE_TYPE_MAP by reference', () => {
    expect(get_type_map('azure')).toBe(AZURE_TYPE_MAP);
  });

  it('default branch returns an empty object (not a reference to any provider map)', () => {
    // Cast through unknown to exercise the default branch — DeployProvider
    // is a closed union at the type level, but the runtime switch has a
    // `default: return {}` arm that protects against unexpected values
    // (e.g. a future provider added to the union without a map).
    const unknownProvider = 'oracle' as unknown as DeployProvider;
    const result = get_type_map(unknownProvider);
    expect(result).toEqual({});
    expect(result).not.toBe(GCP_TYPE_MAP);
    expect(result).not.toBe(AWS_TYPE_MAP);
    expect(result).not.toBe(AZURE_TYPE_MAP);
  });
});
