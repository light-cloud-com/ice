/**
 * Tests for Terraform graph conversion (rf-timp-3 extraction).
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { import_result_to_graph, import_terraform_to_graph } from '../graph-conversion.js';
import { create_mutable_graph } from '../../../graph/mutable-graph.js';
import type { TerraformImportResult, ImportedResource, TerraformState } from '../types.js';

const empty_metadata = {
  terraform_version: '1.5.0',
  state_version: 4,
  serial: 42,
  lineage: 'test-lineage-123',
  resource_count: 0,
  output_count: 0,
  imported_at: '2024-01-15T11:00:00.000Z',
};

function make_resource(overrides: Partial<ImportedResource> = {}): ImportedResource {
  return {
    terraform_address: 'aws_vpc.main',
    terraform_type: 'aws_vpc',
    ice_type: 'Network.VPC',
    name: 'main',
    properties: {},
    dependencies: [],
    provider: 'aws',
    sensitive_attributes: [],
    ...overrides,
  };
}

function make_result(
  resources: ImportedResource[] = [],
  overrides: Partial<TerraformImportResult> = {},
): TerraformImportResult {
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

describe('import_result_to_graph (terraform)', () => {
  it('uses default name "terraform-import" when none supplied', () => {
    const graph = import_result_to_graph(make_result());
    expect(graph.name).toBe('terraform-import');
  });

  it('uses a custom graph name when provided', () => {
    const graph = import_result_to_graph(make_result(), 'my-graph');
    expect(graph.name).toBe('my-graph');
  });

  it('attaches source/version/lineage as graph-level labels', () => {
    const graph = import_result_to_graph(make_result());
    expect(graph.metadata.labels).toMatchObject({
      source: 'terraform',
      terraform_version: '1.5.0',
      lineage: 'test-lineage-123',
    });
  });

  it('emits one node per resource with _terraform_address / _terraform_type', () => {
    const graph = import_result_to_graph(make_result([make_resource()]));
    expect(graph.nodes.size).toBe(1);
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.type).toBe('Network.VPC');
    expect(node.name).toBe('main');
    expect(node.properties._terraform_address).toBe('aws_vpc.main');
    expect(node.properties._terraform_type).toBe('aws_vpc');
  });

  it('attaches provider/terraform_type labels and provenance annotations', () => {
    const graph = import_result_to_graph(make_result([make_resource()]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels).toMatchObject({
      provider: 'aws',
      terraform_type: 'aws_vpc',
    });
    expect(node.metadata.annotations).toMatchObject({
      imported_from: 'terraform',
      terraform_address: 'aws_vpc.main',
    });
  });

  it('attaches module label only when the resource is in a module', () => {
    const graph = import_result_to_graph(
      make_result([make_resource({ module: 'module.network' })]),
    );
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels.module).toBe('module.network');
  });

  it('omits module label when not in a module', () => {
    const graph = import_result_to_graph(make_result([make_resource()]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.metadata.labels.module).toBeUndefined();
  });

  it('emits inferred-tagged depends_on edges between related resources', () => {
    const a = make_resource({ terraform_address: 'aws_vpc.a', name: 'a', dependencies: ['aws_subnet.b'] });
    const b = make_resource({ terraform_address: 'aws_subnet.b', terraform_type: 'aws_subnet', name: 'b' });
    const graph = import_result_to_graph(make_result([a, b]));
    expect(graph.edges.size).toBe(1);
    const edge = Array.from(graph.edges.values())[0]!;
    expect(edge.relationship).toBe('depends_on');
    expect(edge.metadata.labels.inferred).toBe('true');
  });

  it('skips edges where the dependency target is not in the graph', () => {
    const a = make_resource({
      terraform_address: 'aws_vpc.a',
      dependencies: ['aws_subnet.missing'],
    });
    const graph = import_result_to_graph(make_result([a]));
    expect(graph.edges.size).toBe(0);
  });

  it('preserves arbitrary properties on the node', () => {
    const r = make_resource({
      properties: { cidr_block: '10.0.0.0/16', enable_dns_support: true },
    });
    const graph = import_result_to_graph(make_result([r]));
    const node = Array.from(graph.nodes.values())[0]!;
    expect(node.properties.cidr_block).toBe('10.0.0.0/16');
    expect(node.properties.enable_dns_support).toBe(true);
  });

  it('skips edges from resources whose add_node failed (no source_id)', () => {
    // Two resources with the same name -> second add_node fails ->
    // address_to_node_id misses entry -> edge loop hits `if (!source_id) continue`.
    const a = make_resource({ terraform_address: 'aws_vpc.a', name: 'duplicate' });
    const b = make_resource({
      terraform_address: 'aws_vpc.b',
      name: 'duplicate',
      dependencies: ['aws_vpc.a'],
    });
    const graph = import_result_to_graph(make_result([a, b]));
    expect(graph.nodes.size).toBe(1);
    expect(graph.edges.size).toBe(0);
  });
});

// =============================================================================
// import_terraform_to_graph — file-based wrapper
// =============================================================================

describe('import_terraform_to_graph', () => {
  let tmp_dir: string;

  const SAMPLE_STATE: TerraformState = {
    version: 4,
    terraform_version: '1.5.0',
    serial: 1,
    lineage: 'wrap-test',
    resources: [
      {
        mode: 'managed',
        type: 'aws_vpc',
        name: 'main',
        provider: 'provider["registry.terraform.io/hashicorp/aws"]',
        instances: [
          {
            schema_version: 1,
            attributes: { id: 'vpc-123', cidr_block: '10.0.0.0/16' },
            sensitive_attributes: [],
          },
        ],
      },
      {
        mode: 'managed',
        type: 'aws_subnet',
        name: 'public',
        provider: 'provider["registry.terraform.io/hashicorp/aws"]',
        instances: [
          {
            schema_version: 1,
            attributes: { id: 'sub-123', vpc_id: 'vpc-123' },
            sensitive_attributes: [],
            dependencies: ['aws_vpc.main'],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    tmp_dir = mkdtempSync(join(tmpdir(), 'tf-graph-test-'));
  });

  afterEach(() => {
    rmSync(tmp_dir, { recursive: true, force: true });
  });

  it('returns { graph, result } from a state file path', async () => {
    const path = join(tmp_dir, 'main.tfstate');
    writeFileSync(path, JSON.stringify(SAMPLE_STATE));
    const out = await import_terraform_to_graph(path);
    expect(out.result.success).toBe(true);
    expect(out.result.resources.length).toBe(2);
    expect(out.graph.nodes.size).toBe(2);
  });

  it('builds a fresh graph when no target_graph is supplied', async () => {
    const path = join(tmp_dir, 'main.tfstate');
    writeFileSync(path, JSON.stringify(SAMPLE_STATE));
    const out = await import_terraform_to_graph(path);
    // Default name comes from import_result_to_graph
    expect(out.graph.name).toBe('terraform-import');
  });

  it('merges nodes into the supplied target_graph (legacy edges-dropped behaviour)', async () => {
    const path = join(tmp_dir, 'main.tfstate');
    writeFileSync(path, JSON.stringify(SAMPLE_STATE));
    const target = create_mutable_graph('existing');
    target.add_node({ type: 'pre.existing', name: 'pre', properties: {} });

    const out = await import_terraform_to_graph(path, { target_graph: target });
    // Returned graph IS the target
    expect(out.graph).toBe(target);
    // Target has 1 pre + 2 from import = 3 nodes
    expect(target.nodes.size).toBe(3);
    // Edges dropped intentionally per legacy contract
    expect(target.edges.size).toBe(0);
  });

  it('still returns the failed result when the state file does not exist', async () => {
    const out = await import_terraform_to_graph(join(tmp_dir, 'nope.tfstate'));
    expect(out.result.success).toBe(false);
    expect(out.result.errors[0]!.code).toBe('FILE_NOT_FOUND');
    // Graph is built from the empty result, so nodes.size === 0
    expect(out.graph.nodes.size).toBe(0);
  });
});
