/**
 * Tests for `type-mapper/parse.ts` (rf-pmap-2).
 *
 * Pure-function URN/type parsers, hit 100% with input/output pinning.
 * Behaviour preserved verbatim from pre-extraction L19-86 of
 * `type-mapper.ts`.
 */
import { describe, expect, it } from 'vitest';
import { parse_type, parse_urn } from '../parse';

describe('parse_urn', () => {
  it('parses a standard URN', () => {
    const urn = 'urn:pulumi:dev::myproject::aws:s3/bucket:Bucket::my-bucket';
    const result = parse_urn(urn);
    expect(result).toMatchObject({
      stack: 'dev',
      project: 'myproject',
      type: 'aws:s3/bucket:Bucket',
      name: 'my-bucket',
      provider: 'aws',
      module: 's3',
      resource_type: 'bucket',
      resource_class: 'Bucket',
    });
  });

  it('returns null for non-URN input', () => {
    expect(parse_urn('not-a-urn')).toBeNull();
    expect(parse_urn('aws:s3/bucket:Bucket')).toBeNull();
  });

  it('returns null for malformed URN with wrong part count', () => {
    expect(parse_urn('urn:pulumi:dev::myproject::aws:s3/bucket:Bucket')).toBeNull();
    expect(parse_urn('urn:pulumi:dev::myproject')).toBeNull();
  });

  it('returns null when any part is empty', () => {
    expect(parse_urn('urn:pulumi:::myproject::aws:s3/bucket:Bucket::name')).toBeNull();
    expect(parse_urn('urn:pulumi:dev::::aws:s3/bucket:Bucket::name')).toBeNull();
  });

  it('parses URN with stack resource type', () => {
    const urn = 'urn:pulumi:dev::myproject::pulumi:pulumi:Stack::myproject-dev';
    const result = parse_urn(urn);
    expect(result).toMatchObject({
      stack: 'dev',
      project: 'myproject',
      type: 'pulumi:pulumi:Stack',
      name: 'myproject-dev',
      provider: 'pulumi',
      module: 'pulumi',
      resource_class: 'Stack',
    });
  });

  it('parses URN with provider resource type', () => {
    const urn = 'urn:pulumi:dev::myproject::pulumi:providers:aws::default';
    const result = parse_urn(urn);
    expect(result).toMatchObject({
      stack: 'dev',
      project: 'myproject',
      type: 'pulumi:providers:aws',
      name: 'default',
      provider: 'pulumi',
      module: 'providers',
      resource_class: 'aws',
    });
  });
});

describe('parse_type', () => {
  describe('special types', () => {
    it('handles pulumi:pulumi:Stack', () => {
      expect(parse_type('pulumi:pulumi:Stack')).toEqual({
        provider: 'pulumi',
        module: 'pulumi',
        resource_class: 'Stack',
      });
    });

    it('handles pulumi:providers:* with provider name', () => {
      expect(parse_type('pulumi:providers:aws')).toEqual({
        provider: 'pulumi',
        module: 'providers',
        resource_class: 'aws',
      });
      expect(parse_type('pulumi:providers:gcp')).toEqual({
        provider: 'pulumi',
        module: 'providers',
        resource_class: 'gcp',
      });
    });
  });

  describe('standard format', () => {
    it('parses provider:module/resource:Class', () => {
      expect(parse_type('aws:s3/bucket:Bucket')).toEqual({
        provider: 'aws',
        module: 's3',
        resource_type: 'bucket',
        resource_class: 'Bucket',
      });
    });

    it('parses azure-native standard form', () => {
      expect(parse_type('azure:compute/virtualMachine:VirtualMachine')).toEqual({
        provider: 'azure',
        module: 'compute',
        resource_type: 'virtualMachine',
        resource_class: 'VirtualMachine',
      });
    });

    it('parses kubernetes core types', () => {
      expect(parse_type('kubernetes:core/v1:Service')).toEqual({
        provider: 'kubernetes',
        module: 'core',
        resource_type: 'v1',
        resource_class: 'Service',
      });
    });
  });

  describe('alternative format', () => {
    it('parses provider:module:Class (no resource segment)', () => {
      expect(parse_type('azure-native:compute:VirtualMachine')).toEqual({
        provider: 'azure-native',
        module: 'compute',
        resource_class: 'VirtualMachine',
      });
    });
  });

  describe('no match', () => {
    it('returns empty object for malformed input', () => {
      expect(parse_type('foo')).toEqual({});
      expect(parse_type('')).toEqual({});
    });

    it('returns empty object for single-segment input', () => {
      expect(parse_type('foo:')).toEqual({});
    });
  });

  describe('regex priority order', () => {
    it('standard format takes priority over alternative', () => {
      // `aws:s3/bucket:Bucket` matches BOTH the standard regex
      // (provider:module/resource:Class) AND the alternative
      // (provider:module:Class with module=`s3/bucket`). Standard
      // is tried first and wins; the alternative would yield
      // module=`s3/bucket`, but we get module=`s3`.
      expect(parse_type('aws:s3/bucket:Bucket').module).toBe('s3');
      expect(parse_type('aws:s3/bucket:Bucket').resource_type).toBe('bucket');
    });
  });
});
