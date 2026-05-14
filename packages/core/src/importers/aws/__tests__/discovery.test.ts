/**
 * Tests for AWS resource discovery (rf-aimp-3 extraction).
 *
 * The two paginated discover_*() entrypoints begin with a dynamic
 * import of an `@aws-sdk/client-*` module wrapped in
 * `Function('m', 'return import(m)')` — bypassing Vitest's module
 * registry. The working pattern (learnings.md: function-constructor-
 * stub-intercepts-bypass-bundler-imports) is to swap globalThis.Function
 * for the test, returning canned modules whose Command classes are
 * real constructors so `new mod.SearchCommand(...)` works.
 *
 * What's tested:
 *   - The two pure mappers (map_resource_explorer_hit, map_config_result)
 *     which carry the response-shape -> AWSResource conversion logic.
 *   - The dynamic-import failure path on each entrypoint (no SDK).
 *   - Pagination + mapping success path with stubbed Function() (the
 *     do-while loop body that drains NextToken).
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  map_resource_explorer_hit,
  map_config_result,
  discover_with_resource_explorer,
  discover_with_config,
} from '../discovery';
import type { AWSSdk } from '../sdk-init';
import type { AWSImportOptions } from '../types';

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

describe('discover_with_resource_explorer — failure paths', () => {
  it('throws when @aws-sdk/client-resource-explorer-2 is not installed', async () => {
    // The dynamic import is the first await in the function body.
    // Without the SDK installed the import rejects, which propagates.
    await expect(discover_with_resource_explorer(mock_sdk, opts)).rejects.toBeDefined();
  });
});

describe('discover_with_config — failure paths', () => {
  it('throws when @aws-sdk/client-config-service is not installed', async () => {
    await expect(discover_with_config(mock_sdk, opts)).rejects.toBeDefined();
  });
});

// =============================================================================
// Pagination success paths (Function-stub pattern from learnings.md)
// =============================================================================

const originalFunction = globalThis.Function;

function stub_function_with_registry(fakeRegistry: Record<string, unknown>): void {
  const fnStub = function (...args: unknown[]) {
    if (
      args.length === 2 &&
      args[0] === 'm' &&
      typeof args[1] === 'string' &&
      (args[1] as string).includes('return import')
    ) {
      return (spec: string) =>
        spec in fakeRegistry ? Promise.resolve(fakeRegistry[spec]) : Promise.reject(new Error(`miss ${spec}`));
    }
    // @ts-expect-error passthrough to original Function constructor
    return new originalFunction(...args);
  } as unknown as FunctionConstructor;
  fnStub.prototype = originalFunction.prototype;
  globalThis.Function = fnStub;
}

describe('discover_with_resource_explorer — paginated success', () => {
  class FakeSearchCommand {
    input: { QueryString?: string; MaxResults?: number; NextToken?: string };
    constructor(input: { QueryString?: string; MaxResults?: number; NextToken?: string }) {
      this.input = input;
    }
  }

  beforeEach(() => {
    stub_function_with_registry({
      '@aws-sdk/client-resource-explorer-2': { SearchCommand: FakeSearchCommand },
    });
  });

  afterEach(() => {
    globalThis.Function = originalFunction;
  });

  it('drains a single page when NextToken is absent', async () => {
    const send = vi.fn(async () => ({
      Resources: [
        { Arn: 'arn:aws:s3:::a', ResourceType: 'AWS::S3::Bucket', Region: 'us-east-1' },
        { Arn: 'arn:aws:s3:::b', ResourceType: 'AWS::S3::Bucket', Region: 'us-east-1' },
      ],
      NextToken: undefined,
    }));
    const sdk = { ...mock_sdk, ResourceExplorer: { send } };
    const result = await discover_with_resource_explorer(sdk as AWSSdk, opts);
    expect(result).toHaveLength(2);
    expect(result[0]!.arn).toBe('arn:aws:s3:::a');
    expect(send).toHaveBeenCalledTimes(1);
    // First call: NextToken is undefined
    const firstCmd = send.mock.calls[0]![0] as InstanceType<typeof FakeSearchCommand>;
    expect(firstCmd.input.QueryString).toBe('*');
    expect(firstCmd.input.MaxResults).toBe(100);
    expect(firstCmd.input.NextToken).toBeUndefined();
  });

  it('drains multiple pages following NextToken until null', async () => {
    let call = 0;
    const send = vi.fn(async () => {
      call++;
      if (call === 1) {
        return {
          Resources: [{ Arn: 'arn:aws:s3:::a', ResourceType: 'AWS::S3::Bucket', Region: 'us-east-1' }],
          NextToken: 'page2',
        };
      }
      return {
        Resources: [{ Arn: 'arn:aws:s3:::b', ResourceType: 'AWS::S3::Bucket', Region: 'us-east-1' }],
        NextToken: undefined,
      };
    });
    const sdk = { ...mock_sdk, ResourceExplorer: { send } };
    const result = await discover_with_resource_explorer(sdk as AWSSdk, opts);
    expect(result).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
    // Second call: NextToken from page 1
    const secondCmd = send.mock.calls[1]![0] as InstanceType<typeof FakeSearchCommand>;
    expect(secondCmd.input.NextToken).toBe('page2');
  });

  it('returns an empty array when Resources is missing on the response', async () => {
    const send = vi.fn(async () => ({ NextToken: undefined }));
    const sdk = { ...mock_sdk, ResourceExplorer: { send } };
    const result = await discover_with_resource_explorer(sdk as AWSSdk, opts);
    expect(result).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('discover_with_config — paginated success', () => {
  class FakeSelectResourceConfigCommand {
    input: { Expression?: string; Limit?: number; NextToken?: string };
    constructor(input: { Expression?: string; Limit?: number; NextToken?: string }) {
      this.input = input;
    }
  }

  beforeEach(() => {
    stub_function_with_registry({
      '@aws-sdk/client-config-service': { SelectResourceConfigCommand: FakeSelectResourceConfigCommand },
    });
  });

  afterEach(() => {
    globalThis.Function = originalFunction;
  });

  it('drains a single page when NextToken is absent', async () => {
    const send = vi.fn(async () => ({
      Results: [
        JSON.stringify({
          arn: 'arn:aws:s3:::a',
          resourceId: 'a',
          resourceType: 'AWS::S3::Bucket',
          configuration: { foo: 'bar' },
        }),
      ],
      NextToken: undefined,
    }));
    const sdk = { ...mock_sdk, ConfigService: { send } };
    const result = await discover_with_config(sdk as AWSSdk, opts);
    expect(result).toHaveLength(1);
    expect(result[0]!.arn).toBe('arn:aws:s3:::a');
    expect(result[0]!.properties).toEqual({ foo: 'bar' });
    const firstCmd = send.mock.calls[0]![0] as InstanceType<typeof FakeSelectResourceConfigCommand>;
    expect(firstCmd.input.Expression).toContain('SELECT');
    expect(firstCmd.input.Limit).toBe(100);
  });

  it('drains multiple pages following NextToken until null', async () => {
    let call = 0;
    const send = vi.fn(async () => {
      call++;
      if (call === 1) {
        return {
          Results: [JSON.stringify({ arn: 'arn:aws:s3:::a', resourceType: 'AWS::S3::Bucket' })],
          NextToken: 'cursor',
        };
      }
      return {
        Results: [JSON.stringify({ arn: 'arn:aws:s3:::b', resourceType: 'AWS::S3::Bucket' })],
        NextToken: undefined,
      };
    });
    const sdk = { ...mock_sdk, ConfigService: { send } };
    const result = await discover_with_config(sdk as AWSSdk, opts);
    expect(result).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
    const secondCmd = send.mock.calls[1]![0] as InstanceType<typeof FakeSelectResourceConfigCommand>;
    expect(secondCmd.input.NextToken).toBe('cursor');
  });

  it('skips entries whose JSON.parse returns null (malformed Config rows)', async () => {
    const send = vi.fn(async () => ({
      Results: [
        'not-json',
        JSON.stringify({ arn: 'arn:aws:s3:::ok', resourceType: 'AWS::S3::Bucket' }),
      ],
      NextToken: undefined,
    }));
    const sdk = { ...mock_sdk, ConfigService: { send } };
    const result = await discover_with_config(sdk as AWSSdk, opts);
    expect(result).toHaveLength(1);
    expect(result[0]!.arn).toBe('arn:aws:s3:::ok');
  });

  it('returns an empty array when Results is missing on the response', async () => {
    const send = vi.fn(async () => ({ NextToken: undefined }));
    const sdk = { ...mock_sdk, ConfigService: { send } };
    const result = await discover_with_config(sdk as AWSSdk, opts);
    expect(result).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
