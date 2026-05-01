/**
 * Terraform Exporter
 *
 * Exports ICE graphs to Terraform configuration (HCL format).
 * Uses the unified schema to map ICE types to Terraform resource types.
 *
 * The class itself is a thin orchestration shell — every method
 * delegates to a standalone helper in `./terraform/<domain>.ts`.
 * Field-level state (the schema provider + initialised flag) lives
 * on the class; the schema provider is threaded through to every
 * standalone helper that needs it.
 *
 * Decomposition map:
 *  - `./terraform/types.ts` — public option / resource / config /
 *    result shapes (rf-tfexp-1)
 *  - `./terraform/case-utils.ts` — sanitize_name (rf-tfexp-2)
 *  - `./terraform/type-mapping.ts` — fallback_type_mapping (rf-tfexp-3)
 *  - `./terraform/value-transform.ts` — map_properties, transform_value,
 *    format_dependencies (rf-tfexp-4)
 *  - `./terraform/hcl-formatter.ts` — to_hcl, format_hcl_value, to_json
 *    (rf-tfexp-5)
 *  - `./terraform/converter.ts` — export_graph, node_to_resource,
 *    build_dependency_map (rf-tfexp-6)
 *
 * Public API unchanged — `TerraformExporter`, `create_terraform_exporter`,
 * and the eleven exported types all keep their pre-extraction shape.
 */

import { EmbeddedSchemaProvider } from '../schema/embedded-schema-provider.js';
import { export_graph } from './terraform/converter.js';
import type { MutableGraph } from '../graph/mutable-graph.js';
import type {
  TerraformBlock,
  TerraformConfig,
  TerraformExportOptions,
  TerraformExportResult,
  TerraformLifecycle,
  TerraformOutput,
  TerraformProviderConfig,
  TerraformResource,
  TerraformVariable,
  RequiredProvider,
} from './terraform/types.js';

// Re-export the public type surface so external consumers keep their
// `import { ... } from './terraform-exporter'` imports.
export type {
  TerraformBlock,
  TerraformConfig,
  TerraformExportOptions,
  TerraformExportResult,
  TerraformLifecycle,
  TerraformOutput,
  TerraformProviderConfig,
  TerraformResource,
  TerraformVariable,
  RequiredProvider,
};

// =============================================================================
// Terraform Exporter
// =============================================================================

/**
 * Exports ICE graphs to Terraform configuration.
 */
export class TerraformExporter {
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
   * Export an ICE graph to Terraform configuration.
   */
  async exportGraph(graph: MutableGraph, options: TerraformExportOptions): Promise<TerraformExportResult> {
    await this.initialize();
    return export_graph(this.schema_provider, graph, options);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a Terraform exporter.
 */
export function create_terraform_exporter(schema_provider?: EmbeddedSchemaProvider): TerraformExporter {
  return new TerraformExporter(schema_provider);
}
