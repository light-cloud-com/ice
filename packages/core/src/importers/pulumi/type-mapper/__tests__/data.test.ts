/**
 * Tests for `type-mapper/data.ts` (rf-pmap-1).
 *
 * Data-table integrity guards. The lookup tables are the source
 * of truth for ICE iceType names; ANY change is a behaviour
 * change for every external consumer.
 */
import { describe, expect, it } from 'vitest';
import { PROVIDER_MAP, TYPE_MAP } from '../data.js';

describe('PROVIDER_MAP', () => {
  it('exports a non-empty record', () => {
    expect(Object.keys(PROVIDER_MAP).length).toBeGreaterThan(0);
  });

  it('collapses aws-native into aws', () => {
    expect(PROVIDER_MAP['aws-native']).toBe('aws');
    expect(PROVIDER_MAP['aws']).toBe('aws');
  });

  it('collapses azure-native into azure', () => {
    expect(PROVIDER_MAP['azure-native']).toBe('azure');
    expect(PROVIDER_MAP['azure']).toBe('azure');
  });

  it('collapses google-native into gcp', () => {
    expect(PROVIDER_MAP['google-native']).toBe('gcp');
    expect(PROVIDER_MAP['gcp']).toBe('gcp');
  });

  it('contains kubernetes', () => {
    expect(PROVIDER_MAP['kubernetes']).toBe('kubernetes');
  });

  it('contains all 24 expected providers (regression guard)', () => {
    // Pinning the count guards against accidental additions/removals.
    expect(Object.keys(PROVIDER_MAP).length).toBe(24);
  });
});

describe('TYPE_MAP', () => {
  it('exports a non-empty record', () => {
    expect(Object.keys(TYPE_MAP).length).toBeGreaterThan(100);
  });

  it('contains AWS EC2 instance mapping', () => {
    expect(TYPE_MAP['aws:ec2/instance:Instance']).toBe('aws.ec2.instance');
  });

  it('contains AWS S3 bucket variants both mapping to same ICE type', () => {
    // Two Pulumi forms collapse to one ICE iceType.
    expect(TYPE_MAP['aws:s3/bucket:Bucket']).toBe('aws.s3.bucket');
    expect(TYPE_MAP['aws:s3/bucketV2:BucketV2']).toBe('aws.s3.bucket');
  });

  it('contains AWS load balancer aliased forms (lb and alb)', () => {
    expect(TYPE_MAP['aws:lb/loadBalancer:LoadBalancer']).toBe('aws.elb.load_balancer');
    expect(TYPE_MAP['aws:alb/loadBalancer:LoadBalancer']).toBe('aws.elb.load_balancer');
  });

  it('contains Azure compute virtual machine (both classic and azure-native)', () => {
    expect(TYPE_MAP['azure:compute/virtualMachine:VirtualMachine']).toBe(
      'azure.compute.virtual_machine',
    );
    expect(TYPE_MAP['azure-native:compute:VirtualMachine']).toBe('azure.compute.virtual_machine');
  });

  it('contains GCP compute instance', () => {
    expect(TYPE_MAP['gcp:compute/instance:Instance']).toBe('gcp.compute.instance');
  });

  it('contains GCP GKE cluster', () => {
    expect(TYPE_MAP['gcp:container/cluster:Cluster']).toBe('gcp.gke.cluster');
  });

  it('contains Kubernetes core types', () => {
    expect(TYPE_MAP['kubernetes:core/v1:Service']).toBe('kubernetes.core.service');
    expect(TYPE_MAP['kubernetes:apps/v1:Deployment']).toBe('kubernetes.apps.deployment');
  });

  it('contains AWS s3 bucketObject mapped to aws.s3.object', () => {
    // Both bucketObject and bucketObjectv2 collapse to the same ICE type.
    expect(TYPE_MAP['aws:s3/bucketObject:BucketObject']).toBe('aws.s3.object');
    expect(TYPE_MAP['aws:s3/bucketObjectv2:BucketObjectv2']).toBe('aws.s3.object');
  });

  it('all values are lowercase ICE-format types', () => {
    // ICE iceTypes are lowercase dotted; pin the format.
    for (const v of Object.values(TYPE_MAP)) {
      expect(v).toBe(v.toLowerCase());
      expect(v).toMatch(/^[a-z][a-z0-9_.]*$/);
    }
  });
});
