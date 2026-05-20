/**
 * Terraform Schema Extractor
 *
 * Dynamically discovers and extracts ALL resource schemas from the
 * Terraform Registry API. No hardcoded providers or categories -
 * everything is discovered from the registry.
 */

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
// Terraform Registry API Types
// =============================================================================

interface TerraformProviderListResponse {
  providers: TerraformProviderListItem[];
  meta: {
    limit: number;
    current_offset: number;
    next_offset?: number;
    next_url?: string;
  };
}

interface TerraformProviderListItem {
  id: string;
  namespace: string;
  name: string;
  version: string;
  description: string;
  downloads: number;
  tier: string;
  logo_url?: string;
}

interface TerraformProviderVersionsResponse {
  data: TerraformProviderVersion[];
}

interface TerraformProviderVersion {
  type: string;
  id: string;
  attributes: {
    version: string;
    protocols: string[];
    platforms: { os: string; arch: string }[];
  };
}

interface TerraformProviderDocsResponse {
  data: TerraformDocItem[];
}

interface TerraformDocItem {
  id: string;
  type: string;
  attributes: {
    category: string;
    slug: string;
    subcategory: string;
    title: string;
    description?: string;
  };
}

interface TerraformProviderSchema {
  provider_schemas: Record<string, TerraformProviderSchemaContent>;
}

interface TerraformProviderSchemaContent {
  provider: TerraformBlockSchema;
  resource_schemas: Record<string, TerraformResourceSchema>;
  data_source_schemas: Record<string, TerraformResourceSchema>;
}

interface TerraformResourceSchema {
  version: number;
  block: TerraformBlockSchema;
}

interface TerraformBlockSchema {
  attributes?: Record<string, TerraformAttribute>;
  block_types?: Record<string, TerraformBlockType>;
  description?: string;
  description_kind?: string;
  deprecated?: boolean;
}

interface TerraformAttribute {
  type: unknown;
  nested_type?: TerraformNestedType;
  description?: string;
  description_kind?: string;
  required?: boolean;
  optional?: boolean;
  computed?: boolean;
  sensitive?: boolean;
  deprecated?: boolean;
}

interface TerraformNestedType {
  attributes: Record<string, TerraformAttribute>;
  nesting_mode: string;
}

interface TerraformBlockType {
  nesting_mode: string;
  block: TerraformBlockSchema;
  min_items?: number;
  max_items?: number;
}

// =============================================================================
// Terraform Extractor Class
// =============================================================================

export class TerraformExtractor {
  private readonly config: ExtractorConfig;
  private readonly cache: Map<string, unknown> = new Map();

  constructor(config: ExtractorConfig) {
    this.config = config;
  }

  /**
   * Discover all available providers from Terraform Registry.
   */
  async discover_providers(): Promise<ProviderMetadata[]> {
    const providers: ProviderMetadata[] = [];

    try {
      // Fetch provider list from registry
      const response = await this.fetch_with_retry<TerraformProviderListResponse>(
        `${this.config.terraform_registry_url}/providers`,
      );

      if (!response?.providers) {
        return providers;
      }

      for (const item of response.providers) {
        const full_name = `${item.namespace}/${item.name}`;

        // Use version from the list response directly
        const latest_version = item.version || 'unknown';

        const docs = await this.fetch_provider_docs(item.namespace, item.name, latest_version);

        const categories = this.extract_categories_from_docs(docs);
        const resource_count = docs.filter((d) => d.attributes.category === 'resources').length;
        const data_source_count = docs.filter((d) => d.attributes.category === 'data-sources').length;

        providers.push({
          id: full_name,
          name: item.name,
          namespace: item.namespace,
          version: latest_version,
          description: item.description || '',
          source: 'terraform',
          resource_count,
          data_source_count,
          categories,
          docs_url: `https://registry.terraform.io/providers/${full_name}/latest/docs`,
        });
      }
    } catch (error) {
      console.error('Failed to discover providers:', error);
    }

    return providers;
  }

