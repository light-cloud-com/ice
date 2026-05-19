/**
 * Terraform Graph Conversion
 *
 * Emits an ICE `MutableGraph` from a `TerraformImportResult`, plus the
 * file-path -> graph convenience wrapper.  Terraform edges always carry
 * `inferred: 'true'` to mark them as derived (vs explicit), even when
 * the underlying dependency was an explicit `instance.dependencies`
 * entry — the graph treats both the same way.
 */

import { create_mutable_graph, type MutableGraph } from '../../graph/mutable-graph';
import { import_terraform_state } from './state-importer';
import type { TerraformImportOptions } from './state-importer';
import type { TerraformImportResult } from './types';
import type { NodeInput, EdgeInput } from '../../types/graph';

/**
 * Convert imported resources to an ICE graph.
 *
 * One node per resource (typed by `ice_type`), one edge per dependency
 * whose target lives in the graph.  Each resource attaches:
 *   - `_terraform_address` + `_terraform_type` to properties (load-bearing
 *     for the graph builder which round-trips the address back during deploy)
 *   - `provider` + `terraform_type` labels for filtering
 *   - `imported_from` + `terraform_address` annotations for provenance
 *   - `module: '<module>'` label when the resource is in a module
 *
 * Edges are tagged `inferred: 'true'` regardless of their origin.
 */
export function import_result_to_graph(
  result: TerraformImportResult,
  graph_name: string = 'terraform-import',
): MutableGraph {
  const graph = create_mutable_graph(graph_name, {
    description: `Imported from Terraform state (v${result.metadata.state_version})`,
    labels: {
      source: 'terraform',
      terraform_version: result.metadata.terraform_version,
      lineage: result.metadata.lineage,
    },
  });

  // Track terraform address to node ID mapping
  const address_to_node_id = new Map<string, string>();

  // Add nodes for each resource
  for (const resource of result.resources) {
    const node_input: NodeInput = {
      type: resource.ice_type,
      name: resource.name,
      properties: {
        ...resource.properties,
        _terraform_address: resource.terraform_address,
        _terraform_type: resource.terraform_type,
      },
      labels: {
        provider: resource.provider,
        terraform_type: resource.terraform_type,
      },
      annotations: {
        imported_from: 'terraform',
        terraform_address: resource.terraform_address,
      },
    };

    if (resource.module) {
      node_input.labels!['module'] = resource.module;
    }

    const add_result = graph.add_node(node_input);
    if (add_result.success && add_result.node) {
      address_to_node_id.set(resource.terraform_address, add_result.node.id);
    }
  }

  // Add edges for dependencies
  for (const resource of result.resources) {
    const source_id = address_to_node_id.get(resource.terraform_address);
    if (!source_id) continue;

    for (const dep_address of resource.dependencies) {
      const target_id = address_to_node_id.get(dep_address);
      if (!target_id) continue;

      const edge_input: EdgeInput = {
        source: source_id,
        target: target_id,
        relationship: 'depends_on',
        labels: {
          inferred: 'true',
        },
      };

      graph.add_edge(edge_input);
    }
  }

  return graph;
}

/**
 * Import Terraform state directly to a graph.
 *
 * Convenience wrapper combining `import_terraform_state` and
 * `import_result_to_graph`.  When `options.target_graph` is set, the
 * imported nodes are merged into the existing graph (edges are dropped
 * because the source-id -> target-id remapping is non-trivial across
 * graphs — preserves the legacy behaviour exactly).
 */
export async function import_terraform_to_graph(
  state_path: string,
  options: TerraformImportOptions = {},
): Promise<{ graph: MutableGraph; result: TerraformImportResult }> {
  const result = await import_terraform_state(state_path, options);
  const graph = options.target_graph ?? import_result_to_graph(result);

  if (options.target_graph) {
    // Merge into existing graph
    const merge_result = import_result_to_graph(result, 'temp');
    for (const node of merge_result.nodes.values()) {
      options.target_graph.add_node({
        type: node.type,
        name: node.name,
        properties: node.properties,
        labels: node.metadata.labels,
        annotations: node.metadata.annotations,
      });
    }
  }

  return { graph, result };
}
