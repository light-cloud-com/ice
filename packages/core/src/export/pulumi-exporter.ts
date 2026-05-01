/**
 * Pulumi Exporter
 *
 * Exports ICE graphs to Pulumi programs (YAML or TypeScript).
 * Uses the unified schema to map ICE types to Pulumi resource types.
 */

import { EmbeddedSchemaProvider } from '../schema/embedded-schema-provider.js';
import {
  sanitize_name,
  sanitize_var_name,
  to_camel_case,
} from './pulumi/case-utils.js';
import {
  fallback_type_mapping,
  get_package_name,
  parse_resource_type,
} from './pulumi/type-mapping.js';
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
      typescript = this.toTypeScript(program, options);
    } else {
      yaml = this.toYAML(program, options);
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
            properties: this.mapProperties(node.properties || {}),
            options: this.buildOptions(dependency_map.get(node.id) || []),
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
        properties: this.mapProperties(node.properties || {}),
        options: this.buildOptions(dependency_map.get(node.id) || []),
      },
    };
  }

  /**
   * Build resource options.
   */
  private buildOptions(deps: string[]): PulumiResourceOptions | undefined {
    if (deps.length === 0) return undefined;

    return {
      depends_on: deps,
    };
  }

  /**
   * Map ICE properties to Pulumi properties.
   */
  private mapProperties(properties: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip internal properties (starting with _)
      if (key.startsWith('_')) continue;

      // Convert property names to camelCase (Pulumi convention)
      const pulumi_key = to_camel_case(key);
      result[pulumi_key] = this.transformValue(value);
    }

    return result;
  }

  /**
   * Transform a value for Pulumi output.
   */
  private transformValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return null;
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.transformValue(v));
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[to_camel_case(k)] = this.transformValue(v);
      }
      return result;
    }

    return value;
  }

  /**
   * Convert program to YAML format.
   */
  private toYAML(program: PulumiProgram, options: PulumiExportOptions): string {
    const lines: string[] = [];

    lines.push(`name: ${program.name}`);
    lines.push(`runtime: ${program.runtime}`);

    if (program.description) {
      lines.push(`description: ${program.description}`);
    }

    lines.push('');

    // Configuration
    if (program.config && Object.keys(program.config).length > 0) {
      lines.push('config:');
      for (const [key, value] of Object.entries(program.config)) {
        lines.push(`  ${key}: ${this.formatYAMLValue(value, 4)}`);
      }
      lines.push('');
    }

    // Resources
    if (program.resources.length > 0) {
      lines.push('resources:');
      for (const resource of program.resources) {
        if (options.include_comments) {
          lines.push(`  # ${resource.name}`);
        }
        lines.push(`  ${resource.name}:`);
        lines.push(`    type: ${resource.type}`);

        if (Object.keys(resource.properties).length > 0) {
          lines.push('    properties:');
          for (const [key, value] of Object.entries(resource.properties)) {
            if (value !== null && value !== undefined) {
              lines.push(`      ${key}: ${this.formatYAMLValue(value, 8)}`);
            }
          }
        }

        if (resource.options?.depends_on && resource.options.depends_on.length > 0) {
          lines.push('    options:');
          lines.push('      dependsOn:');
          for (const dep of resource.options.depends_on) {
            lines.push(`        - \${${dep}}`);
          }
        }

        lines.push('');
      }
    }

    // Outputs
    if (program.outputs && Object.keys(program.outputs).length > 0) {
      lines.push('outputs:');
      for (const [key, value] of Object.entries(program.outputs)) {
        lines.push(`  ${key}: ${this.formatYAMLValue(value, 4)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a value for YAML output.
   */
  private formatYAMLValue(value: unknown, indent: number = 0): string {
    const spaces = ' '.repeat(indent);

    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      // Check if string needs quoting
      if (value.includes(':') || value.includes('#') || value.includes('\n')) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';

      const items = value.map((v) => `${spaces}  - ${this.formatYAMLValue(v, indent + 4)}`);
      return `\n${items.join('\n')}`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return '{}';

      const formatted = entries.map(([k, v]) => {
        const formattedValue = this.formatYAMLValue(v, indent + 2);
        return `${spaces}  ${k}: ${formattedValue}`;
      });
      return `\n${formatted.join('\n')}`;
    }

    return String(value);
  }

  /**
   * Convert program to TypeScript format.
   */
  private toTypeScript(program: PulumiProgram, options: PulumiExportOptions): string {
    const lines: string[] = [];

    // Imports
    const providers = new Set<string>();
    for (const resource of program.resources) {
      const match = resource.type.match(/^([^:]+):/);
      if (match) {
        providers.add(match[1]!);
      }
    }

    lines.push('import * as pulumi from "@pulumi/pulumi";');
    for (const provider of providers) {
      const package_name = get_package_name(provider);
      lines.push(`import * as ${provider.replace(/-/g, '_')} from "@pulumi/${package_name}";`);
    }
    lines.push('');

    // Configuration
    if (program.config && Object.keys(program.config).length > 0) {
      lines.push('// Configuration');
      lines.push('const config = new pulumi.Config();');
      for (const [key, value] of Object.entries(program.config)) {
        if (typeof value === 'string') {
          lines.push(`const ${to_camel_case(key)} = config.require("${key}");`);
        } else {
          lines.push(`const ${to_camel_case(key)} = config.requireObject("${key}");`);
        }
      }
      lines.push('');
    }

    // Resources
    if (options.include_comments) {
      lines.push('// Resources');
    }

    for (const resource of program.resources) {
      const { provider_alias: _provider_alias, class_path } = parse_resource_type(resource.type);

      if (options.include_comments) {
        lines.push(`// ${resource.name}`);
      }

      lines.push(`const ${sanitize_var_name(resource.name)} = new ${class_path}("${resource.name}", {`);

      for (const [key, value] of Object.entries(resource.properties)) {
        if (value !== null && value !== undefined) {
          lines.push(`    ${key}: ${this.formatTSValue(value)},`);
        }
      }

      lines.push('});');
      lines.push('');
    }

    // Outputs
    if (program.outputs && Object.keys(program.outputs).length > 0) {
      lines.push('// Outputs');
      for (const [key, value] of Object.entries(program.outputs)) {
        lines.push(`export const ${to_camel_case(key)} = ${this.formatTSValue(value)};`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a value for TypeScript output.
   */
  private formatTSValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'undefined';
    }

    if (typeof value === 'string') {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value.map((v) => this.formatTSValue(v));
      return `[${items.join(', ')}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return '{}';

      const formatted = entries.map(([k, v]) => `${k}: ${this.formatTSValue(v)}`);
      return `{ ${formatted.join(', ')} }`;
    }

    return String(value);
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
