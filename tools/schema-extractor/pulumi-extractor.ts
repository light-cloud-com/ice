/**
 * Pulumi Schema Extractor
 *
 * Dynamically discovers and extracts ALL resource schemas from the
 * Pulumi Registry. No hardcoded providers or categories -
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
// Known Pulumi Providers (no public discovery API available)
// =============================================================================

/**
 * List of known Pulumi providers with their GitHub schema locations.
 * Pulumi doesn't have a public API for listing packages, so we maintain
 * a curated list of popular providers.
 */
const KNOWN_PULUMI_PROVIDERS: KnownProvider[] = [
  // Cloud Providers
  {
    name: 'aws',
    repo: 'pulumi/pulumi-aws',
    description: 'Amazon Web Services (AWS)',
    category: 'Cloud',
  },
  {
    name: 'azure',
    repo: 'pulumi/pulumi-azure',
    description: 'Microsoft Azure (Classic)',
    category: 'Cloud',
  },
  {
    name: 'azure-native',
    repo: 'pulumi/pulumi-azure-native',
    description: 'Microsoft Azure Native',
    category: 'Cloud',
  },
  {
    name: 'gcp',
    repo: 'pulumi/pulumi-gcp',
    description: 'Google Cloud Platform',
    category: 'Cloud',
  },
  {
    name: 'google-native',
    repo: 'pulumi/pulumi-google-native',
    description: 'Google Cloud Native',
    category: 'Cloud',
  },
  {
    name: 'digitalocean',
    repo: 'pulumi/pulumi-digitalocean',
    description: 'DigitalOcean',
    category: 'Cloud',
  },
  { name: 'linode', repo: 'pulumi/pulumi-linode', description: 'Linode', category: 'Cloud' },
  {
    name: 'alicloud',
    repo: 'pulumi/pulumi-alicloud',
    description: 'Alibaba Cloud',
    category: 'Cloud',
  },
  {
    name: 'oci',
    repo: 'pulumi/pulumi-oci',
    description: 'Oracle Cloud Infrastructure',
    category: 'Cloud',
  },

  // Kubernetes & Containers
  {
    name: 'kubernetes',
    repo: 'pulumi/pulumi-kubernetes',
    description: 'Kubernetes',
    category: 'Containers',
  },
  { name: 'docker', repo: 'pulumi/pulumi-docker', description: 'Docker', category: 'Containers' },

  // Infrastructure
  {
    name: 'cloudflare',
    repo: 'pulumi/pulumi-cloudflare',
    description: 'Cloudflare',
    category: 'Infrastructure',
  },
  {
    name: 'fastly',
    repo: 'pulumi/pulumi-fastly',
    description: 'Fastly CDN',
    category: 'Infrastructure',
  },
  {
    name: 'akamai',
    repo: 'pulumi/pulumi-akamai',
    description: 'Akamai',
    category: 'Infrastructure',
  },

  // Databases
  {
    name: 'postgresql',
    repo: 'pulumi/pulumi-postgresql',
    description: 'PostgreSQL',
    category: 'Database',
  },
  { name: 'mysql', repo: 'pulumi/pulumi-mysql', description: 'MySQL', category: 'Database' },
  {
    name: 'mongodbatlas',
    repo: 'pulumi/pulumi-mongodbatlas',
    description: 'MongoDB Atlas',
    category: 'Database',
  },

  // DevOps & CI/CD
  { name: 'github', repo: 'pulumi/pulumi-github', description: 'GitHub', category: 'DevOps' },
  { name: 'gitlab', repo: 'pulumi/pulumi-gitlab', description: 'GitLab', category: 'DevOps' },
  {
    name: 'datadog',
    repo: 'pulumi/pulumi-datadog',
    description: 'Datadog',
    category: 'Monitoring',
  },
  {
    name: 'newrelic',
    repo: 'pulumi/pulumi-newrelic',
    description: 'New Relic',
    category: 'Monitoring',
  },
  {
    name: 'pagerduty',
    repo: 'pulumi/pulumi-pagerduty',
    description: 'PagerDuty',
    category: 'Monitoring',
  },

  // Auth & Security
  {
    name: 'vault',
    repo: 'pulumi/pulumi-vault',
    description: 'HashiCorp Vault',
    category: 'Security',
  },
  { name: 'auth0', repo: 'pulumi/pulumi-auth0', description: 'Auth0', category: 'Security' },
  { name: 'okta', repo: 'pulumi/pulumi-okta', description: 'Okta', category: 'Security' },

  // Networking
  {
    name: 'consul',
    repo: 'pulumi/pulumi-consul',
    description: 'HashiCorp Consul',
    category: 'Networking',
  },
  { name: 'ns1', repo: 'pulumi/pulumi-ns1', description: 'NS1 DNS', category: 'Networking' },
  {
    name: 'dnsimple',
    repo: 'pulumi/pulumi-dnsimple',
    description: 'DNSimple',
    category: 'Networking',
  },

  // Messaging
  {
    name: 'kafka',
    repo: 'pulumi/pulumi-kafka',
    description: 'Apache Kafka',
    category: 'Messaging',
  },
  {
    name: 'rabbitmq',
    repo: 'pulumi/pulumi-rabbitmq',
    description: 'RabbitMQ',
    category: 'Messaging',
  },

  // Other
  {
    name: 'random',
    repo: 'pulumi/pulumi-random',
    description: 'Random Provider',
    category: 'Utility',
  },
  { name: 'tls', repo: 'pulumi/pulumi-tls', description: 'TLS Provider', category: 'Security' },
  {
    name: 'command',
    repo: 'pulumi/pulumi-command',
    description: 'Command Provider',
    category: 'Utility',
  },
];

