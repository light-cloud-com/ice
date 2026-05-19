/**
 * Terraform Exporter — graph-to-resource converter (rf-tfexp-6).
 *
 * Three helpers extracted from `terraform-exporter.ts` (pre-extraction
 * L189-262 `exportGraph`, L267-279 `buildDependencyMap`, L284-330
 * `nodeToResource`). The class state previously held by the
 * orchestrator (`schema_provider`) is now passed as the first
 * argument to each helper.
 *
 * Flow (verbatim):
 *  1. exporter calls `node_to_resource(schema_provider, node, options, dep_map)`.
 *  2. helper looks up the Terraform implementation via the schema provider.
 *  3. on miss, helper falls back to `fallback_type_mapping`.
 *  4. on hit (or fallback hit), returns `{ success, resource }`.
 *  5. on no-match, returns `{ success: false, error, unmapped: true }`.
 *
 * The orchestrator's `exportGraph` method (re-exported here as
 * `export_graph`) drives the loop and the format-selection branch
 * (hcl vs json).
 *
 * Pre-extraction quirks preserved:
 *  - `exportGraph` calls `await this.initialize()` first; the
 *    standalone `export_graph` requires the schema provider to be
 *    initialised by the caller (the class wrapper still does this
 *    as part of its facade behaviour).
 *  - `buildDependencyMap` only considers edges with relationship
 *    'depends_on'; other relationship kinds are silently skipped.
 *  - `nodeToResource` uses `node.properties || {}` defensively
 *    (some nodes have undefined `properties`).
 *  - `unmapped_types` is deduped with `[...new Set(...)]` AFTER
 *    the loop; `warnings` is NOT deduped and may contain duplicate
 *    "No Terraform mapping" messages — preserved verbatim.
 *  - The format-selection branch checks `options.format === 'json'`;
 *    every other value (including undefined) emits HCL.
 */

import { sanitize_name } from './case-utils';
import { to_hcl, to_json } from './hcl-formatter';
import { fallback_type_mapping } from './type-mapping';
import { format_dependencies, map_properties } from './value-transform';
import type {
  TerraformBlock,
  TerraformConfig,
  TerraformExportOptions,
  TerraformExportResult,
  TerraformProviderConfig,
  TerraformResource,
} from './types';
import type { MutableGraph } from '../../graph/mutable-graph';
import type { EmbeddedSchemaProvider } from '../../schema/embedded-schema-provider';
import type { IceType } from '../../schema/schema-provider';
import type { Node } from '../../types/graph';

/**
 * Build a `node.id -> node.id[]` dependency map from a graph's edges.
 *
 * Only `depends_on`-relationship edges contribute; other edge
 * relationships (e.g. `contains`, `connects_to`) are ignored. The
 * returned map keys are source-node ids; values are arrays of
 * target-node ids in iteration order. No deduplication is applied
 * — a graph with two `depends_on` edges from the same source to
 * the same target produces a duplicate target id (preserved
 * pre-extraction behaviour, since `MutableGraph.edges` is keyed
 * by edge id, not by source/target).
 */
export function build_dependency_map(graph: MutableGraph): Map<string, string[]> {
  const deps = new Map<string, string[]>();

  for (const [_id, edge] of graph.edges) {
    if (edge.relationship === 'depends_on') {
      const source_deps = deps.get(edge.source) || [];
      source_deps.push(edge.target);
      deps.set(edge.source, source_deps);
    }
  }

  return deps;
}

/**
 * Convert a single ICE node to a Terraform resource.
 *
 * Pulled from the schema provider; on lookup miss, falls back to
 * `fallback_type_mapping`. On both miss + fallback miss, returns
 * `{ success: false, error, unmapped: true }` so the caller can
 * track unmapped types for the export warnings list.
 *
 * The `unmapped` flag is the discriminator the caller uses to
 * decide whether to push to `unmapped_types` (warning) vs `errors`
 * (failure). Pre-extraction shape preserved exactly.
 */
