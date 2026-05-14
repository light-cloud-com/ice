/**
 * AWS Graph Conversion + Relationship Inference
 *
 * Converts an `AWSImportResult` into an ICE `MutableGraph`, and runs the
 * post-pass that infers cross-resource dependencies from ARN strings
 * embedded in resource properties.
 */

import { create_mutable_graph, type MutableGraph } from '../../graph/mutable-graph';
import type { AWSImportResult, AWSImportedResource } from './types';
import type { NodeInput, EdgeInput } from '../../types/graph';

/**
 * Infer cross-resource dependencies by scanning each resource's
 * `properties` for ARN strings (`arn:aws:...`) that match another
 * resource in the same import.
 *
 * Per resource:
 *   - Walk every value (recursively into arrays and plain objects).
 *   - For each `string` that startsWith `'arn:aws:'` AND is in the
 *     ARN set of the import AND is not the resource's own ARN AND
 *     hasn't been added yet, append to that resource's deps.
 *   - Replace the resource's `dependencies` array with the new list.
 *
 * Mutates each `resource.dependencies` in place via property
 * assignment (the `as { dependencies: string[] }` cast bypasses the
 * readonly type contract — load-bearing for back-compat).
 */
export function infer_relationships(resources: AWSImportedResource[]): void {
  const arn_set = new Set(resources.map((r) => r.aws_arn));

  for (const resource of resources) {
    const deps: string[] = [];

    // Scan properties for ARN references
    const find_arns = (obj: unknown): void => {
      if (typeof obj === 'string' && obj.startsWith('arn:aws:') && arn_set.has(obj)) {
        if (obj !== resource.aws_arn && !deps.includes(obj)) {
          deps.push(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(find_arns);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(find_arns);
      }
    };

    find_arns(resource.properties);
    (resource as { dependencies: string[] }).dependencies = deps;
  }
}

/**
 * Convert AWS import result to ICE graph.
 *
 * One node per resource (typed by `ice_type`), one edge per
 * dependency whose target lives in the graph.  Each resource attaches:
 *   - `_aws_arn` + `_aws_type` properties (load-bearing for round-trip)
 *   - `provider/aws_type/account_id/region/...resource.tags` labels
 *     (tags are spread last so AWS-canonical labels win on collision)
 *   - `imported_from`, `aws_arn`, `aws_account` annotations
 *
 * Edge labels: `inferred: true` + `source: aws`. Self-dependencies are
 * skipped, missing-target edges are silently dropped.
 */
export function aws_result_to_graph(
  result: AWSImportResult,
  graph_name: string = 'aws-import',
): MutableGraph {
  const graph = create_mutable_graph(graph_name, {
    description: `Imported from AWS account ${result.metadata.account_id}`,
    labels: {
      source: 'aws',
      account_id: result.metadata.account_id,
    },
  });

  // Track ARN to node ID mapping
  const arn_to_node_id = new Map<string, string>();

  // Add nodes for each resource
  for (const resource of result.resources) {
    const labels: Record<string, string> = {
      provider: 'aws',
      aws_type: resource.aws_type,
      account_id: resource.account_id,
      region: resource.region,
      ...resource.tags,
    };

    const node_input: NodeInput = {
      type: resource.ice_type,
      name: resource.name,
      properties: {
        ...resource.properties,
        _aws_arn: resource.aws_arn,
        _aws_type: resource.aws_type,
      },
      labels,
      annotations: {
        imported_from: 'aws',
        aws_arn: resource.aws_arn,
        aws_account: resource.account_id,
      },
    };

    const add_result = graph.add_node(node_input);
    if (add_result.success && add_result.node) {
      arn_to_node_id.set(resource.aws_arn, add_result.node.id);
    }
  }

  // Add edges for dependencies
  for (const resource of result.resources) {
    const source_id = arn_to_node_id.get(resource.aws_arn);
    if (!source_id) continue;

    for (const dep_arn of resource.dependencies) {
      const target_id = arn_to_node_id.get(dep_arn);
      if (!target_id) continue;
      if (source_id === target_id) continue;

      const edge_input: EdgeInput = {
        source: source_id,
        target: target_id,
        relationship: 'depends_on',
        labels: {
          inferred: 'true',
          source: 'aws',
        },
      };

      graph.add_edge(edge_input);
    }
  }

  return graph;
}
