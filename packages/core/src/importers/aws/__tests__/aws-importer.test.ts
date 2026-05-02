/**
 * Tests for `aws-importer.ts` (rf-aimp).
 *
 * The orchestrator pulls from four collaborator modules: `sdk-init`,
 * `discovery`, `type-mapper`, and `graph-conversion`. Each is mocked
 * via a `vi.hoisted` bag so the tests can control the (region,
 * resource, error) shape returned to the orchestrator without
 * touching the AWS SDK.
 *
 * Branches covered:
 *  - `services.includes('all')` true vs false (early-skip path)
 *  - SDK init failure -> outer catch -> classified error in `errors`
 *  - get_account_id is called; result populates `metadata.account_id`
 *  - Resource Explorer success -> resources accumulate, services_scanned
 *  - Resource Explorer failure (RESOURCE_EXPLORER_NOT_ENABLED) ->
 *    fallback to Config; both errors and warnings populate
 *  - Config also fails -> additional error pushed
 *  - Auth-class error from Resource Explorer -> surfaced as error,
 *    no fallback
 *  - Other Resource Explorer error -> rethrown to outer catch
 *  - filter_types includes the ICE type -> resource kept
 *  - filter_types excludes the ICE type -> resource filtered out
 *  - exclude_types matches -> resource filtered out
 *  - filter_tags match -> resource kept
 *  - filter_tags mismatch -> resource filtered out
 *  - infer_dependencies true -> infer_relationships called
 *  - infer_dependencies false -> infer_relationships NOT called
 *  - regions_scanned dedupe across resources in same region
 *  - resources without tags default to empty object on the import
 *  - import_aws_to_graph wraps import_aws + aws_result_to_graph
 *  - Custom graph_name passes through to aws_result_to_graph
 *  - Default graph_name 'aws-import' when omitted
 *  - fatalErrors filter: RESOURCE_EXPLORER_NOT_ENABLED is NON-fatal,
 *    other codes are fatal.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AWSResource, AWSImportResult } from '../types.js';
import type { MutableGraph } from '../../../graph/mutable-graph.js';

// =============================================================================
// Hoisted mock bag — collaborators are stubbed at the boundary so the
// orchestrator's transformation logic is what's under test.
// =============================================================================
const h = vi.hoisted(() => ({
  init_aws_sdk: vi.fn(),
  get_account_id: vi.fn(),
  discover_with_resource_explorer: vi.fn(),
  discover_with_config: vi.fn(),
  get_ice_type: vi.fn(),
  map_properties: vi.fn(),
  aws_result_to_graph: vi.fn(),
  infer_relationships: vi.fn(),
}));

vi.mock('../sdk-init.js', () => ({
  init_aws_sdk: h.init_aws_sdk,
  get_account_id: h.get_account_id,
}));

vi.mock('../discovery.js', () => ({
  discover_with_resource_explorer: h.discover_with_resource_explorer,
  discover_with_config: h.discover_with_config,
}));

vi.mock('../type-mapper.js', () => ({
  get_ice_type: h.get_ice_type,
  map_properties: h.map_properties,
}));

vi.mock('../graph-conversion.js', () => ({
  aws_result_to_graph: h.aws_result_to_graph,
  infer_relationships: h.infer_relationships,
}));

// =============================================================================
// Test fixtures
// =============================================================================
function makeResource(overrides: Partial<AWSResource> = {}): AWSResource {
  return {
    arn: 'arn:aws:ec2:us-east-1:123:vpc/vpc-1',
    name: 'vpc-1',
    resource_type: 'AWS::EC2::VPC',
    region: 'us-east-1',
    account_id: '123',
    properties: {},
    tags: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default happy-path stubs — overridden per-test as needed.
  h.init_aws_sdk.mockResolvedValue({
    STS: {},
    ResourceExplorer: {},
    ConfigService: {},
  });
  h.get_account_id.mockResolvedValue('123456789');
  h.discover_with_resource_explorer.mockResolvedValue([]);
  h.discover_with_config.mockResolvedValue([]);
  h.get_ice_type.mockImplementation((aws_type: string) => `ice.${aws_type.toLowerCase()}`);
  h.map_properties.mockImplementation((_t: string, p: Record<string, unknown>) => p);
  h.aws_result_to_graph.mockReturnValue({ name: 'mock-graph' } as unknown as MutableGraph);
});

// =============================================================================
// Tests
// =============================================================================
describe('import_aws — happy path', () => {
  it('returns success: true with empty resources by default', async () => {
    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.success).toBe(true);
    expect(result.resources).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('initializes the SDK with the supplied profile', async () => {
    const { import_aws } = await import('../aws-importer.js');
    await import_aws({ profile: 'my-profile' });

    expect(h.init_aws_sdk).toHaveBeenCalledWith('my-profile');
  });

  it('initializes the SDK with no profile when none supplied', async () => {
    const { import_aws } = await import('../aws-importer.js');
    await import_aws();

    expect(h.init_aws_sdk).toHaveBeenCalledWith(undefined);
  });

  it('populates account_id from get_account_id', async () => {
    h.get_account_id.mockResolvedValueOnce('999999');
    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.metadata.account_id).toBe('999999');
  });

  it('records resource-explorer in services_scanned on success', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([makeResource()]);
    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.metadata.services_scanned).toContain('resource-explorer');
  });

  it('records imported_at as a valid ISO timestamp and a non-negative duration', async () => {
    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(() => new Date(result.metadata.imported_at).toISOString()).not.toThrow();
    expect(result.metadata.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('skips Resource Explorer when services excludes "all"', async () => {
    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws({ services: ['ec2'] });

    expect(h.discover_with_resource_explorer).not.toHaveBeenCalled();
    expect(result.metadata.services_scanned).toEqual([]);
  });
});

describe('import_aws — Resource Explorer failure paths', () => {
  it('falls back to Config when Resource Explorer is not enabled', async () => {
    const reErr: Error & { name?: string } = new Error('Resource Explorer is not enabled');
    reErr.name = 'AccessDeniedException';
    h.discover_with_resource_explorer.mockRejectedValueOnce(reErr);
    h.discover_with_config.mockResolvedValueOnce([makeResource()]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(h.discover_with_config).toHaveBeenCalled();
    expect(result.metadata.services_scanned).toContain('config');
    expect(result.warnings.find((w) => w.code === 'FALLBACK_TO_CONFIG')).toBeDefined();
    expect(
      result.errors.find((e) => e.code === 'RESOURCE_EXPLORER_NOT_ENABLED'),
    ).toBeDefined();
    // Non-fatal: still imports config resources
    expect(result.success).toBe(true);
    expect(result.resources).toHaveLength(1);
  });

  it('falls back to Config when Resource Explorer error message contains "not enabled"', async () => {
    h.discover_with_resource_explorer.mockRejectedValueOnce(
      new Error('Service is not enabled in this region'),
    );
    h.discover_with_config.mockResolvedValueOnce([]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(h.discover_with_config).toHaveBeenCalled();
    expect(
      result.errors.find((e) => e.code === 'RESOURCE_EXPLORER_NOT_ENABLED'),
    ).toBeDefined();
  });

  it('falls back to Config when Resource Explorer error message includes "Resource Explorer"', async () => {
    h.discover_with_resource_explorer.mockRejectedValueOnce(
      new Error('Resource Explorer index missing'),
    );
    h.discover_with_config.mockResolvedValueOnce([]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(h.discover_with_config).toHaveBeenCalled();
  });

  it('also captures Config failures in errors[]', async () => {
    const reErr: Error & { name?: string } = new Error('Resource Explorer not enabled');
    reErr.name = 'AccessDeniedException';
    h.discover_with_resource_explorer.mockRejectedValueOnce(reErr);
    h.discover_with_config.mockRejectedValueOnce(
      Object.assign(new Error('throttle'), { code: 'Throttling' }),
    );

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.code === 'API_RATE_LIMITED')).toBe(true);
  });

  it('captures a Config error without an action when classifier omits one', async () => {
    const reErr: Error & { name?: string } = new Error('Resource Explorer not enabled');
    reErr.name = 'AccessDeniedException';
    h.discover_with_resource_explorer.mockRejectedValueOnce(reErr);
    // ResourceNotFoundException maps to RESOURCE_NOT_FOUND with no action
    h.discover_with_config.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { code: 'ResourceNotFoundException' }),
    );

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    const cfgErr = result.errors.find((e) => e.code === 'RESOURCE_NOT_FOUND');
    expect(cfgErr).toBeDefined();
    expect(cfgErr?.action).toBeUndefined();
  });

  it('surfaces auth-expired errors immediately (no fallback)', async () => {
    h.discover_with_resource_explorer.mockRejectedValueOnce(
      Object.assign(new Error('expired'), { code: 'ExpiredTokenException' }),
    );
    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(h.discover_with_config).not.toHaveBeenCalled();
    expect(result.errors.some((e) => e.code === 'AUTH_EXPIRED')).toBe(true);
    expect(result.errors[0]!.action).toBe('reauth');
  });

  it('surfaces invalid-credentials errors immediately', async () => {
    h.discover_with_resource_explorer.mockRejectedValueOnce(
      Object.assign(new Error('bad creds'), { code: 'InvalidClientTokenId' }),
    );
    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(h.discover_with_config).not.toHaveBeenCalled();
    expect(result.errors.some((e) => e.code === 'AUTH_INVALID_CREDENTIALS')).toBe(true);
  });

  it('rethrows uncategorised RE errors into the outer classifier path', async () => {
    // ResourceNotFoundException -> RESOURCE_NOT_FOUND, which is none of
    // the inner branches; the orchestrator rethrows to the outer catch.
    h.discover_with_resource_explorer.mockRejectedValueOnce(
      Object.assign(new Error('mystery'), { code: 'ResourceNotFoundException' }),
    );
    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.errors.some((e) => e.code === 'RESOURCE_NOT_FOUND')).toBe(true);
  });
});

describe('import_aws — outer SDK init failure', () => {
  it('records a classified error when init_aws_sdk throws', async () => {
    h.init_aws_sdk.mockRejectedValueOnce(
      Object.assign(new Error('expired'), { code: 'ExpiredTokenException' }),
    );

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'AUTH_EXPIRED')).toBe(true);
  });

  it('records a classified error when get_account_id throws', async () => {
    h.get_account_id.mockRejectedValueOnce(
      Object.assign(new Error('throttled'), { code: 'Throttling' }),
    );

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.code === 'API_RATE_LIMITED')).toBe(true);
  });

  it('outer catch omits action when classifier provides none', async () => {
    // 404 / RESOURCE_NOT_FOUND has no action in classifyAWSError
    h.init_aws_sdk.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { code: 'ResourceNotFoundException' }),
    );

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    const err = result.errors[0]!;
    expect(err.code).toBe('RESOURCE_NOT_FOUND');
    expect(err.action).toBeUndefined();
    expect(err.command).toBeUndefined();
  });
});

describe('import_aws — resource transform & filtering', () => {
  it('maps each AWS resource to ICE shape via get_ice_type + map_properties', async () => {
    h.get_ice_type.mockReturnValueOnce('aws.ec2.vpc');
    h.map_properties.mockReturnValueOnce({ cidr_block: '10.0.0.0/16' });
    h.discover_with_resource_explorer.mockResolvedValueOnce([
      makeResource({ properties: { CidrBlock: '10.0.0.0/16' } }),
    ]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.resources).toHaveLength(1);
    const imported = result.resources[0]!;
    expect(imported.ice_type).toBe('aws.ec2.vpc');
    expect(imported.aws_arn).toBe('arn:aws:ec2:us-east-1:123:vpc/vpc-1');
    expect(imported.aws_type).toBe('AWS::EC2::VPC');
    expect(imported.properties).toEqual({ cidr_block: '10.0.0.0/16' });
    expect(imported.provider).toBe('aws');
    expect(imported.dependencies).toEqual([]);
  });

  it('filter_types: keeps only resources whose ICE type is allow-listed', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([
      makeResource({ resource_type: 'AWS::EC2::VPC' }),
      makeResource({ resource_type: 'AWS::S3::Bucket', arn: 'arn:aws:s3:::b' }),
    ]);
    h.get_ice_type
      .mockReturnValueOnce('aws.ec2.vpc')
      .mockReturnValueOnce('aws.s3.bucket');

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws({ filter_types: ['aws.ec2.vpc'] });

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.ice_type).toBe('aws.ec2.vpc');
  });

  it('exclude_types: drops resources whose ICE type is excluded', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([
      makeResource({ resource_type: 'AWS::EC2::VPC' }),
      makeResource({ resource_type: 'AWS::S3::Bucket', arn: 'arn:aws:s3:::b' }),
    ]);
    h.get_ice_type
      .mockReturnValueOnce('aws.ec2.vpc')
      .mockReturnValueOnce('aws.s3.bucket');

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws({ exclude_types: ['aws.s3.bucket'] });

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.ice_type).toBe('aws.ec2.vpc');
  });

  it('filter_tags: keeps only resources whose tags match all required tags', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([
      makeResource({ tags: { Env: 'prod', Owner: 'team' } }),
      makeResource({ tags: { Env: 'dev' }, arn: 'arn:aws:s3:::b' }),
    ]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws({ filter_tags: { Env: 'prod' } });

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]!.tags.Env).toBe('prod');
  });

  it('filter_tags: drops resources with no tags object when filter requires a tag', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([
      makeResource({ tags: undefined as unknown as Record<string, string> }),
    ]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws({ filter_tags: { Env: 'prod' } });

    expect(result.resources).toHaveLength(0);
  });

  it('defaults imported tags to {} when source has no tags', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([
      makeResource({ tags: undefined as unknown as Record<string, string> }),
    ]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.resources[0]!.tags).toEqual({});
  });

  it('regions_scanned dedupes when two resources share a region', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([
      makeResource({ region: 'us-east-1', arn: 'arn:aws:ec2:us-east-1:123:vpc/a' }),
      makeResource({ region: 'us-east-1', arn: 'arn:aws:ec2:us-east-1:123:vpc/b' }),
      makeResource({ region: 'eu-west-1', arn: 'arn:aws:ec2:eu-west-1:123:vpc/c' }),
    ]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.metadata.regions).toEqual(['us-east-1', 'eu-west-1']);
  });

  it('infer_relationships is called when infer_dependencies is true (default)', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([makeResource()]);

    const { import_aws } = await import('../aws-importer.js');
    await import_aws();

    expect(h.infer_relationships).toHaveBeenCalledTimes(1);
  });

  it('infer_relationships is NOT called when infer_dependencies is false', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([makeResource()]);

    const { import_aws } = await import('../aws-importer.js');
    await import_aws({ infer_dependencies: false });

    expect(h.infer_relationships).not.toHaveBeenCalled();
  });

  it('resource_count reflects post-filter count', async () => {
    h.discover_with_resource_explorer.mockResolvedValueOnce([
      makeResource(),
      makeResource({ arn: 'arn:aws:s3:::b' }),
    ]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.metadata.resource_count).toBe(2);
  });
});

describe('import_aws — fatalErrors filter', () => {
  it('RESOURCE_EXPLORER_NOT_ENABLED is non-fatal (success: true)', async () => {
    const reErr: Error & { name?: string } = new Error('Resource Explorer not enabled');
    reErr.name = 'AccessDeniedException';
    h.discover_with_resource_explorer.mockRejectedValueOnce(reErr);
    h.discover_with_config.mockResolvedValueOnce([makeResource()]);

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.errors.some((e) => e.code === 'RESOURCE_EXPLORER_NOT_ENABLED')).toBe(true);
    expect(result.success).toBe(true);
  });

  it('a non-RE_NOT_ENABLED error makes success: false', async () => {
    h.discover_with_resource_explorer.mockRejectedValueOnce(
      Object.assign(new Error('expired'), { code: 'ExpiredTokenException' }),
    );

    const { import_aws } = await import('../aws-importer.js');
    const result = await import_aws();

    expect(result.success).toBe(false);
  });
});

describe('import_aws_to_graph', () => {
  it('uses default graph_name "aws-import" when omitted', async () => {
    const { import_aws_to_graph } = await import('../aws-importer.js');
    await import_aws_to_graph();

    expect(h.aws_result_to_graph).toHaveBeenCalledWith(
      expect.objectContaining({ resources: [], errors: [], warnings: [] }),
      'aws-import',
    );
  });

  it('passes a custom graph_name through to aws_result_to_graph', async () => {
    const { import_aws_to_graph } = await import('../aws-importer.js');
    await import_aws_to_graph({}, 'my-aws');

    expect(h.aws_result_to_graph).toHaveBeenCalledWith(expect.any(Object), 'my-aws');
  });

  it('returns both the graph and the underlying import result', async () => {
    const fakeGraph = { name: 'fake' } as unknown as MutableGraph;
    h.aws_result_to_graph.mockReturnValueOnce(fakeGraph);

    const { import_aws_to_graph } = await import('../aws-importer.js');
    const out = await import_aws_to_graph();

    expect(out.graph).toBe(fakeGraph);
    expect(out.result).toMatchObject({
      success: true,
      resources: [],
      errors: [],
    } as Partial<AWSImportResult>);
  });
});

describe('aws_result_to_graph re-export', () => {
  it('is re-exported from the orchestrator module', async () => {
    const mod = await import('../aws-importer.js');
    expect(mod.aws_result_to_graph).toBe(h.aws_result_to_graph);
  });
});
