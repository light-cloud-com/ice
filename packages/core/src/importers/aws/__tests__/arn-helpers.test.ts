/**
 * Tests for AWS ARN helpers (rf-aimp-1 extraction).
 */

import { describe, it, expect } from 'vitest';
import {
  extract_name_from_arn,
  extract_account_from_arn,
  extract_region_from_arn,
  parse_tags,
} from '../arn-helpers';

describe('extract_name_from_arn', () => {
  it('extracts the trailing /-separated name', () => {
    expect(extract_name_from_arn('arn:aws:ec2:us-east-1:123456789:vpc/vpc-12345678')).toBe(
      'vpc-12345678',
    );
  });

  it('extracts the trailing :-separated name', () => {
    expect(extract_name_from_arn('arn:aws:iam::123456789:user/admin')).toBe('admin');
  });

  it('handles compound resource paths (resource:type:name)', () => {
    expect(extract_name_from_arn('arn:aws:dynamodb:us-east-1:123:table/my-table')).toBe('my-table');
  });

  it('returns the resource portion when no separator is present', () => {
    expect(extract_name_from_arn('arn:aws:s3:::my-bucket')).toBe('my-bucket');
  });

  it('returns the original string when fewer than 6 segments', () => {
    expect(extract_name_from_arn('not-an-arn')).toBe('not-an-arn');
    expect(extract_name_from_arn('arn:partial')).toBe('arn:partial');
  });

  it('returns the resource portion when slash leaves an empty trailing segment', () => {
    // Trailing slash on the resource: split returns ['table', ''], last is '', falls back to resource string
    expect(extract_name_from_arn('arn:aws:s3:us-east-1:123:bucket/')).toBe('bucket/');
  });
});

describe('extract_account_from_arn', () => {
  it('returns the 5th segment as the account id', () => {
    expect(extract_account_from_arn('arn:aws:ec2:us-east-1:123456789:vpc/vpc-1')).toBe(
      '123456789',
    );
  });

  it('returns empty string for an empty account slot', () => {
    expect(extract_account_from_arn('arn:aws:s3:::my-bucket')).toBe('');
  });

  it('returns empty string when ARN is malformed (too few segments)', () => {
    expect(extract_account_from_arn('arn:aws:ec2')).toBe('');
  });
});

describe('extract_region_from_arn', () => {
  it('returns the 4th segment as the region', () => {
    expect(extract_region_from_arn('arn:aws:ec2:us-east-1:123:vpc/vpc-1')).toBe('us-east-1');
  });

  it('defaults to "global" when region slot is empty', () => {
    expect(extract_region_from_arn('arn:aws:iam::123:user/admin')).toBe('global');
  });

  it('returns "global" when ARN is malformed', () => {
    expect(extract_region_from_arn('arn:aws:ec2')).toBe('global');
  });
});

describe('parse_tags', () => {
  it('parses Tags: [{Key, Value}] array form', () => {
    const result = parse_tags({
      Tags: [
        { Key: 'Name', Value: 'web' },
        { Key: 'Env', Value: 'prod' },
      ],
    });
    expect(result).toEqual({ Name: 'web', Env: 'prod' });
  });

  it('parses already-normalised tags: {} object form', () => {
    const result = parse_tags({ tags: { Name: 'web', Env: 'prod' } });
    expect(result).toEqual({ Name: 'web', Env: 'prod' });
  });

  it('coerces non-string Key/Value pairs to strings', () => {
    const result = parse_tags({ Tags: [{ Key: 'count', Value: 42 }] });
    expect(result).toEqual({ count: '42' });
  });

  it('skips array entries lacking Key or Value', () => {
    const result = parse_tags({
      Tags: [
        { Key: 'k1', Value: 'v1' },
        { Key: 'k2' }, // missing Value
        null,
        'string-not-tag',
        { Value: 'orphan' }, // missing Key
      ],
    });
    expect(result).toEqual({ k1: 'v1' });
  });

  it('returns empty object for null input', () => {
    expect(parse_tags(null)).toEqual({});
  });

  it('returns empty object for non-object input', () => {
    expect(parse_tags('a string')).toEqual({});
    expect(parse_tags(42)).toEqual({});
  });

  it('returns empty object when neither Tags nor tags present', () => {
    expect(parse_tags({ other: 'data' })).toEqual({});
  });

  it('prefers Tags array over tags object when both exist', () => {
    const result = parse_tags({
      Tags: [{ Key: 'a', Value: '1' }],
      tags: { b: '2' },
    });
    expect(result).toEqual({ a: '1' });
  });
});
