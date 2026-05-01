/**
 * Pulumi Exporter
 *
 * Exports ICE graphs to Pulumi programs (YAML or TypeScript).
 * Uses the unified schema to map ICE types to Pulumi resource types.
 */

import { EmbeddedSchemaProvider } from '../schema/embedded-schema-provider.js';
import { sanitize_name } from './pulumi/case-utils.js';
import { fallback_type_mapping } from './pulumi/type-mapping.js';
import { to_typescript } from './pulumi/typescript-formatter.js';
import { build_options, map_properties } from './pulumi/value-transform.js';
import { to_yaml } from './pulumi/yaml-formatter.js';
import type { MutableGraph } from '../graph/mutable-graph.js';
import type { IceType } from '../schema/schema-provider.js';
import type { Node } from '../types/graph.js';
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
  async exportGraph(graph: MutableGraph, options: PulumiExportOptions): Promise<PulumiExportResult> {
    await this.initialize();

    const warnings: string[] = [];
    const errors: string[] = [];
    const unmapped_types: string[] = [];
    const resources: PulumiResource[] = [];

    // Build dependency map
    const dependency_map = this.buildDependencyMap(graph);

    // Convert each node to Pulumi resource
    for (const [_id, node] of graph.nodes) {
      const result = await this.nodeToResource(node, options, dependency_map);

      if (result.success && result.resource) {
        resources.push(result.resource);
      } else if (result.error) {
        if (result.unmapped) {
          unmapped_types.push(node.type);
          warnings.push(`No Pulumi mapping for ICE type: ${node.type}`);
        } else {
          errors.push(result.error);
        }
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

  /**
   * Build dependency map from graph edges.
   */
  private buildDependencyMap(graph: MutableGraph): Map<string, string[]> {
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
   * Convert an ICE node to a Pulumi resource.
   */
  private async nodeToResource(
    node: Node,
    options: PulumiExportOptions,
    dependency_map: Map<string, string[]>,
  ): Promise<{ success: boolean; resource?: PulumiResource; error?: string; unmapped?: boolean }> {
    // Look up Pulumi type from schema
    const impl = this.schema_provider.get_implementation(node.type as IceType, 'pulumi', options.provider);

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