export async function node_to_resource(
  schema_provider: EmbeddedSchemaProvider,
  node: Node,
  options: TerraformExportOptions,
  dependency_map: Map<string, string[]>,
): Promise<{
  success: boolean;
  resource?: TerraformResource;
  error?: string;
  unmapped?: boolean;
}> {
  // Look up Terraform type from schema
  const impl = schema_provider.get_implementation(node.type as IceType, 'terraform', options.provider);

  if (!impl) {
    // Try fallback mapping
    const fallback = fallback_type_mapping(node.type, options.provider);
    if (fallback) {
      return {
        success: true,
        resource: {
          type: fallback,
          name: sanitize_name(node.name),
          properties: map_properties(node.properties || {}, fallback),
          depends_on: format_dependencies(dependency_map.get(node.id) || [], options.provider),
        },
      };
    }

    return {
      success: false,
      error: `No Terraform mapping for ${node.type} with provider ${options.provider}`,
      unmapped: true,
    };
  }

  const terraform_type = impl.native_type;

  return {
    success: true,
    resource: {
      type: terraform_type,
      name: sanitize_name(node.name),
      properties: map_properties(node.properties || {}, terraform_type),
      depends_on: format_dependencies(dependency_map.get(node.id) || [], options.provider),
    },
  };
}

/**
 * Drive the full graph -> Terraform-config export.
 *
 * Walks every node in the graph, converts each via
 * `node_to_resource`, accumulates `warnings` / `errors` /
 * `unmapped_types`, and emits the HCL or JSON output depending
 * on `options.format`. The format default is HCL (anything other
 * than the literal 'json' string).
 *
 * The caller is responsible for initialising the schema provider
 * before calling this function; the class facade in
 * `terraform-exporter.ts` does that for backward compatibility.
 *
 * Output shape (`TerraformExportResult`):
 *  - `success` true iff `errors.length === 0` (warnings + unmapped
 *    don't fail the export).
 *  - `config` is always populated, even on failure.
 *  - `hcl` and `json` are mutually-exclusive (only one is
 *    populated based on format selection).
 *  - `unmapped_types` is deduped via `[...new Set(...)]`.
 */
export async function export_graph(
  schema_provider: EmbeddedSchemaProvider,
  graph: MutableGraph,
  options: TerraformExportOptions,
): Promise<TerraformExportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const unmapped_types: string[] = [];
  const resources: TerraformResource[] = [];

  // Build dependency map
  const dependency_map = build_dependency_map(graph);

  // Convert each node to Terraform resource
  for (const [_id, node] of graph.nodes) {
    const result = await node_to_resource(schema_provider, node, options, dependency_map);

    if (result.success && result.resource) {
      resources.push(result.resource);
    } else if (result.error) {
      // findings.md #34 — `node_to_resource` only returns
      // `success: false` on the no-impl-and-no-fallback branch,
      // which always co-emits `unmapped: true`. The previous else
      // arm was structurally unreachable; collapsed to the
      // unmapped-only branch.
      unmapped_types.push(node.type);
      warnings.push(`No Terraform mapping for ICE type: ${node.type}`);
    }
  }

  // Build provider config
  const providers: TerraformProviderConfig[] = [];
  if (options.provider_config) {
    providers.push({
      name: options.provider,
      config: options.provider_config,
    });
  }

  // Build terraform block
  const terraform: TerraformBlock = {};
  if (options.required_providers && options.required_providers.length > 0) {
    terraform.required_providers = {};
    for (const rp of options.required_providers) {
      terraform.required_providers[rp.name] = {
        source: rp.source,
        version: rp.version,
      };
    }
  }

  const config: TerraformConfig = {
    terraform: Object.keys(terraform).length > 0 ? terraform : undefined,
    providers,
    resources,
  };

  // Generate output format
  let hcl: string | undefined;
  let json: string | undefined;

  if (options.format === 'json') {
    json = to_json(config);
  } else {
    hcl = to_hcl(config, options);
  }

  return {
    success: errors.length === 0,
    config,
    hcl,
    json,
    warnings,
    errors,
    unmapped_types: [...new Set(unmapped_types)],
  };
}