interface KnownProvider {
  name: string;
  repo: string;
  description: string;
  category: string;
}

// =============================================================================
// Pulumi Registry API Types
// =============================================================================

interface PulumiPackageSchema {
  name: string;
  displayName?: string;
  version: string;
  description?: string;
  keywords?: string[];
  homepage?: string;
  repository?: string;
  publisher?: string;
  meta?: {
    moduleFormat?: string;
  };
  config?: PulumiConfigSchema;
  provider?: PulumiResourceDefinition;
  resources?: Record<string, PulumiResourceDefinition>;
  functions?: Record<string, PulumiFunctionDefinition>;
  types?: Record<string, PulumiTypeDefinition>;
  language?: Record<string, unknown>;
}

interface PulumiConfigSchema {
  variables?: Record<string, PulumiPropertySchema>;
  required?: string[];
}

interface PulumiResourceDefinition {
  description?: string;
  inputProperties?: Record<string, PulumiPropertySchema>;
  requiredInputs?: string[];
  properties?: Record<string, PulumiPropertySchema>;
  required?: string[];
  stateInputs?: PulumiObjectTypeSpec;
  aliases?: PulumiAlias[];
  deprecationMessage?: string;
  isComponent?: boolean;
  methods?: Record<string, string>;
}

interface PulumiFunctionDefinition {
  description?: string;
  inputs?: PulumiObjectTypeSpec;
  outputs?: PulumiObjectTypeSpec;
  deprecationMessage?: string;
}

interface PulumiObjectTypeSpec {
  description?: string;
  properties?: Record<string, PulumiPropertySchema>;
  required?: string[];
  type?: string;
}

interface PulumiPropertySchema {
  type?: string;
  $ref?: string;
  description?: string;
  default?: unknown;
  defaultInfo?: {
    environment?: string[];
  };
  deprecationMessage?: string;
  language?: Record<string, unknown>;
  secret?: boolean;
  replaceOnChanges?: boolean;
  willReplaceOnChanges?: boolean;
  items?: PulumiPropertySchema;
  additionalProperties?: PulumiPropertySchema;
  oneOf?: PulumiPropertySchema[];
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
  const?: unknown;
  enum?: PulumiEnumValue[];
  plain?: boolean;

  // Validation constraints
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
}

interface PulumiEnumValue {
  value: string | number | boolean;
  name?: string;
  description?: string;
  deprecationMessage?: string;
}

interface PulumiTypeDefinition {
  type?: string;
  description?: string;
  properties?: Record<string, PulumiPropertySchema>;
  required?: string[];
  enum?: PulumiEnumValue[];
  isOverlay?: boolean;
}

interface PulumiAlias {
  name?: string;
  project?: string;
  type?: string;
}

// =============================================================================
// Pulumi Extractor Class
// =============================================================================

export class PulumiExtractor {
  private readonly config: ExtractorConfig;
  private readonly cache: Map<string, unknown> = new Map();

  constructor(config: ExtractorConfig) {
    this.config = config;
  }