  /**
   * Extract ALL resources from a specific provider.
   */
  async extract_provider(provider_id: string): Promise<ExtractionResult> {
    const start_time = Date.now();
    const resources: ExtractedResourceSchema[] = [];
    const data_sources: ExtractedResourceSchema[] = [];
    const errors: ExtractionError[] = [];
    const categories_found = new Set<string>();

    const [namespace, name] = provider_id.split('/');

    try {
      // Get provider metadata
      const provider_metadata = await this.get_provider_metadata(namespace, name);

      if (!provider_metadata) {
        return this.create_error_result(provider_id, start_time, `Provider ${provider_id} not found`);
      }

      // Get provider schema (contains all resources)
      const schema = await this.fetch_provider_schema(namespace, name, provider_metadata.version);

      if (!schema) {
        return this.create_error_result(provider_id, start_time, `Failed to fetch schema for ${provider_id}`);
      }

      // Get documentation for categories
      const docs = await this.fetch_provider_docs(namespace, name, provider_metadata.version);
      const doc_map = this.build_doc_map(docs);

      // Extract all resources
      const provider_schema_key = Object.keys(schema.provider_schemas)[0];
      const provider_content = schema.provider_schemas[provider_schema_key];

      if (provider_content?.resource_schemas) {
        for (const [resource_type, resource_schema] of Object.entries(provider_content.resource_schemas)) {
          try {
            const doc_info = doc_map.get(resource_type);
            const extracted = this.extract_resource(
              resource_type,
              resource_schema,
              namespace,
              name,
              provider_metadata.version,
              doc_info,
            );

            if (extracted.category) {
              categories_found.add(extracted.category);
            }

            if (!extracted.deprecated || this.config.include_deprecated) {
              resources.push(extracted);
            }
          } catch (error) {
            errors.push({
              resource_type,
              error: error instanceof Error ? error.message : String(error),
              recoverable: true,
            });
          }
        }
      }

      // Extract all data sources
      if (provider_content?.data_source_schemas) {
        for (const [data_source_type, data_source_schema] of Object.entries(provider_content.data_source_schemas)) {
          try {
            const doc_info = doc_map.get(`data.${data_source_type}`);
            const extracted = this.extract_resource(
              data_source_type,
              data_source_schema,
              namespace,
              name,
              provider_metadata.version,
              doc_info,
              true,
            );

            if (extracted.category) {
              categories_found.add(extracted.category);
            }

            if (!extracted.deprecated || this.config.include_deprecated) {
              data_sources.push(extracted);
            }
          } catch (error) {
            errors.push({
              resource_type: `data.${data_source_type}`,
              error: error instanceof Error ? error.message : String(error),
              recoverable: true,
            });
          }
        }
      }

      const metadata: ExtractionMetadata = {
        extracted_at: new Date().toISOString(),
        source_version: provider_metadata.version,
        total_resources: resources.length + data_sources.length + errors.length,
        successful_extractions: resources.length + data_sources.length,
        failed_extractions: errors.length,
        duration_ms: Date.now() - start_time,
        categories_found: Array.from(categories_found),
      };

      return {
        success: true,
        source: 'terraform',
        provider: provider_metadata,
        resources,
        data_sources,
        errors,
        metadata,
      };
    } catch (error) {
      return this.create_error_result(provider_id, start_time, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Extract a single resource schema.
   */
  private extract_resource(
    resource_type: string,
    schema: TerraformResourceSchema,
    namespace: string,
    name: string,
    version: string,
    doc_info?: { category: string; subcategory: string; description?: string },
    is_data_source = false,
  ): ExtractedResourceSchema {
    const block = schema.block;
    const input_properties: PropertyDefinition[] = [];
    const output_properties: PropertyDefinition[] = [];
    const required_inputs: string[] = [];

    // Extract all attributes
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

    // Extract all block types as nested properties
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
      category: doc_info?.category || doc_info?.subcategory,
      subcategory: doc_info?.subcategory,
      description: block.description || doc_info?.description || '',
      input_properties,
      output_properties,
      required_inputs,
      deprecated: block.deprecated || false,
      documentation_url: `https://registry.terraform.io/providers/${namespace}/${name}/latest/docs/${prefix}/${resource_slug}`,
      provider_version: version,
    };
  }

  /**
   * Convert Terraform attribute to property definition.
   */
  private convert_attribute(name: string, attr: TerraformAttribute): PropertyDefinition {
    let type: PropertyType;
    let nested_properties: PropertyDefinition[] | undefined;
    let element_type: PropertyType | undefined;

    if (attr.nested_type) {
      type = attr.nested_type.nesting_mode === 'list' ? 'array' : 'object';
      nested_properties = Object.entries(attr.nested_type.attributes).map(([n, a]) => this.convert_attribute(n, a));
    } else {
      const type_info = this.parse_terraform_type(attr.type);
      type = type_info.type;
      element_type = type_info.element_type;
    }

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
    };
  }

  /**
   * Convert Terraform block type to property definition.
   */
  private convert_block_type(name: string, block_type: TerraformBlockType): PropertyDefinition {
    const nested_properties = this.extract_block_properties(block_type.block);

    const type: PropertyType =
      block_type.nesting_mode === 'list' || block_type.nesting_mode === 'set' ? 'array' : 'object';

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
   * Extract properties from a block schema.
   */
  private extract_block_properties(block: TerraformBlockSchema): PropertyDefinition[] {
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
   * Parse Terraform type to ICE type.
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
   * Map simple Terraform type to ICE type.
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
   * Fetch provider versions from registry.
   */
  private async fetch_provider_versions(namespace: string, name: string): Promise<TerraformProviderVersion[]> {
    try {
      const response = await this.fetch_with_retry<TerraformProviderVersionsResponse>(
        `${this.config.terraform_registry_url}/providers/${namespace}/${name}/versions`,
      );
      return response?.data || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch provider documentation from registry.
   */
  private async fetch_provider_docs(namespace: string, name: string, version: string): Promise<TerraformDocItem[]> {
    try {
      const response = await this.fetch_with_retry<TerraformProviderDocsResponse>(
        `${this.config.terraform_registry_url}/providers/${namespace}/${name}/${version}/docs`,
      );
      return response?.data || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch provider schema from registry.
   */
  private async fetch_provider_schema(
    namespace: string,
    name: string,
    version: string,
  ): Promise<TerraformProviderSchema | null> {
    const cache_key = `terraform:schema:${namespace}/${name}:${version}`;

    if (this.cache.has(cache_key)) {
      return this.cache.get(cache_key) as TerraformProviderSchema;
    }

    try {
      // Note: The actual schema endpoint requires running terraform providers schema
      // For now, we simulate with the doc-based approach
      // In production, this would use terraform CLI or the provider binary
      const schema = await this.simulate_schema_from_docs(namespace, name, version);
      this.cache.set(cache_key, schema);
      return schema;
    } catch {
      return null;
    }
  }

  /**
   * Simulate schema from documentation (development placeholder).
   * In production, this should use `terraform providers schema -json` command.
   */
  private async simulate_schema_from_docs(
    namespace: string,
    name: string,
    _version: string,
  ): Promise<TerraformProviderSchema> {
    // This is a placeholder - in production, run:
    // terraform providers schema -json
    // after configuring the provider in a .tf file

    const docs = await this.fetch_provider_docs(namespace, name, _version);

    const resource_schemas: Record<string, TerraformResourceSchema> = {};

    // Create basic schemas from doc entries
    for (const doc of docs) {
      if (doc.attributes.category === 'resources') {
        const resource_type = `${name}_${doc.attributes.slug}`;
        resource_schemas[resource_type] = {
          version: 0,
          block: {
            description: doc.attributes.description || doc.attributes.title,
            attributes: {
              id: { type: 'string', computed: true, description: 'Resource ID' },
            },
          },
        };
      }
    }

    return {
      provider_schemas: {
        [`registry.terraform.io/${namespace}/${name}`]: {
          provider: { attributes: {} },
          resource_schemas,
          data_source_schemas: {},
        },
      },
    };
  }

  /**
   * Get provider metadata.
   */
  private async get_provider_metadata(namespace: string, name: string): Promise<ProviderMetadata | null> {
    try {
      const versions = await this.fetch_provider_versions(namespace, name);
      const latest_version = versions[0]?.attributes.version || 'unknown';

      const docs = await this.fetch_provider_docs(namespace, name, latest_version);
      const categories = this.extract_categories_from_docs(docs);

      const resources = docs.filter((d) => d.attributes.category === 'resources');
      const data_sources = docs.filter((d) => d.attributes.category === 'data-sources');

      return {
        id: `${namespace}/${name}`,
        name,
        namespace,
        version: latest_version,
        description: '',
        source: 'terraform',
        resource_count: resources.length,
        data_source_count: data_sources.length,
        categories,
        docs_url: `https://registry.terraform.io/providers/${namespace}/${name}/latest/docs`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract unique categories from documentation.
   */
  private extract_categories_from_docs(docs: TerraformDocItem[]): string[] {
    const categories = new Set<string>();

    for (const doc of docs) {
      if (doc.attributes.subcategory) {
        categories.add(doc.attributes.subcategory);
      }
    }

    return Array.from(categories);
  }

  /**
   * Build a map of resource type to doc info.
   */
  private build_doc_map(
    docs: TerraformDocItem[],
  ): Map<string, { category: string; subcategory: string; description?: string }> {
    const map = new Map<string, { category: string; subcategory: string; description?: string }>();

    for (const doc of docs) {
      map.set(doc.attributes.slug, {
        category: doc.attributes.category,
        subcategory: doc.attributes.subcategory,
        description: doc.attributes.description,
      });
    }

    return map;
  }

  /**
   * Fetch with retry and caching.
   */
  private async fetch_with_retry<T>(url: string): Promise<T | null> {
    const cache_key = `fetch:${url}`;

    if (this.cache.has(cache_key)) {
      return this.cache.get(cache_key) as T;
    }

    for (let attempt = 0; attempt < this.config.retry_attempts; attempt++) {
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(this.config.timeout_ms),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as T;
        this.cache.set(cache_key, data);
        return data;
      } catch (error) {
        if (attempt === this.config.retry_attempts - 1) {
          throw error;
        }
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return null;
  }

  /**
   * Create error result.
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

export function create_terraform_extractor(config: ExtractorConfig): TerraformExtractor {
  return new TerraformExtractor(config);
}
