/**
 * Pulumi Exporter — graph-to-resource converter (rf-pulumi-7).
 *
 * Three helpers extracted from `pulumi-exporter.ts` (pre-extraction
 * L135-189 `exportGraph`, L194-205 `buildDependencyMap`, L211-251
 * `nodeToResource`). The class state previously held by the
 * orchestrator (`schema_provider`) is now passed as the first
 * argument to each helper — the rf-sqlite Approach B pattern, but
 * with the schema provider as the only mutable input rather than
 * a SqliteContext-style handle.
 *
 * Flow (verbatim):
 *  1. exporter calls `node_to_resource(schema_provider, node, options, dep_map)`.
 *  2. helper looks up the Pulumi implementation via the schema provider.
 *  3. on miss, helper falls back to `fallback_type_mapping`.
 *  4. on hit (or fallback hit), returns `{ success, resource }`.
 *  5. on no-match, returns `{ success: false, error, unmapped: true }`.
 *
 * The orchestrator's `exportGraph` method (re-exported here as
 * `export_graph`) drives the loop and the format-selection branch
 * (yaml vs typescript). The orchestrator (`PulumiExporter` class)
 * is now a one-line passthrough — see rf-pulumi-8 housekeeping.
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
 *    "No Pulumi mapping" messages — preserved verbatim.
 */

import { sanitize_name } from './case-utils';
import { fallback_type_mapping } from './type-mapping';
import { to_typescript } from './typescript-formatter';
import { build_options, map_properties } from './value-transform';
import { to_yaml } from './yaml-formatter';
import type { PulumiExportOptions, PulumiExportResult, PulumiProgram, PulumiResource } from './types';
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
 * Convert a single ICE node to a Pulumi resource.
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
  options: PulumiExportOptions,
  dependency_map: Map<string, string[]>,
): Promise<{
  success: boolean;
  resource?: PulumiResource;
  error?: string;
  unmapped?: boolean;
}> {
  // Look up Pulumi type from schema
  const impl = schema_provider.get_implementation(node.type as IceType, 'pulumi', options.provider);

  if (!impl) {
    // Try fallback mapping
    const fallback = fallback_type_mapping(node.type, options.provider);
    if (fallback) {
      return {
        success: true,
        resource: {
          type: fallback,
          name: sanitize_name(node.name),
          properties: map_properties(node.properties || {}),
          options: build_options(dependency_map.get(node.id) || []),
        },
      };
    }

    return {
      success: false,
      error: `No Pulumi mapping for ${node.type} with provider ${options.provider}`,
      unmapped: true,
    };
  }

  const pulumi_type = impl.native_type;

  return {
    success: true,
    resource: {
      type: pulumi_type,
      name: sanitize_name(node.name),
      properties: map_properties(node.properties || {}),
      options: build_options(dependency_map.get(node.id) || []),
    },
  };
}

/**
 * Drive the full graph -> Pulumi-program export.
 *
 * Walks every node in the graph, converts each via
 * `node_to_resource`, accumulates `warnings` / `errors` /
 * `unmapped_types`, and emits the YAML or TypeScript output
 * depending on `options.format`. The format default is YAML
 * (anything other than the literal 'typescript' string).
 *
 * The caller is responsible for initialising the schema provider
 * before calling this function; the class facade in
 * `pulumi-exporter.ts` does that for backward compatibility, but
 * a direct standalone caller must do it too.
 *
 * Output shape (`PulumiExportResult`):
 *  - `success` true iff `errors.length === 0` (warnings + unmapped
 *    don't fail the export).
 *  - `program` is always populated, even on failure.
 *  - `yaml` and `typescript` are mutually-exclusive (only one is
 *    populated based on format selection).
 *  - `unmapped_types` is deduped via `[...new Set(...)]`.
 */
export async function export_graph(
  schema_provider: EmbeddedSchemaProvider,
  graph: MutableGraph,
  options: PulumiExportOptions,
): Promise<PulumiExportResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const unmapped_types: string[] = [];
  const resources: PulumiResource[] = [];

  // Build dependency map
  const dependency_map = build_dependency_map(graph);

  // Convert each node to Pulumi resource
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
      warnings.push(`No Pulumi mapping for ICE type: ${node.type}`);
    }
  }

  const program: PulumiProgram = {
    name: options.project_name || 'ice-export',
    runtime: options.runtime || 'nodejs',
    description: `Exported from ICE graph: ${graph.name}`,
    config: options.config,
    resources,
  };

  // Generate output format
  let yaml: string | undefined;
  let typescript: string | undefined;

  if (options.format === 'typescript') {
    typescript = to_typescript(program, options);
  } else {
    yaml = to_yaml(program, options);
  }

  return {
    success: errors.length === 0,
    program,
    yaml,
    typescript,
    warnings,
    errors,
    unmapped_types: [...new Set(unmapped_types)],
  };
}