  /**
   * Discover all available packages from known Pulumi providers list.
   * Note: Pulumi doesn't have a public discovery API, so we use a curated list.
   */
  async discover_providers(): Promise<ProviderMetadata[]> {
    const providers: ProviderMetadata[] = [];

    for (const known of KNOWN_PULUMI_PROVIDERS) {
      providers.push({
        id: `pulumi/${known.name}`,
        name: known.name,
        namespace: 'pulumi',
        version: 'latest', // Version determined when fetching schema
        description: known.description,
        source: 'pulumi',
        resource_count: 0, // Will be populated when extracting
        categories: [known.category],
        docs_url: `https://www.pulumi.com/registry/packages/${known.name}/`,
      });
    }

    return providers;
  }

  /**
   * Extract ALL resources from a specific package.
   */
  async extract_provider(provider_id: string): Promise<ExtractionResult> {
    const start_time = Date.now();
    const resources: ExtractedResourceSchema[] = [];
    const errors: ExtractionError[] = [];
    const categories_found = new Set<string>();

    const [namespace, name] = provider_id.includes('/')
      ? provider_id.split('/')
      : ['pulumi', provider_id];

    try {
      // Fetch the full package schema
      const schema = await this.fetch_package_schema(name);

      if (!schema) {
        return this.create_error_result(
          provider_id,
          start_time,
          `Package ${provider_id} not found or schema unavailable`
        );
      }

      const type_registry = schema.types || {};

      // Extract all resources
      if (schema.resources) {
        for (const [resource_type, resource_def] of Object.entries(schema.resources)) {
          try {
            // Skip deprecated unless configured to include
            if (resource_def.deprecationMessage && !this.config.include_deprecated) {
              continue;
            }

            const extracted = this.extract_resource(
              resource_type,
              resource_def,
              schema.name,
              namespace,
              schema.version,
              type_registry
            );

            // Extract category from resource type path
            const category = this.extract_category_from_type(resource_type);
            if (category) {
              categories_found.add(category);
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

      const provider_metadata: ProviderMetadata = {
        id: provider_id,
        name: schema.name,
        namespace,
        version: schema.version,
        description: schema.description || '',
        source: 'pulumi',
        resource_count: resources.length,
        categories: Array.from(categories_found),
        docs_url: `https://www.pulumi.com/registry/packages/${schema.name}/`,
      };

      const metadata: ExtractionMetadata = {
        extracted_at: new Date().toISOString(),
        source_version: schema.version,
        total_resources: resources.length + errors.length,
        successful_extractions: resources.length,
        failed_extractions: errors.length,
        duration_ms: Date.now() - start_time,
        categories_found: Array.from(categories_found),
      };

      return {
        success: true,
        source: 'pulumi',
        provider: provider_metadata,
        resources,
        errors,
        metadata,
      };
    } catch (error) {
      return this.create_error_result(
        provider_id,
        start_time,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Extract a single resource schema.
   */
  private extract_resource(
    resource_type: string,
    def: PulumiResourceDefinition,
    package_name: string,
    namespace: string,
    version: string,
    type_registry: Record<string, PulumiTypeDefinition>
  ): ExtractedResourceSchema {
    const input_properties: PropertyDefinition[] = [];
    const output_properties: PropertyDefinition[] = [];
    const required_inputs = def.requiredInputs || [];

    // Extract input properties
    if (def.inputProperties) {
      for (const [prop_name, prop_schema] of Object.entries(def.inputProperties)) {
        const prop = this.convert_property(prop_name, prop_schema, type_registry);
        prop.required = required_inputs.includes(prop_name);
        input_properties.push(prop);
      }
    }

    // Extract output properties (computed)
    if (def.properties) {
      for (const [prop_name, prop_schema] of Object.entries(def.properties)) {
        // Check if this is input or output only
        const is_input = def.inputProperties && prop_name in def.inputProperties;

        if (!is_input) {
          const prop = this.convert_property(prop_name, prop_schema, type_registry);
          prop.computed = true;
          output_properties.push(prop);
        }
      }
    }

    // Parse module path from resource type (e.g., "aws:ec2/vpc:Vpc" -> "ec2")
    const module_path = this.extract_module_from_type(resource_type);
    const category = this.extract_category_from_type(resource_type);

    // Build documentation URL
    const doc_path = this.build_doc_path(resource_type, package_name);

    return {
      source_type: resource_type,
      source: 'pulumi',
      provider_name: `${namespace}/${package_name}`,
      provider_namespace: namespace,
      category,
      module_path,
      description: def.description || '',
      input_properties,
      output_properties,
      required_inputs,
      deprecated: !!def.deprecationMessage,
      deprecation_message: def.deprecationMessage,
      documentation_url: `https://www.pulumi.com/registry/packages/${package_name}/api-docs/${doc_path}`,
      provider_version: version,
    };
  }

  /**
   * Convert Pulumi property schema to property definition.
   */
  private convert_property(
    name: string,
    schema: PulumiPropertySchema,
    type_registry: Record<string, PulumiTypeDefinition>
  ): PropertyDefinition {
    let type: PropertyType;
    let nested_properties: PropertyDefinition[] | undefined;
    let element_type: PropertyType | undefined;
    let element_properties: PropertyDefinition[] | undefined;

    // Handle type references
    if (schema.$ref) {
      const ref_type = this.resolve_type_ref(schema.$ref, type_registry);
      if (ref_type) {
        if (ref_type.enum) {
          type = 'string'; // Enums are typically strings
        } else if (ref_type.properties) {
          type = 'object';
          nested_properties = this.extract_properties_from_type(ref_type, type_registry);
        } else {
          type = this.map_pulumi_type(ref_type.type || 'object');
        }
      } else {
        type = 'object';
      }
    } else if (schema.oneOf && schema.oneOf.length > 0) {
      // Union type - use first non-null type
      const first_type = schema.oneOf.find((t) => t.type !== 'null');
      type = first_type ? this.map_pulumi_type(first_type.type || 'any') : 'any';
    } else if (schema.type === 'array' && schema.items) {
      type = 'array';
      if (schema.items.$ref) {
        const item_type = this.resolve_type_ref(schema.items.$ref, type_registry);
        if (item_type?.properties) {
          element_properties = this.extract_properties_from_type(item_type, type_registry);
        }
        element_type = 'object';
      } else {
        element_type = this.map_pulumi_type(schema.items.type || 'any');
      }
    } else if (schema.type === 'object' && schema.additionalProperties) {
      type = 'map';
      if (schema.additionalProperties.$ref) {
        element_type = 'object';
      } else {
        element_type = this.map_pulumi_type(schema.additionalProperties.type || 'any');
      }
    } else {
      type = this.map_pulumi_type(schema.type || 'any');
    }

    // Extract validation rules
    const validation = this.extract_validation(schema);

    return {
      name: this.to_snake_case(name),
      type,
      description: schema.description || '',
      required: false, // Set at schema level
      computed: false,
      sensitive: schema.secret || false,
      deprecated: !!schema.deprecationMessage,
      default_value: schema.default,
      validation: Object.keys(validation).length > 0 ? validation : undefined,
      nested_properties,
      element_type,
      element_properties,
    };
  }

  /**
   * Extract properties from a type definition.
   */
  private extract_properties_from_type(
    type_def: PulumiTypeDefinition,
    type_registry: Record<string, PulumiTypeDefinition>
  ): PropertyDefinition[] {
    const properties: PropertyDefinition[] = [];

    if (type_def.properties) {
      for (const [name, schema] of Object.entries(type_def.properties)) {
        const prop = this.convert_property(name, schema, type_registry);
        if (type_def.required?.includes(name)) {
          prop.required = true;
        }
        properties.push(prop);
      }
    }

    return properties;
  }

  /**
   * Resolve a type reference to its definition.
   */
  private resolve_type_ref(
    ref: string,
    type_registry: Record<string, PulumiTypeDefinition>
  ): PulumiTypeDefinition | null {
    // Refs are like "#/types/aws:ec2/Vpc:Vpc"
    const type_key = ref.replace('#/types/', '');
    return type_registry[type_key] || null;
  }

  /**
   * Map Pulumi type string to ICE type.
   */
  private map_pulumi_type(pulumi_type: string | undefined): PropertyType {
    switch (pulumi_type) {
      case 'string':
        return 'string';
      case 'integer':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'array':
        return 'array';
      case 'object':
        return 'object';
      default:
        return 'any';
    }
  }

  /**
   * Extract validation constraints from property schema.
   */
  private extract_validation(schema: PulumiPropertySchema): ValidationDefinition {
    const validation: ValidationDefinition = {};

    if (schema.enum && schema.enum.length > 0) {
      validation.enum_values = schema.enum.map((e) =>
        typeof e.value === 'boolean' ? String(e.value) : e.value
      ) as (string | number)[];
    }

    if (schema.pattern) {
      validation.pattern = schema.pattern;
    }

    if (schema.minLength !== undefined) {
      validation.min_length = schema.minLength;
    }

    if (schema.maxLength !== undefined) {
      validation.max_length = schema.maxLength;
    }

    if (schema.minimum !== undefined) {
      validation.minimum = schema.minimum;
    }

    if (schema.maximum !== undefined) {
      validation.maximum = schema.maximum;
    }

    if (schema.minItems !== undefined) {
      validation.min_items = schema.minItems;
    }

    if (schema.maxItems !== undefined) {
      validation.max_items = schema.maxItems;
    }

    return validation;
  }

  /**
   * Extract module path from Pulumi resource type.
   * e.g., "aws:ec2/vpc:Vpc" -> "ec2"
   */
  private extract_module_from_type(resource_type: string): string | undefined {
    const parts = resource_type.split(':');
    if (parts.length >= 2) {
      const module_part = parts[1];
      const slash_index = module_part.indexOf('/');
      if (slash_index > 0) {
        return module_part.substring(0, slash_index);
      }
      return module_part;
    }
    return undefined;
  }

  /**
   * Extract category from resource type (uses module as category).
   */
  private extract_category_from_type(resource_type: string): string | undefined {
    return this.extract_module_from_type(resource_type);
  }

  /**
   * Build documentation path from resource type.
   */
  private build_doc_path(resource_type: string, _package_name: string): string {
    // "aws:ec2/vpc:Vpc" -> "ec2/vpc"
    const parts = resource_type.split(':');
    if (parts.length >= 2) {
      const module_and_resource = parts[1];
      return module_and_resource.toLowerCase();
    }
    return resource_type.toLowerCase();
  }

  /**
   * Convert camelCase to snake_case.
   */
  private to_snake_case(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '');
  }

  /**
   * Fetch full package schema from GitHub.
   */
  private async fetch_package_schema(package_name: string): Promise<PulumiPackageSchema | null> {
    const cache_key = `pulumi:schema:${package_name}`;

    if (this.cache.has(cache_key)) {
      return this.cache.get(cache_key) as PulumiPackageSchema;
    }

    // Find the known provider config
    const known = KNOWN_PULUMI_PROVIDERS.find((p) => p.name === package_name);
    const repo = known?.repo || `pulumi/pulumi-${package_name}`;

    // List of possible schema locations in GitHub repos
    const schema_paths = [
      // Standard location
      `https://raw.githubusercontent.com/${repo}/master/provider/cmd/pulumi-resource-${package_name}/schema.json`,
      `https://raw.githubusercontent.com/${repo}/main/provider/cmd/pulumi-resource-${package_name}/schema.json`,
      // Alternative locations used by some providers
      `https://raw.githubusercontent.com/${repo}/master/provider/cmd/pulumi-tfgen-${package_name}/schema.json`,
      `https://raw.githubusercontent.com/${repo}/main/provider/cmd/pulumi-tfgen-${package_name}/schema.json`,
      // Root schema location (used by some native providers)
      `https://raw.githubusercontent.com/${repo}/master/schema.json`,
      `https://raw.githubusercontent.com/${repo}/main/schema.json`,
      // Provider directory (kubernetes, etc.)
      `https://raw.githubusercontent.com/${repo}/master/provider/pkg/gen/schema.json`,
      `https://raw.githubusercontent.com/${repo}/main/provider/pkg/gen/schema.json`,
    ];

    for (const url of schema_paths) {
      try {
        const schema = await this.fetch_with_retry<PulumiPackageSchema>(url);
        if (schema && schema.resources) {
          this.cache.set(cache_key, schema);
          return schema;
        }
      } catch {
        // Try next path
        continue;
      }
    }

    return null;
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
          if (response.status === 404) {
            return null;
          }
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
  private create_error_result(
    provider_id: string,
    start_time: number,
    error: string
  ): ExtractionResult {
    const [namespace, name] = provider_id.includes('/')
      ? provider_id.split('/')
      : ['pulumi', provider_id];

    return {
      success: false,
      source: 'pulumi',
      provider: {
        id: provider_id,
        name: name || provider_id,
        namespace: namespace || 'unknown',
        version: 'unknown',
        description: '',
        source: 'pulumi',
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

export function create_pulumi_extractor(config: ExtractorConfig): PulumiExtractor {
  return new PulumiExtractor(config);
}
