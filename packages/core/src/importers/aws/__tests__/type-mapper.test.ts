/**
 * Tests for the AWS type mapper.
 *
 * The TYPE_MAP table is large but the mapping logic is shallow — get_ice_type
 * either hits the table, falls back to a synthesized aws.<service>.<resource>
 * shape, or hits the unknown-format guard. is_type_supported and
 * get_supported_types delegate to the same map. map_properties does case
 * conversion on every key.
 */

import { describe, it, expect } from 'vitest';
import { get_ice_type, is_type_supported, get_supported_types, map_properties } from '../type-mapper.js';

describe('get_ice_type', () => {
  it('returns the mapped ICE type for a known AWS type', () => {
    expect(get_ice_type('AWS::EC2::Instance')).toBe('aws.ec2.instance');
  });

  it('lowercases the input before lookup', () => {
    expect(get_ice_type('AWS::EC2::VPC')).toBe('aws.ec2.vpc');
    expect(get_ice_type('aws::ec2::vpc')).toBe('aws.ec2.vpc');
    expect(get_ice_type('Aws::Ec2::Vpc')).toBe('aws.ec2.vpc');
  });

  it('returns the security_group mapping for AWS::EC2::SecurityGroup', () => {
    expect(get_ice_type('AWS::EC2::SecurityGroup')).toBe('aws.ec2.security_group');
  });

  it('returns the rds.instance mapping for AWS::RDS::DBInstance', () => {
    expect(get_ice_type('AWS::RDS::DBInstance')).toBe('aws.rds.instance');
  });

  it('returns the s3.bucket mapping for AWS::S3::Bucket', () => {
    expect(get_ice_type('AWS::S3::Bucket')).toBe('aws.s3.bucket');
  });

  it('returns lambda.function for AWS::Lambda::Function', () => {
    expect(get_ice_type('AWS::Lambda::Function')).toBe('aws.lambda.function');
  });

  it('returns iam.role for AWS::IAM::Role', () => {
    expect(get_ice_type('AWS::IAM::Role')).toBe('aws.iam.role');
  });

  it('returns elb.load_balancer for AWS::ElasticLoadBalancingV2::LoadBalancer', () => {
    expect(get_ice_type('AWS::ElasticLoadBalancingV2::LoadBalancer')).toBe('aws.elb.load_balancer');
  });

  it('synthesizes a fallback for an unmapped AWS::Service::Resource shape', () => {
    expect(get_ice_type('AWS::Foo::Bar')).toBe('aws.foo.bar');
  });

  it('joins multi-segment resource names with underscores in fallback', () => {
    // After lowercase + replace('aws::','') + split('::'), >2 segments join with '_'
    expect(get_ice_type('AWS::Foo::Bar::Baz')).toBe('aws.foo.bar_baz');
  });

  it('returns the unknown-format fallback for a single-segment input', () => {
    expect(get_ice_type('weirdformat')).toBe('aws.unknown.weirdformat');
  });

  it('returns the unknown-format fallback for an empty string', () => {
    expect(get_ice_type('')).toBe('aws.unknown.');
  });

  it('preserves :: in the unknown fallback by replacing with _', () => {
    // Single segment that starts with aws:: (lowercased then replaced) — actually
    // 'aws::foo' lowercased becomes 'aws::foo' which after replace('aws::','')
    // becomes 'foo', length 1, so unknown branch. The replace(/::/g, '_') still runs.
    // For a string with :: that isn't aws::, the replace strips them.
    expect(get_ice_type('not_aws::single')).toBe('aws.unknown.not_aws_single');
  });
});

describe('is_type_supported', () => {
  it('returns true for an explicitly mapped type', () => {
    expect(is_type_supported('AWS::EC2::Instance')).toBe(true);
  });

  it('returns false for an unmapped type', () => {
    expect(is_type_supported('AWS::Foo::Bar')).toBe(false);
  });

  it('lowercases the input before checking the table', () => {
    expect(is_type_supported('aws::s3::bucket')).toBe(true);
    expect(is_type_supported('AWS::S3::Bucket')).toBe(true);
  });

  it('returns false for the empty string', () => {
    expect(is_type_supported('')).toBe(false);
  });
});

describe('get_supported_types', () => {
  it('returns all keys of the TYPE_MAP', () => {
    const types = get_supported_types();
    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain('aws::ec2::instance');
    expect(types).toContain('aws::s3::bucket');
  });

  it('returns lowercased canonical keys', () => {
    const types = get_supported_types();
    for (const t of types) {
      expect(t).toBe(t.toLowerCase());
    }
  });
});

describe('map_properties', () => {
  it('converts PascalCase keys to snake_case', () => {
    const result = map_properties('AWS::EC2::Instance', {
      InstanceId: 'i-123',
      VpcId: 'vpc-456',
    });
    expect(result).toEqual({
      instance_id: 'i-123',
      vpc_id: 'vpc-456',
    });
  });

  it('converts camelCase keys to snake_case', () => {
    const result = map_properties('AWS::EC2::Instance', {
      vpcId: 'vpc-1',
      cidrBlock: '10.0.0.0/16',
    });
    expect(result).toEqual({
      vpc_id: 'vpc-1',
      cidr_block: '10.0.0.0/16',
    });
  });

  it('preserves already-snake_case keys', () => {
    const result = map_properties('AWS::S3::Bucket', {
      bucket_name: 'my-bucket',
    });
    expect(result).toEqual({ bucket_name: 'my-bucket' });
  });

  it('passes values through unchanged regardless of type', () => {
    const result = map_properties('AWS::S3::Bucket', {
      Name: 'my-bucket',
      Versioning: { enabled: true },
      Tags: [{ Key: 'Env', Value: 'prod' }],
    });
    expect(result).toEqual({
      name: 'my-bucket',
      versioning: { enabled: true },
      tags: [{ Key: 'Env', Value: 'prod' }],
    });
  });

  it('returns an empty object for empty input', () => {
    expect(map_properties('AWS::EC2::Instance', {})).toEqual({});
  });

  it('strips a leading underscore from keys that start with a capital letter', () => {
    // `Name` -> `_name` -> `name` (leading _ stripped)
    const result = map_properties('AWS::S3::Bucket', { Name: 'x' });
    expect(result.name).toBe('x');
    expect(result._name).toBeUndefined();
  });

  it('handles multiple consecutive capitals as separate underscores', () => {
    // 'IPAddress' -> '_i_p_address' -> 'i_p_address' (leading _ stripped)
    const result = map_properties('AWS::EC2::Instance', { IPAddress: '1.2.3.4' });
    expect(result).toEqual({ i_p_address: '1.2.3.4' });
  });

  it('ignores the aws_type argument (only uses keys)', () => {
    // The first argument is documented but the implementation ignores it.
    const a = map_properties('AWS::EC2::Instance', { Name: 'x' });
    const b = map_properties('AWS::S3::Bucket', { Name: 'x' });
    expect(a).toEqual(b);
  });
});
