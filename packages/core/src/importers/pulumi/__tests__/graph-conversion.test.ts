/**
 * Tests for Pulumi graph conversion (rf-pimp-3 extraction).
 */

import { describe, it, expect } from 'vitest';
import { import_result_to_graph } from '../graph-conversion.js';
import type { PulumiImportResult, PulumiImportedResource } from '../types.js';

const empty_metadata = {
  pulumi_version: 'v3.100.0',
  stack: 'organization/myproject/dev',
  project: 'myproject',
  deployment_time: '2024-01-15T10:30:00.000Z',
  resource_count: 0,
  output_count: 0,
  imported_at: '2024-01-15T11:00:00.000Z',
};

function make_resource(overrides: Partial<PulumiImportedResource> = {}): PulumiImportedResource {
  return {
    pulumi_urn: 'urn:pulumi:dev::p::aws:ec2/vpc:Vpc::main',
    pulumi_type: 'aws:ec2/vpc:Vpc',
    ice_type: 'Network.VPC',
    name: 'main',
    properties: {},
    dependencies: [],
    provider: 'aws',
    protect: false,
    external: false,
    secret_outputs: [],
    ...overrides,
  };
}

function make_result(
  resources: PulumiImportedResource[] = [],
  overrides: Partial<PulumiImportResult> = {},
): PulumiImportResult {
  return {
    success: true,
    resources,
    outputs: [],
    errors: [],
    warnings: [],
    metadata: empty_metadata,
    ...overrides,
  };
}

describe('import_result_to_graph', () => {
  it('creates a graph with the default name when none is supplied', () => {
    const graph = import_result_to_graph(make_result());
    expect(graph.name).toBe('pulumi-import');
  });

  it('uses a custom graph name when provided', () => {
    const graph = import_result_to_graph(make_result(), 'my-graph');
    expect(graph.name).toBe('my-graph');
  });

  it('attaches source/version/stack/project as graph-level labels', () => {
    const graph = import_result_to_graph(make_result());
    expect(graph.metadata.labels).toMatchObject({
      source: 'pulumi',
      pulumi_version: 'v3.100.0',
      stack: 'organization/myproject/dev',
      project: 'myproject',
    });
  });

  it('emits one node per resource with _pulumi_urn / _pulumi_type properties', () => {
    const graph = import_result_to_graph(make_result([make_resource()]));
    expect(graph.nodes.size).toBe(1);
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.type).toBe('Network.VPC');
    expect(node.name).toBe('main');
    expect(node.properties._pulumi_urn).toBe('urn:pulumi:dev::p::aws:ec2/vpc:Vpc::main');
    expect(node.properties._pulumi_type).toBe('aws:ec2/vpc:Vpc');
  });

  it('attaches provider/pulumi_type labels and provenance annotations', () => {
    const graph = import_result_to_graph(make_result([make_resource()]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels).toMatchObject({ provider: 'aws', pulumi_type: 'aws:ec2/vpc:Vpc' });
    expect(node.metadata.annotations).toMatchObject({
      imported_from: 'pulumi',
      pulumi_urn: 'urn:pulumi:dev::p::aws:ec2/vpc:Vpc::main',
    });
  });

  it('lifts the resource id into the node id property when present', () => {
    const graph = import_result_to_graph(
      make_result([make_resource({ id: 'vpc-12345678' })]),
    );
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.properties.id).toBe('vpc-12345678');
  });

  it('flips the protected/external labels when those flags are set', () => {
    const graph = import_result_to_graph(
      make_result([make_resource({ protect: true, external: true })]),
    );
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels.protected).toBe('true');
    expect(node.metadata.labels.external).toBe('true');
  });

  it('does not set protected/external labels when flags are false', () => {
    const graph = import_result_to_graph(make_result([make_resource()]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels.protected).toBeUndefined();
    expect(node.metadata.labels.external).toBeUndefined();
  });

  it('emits a depends_on edge between two related resources', () => {
    const a = make_resource({
      pulumi_urn: 'urn:a',
      name: 'a',
      dependencies: ['urn:b'],
    });
    const b = make_resource({ pulumi_urn: 'urn:b', name: 'b' });
    const graph = import_result_to_graph(make_result([a, b]));
    expect(graph.edges.size).toBe(1);
    const edge = Array.from(graph.edges.values())[0]!;
    expect(edge.relationship).toBe('depends_on');
    expect(edge.metadata.labels.source).toBe('pulumi');
  });

  it('skips dependency edges when the target resource is not in the graph', () => {
    const a = make_resource({
      pulumi_urn: 'urn:a',
      name: 'a',
      dependencies: ['urn:nope'],
    });
    const graph = import_result_to_graph(make_result([a]));
    expect(graph.edges.size).toBe(0);
  });

  it('skips self-dependency edges', () => {
    const r = make_resource({ pulumi_urn: 'urn:self', dependencies: ['urn:self'] });
    const graph = import_result_to_graph(make_result([r]));
    expect(graph.edges.size).toBe(0);
  });

  it('preserves arbitrary properties on the node', () => {
    const r = make_resource({
      properties: { cidrBlock: '10.0.0.0/16', enableDnsHostnames: true },
    });
    const graph = import_result_to_graph(make_result([r]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.properties.cidrBlock).toBe('10.0.0.0/16');
    expect(node.properties.enableDnsHostnames).toBe(true);
  });
});
