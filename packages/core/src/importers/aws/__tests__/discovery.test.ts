/**
 * Tests for AWS resource discovery (rf-aimp-3 extraction).
 *
 * The two paginated discover_*() entrypoints begin with a dynamic
 * import of an `@aws-sdk/client-*` module, which can't be intercepted
 * in tests because the import is wrapped in `Function('m', 'return
 * import(m)')` — the runtime call-site bypasses any Vitest module
 * registry.  We exercise:
 *
 *   - The two pure mappers (map_resource_explorer_hit, map_config_result)
 *     which carry the response-shape -> AWSResource conversion logic.
 *   - The dynamic-import failure path on each entrypoint.
 */

import { describe, it, expect } from 'vitest';
import {
  map_resource_explorer_hit,
  map_config_result,
  discover_with_resource_explorer,
  discover_with_config,
} from '../discovery.js';
import type { AWSSdk } from '../sdk-init.js';
import type { AWSImportOptions } from '../types.js';

const mock_sdk: AWSSdk = {
  STS: {},
  ResourceExplorer: { send: async () => ({ Resources: [] }) },
  ConfigService: { send: async () => ({ Results: [] }) },
};

const opts: Required<Omit<AWSImportOptions, 'profile'>> = {
  regions: [],
  services: ['all'],
  filter_types: [],
  exclude_types: [],
  filter_tags: {},
  infer_dependencies: true,
};

describe('map_resource_explorer_hit', () => {
  it('maps a typical Resource Explorer hit', () => {
    const result = map_resource_explorer_hit({
      Arn: 'arn:aws:ec2:us-east-1:123456789:vpc/vpc-1',
      ResourceType: 'AWS::EC2::VPC',
      Region: 'us-east-1',
      Properties: { Tags: [{ Key: 'Name', Value: 'web' }] },
    });
    expect(result).toEqual({
      arn: 'arn:aws:ec2:us-east-1:123456789:vpc/vpc-1',
      name: 'vpc-1',
      resource_type: 'AWS::EC2::VPC',
      region: 'us-east-1',
      account_id: '123456789',
      properties: { Tags: [{ Key: 'Name', Value: 'web' }] },
      tags: { Name: 'web' },
    });
  });

  it('defaults region to "global" when Region missing', () => {
    const result = map_resource_explorer_hit({
      Arn: 'arn:aws:iam::123:user/admin',
      ResourceType: 'AWS::IAM::User',
    });
    expect(result.region).toBe('global');
  });

  it('uses empty string for missing arn / resource_type', () => {
    const result = map_resource_explorer_hit({});
    expect(result.arn).toBe('');
    expect(result.resource_type).toBe('');
    expect(result.account_id).toBe('');
    expect(result.region).toBe('global');
    expect(result.properties).toEqual({});
    expect(result.tags).toEqual({});
  });

  it('extracts name from ARN trailing segment', () => {
    const result = map_resource_explorer_hit({
      Arn: 'arn:aws:s3:::my-bucket',
    });
    expect(result.name).toBe('my-bucket');
  });
});

describe('map_config_result', () => {
  it('parses a typical Config result', () => {
    const json = JSON.stringify({
      arn: 'arn:aws:rds:us-east-1:123:db:mydb',
      resourceId: 'mydb',
      resourceType: 'AWS::RDS::DBInstance',
      configuration: { engine: 'postgres' },
      tags: { Env: 'prod' },
    });
    const result = map_config_result(json);
    expect(result).toEqual({
      arn: 'arn:aws:rds:us-east-1:123:db:mydb',
      name: 'mydb',
      resource_type: 'AWS::RDS::DBInstance',
      region: 'us-east-1',
      account_id: '123',
      properties: { engine: 'postgres' },
      tags: { Env: 'prod' },
    });
  });

  it('falls back to extract_name_from_arn when resourceId missing', () => {
    const json = JSON.stringify({
      arn: 'arn:aws:s3:::my-bucket',
      resourceType: 'AWS::S3::Bucket',
    });
    const result = map_config_result(json);
    expect(result?.name).toBe('my-bucket');
  });

  it('returns null for malformed JSON', () => {
    expect(map_config_result('not-json')).toBeNull();
    expect(map_config_result('{')).toBeNull();
  });

  it('uses defaults when fields are missing', () => {
    const result = map_config_result('{}');
    expect(result).toEqual({
      arn: '',
      name: '',
      resource_type: '',
      region: 'global',
      account_id: '',
      properties: {},
      tags: {},
    });
  });
});

describe('discover_with_resource_explorer', () => {
  it('throws when @aws-sdk/client-resource-explorer-2 is not installed', async () => {
    // The dynamic import is the first await in the function body.
    // Without the SDK installed the import rejects, which propagates.
    await expect(discover_with_resource_explorer(mock_sdk, opts)).rejects.toBeDefined();
  });
});

describe('discover_with_config', () => {
  it('throws when @aws-sdk/client-config-service is not installed', async () => {
    await expect(discover_with_config(mock_sdk, opts)).rejects.toBeDefined();
  });
});
