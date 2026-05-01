/**
 * Tests for AWS graph conversion + relationship inference (rf-aimp-4).
 */

import { describe, it, expect } from 'vitest';
import { aws_result_to_graph, infer_relationships } from '../graph-conversion.js';
import type { AWSImportResult, AWSImportedResource } from '../types.js';

const empty_metadata = {
  account_id: '123456789',
  regions: ['us-east-1'],
  services_scanned: ['resource-explorer'],
  resource_count: 0,
  imported_at: '2024-01-15T11:00:00.000Z',
  duration_ms: 100,
};

function make_resource(overrides: Partial<AWSImportedResource> = {}): AWSImportedResource {
  return {
    aws_arn: 'arn:aws:ec2:us-east-1:123:vpc/vpc-1',
    aws_type: 'AWS::EC2::VPC',
    ice_type: 'Network.VPC',
    name: 'main',
    properties: {},
    dependencies: [],
    provider: 'aws',
    account_id: '123',
    region: 'us-east-1',
    tags: {},
    ...overrides,
  };
}

function make_result(
  resources: AWSImportedResource[] = [],
  overrides: Partial<AWSImportResult> = {},
): AWSImportResult {
  return {
    success: true,
    resources,
    errors: [],
    warnings: [],
    metadata: empty_metadata,
    ...overrides,
  };
}

describe('aws_result_to_graph', () => {
  it('uses default name "aws-import" when none supplied', () => {
    const graph = aws_result_to_graph(make_result());
    expect(graph.name).toBe('aws-import');
  });

  it('uses custom graph name when provided', () => {
    const graph = aws_result_to_graph(make_result(), 'my-aws');
    expect(graph.name).toBe('my-aws');
  });

  it('attaches source/account_id labels at the graph level', () => {
    const graph = aws_result_to_graph(make_result());
    expect(graph.metadata.labels).toMatchObject({
      source: 'aws',
      account_id: '123456789',
    });
  });

  it('emits one node per resource with _aws_arn / _aws_type properties', () => {
    const graph = aws_result_to_graph(make_result([make_resource()]));
    expect(graph.nodes.size).toBe(1);
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.type).toBe('Network.VPC');
    expect(node.name).toBe('main');
    expect(node.properties._aws_arn).toBe('arn:aws:ec2:us-east-1:123:vpc/vpc-1');
    expect(node.properties._aws_type).toBe('AWS::EC2::VPC');
  });

  it('attaches provider/aws_type/account_id/region labels', () => {
    const graph = aws_result_to_graph(make_result([make_resource()]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels).toMatchObject({
      provider: 'aws',
      aws_type: 'AWS::EC2::VPC',
      account_id: '123',
      region: 'us-east-1',
    });
  });

  it('spreads resource tags into labels', () => {
    const graph = aws_result_to_graph(
      make_result([make_resource({ tags: { Name: 'web', Env: 'prod' } })]),
    );
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels.Name).toBe('web');
    expect(node.metadata.labels.Env).toBe('prod');
  });

  it('AWS-canonical labels are overwritten by tags with the same key', () => {
    // tags spread last in source code => tag values win on collision
    const graph = aws_result_to_graph(
      make_result([make_resource({ tags: { region: 'fake' } })]),
    );
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels.region).toBe('fake');
  });

  it('attaches imported_from / aws_arn / aws_account annotations', () => {
    const graph = aws_result_to_graph(make_result([make_resource()]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.annotations).toMatchObject({
      imported_from: 'aws',
      aws_arn: 'arn:aws:ec2:us-east-1:123:vpc/vpc-1',
      aws_account: '123',
    });
  });

  it('emits inferred + source-tagged depends_on edges', () => {
    const a = make_resource({
      aws_arn: 'arn:aws:ec2:us-east-1:123:vpc/a',
      dependencies: ['arn:aws:ec2:us-east-1:123:subnet/b'],
    });
    const b = make_resource({
      aws_arn: 'arn:aws:ec2:us-east-1:123:subnet/b',
      aws_type: 'AWS::EC2::Subnet',
      ice_type: 'Network.Subnet',
      name: 'b',
    });
    const graph = aws_result_to_graph(make_result([a, b]));
    expect(graph.edges.size).toBe(1);
    const edge = Array.from(graph.edges.values())[0]!;
    expect(edge.relationship).toBe('depends_on');
    expect(edge.metadata.labels.inferred).toBe('true');
    expect(edge.metadata.labels.source).toBe('aws');
  });

  it('skips self-dependency edges', () => {
    const r = make_resource({
      aws_arn: 'arn:aws:s3:::bucket',
      dependencies: ['arn:aws:s3:::bucket'],
    });
    const graph = aws_result_to_graph(make_result([r]));
    expect(graph.edges.size).toBe(0);
  });

  it('skips edges where the target is not in the graph', () => {
    const r = make_resource({ dependencies: ['arn:aws:s3:::missing'] });
    const graph = aws_result_to_graph(make_result([r]));
    expect(graph.edges.size).toBe(0);
  });
});

