/**
 * Pulumi Exporter
 *
 * Exports ICE graphs to Pulumi programs (YAML or TypeScript).
 * Uses the unified schema to map ICE types to Pulumi resource types.
 *
 * The class itself is a thin orchestration shell — every method
 * delegates to a standalone helper in `./pulumi/<domain>.ts`.
 * Field-level state (the schema provider + initialised flag) lives
 * on the class; the schema provider is threaded through to every
 * standalone helper that needs it.
 *
 * Decomposition map:
 *  - `./pulumi/types.ts` — public option / resource / program /
 *    result shapes (rf-pulumi-1)
 *  - `./pulumi/case-utils.ts` — to_pascal_case, to_camel_case,
 *    sanitize_name, sanitize_var_name (rf-pulumi-2)
 *  - `./pulumi/type-mapping.ts` — fallback_type_mapping,
 *    parse_resource_type, get_package_name (rf-pulumi-3)
 *  - `./pulumi/value-transform.ts` — map_properties, transform_value,
 *    build_options (rf-pulumi-4)
 *  - `./pulumi/yaml-formatter.ts` — to_yaml, format_yaml_value
 *    (rf-pulumi-5)
 *  - `./pulumi/typescript-formatter.ts` — to_typescript,
 *    format_ts_value (rf-pulumi-6)
 *  - `./pulumi/converter.ts` — export_graph, node_to_resource,
 *    build_dependency_map (rf-pulumi-7)
 *
 * Public API unchanged — `PulumiExporter`, `create_pulumi_exporter`,
 * and the five exported types (`PulumiExportOptions`, `PulumiResource`,
 * `PulumiResourceOptions`, `PulumiProgram`, `PulumiExportResult`)
 * all keep their pre-extraction shape.
 */

import { EmbeddedSchemaProvider } from '../schema/embedded-schema-provider.js';
import { export_graph } from './pulumi/converter.js';
import type { MutableGraph } from '../graph/mutable-graph.js';
import type {
  PulumiExportOptions,
  PulumiExportResult,
  PulumiProgram,
  PulumiResource,
  PulumiResourceOptions,
} from './pulumi/types.js';

// Re-export the public type surface so external consumers keep their
// `import { ... } from './pulumi-exporter'` imports.
export type {
  PulumiExportOptions,
  PulumiExportResult,
  PulumiProgram,
  PulumiResource,
  PulumiResourceOptions,
};

// =============================================================================
// Pulumi Exporter
// =============================================================================

/**
 * Exports ICE graphs to Pulumi programs.
 */
export class PulumiExporter {
  private schema_provider: EmbeddedSchemaProvider;
  private initialized = false;

  constructor(schema_provider?: EmbeddedSchemaProvider) {
    this.schema_provider = schema_provider || new EmbeddedSchemaProvider();
  }

  /**
   * Initialize the exporter.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.schema_provider.initialize();
    this.initialized = true;
  }

  /**
   * Export an ICE graph to Pulumi program.
   */
  async exportGraph(
    graph: MutableGraph,
    options: PulumiExportOptions,
  ): Promise<PulumiExportResult> {
    await this.initialize();
    return export_graph(this.schema_provider, graph, options);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Pulumi exporter.
 */
export function create_pulumi_exporter(schema_provider?: EmbeddedSchemaProvider): PulumiExporter {
  return new PulumiExporter(schema_provider);
}
