/**
 * Terraform Exporter
 *
 * Exports ICE graphs to Terraform configuration (HCL format).
 * Uses the unified schema to map ICE types to Terraform resource types.
 */

import { EmbeddedSchemaProvider } from '../schema/embedded-schema-provider.js';
import type { MutableGraph } from '../graph/mutable-graph.js';
import type { IceType } from '../schema/schema-provider.js';
import type { Node } from '../types/graph.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Terraform export options.
 */
export interface TerraformExportOptions {
  /** Target provider (e.g., "google", "aws", "azurerm") */
  provider: string;

  /** Output format: hcl (human-readable) or json */
  format?: 'hcl' | 'json';

  /** Include comments in output */
  include_comments?: boolean;

  /** Include import blocks for existing resources */
  include_imports?: boolean;

  /** Provider configuration to include */
  provider_config?: Record<string, unknown>;

  /** Required providers configuration */
  required_providers?: RequiredProvider[];
}

/**
 * Required provider configuration.
 */
export interface RequiredProvider {
  name: string;
  source: string;
  version?: string;
}

/**
 * Terraform resource definition.
 */
export interface TerraformResource {
  /** Resource type (e.g., "google_compute_instance") */
  type: string;

  /** Resource name (identifier) */
  name: string;

  /** Resource properties */
  properties: Record<string, unknown>;

  /** Dependencies */
  depends_on?: string[];

  /** Provider alias (if using multiple providers) */
  provider?: string;

  /** Lifecycle configuration */
  lifecycle?: TerraformLifecycle;
}

/**
 * Terraform lifecycle block.
 */
export interface TerraformLifecycle {
  create_before_destroy?: boolean;
  prevent_destroy?: boolean;
  ignore_changes?: string[];
}

/**
 * Complete Terraform configuration.
 */
export interface TerraformConfig {
  /** Terraform block */
  terraform?: TerraformBlock;

  /** Provider configurations */
  providers: TerraformProviderConfig[];

  /** Resource definitions */
  resources: TerraformResource[];

  /** Local values */
  locals?: Record<string, unknown>;

  /** Variable definitions */
  variables?: TerraformVariable[];

  /** Output definitions */
  outputs?: TerraformOutput[];
}

/**
 * Terraform block configuration.
 */
export interface TerraformBlock {
  required_version?: string;
  required_providers?: Record<
    string,
    {
      source: string;
      version?: string;
    }
  >;
  backend?: Record<string, unknown>;
}

/**
 * Provider configuration.
 */
export interface TerraformProviderConfig {
  name: string;
  alias?: string;
  config: Record<string, unknown>;
}

/**
 * Variable definition.
 */
export interface TerraformVariable {
  name: string;
  type?: string;
  description?: string;
  default?: unknown;
  sensitive?: boolean;
}

/**
 * Output definition.
 */
export interface TerraformOutput {
  name: string;
  value: string;
  description?: string;
  sensitive?: boolean;
}

/**
 * Export result.
 */