describe('infer_relationships', () => {
  it('infers a dep when a property contains another resource\'s ARN', () => {
    const a = make_resource({ aws_arn: 'arn:aws:ec2:us-east-1:123:vpc/a' });
    const b = make_resource({
      aws_arn: 'arn:aws:ec2:us-east-1:123:subnet/b',
      properties: { vpcId: 'arn:aws:ec2:us-east-1:123:vpc/a' },
    });
    infer_relationships([a, b]);
    expect(b.dependencies).toEqual(['arn:aws:ec2:us-east-1:123:vpc/a']);
  });

  it('descends into nested objects', () => {
    const a = make_resource({ aws_arn: 'arn:aws:s3:::bucket' });
    const b = make_resource({
      aws_arn: 'arn:aws:lambda:us-east-1:123:function/fn',
      properties: { config: { source: { ref: 'arn:aws:s3:::bucket' } } },
    });
    infer_relationships([a, b]);
    expect(b.dependencies).toContain('arn:aws:s3:::bucket');
  });

  it('descends into arrays', () => {
    const a = make_resource({ aws_arn: 'arn:aws:s3:::bucket' });
    const b = make_resource({
      aws_arn: 'arn:aws:lambda:us-east-1:123:function/fn',
      properties: { sources: ['arn:aws:s3:::bucket'] },
    });
    infer_relationships([a, b]);
    expect(b.dependencies).toContain('arn:aws:s3:::bucket');
  });

  it('does not include the resource\'s own ARN in its deps', () => {
    const a = make_resource({
      aws_arn: 'arn:aws:s3:::bucket',
      properties: { ref: 'arn:aws:s3:::bucket' },
    });
    infer_relationships([a]);
    expect(a.dependencies).toEqual([]);
  });

  it('dedupes repeated ARN references', () => {
    const a = make_resource({ aws_arn: 'arn:aws:s3:::bucket' });
    const b = make_resource({
      aws_arn: 'arn:aws:lambda:us-east-1:123:function/fn',
      properties: {
        a: 'arn:aws:s3:::bucket',
        b: 'arn:aws:s3:::bucket',
        nested: { c: 'arn:aws:s3:::bucket' },
      },
    });
    infer_relationships([a, b]);
    expect(b.dependencies).toEqual(['arn:aws:s3:::bucket']);
  });

  it('ignores ARN strings whose target is not in the import set', () => {
    const a = make_resource({
      properties: { ref: 'arn:aws:s3:::nonexistent-bucket' },
    });
    infer_relationships([a]);
    expect(a.dependencies).toEqual([]);
  });

  it('replaces existing dependencies with the inferred set', () => {
    // Note: the original implementation OVERWRITES, doesn't union with existing.
    const a = make_resource({ aws_arn: 'arn:aws:s3:::bucket' });
    const b = make_resource({
      aws_arn: 'arn:aws:lambda:us-east-1:123:function/fn',
      dependencies: ['arn:aws:s3:::stale'], // pre-existing, not in import
      properties: { ref: 'arn:aws:s3:::bucket' },
    });
    infer_relationships([a, b]);
    expect(b.dependencies).toEqual(['arn:aws:s3:::bucket']);
  });

  it('treats non-ARN strings as no-ops', () => {
    const a = make_resource({
      properties: { name: 'hello world', region: 'us-east-1' },
    });
    infer_relationships([a]);
    expect(a.dependencies).toEqual([]);
  });
});
