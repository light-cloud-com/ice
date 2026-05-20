/**
 * Terraform CLI Schema Extractor
 *
 * Extracts complete provider schemas using the Terraform CLI.
 * This provides full schema information including all attributes,
 * blocks, and validation rules.
 *
 * Requirements:
 * - Terraform CLI installed and in PATH
 * - Internet access to download providers
 *
 * Usage:
 *   const extractor = new TerraformCliExtractor(config);
 *   const result = await extractor.extract_provider('hashicorp/aws');
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  ExtractedResourceSchema,
  ExtractionError,
  ExtractionMetadata,
  ExtractionResult,
  ExtractorConfig,
  PropertyDefinition,
  PropertyType,
  ProviderMetadata,
  ValidationDefinition,
} from './types';

// =============================================================================
// Terraform Schema Types (from terraform providers schema -json)
// =============================================================================

interface TerraformSchemaJson {
  format_version: string;
  provider_schemas: Record<string, TerraformProviderSchemaJson>;
}

interface TerraformProviderSchemaJson {
  provider: TerraformBlockSchemaJson;
  resource_schemas: Record<string, TerraformResourceSchemaJson>;
  data_source_schemas: Record<string, TerraformResourceSchemaJson>;
}

interface TerraformResourceSchemaJson {
  version: number;
  block: TerraformBlockSchemaJson;
}

interface TerraformBlockSchemaJson {
  attributes?: Record<string, TerraformAttributeJson>;
  block_types?: Record<string, TerraformBlockTypeJson>;
  description?: string;
  description_kind?: string;
  deprecated?: boolean;
}

interface TerraformAttributeJson {
  type?: unknown;
  nested_type?: TerraformNestedTypeJson;
  description?: string;
  description_kind?: string;
  required?: boolean;
  optional?: boolean;
  computed?: boolean;
  sensitive?: boolean;
  deprecated?: boolean;
}

interface TerraformNestedTypeJson {
  attributes: Record<string, TerraformAttributeJson>;
  nesting_mode: 'single' | 'list' | 'set' | 'map';
  min_items?: number;
  max_items?: number;
}

interface TerraformBlockTypeJson {
  nesting_mode: 'single' | 'list' | 'set' | 'map';
  block: TerraformBlockSchemaJson;
  min_items?: number;
  max_items?: number;
}

// =============================================================================
// Known Terraform Providers
// =============================================================================

interface TerraformProviderInfo {
  namespace: string;
  name: string;
  version?: string;
  description: string;
}

const TERRAFORM_PROVIDERS: TerraformProviderInfo[] = [
  // Major hyperscalers
  { namespace: 'hashicorp', name: 'aws', description: 'Amazon Web Services' },
  { namespace: 'hashicorp', name: 'azurerm', description: 'Microsoft Azure' },
  { namespace: 'hashicorp', name: 'google', description: 'Google Cloud Platform' },
  { namespace: 'hashicorp', name: 'kubernetes', description: 'Kubernetes' },

  // Other clouds we want in the catalog
  { namespace: 'digitalocean', name: 'digitalocean', description: 'DigitalOcean' },
  { namespace: 'cloudflare', name: 'cloudflare', description: 'Cloudflare' },
  { namespace: 'aliyun', name: 'alicloud', description: 'Alibaba Cloud' },
  { namespace: 'oracle', name: 'oci', description: 'Oracle Cloud Infrastructure' },
  { namespace: 'IBM-Cloud', name: 'ibm', description: 'IBM Cloud' },
  { namespace: 'ovh', name: 'ovh', description: 'OVHcloud' },
];

// =============================================================================
// Terraform CLI Extractor
// =============================================================================

export class TerraformCliExtractor {
  private readonly config: ExtractorConfig;
  private workDir: string | null = null;

  constructor(config: ExtractorConfig) {
    this.config = config;
  }

  /**
   * Check if Terraform CLI is available
   */
  static is_available(): boolean {
    try {
      execSync('terraform version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Terraform version
   */
  static get_version(): string | null {
    try {
      const output = execSync('terraform version -json', { stdio: 'pipe' }).toString();
      const version = JSON.parse(output);
      return version.terraform_version;
    } catch {
      return null;
    }
  }

  /**
   * Discover available providers
   */
  async discover_providers(): Promise<ProviderMetadata[]> {
    return TERRAFORM_PROVIDERS.map((p) => ({
      id: `${p.namespace}/${p.name}`,
      name: p.name,
      namespace: p.namespace,
      version: p.version || 'latest',
      description: p.description,
      source: 'terraform' as const,
      resource_count: 0,
      categories: [],
      docs_url: `https://registry.terraform.io/providers/${p.namespace}/${p.name}/latest/docs`,
    }));
  }

  /**
   * Extract schemas from a provider using Terraform CLI
   */
  async extract_provider(provider_id: string): Promise<ExtractionResult> {
    const start_time = Date.now();
    const [namespace, name] = provider_id.split('/');

    if (!TerraformCliExtractor.is_available()) {
      return this.create_error_result(
        provider_id,
        start_time,
        'Terraform CLI not found. Install Terraform to extract schemas.',
      );
    }

    try {
      // Create temporary working directory
      this.workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'terraform-schema-'));

      // Generate provider configuration
      const provider_config = this.generate_provider_config(namespace, name);
      fs.writeFileSync(path.join(this.workDir, 'providers.tf'), provider_config);

      // Run terraform init
      console.log(`      Initializing ${provider_id}...`);
      await this.run_terraform_init();

      // Run terraform providers schema
      console.log(`      Extracting schema...`);
      const schema_json = await this.run_terraform_schema();

      // Parse and convert schemas
      const result = this.parse_schema_json(schema_json, namespace, name, start_time);

      return result;
    } catch (error) {
      return this.create_error_result(provider_id, start_time, error instanceof Error ? error.message : String(error));
    } finally {
      // Cleanup
      if (this.workDir && fs.existsSync(this.workDir)) {
        fs.rmSync(this.workDir, { recursive: true, force: true });
        this.workDir = null;
      }
    }
  }

  /**
   * Extract multiple providers in parallel (with concurrency limit)
   */
  async extract_providers(provider_ids: string[], concurrency: number = 2): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < provider_ids.length; i += concurrency) {
      const batch = provider_ids.slice(i, i + concurrency);
      const batch_results = await Promise.all(batch.map((id) => this.extract_provider(id)));
      results.push(...batch_results);
    }

    return results;
  }

  /**
   * Generate Terraform provider configuration
   */
  private generate_provider_config(namespace: string, name: string, version?: string): string {
    const version_line = version ? `\n      version = "${version}"` : '';

    return `
terraform {
  required_providers {
    ${name} = {
      source = "${namespace}/${name}"${version_line}
    }
  }
}

provider "${name}" {}
`;
  }

  /**
   * Run terraform init
   */
  private async run_terraform_init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('terraform', ['init', '-no-color'], {
        cwd: this.workDir!,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data;
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`terraform init failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Run terraform providers schema -json
   */
  private async run_terraform_schema(): Promise<TerraformSchemaJson> {
    return new Promise((resolve, reject) => {
      const proc = spawn('terraform', ['providers', 'schema', '-json'], {
        cwd: this.workDir!,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 500 * 1024 * 1024, // 500MB buffer for large schemas
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data;
      });
      proc.stderr.on('data', (data) => {
        stderr += data;
      });

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(new Error(`Failed to parse schema JSON: ${e}`));
          }
        } else {
          reject(new Error(`terraform providers schema failed: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Parse Terraform schema JSON into extraction result
   */
  private parse_schema_json(
    schema: TerraformSchemaJson,
    namespace: string,
    name: string,
    start_time: number,
  ): ExtractionResult {
    const resources: ExtractedResourceSchema[] = [];
    const data_sources: ExtractedResourceSchema[] = [];
    const errors: ExtractionError[] = [];
    const categories_found = new Set<string>();

    // Find the provider schema. Terraform lowercases the namespace in the
    // JSON output (e.g. our "IBM-Cloud/ibm" comes back as
    // "registry.terraform.io/ibm-cloud/ibm"), so the comparison must be
    // case-insensitive — otherwise the provider extracts to 0 resources
    // even though the schema is right there.
    const target = `${namespace}/${name}`.toLowerCase();
    const target_full = `registry.terraform.io/${target}`;
    const provider_key = Object.keys(schema.provider_schemas).find((k) => {
      const lk = k.toLowerCase();
      return lk.includes(target) || lk.includes(target_full);
    });

    if (!provider_key) {
      return this.create_error_result(`${namespace}/${name}`, start_time, 'Provider schema not found in output');
    }

    const provider_schema = schema.provider_schemas[provider_key];

    // Extract resources
    if (provider_schema.resource_schemas) {
      for (const [resource_type, resource_schema] of Object.entries(provider_schema.resource_schemas)) {
        try {
          const extracted = this.extract_resource(resource_type, resource_schema, namespace, name, false);

          // Extract category from resource type
          const category = this.extract_category(resource_type, name);
          if (category) {
            categories_found.add(category);
            extracted.category = category;
          }

          resources.push(extracted);
        } catch (error) {
          errors.push({
            resource_type,
            error: error instanceof Error ? error.message : String(error),
            recoverable: true,
          });
        }
      }
    }

    // Extract data sources
    if (provider_schema.data_source_schemas) {
      for (const [ds_type, ds_schema] of Object.entries(provider_schema.data_source_schemas)) {
        try {
          const extracted = this.extract_resource(ds_type, ds_schema, namespace, name, true);

          const category = this.extract_category(ds_type, name);
          if (category) {
            categories_found.add(category);
            extracted.category = category;
          }

          data_sources.push(extracted);
        } catch (error) {
          errors.push({
            resource_type: `data.${ds_type}`,
            error: error instanceof Error ? error.message : String(error),
            recoverable: true,
          });
        }
      }
    }

    const metadata: ExtractionMetadata = {
      extracted_at: new Date().toISOString(),
      source_version: 'cli',
      total_resources: resources.length + data_sources.length + errors.length,
      successful_extractions: resources.length + data_sources.length,
      failed_extractions: errors.length,
      duration_ms: Date.now() - start_time,
      categories_found: Array.from(categories_found),
    };

    return {
      success: true,
      source: 'terraform',
      provider: {
        id: `${namespace}/${name}`,
        name,
        namespace,
        version: 'latest',
        description: '',
        source: 'terraform',
        resource_count: resources.length,
        data_source_count: data_sources.length,
        categories: Array.from(categories_found),
        docs_url: `https://registry.terraform.io/providers/${namespace}/${name}/latest/docs`,
      },
      resources,
      data_sources,
      errors,
      metadata,
    };
  }

  /**
   * Extract a single resource schema
   */
  private extract_resource(
    resource_type: string,
    schema: TerraformResourceSchemaJson,
    namespace: string,
    name: string,
    is_data_source: boolean,
  ): ExtractedResourceSchema {
    const block = schema.block;
    const input_properties: PropertyDefinition[] = [];
    const output_properties: PropertyDefinition[] = [];
    const required_inputs: string[] = [];

    // Extract attributes
    if (block.attributes) {
      for (const [attr_name, attr] of Object.entries(block.attributes)) {
        const prop = this.convert_attribute(attr_name, attr);

        if (attr.computed && !attr.optional && !attr.required) {
          output_properties.push(prop);
        } else {
          input_properties.push(prop);
          if (attr.required) {
            required_inputs.push(attr_name);
          }
        }
      }
    }

    // Extract block types as nested properties
    if (block.block_types) {
      for (const [block_name, block_type] of Object.entries(block.block_types)) {
        const prop = this.convert_block_type(block_name, block_type);
        input_properties.push(prop);

        if ((block_type.min_items || 0) > 0) {
          required_inputs.push(block_name);
        }
      }
    }

    const prefix = is_data_source ? 'data-sources' : 'resources';
    const resource_slug = resource_type.replace(`${name}_`, '');

    return {
      source_type: resource_type,
      source: 'terraform',
      provider_name: `${namespace}/${name}`,
      provider_namespace: namespace,
      category: undefined, // Set by caller
      description: block.description || '',
      input_properties,
      output_properties,
      required_inputs,
      deprecated: block.deprecated || false,
      documentation_url: `https://registry.terraform.io/providers/${namespace}/${name}/latest/docs/${prefix}/${resource_slug}`,
      provider_version: 'latest',
    };
  }

  /**
   * Convert Terraform attribute to property definition
   */
  private convert_attribute(name: string, attr: TerraformAttributeJson): PropertyDefinition {
    let type: PropertyType;
    let nested_properties: PropertyDefinition[] | undefined;
    let element_type: PropertyType | undefined;

    if (attr.nested_type) {
      type = this.nesting_mode_to_type(attr.nested_type.nesting_mode);
      nested_properties = Object.entries(attr.nested_type.attributes).map(([n, a]) => this.convert_attribute(n, a));
    } else {
      const type_info = this.parse_terraform_type(attr.type);
      type = type_info.type;
      element_type = type_info.element_type;
    }

    const validation: ValidationDefinition | undefined =
      attr.nested_type?.min_items !== undefined || attr.nested_type?.max_items !== undefined
        ? {
            min_items: attr.nested_type?.min_items,
            max_items: attr.nested_type?.max_items,
          }
        : undefined;

    return {
      name,
      type,
      description: attr.description || '',
      required: attr.required || false,
      computed: attr.computed || false,
      sensitive: attr.sensitive || false,
      deprecated: attr.deprecated || false,
      nested_properties,
      element_type,
      validation,
    };
  }

  /**
   * Convert Terraform block type to property definition
   */
  private convert_block_type(name: string, block_type: TerraformBlockTypeJson): PropertyDefinition {
    const nested_properties = this.extract_block_properties(block_type.block);
    const type = this.nesting_mode_to_type(block_type.nesting_mode);

    const validation: ValidationDefinition | undefined =
      block_type.min_items !== undefined || block_type.max_items !== undefined
        ? {
            min_items: block_type.min_items,
            max_items: block_type.max_items,
          }
        : undefined;

    return {
      name,
      type,
      description: block_type.block.description || '',
      required: (block_type.min_items || 0) > 0,
      computed: false,
      sensitive: false,
      deprecated: block_type.block.deprecated || false,
      nested_properties,
      validation,
    };
  }

  /**
   * Extract properties from a block schema
   */
  private extract_block_properties(block: TerraformBlockSchemaJson): PropertyDefinition[] {
    const properties: PropertyDefinition[] = [];

    if (block.attributes) {
      for (const [name, attr] of Object.entries(block.attributes)) {
        properties.push(this.convert_attribute(name, attr));
      }
    }

    if (block.block_types) {
      for (const [name, bt] of Object.entries(block.block_types)) {
        properties.push(this.convert_block_type(name, bt));
      }
    }

    return properties;
  }

  /**
   * Convert nesting mode to property type
   */
  private nesting_mode_to_type(mode: string): PropertyType {
    switch (mode) {
      case 'single':
        return 'object';
      case 'list':
      case 'set':
        return 'array';
      case 'map':
        return 'map';
      default:
        return 'object';
    }
  }

  /**
   * Parse Terraform type to ICE type
   */
  private parse_terraform_type(tf_type: unknown): {
    type: PropertyType;
    element_type?: PropertyType;
  } {
    if (typeof tf_type === 'string') {
      return { type: this.map_simple_type(tf_type) };
    }

    if (Array.isArray(tf_type)) {
      const [container, element] = tf_type;

      if (container === 'list' || container === 'set') {
        return {
          type: 'array',
          element_type: typeof element === 'string' ? this.map_simple_type(element) : 'object',
        };
      }

      if (container === 'map') {
        return {
          type: 'map',
          element_type: typeof element === 'string' ? this.map_simple_type(element) : 'any',
        };
      }

      if (container === 'object') {
        return { type: 'object' };
      }
    }

    return { type: 'any' };
  }

  /**
   * Map simple Terraform type to ICE type
   */
  private map_simple_type(tf_type: string): PropertyType {
    switch (tf_type) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'bool':
        return 'boolean';
      default:
        return 'any';
    }
  }

  /**
   * Extract category from resource type
   */
  private extract_category(resource_type: string, provider_name: string): string | undefined {
    // Remove provider prefix: aws_vpc -> vpc, aws_ec2_instance -> ec2_instance
    const without_prefix = resource_type.replace(`${provider_name}_`, '');

    // Extract first part as category: ec2_instance -> ec2
    const parts = without_prefix.split('_');
    if (parts.length > 1) {
      return parts[0];
    }

    return without_prefix;
  }

  /**
   * Create error result
   */
  private create_error_result(provider_id: string, start_time: number, error: string): ExtractionResult {
    const [namespace, name] = provider_id.split('/');

    return {
      success: false,
      source: 'terraform',
      provider: {
        id: provider_id,
        name: name || provider_id,
        namespace: namespace || 'unknown',
        version: 'unknown',
        description: '',
        source: 'terraform',
        resource_count: 0,
        categories: [],
        docs_url: '',
      },
      resources: [],
      errors: [{ error, recoverable: false }],
      metadata: {
        extracted_at: new Date().toISOString(),
        source_version: 'unknown',
        total_resources: 0,
        successful_extractions: 0,
        failed_extractions: 1,
        duration_ms: Date.now() - start_time,
        categories_found: [],
      },
    };
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function create_terraform_cli_extractor(config: ExtractorConfig): TerraformCliExtractor {
  return new TerraformCliExtractor(config);
}
