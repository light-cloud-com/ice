/**
 * Tests for the cloud-native service-name registry. The lookup is an
 * (iceType, provider) → string indirection with a defaulting rule when the
 * caller omits / nulls the provider. Each test below pins one slice of that
 * matrix so a future schema bump can't silently swap "Cloud Run" for "Cloud
 * Functions" on a happy-path block card.
 */

import { describe, it, expect } from 'vitest';

import { getServiceName } from '../service-names';

describe('getServiceName — happy path lookups', () => {
  it('resolves Compute.Container per provider', () => {
    expect(getServiceName('Compute.Container', 'aws')).toBe('Amazon ECS');
    expect(getServiceName('Compute.Container', 'gcp')).toBe('Cloud Run');
    expect(getServiceName('Compute.Container', 'azure')).toBe('Azure Container Apps');
    expect(getServiceName('Compute.Container', 'kubernetes')).toBe('Kubernetes Deployment');
    expect(getServiceName('Compute.Container', 'alibaba')).toBe('Alibaba ECI');
    expect(getServiceName('Compute.Container', 'oci')).toBe('OCI Container Instances');
    expect(getServiceName('Compute.Container', 'digitalocean')).toBe('DO App Platform');
  });

  it('resolves Database.PostgreSQL per provider', () => {
    expect(getServiceName('Database.PostgreSQL', 'aws')).toBe('Amazon RDS');
    expect(getServiceName('Database.PostgreSQL', 'gcp')).toBe('Cloud SQL');
    expect(getServiceName('Database.PostgreSQL', 'azure')).toBe('Azure Database for PostgreSQL');
    expect(getServiceName('Database.PostgreSQL', 'digitalocean')).toBe('DO Managed Database');
  });

  it('resolves singleton-provider entries (Aurora is AWS-only)', () => {
    expect(getServiceName('Database.Aurora', 'aws')).toBe('Amazon Aurora');
    expect(getServiceName('Database.Aurora', 'gcp')).toBeNull();
  });

  it('resolves Source.Repository per VCS provider', () => {
    expect(getServiceName('Source.Repository', 'github')).toBe('GitHub');
    expect(getServiceName('Source.Repository', 'gitlab')).toBe('GitLab');
    expect(getServiceName('Source.Repository', 'bitbucket')).toBe('Bitbucket');
  });

  it('resolves CDN, LoadBalancer, and Cloudflare-only providers', () => {
    expect(getServiceName('Network.CDN', 'cloudflare')).toBe('Cloudflare CDN');
    expect(getServiceName('Network.LoadBalancer', 'aws')).toBe('Elastic Load Balancer');
    expect(getServiceName('Compute.StaticSite', 'cloudflare')).toBe('Cloudflare Pages');
  });

  it('resolves AI.* mappings', () => {
    expect(getServiceName('AI.LLMGateway', 'aws')).toBe('Amazon Bedrock');
    expect(getServiceName('AI.MLModel', 'gcp')).toBe('Vertex AI');
    expect(getServiceName('AI.VectorDB', 'azure')).toBe('Azure Cognitive Search');
  });
});

describe('getServiceName — provider normalization', () => {
  it('lowercases the provider before lookup', () => {
    expect(getServiceName('Compute.Container', 'AWS')).toBe('Amazon ECS');
    expect(getServiceName('Compute.Container', 'GCP')).toBe('Cloud Run');
    expect(getServiceName('Compute.Container', 'Azure')).toBe('Azure Container Apps');
  });

  it("falls back to 'aws' when provider is empty string", () => {
    // Falsy provider triggers the `provider?.toLowerCase() || 'aws'` default.
    expect(getServiceName('Compute.Container', '')).toBe('Amazon ECS');
  });

  it("falls back to 'aws' when provider is undefined-cast", () => {
    expect(getServiceName('Compute.Container', undefined as unknown as string)).toBe('Amazon ECS');
  });

  it("falls back to 'aws' when provider is null-cast", () => {
    expect(getServiceName('Compute.Container', null as unknown as string)).toBe('Amazon ECS');
  });
});

describe('getServiceName — negative path', () => {
  it('returns null for an unknown iceType', () => {
    expect(getServiceName('Unknown.Service', 'aws')).toBeNull();
    expect(getServiceName('', 'aws')).toBeNull();
  });

  it('returns null for a known iceType with an unsupported provider', () => {
    // Database.DynamoDB only has an `aws` entry — gcp lookup returns null
    // (the iceType is in the registry but the provider key is not).
    expect(getServiceName('Database.DynamoDB', 'gcp')).toBeNull();
    expect(getServiceName('Storage.S3', 'gcp')).toBeNull();
    expect(getServiceName('Compute.SSRSite', 'kubernetes')).toBeNull();
  });
});