export interface TerraformExportResult {
  success: boolean;
  config: TerraformConfig;
  hcl?: string;
  json?: string;
  warnings: string[];
  errors: string[];
  unmapped_types: string[];
}

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

    const warnings: string[] = [];
    const errors: string[] = [];
    const unmapped_types: string[] = [];
    const resources: TerraformResource[] = [];

    // Build dependency map
    const dependency_map = this.buildDependencyMap(graph);

    // Convert each node to Terraform resource
    for (const [_id, node] of graph.nodes) {
      const result = await this.nodeToResource(node, options, dependency_map);

      if (result.success && result.resource) {
        resources.push(result.resource);
      } else if (result.error) {
        if (result.unmapped) {
          unmapped_types.push(node.type);
          warnings.push(`No Terraform mapping for ICE type: ${node.type}`);
        } else {
          errors.push(result.error);
        }
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
      json = this.toJSON(config);
    } else {
      hcl = this.toHCL(config, options);
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
   * Convert an ICE node to a Terraform resource.
   */
  private async nodeToResource(
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
    const impl = this.schema_provider.get_implementation(node.type as IceType, 'terraform', options.provider);

    if (!impl) {
      // Try fallback mapping
      const fallback = this.fallbackTypeMapping(node.type, options.provider);
      if (fallback) {
        return {
          success: true,
          resource: {
            type: fallback,
            name: this.sanitizeName(node.name),
            properties: this.mapProperties(node.properties || {}, fallback),
            depends_on: this.formatDependencies(dependency_map.get(node.id) || [], options.provider),
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
        name: this.sanitizeName(node.name),
        properties: this.mapProperties(node.properties || {}, terraform_type),
        depends_on: this.formatDependencies(dependency_map.get(node.id) || [], options.provider),
      },
    };
  }

  /**
   * Fallback type mapping for common types.
   */
  private fallbackTypeMapping(ice_type: string, provider: string): string | null {
    // Map provider prefixes
    const provider_prefix_map: Record<string, string> = {
      google: 'google',
      gcp: 'google',
      aws: 'aws',
      azure: 'azurerm',
      azurerm: 'azurerm',
    };

    const tf_prefix = provider_prefix_map[provider] || provider;

    // Try to convert ICE type to Terraform type
    // e.g., gcp.compute.instance -> google_compute_instance
    // e.g., aws.ec2.instance -> aws_instance
    if (ice_type.startsWith('gcp.')) {
      return ice_type.replace('gcp.', `${tf_prefix}_`).replace(/\./g, '_');
    }
    if (ice_type.startsWith('aws.')) {
      return ice_type.replace('aws.', 'aws_').replace(/\./g, '_');
    }
    if (ice_type.startsWith('azure.')) {
      return ice_type.replace('azure.', 'azurerm_').replace(/\./g, '_');
    }

    // Generic fallback
    return `${tf_prefix}_${ice_type.replace(/\./g, '_')}`;
  }

  /**
   * Map ICE properties to Terraform properties.
   */
  private mapProperties(properties: Record<string, unknown>, _terraform_type: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip internal properties (starting with _)
      if (key.startsWith('_')) continue;

      // Convert property names from snake_case to Terraform convention
      // (Terraform uses snake_case, so usually it's 1:1)
      const tf_key = key;

      // Handle special value transformations
      result[tf_key] = this.transformValue(value);
    }

    return result;
  }

  /**
   * Transform a value for Terraform output.
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
        result[k] = this.transformValue(v);
      }
      return result;
    }

    return value;
  }

  /**
   * Format dependency references.
   */
  private formatDependencies(deps: string[], _provider: string): string[] | undefined {
    if (deps.length === 0) return undefined;

    // Format as Terraform references
    // Note: In a real implementation, we'd need to look up the actual
    // resource type and name for each dependency
    return deps.map((dep) => `# ${dep}`); // Placeholder
  }

  /**
   * Sanitize a name for use as Terraform identifier.
   */
  private sanitizeName(name: string): string {
    // Terraform resource names must:
    // - Start with letter or underscore
    // - Contain only letters, digits, underscores, hyphens
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^([0-9])/, '_$1');
  }

  /**
   * Convert config to HCL format.
   */
  private toHCL(config: TerraformConfig, options: TerraformExportOptions): string {
    const lines: string[] = [];

    // Terraform block
    if (config.terraform) {
      lines.push('terraform {');
      if (config.terraform.required_version) {
        lines.push(`  required_version = "${config.terraform.required_version}"`);
      }
      if (config.terraform.required_providers) {
        lines.push('  required_providers {');
        for (const [name, prov] of Object.entries(config.terraform.required_providers)) {
          lines.push(`    ${name} = {`);
          lines.push(`      source  = "${prov.source}"`);
          if (prov.version) {
            lines.push(`      version = "${prov.version}"`);
          }
          lines.push('    }');
        }
        lines.push('  }');
      }
      lines.push('}');
      lines.push('');
    }

    // Provider blocks
    for (const provider of config.providers) {
      lines.push(`provider "${provider.name}" {`);
      for (const [key, value] of Object.entries(provider.config)) {
        lines.push(`  ${key} = ${this.formatHCLValue(value)}`);
      }
      lines.push('}');
      lines.push('');
    }

    // Resource blocks
    for (const resource of config.resources) {
      if (options.include_comments) {
        lines.push(`# Resource: ${resource.name}`);
      }
      lines.push(`resource "${resource.type}" "${resource.name}" {`);

      for (const [key, value] of Object.entries(resource.properties)) {
        if (value !== null && value !== undefined) {
          lines.push(`  ${key} = ${this.formatHCLValue(value)}`);
        }
      }

      if (resource.depends_on && resource.depends_on.length > 0) {
        lines.push('');
        lines.push('  depends_on = [');
        for (const dep of resource.depends_on) {
          lines.push(`    ${dep},`);
        }
        lines.push('  ]');
      }

      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format a value for HCL output.
   */
  private formatHCLValue(value: unknown, indent: number = 2): string {
    const spaces = ' '.repeat(indent);

    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      // Escape special characters and wrap in quotes
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';

      const items = value.map((v) => this.formatHCLValue(v, indent + 2));
      return `[\n${spaces}  ${items.join(`,\n${spaces}  `)}\n${spaces}]`;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return '{}';

      const formatted = entries.map(([k, v]) => {
        const formattedValue = this.formatHCLValue(v, indent + 2);
        return `${spaces}  ${k} = ${formattedValue}`;
      });
      return `{\n${formatted.join('\n')}\n${spaces}}`;
    }

    return String(value);
  }

  /**
   * Convert config to JSON format.
   */
  private toJSON(config: TerraformConfig): string {
    return JSON.stringify(config, null, 2);
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
