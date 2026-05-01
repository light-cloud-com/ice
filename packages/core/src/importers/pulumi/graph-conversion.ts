/**
 * Pulumi Graph Conversion
 *
 * Emits an ICE `MutableGraph` from a `PulumiImportResult`, plus the
 * file-path -> graph convenience wrapper.  Self-dependency edges are
 * dropped, and `protect`/`external` resources flip the node-level label
 * (the ICE graph treats labels as denormalised state).
 */

import { create_mutable_graph, type MutableGraph } from '../../graph/mutable-graph.js';
import { import_pulumi_state } from './state-importer.js';
import type { PulumiImportOptions } from './state-importer.js';
import type { PulumiImportResult } from './types.js';
import type { NodeInput, EdgeInput } from '../../types/graph.js';

/**
 * Convert imported resources to an ICE graph.
 *
 * One node per resource (typed by `ice_type`), one edge per cross-resource
 * dependency.  Self-dependencies are skipped.  Each resource attaches:
 *   - `_pulumi_urn` + `_pulumi_type` to properties (load-bearing for the
 *     graph builder which round-trips the URN back during deploy)
 *   - `provider` + `pulumi_type` labels for filtering
 *   - `imported_from` + `pulumi_urn` annotations for provenance
 *   - `protected: 'true'` label when `resource.protect`
 *   - `external: 'true'` label when `resource.external`
 *   - `id` property when present
 */
export function import_result_to_graph(
  result: PulumiImportResult,
  graph_name: string = 'pulumi-import',
): MutableGraph {
  const graph = create_mutable_graph(graph_name, {
    description: `Imported from Pulumi stack ${result.metadata.stack}`,
    labels: {
      source: 'pulumi',
      pulumi_version: result.metadata.pulumi_version,
      stack: result.metadata.stack,
      project: result.metadata.project,
    },
  });

  // Track URN to node ID mapping
  const urn_to_node_id = new Map<string, string>();

  // Add nodes for each resource
  for (const resource of result.resources) {
    const node_input: NodeInput = {
      type: resource.ice_type,
      name: resource.name,
      properties: {
        ...resource.properties,
        _pulumi_urn: resource.pulumi_urn,
        _pulumi_type: resource.pulumi_type,
      },
      labels: {
        provider: resource.provider,
        pulumi_type: resource.pulumi_type,
      },
      annotations: {
        imported_from: 'pulumi',
        pulumi_urn: resource.pulumi_urn,
      },
    };

    if (resource.id) {
      node_input.properties!['id'] = resource.id;
    }

    if (resource.protect) {
      node_input.labels!['protected'] = 'true';
    }

    if (resource.external) {
      node_input.labels!['external'] = 'true';
    }

    const add_result = graph.add_node(node_input);
    if (add_result.success && add_result.node) {
      urn_to_node_id.set(resource.pulumi_urn, add_result.node.id);
    }
  }

  // Add edges for dependencies
  for (const resource of result.resources) {
    const source_id = urn_to_node_id.get(resource.pulumi_urn);
    if (!source_id) continue;

    for (const dep_urn of resource.dependencies) {
      const target_id = urn_to_node_id.get(dep_urn);
      if (!target_id) continue;

      // Skip self-dependencies
      if (source_id === target_id) continue;

      const edge_input: EdgeInput = {
        source: source_id,
        target: target_id,
        relationship: 'depends_on',
        labels: {
          source: 'pulumi',
        },
      };

      graph.add_edge(edge_input);
    }
  }

  return graph;
}

/**
 * Import Pulumi state directly to a graph.
 *
 * Convenience wrapper combining `import_pulumi_state` and
 * `import_result_to_graph`.  When `options.target_graph` is set, the
 * imported nodes are merged into the existing graph (edges are dropped
 * because the source-id -> target-id remapping is non-trivial across
 * graphs — preserves the legacy behaviour exactly).
 */
export async function import_pulumi_to_graph(
  state_path: string,
  options: PulumiImportOptions = {},
): Promise<{ graph: MutableGraph; result: PulumiImportResult }> {
  const result = await import_pulumi_state(state_path, options);
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
