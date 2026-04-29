/**
 * Schema Unifier
 *
 * Aggregates ALL extracted schemas from Terraform and Pulumi into a unified
 * format. No hardcoded mappings - everything is data-driven from extraction.
 */

import type {
  CrossProviderPropertyMap,
  ExtractedResourceSchema,
  ExtractionResult,
  PropertyDefinition,
  ProviderImplementation,
  ProviderPropertyInfo,
  SchemaManifest,
  SourceManifest,
  UnifiedPropertyDefinition,
  UnifiedResourceType,
} from './types';

// =============================================================================
// Schema Store - Raw Aggregation
// =============================================================================

export interface SchemaStore {
  /** All extracted schemas indexed by source and provider */
  readonly terraform: Map<string, ExtractedResourceSchema[]>;
  readonly pulumi: Map<string, ExtractedResourceSchema[]>;

  /** All discovered categories across all providers */
  readonly categories: Set<string>;

  /** All provider metadata */
  readonly providers: Map<string, ProviderInfo>;
}

interface ProviderInfo {
  readonly source: 'terraform' | 'pulumi';
  readonly name: string;
  readonly namespace: string;
  readonly version: string;
  readonly resource_count: number;
  readonly categories: string[];
}

// =============================================================================
// Schema Unifier Class
// =============================================================================

export class SchemaUnifier {
  private store: SchemaStore = {
    terraform: new Map(),
    pulumi: new Map(),
    categories: new Set(),
    providers: new Map(),
  };

  /**
   * Add extraction results to the store.
   */
  add_results(results: ExtractionResult[]): void {
    for (const result of results) {
      if (!result.success) continue;

      const provider_key = result.provider.id;
      const source_map = result.source === 'terraform' ? this.store.terraform : this.store.pulumi;

      // Store resources
      const existing = source_map.get(provider_key) || [];
      existing.push(...result.resources);
      source_map.set(provider_key, existing);

      // Track categories
      for (const category of result.metadata.categories_found) {
        this.store.categories.add(category);
      }

      // Store provider info
      this.store.providers.set(`${result.source}:${provider_key}`, {
        source: result.source,
        name: result.provider.name,
        namespace: result.provider.namespace,
        version: result.provider.version,
        resource_count: result.resources.length,
        categories: result.metadata.categories_found,
      });
    }
  }

  /**
   * Get all resources - raw, unprocessed.
   */
  get_all_resources(): ExtractedResourceSchema[] {
    const all: ExtractedResourceSchema[] = [];

    for (const resources of this.store.terraform.values()) {
      all.push(...resources);
    }

    for (const resources of this.store.pulumi.values()) {
      all.push(...resources);
    }

    return all;
  }

  /**
   * Get resources grouped by category.
   */
  get_resources_by_category(): Map<string, ExtractedResourceSchema[]> {
    const by_category = new Map<string, ExtractedResourceSchema[]>();

    for (const resource of this.get_all_resources()) {
      const category = resource.category || 'uncategorized';
      const existing = by_category.get(category) || [];
      existing.push(resource);
      by_category.set(category, existing);
    }

    return by_category;
  }

  /**
   * Get resources grouped by provider.
   */
  get_resources_by_provider(): Map<string, ExtractedResourceSchema[]> {
    const by_provider = new Map<string, ExtractedResourceSchema[]>();

    for (const resource of this.get_all_resources()) {
      const key = `${resource.source}:${resource.provider_name}`;
      const existing = by_provider.get(key) || [];
      existing.push(resource);
      by_provider.set(key, existing);
    }

    return by_provider;
  }

  /**
   * Find potentially equivalent resources across providers.
   * Uses heuristics like name similarity and property overlap.
   */
  find_cross_provider_equivalents(): CrossProviderEquivalent[] {
    const equivalents: CrossProviderEquivalent[] = [];
    const all_resources = this.get_all_resources();

    // Group by normalized resource name
    const by_normalized_name = new Map<string, ExtractedResourceSchema[]>();

    for (const resource of all_resources) {
      const normalized = this.normalize_resource_name(resource.source_type);

      const existing = by_normalized_name.get(normalized) || [];
      existing.push(resource);
      by_normalized_name.set(normalized, existing);
    }

    // Find groups with multiple providers
    for (const [normalized_name, resources] of by_normalized_name) {
      const unique_providers = new Set(resources.map((r) => `${r.source}:${r.provider_name}`));

      if (unique_providers.size > 1) {
        const property_similarity = this.calculate_property_similarity(resources);

        equivalents.push({
          normalized_name,
          resources,
          provider_count: unique_providers.size,
          property_similarity,
        });
      }
    }

    return equivalents.sort((a, b) => b.property_similarity - a.property_similarity);
  }

  /**
   * Generate unified resource types from cross-provider equivalents.
   */
  generate_unified_types(): UnifiedResourceType[] {
    const unified_by_ice_type = new Map<string, UnifiedResourceType>();
    const equivalents = this.find_cross_provider_equivalents();

    for (const equiv of equivalents) {
      if (equiv.property_similarity < 0.3) continue; // Skip low similarity matches

      const unified_type = this.create_unified_type(equiv);

      // Merge with existing if ice_type already exists
      const existing = unified_by_ice_type.get(unified_type.ice_type);
      if (existing) {
        // Merge implementations
        for (const impl of unified_type.implementations) {
          const exists = existing.implementations.some(
            (e) => e.source === impl.source && e.resource_type === impl.resource_type
          );
          if (!exists) {
            existing.implementations.push(impl);
          }
        }
      } else {
        unified_by_ice_type.set(unified_type.ice_type, unified_type);
      }
    }

    // Also include single-provider resources as unified types
    const all_resources = this.get_all_resources();
    const in_equivalents = new Set(
      equivalents.flatMap((e) => e.resources.map((r) => r.source_type))
    );

    for (const resource of all_resources) {
      if (!in_equivalents.has(resource.source_type)) {
        const single_unified = this.create_single_provider_unified_type(resource);

        // Merge with existing if ice_type already exists
        const existing = unified_by_ice_type.get(single_unified.ice_type);
        if (existing) {
          // Merge implementations
          for (const impl of single_unified.implementations) {
            const exists = existing.implementations.some(
              (e) => e.source === impl.source && e.resource_type === impl.resource_type
            );
            if (!exists) {
              existing.implementations.push(impl);
            }
          }
        } else {
          unified_by_ice_type.set(single_unified.ice_type, single_unified);
        }
      }
    }

    return Array.from(unified_by_ice_type.values());
  }

  /**
   * Generate manifest of all extracted schemas.
   */
  generate_manifest(): SchemaManifest {
    const terraform_providers: {
      name: string;
      namespace: string;
      version: string;
      resource_count: number;
      categories: Record<string, number>;
    }[] = [];
    const pulumi_providers: {
      name: string;
      namespace: string;
      version: string;
      resource_count: number;
      categories: Record<string, number>;
    }[] = [];

    for (const [key, info] of this.store.providers) {
      const category_counts: Record<string, number> = {};

      const source_map = info.source === 'terraform' ? this.store.terraform : this.store.pulumi;
      const resources = source_map.get(`${info.namespace}/${info.name}`) || [];

      for (const resource of resources) {
        const cat = resource.category || 'uncategorized';
        category_counts[cat] = (category_counts[cat] || 0) + 1;
      }

      const entry = {
        name: info.name,
        namespace: info.namespace,
        version: info.version,
        resource_count: info.resource_count,
        categories: category_counts,
      };

      if (info.source === 'terraform') {
        terraform_providers.push(entry);
      } else {
        pulumi_providers.push(entry);
      }
    }

    const sources: SourceManifest[] = [];

    if (terraform_providers.length > 0) {
      sources.push({ source: 'terraform', providers: terraform_providers });
    }

    if (pulumi_providers.length > 0) {
      sources.push({ source: 'pulumi', providers: pulumi_providers });
    }

    const unified = this.generate_unified_types();

    return {
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      sources,
      unified_types: unified.length,
      total_resources: this.get_all_resources().length,
    };
  }

  /**
   * Get statistics about the aggregated schemas.
   */
  get_statistics(): SchemaStatistics {
    const all_resources = this.get_all_resources();
    const by_category = this.get_resources_by_category();
    const equivalents = this.find_cross_provider_equivalents();

    let terraform_count = 0;
    let pulumi_count = 0;
    let inferred_terraform_count = 0;

    for (const resources of this.store.terraform.values()) {
      terraform_count += resources.length;
    }

    for (const resources of this.store.pulumi.values()) {
      pulumi_count += resources.length;
      // Count how many Pulumi resources can have Terraform implementations inferred
      for (const resource of resources) {
        if (this.infer_terraform_implementation(resource)) {
          inferred_terraform_count++;
        }
      }
    }

    return {
      total_resources: all_resources.length,
      terraform_resources: terraform_count,
      pulumi_resources: pulumi_count,
      inferred_terraform_implementations: inferred_terraform_count,
      terraform_providers: this.store.terraform.size,
      pulumi_providers: this.store.pulumi.size,
      categories: Array.from(this.store.categories),
      category_counts: Object.fromEntries(
        Array.from(by_category.entries()).map(([k, v]) => [k, v.length])
      ),
      cross_provider_equivalents: equivalents.length,
    };
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Normalize resource type name for comparison.
   */
  private normalize_resource_name(source_type: string): string {
    // Remove provider prefix
    // "aws_vpc" -> "vpc"
    // "aws:ec2/vpc:Vpc" -> "vpc"
    // "azurerm_virtual_network" -> "virtual_network"

    let normalized = source_type.toLowerCase();

    // Handle Pulumi format: "aws:ec2/vpc:Vpc" -> "vpc"
    if (normalized.includes(':')) {
      const parts = normalized.split(':');
      if (parts.length >= 3) {
        normalized = parts[2];
      } else if (parts.length === 2) {
        const module_part = parts[1];
        const slash_idx = module_part.lastIndexOf('/');
        normalized = slash_idx >= 0 ? module_part.substring(slash_idx + 1) : module_part;
      }
    }

    // Handle Terraform format: "aws_vpc" -> "vpc"
    // Remove common provider prefixes
    const prefixes = ['aws_', 'azurerm_', 'google_', 'kubernetes_', 'azure_native_', 'gcp_'];

    for (const prefix of prefixes) {
      if (normalized.startsWith(prefix)) {
        normalized = normalized.substring(prefix.length);
        break;
      }
    }

    // Normalize common variations
    normalized = normalized.replace(/_/g, '').replace(/-/g, '').replace(/\s/g, '');

    return normalized;
  }

  /**
   * Calculate property similarity between resources.
   */
  private calculate_property_similarity(resources: ExtractedResourceSchema[]): number {
    if (resources.length < 2) return 1.0;

    // Get all unique property names from all resources
    const all_property_sets = resources.map((r) => {
      const names = new Set<string>();
      for (const prop of r.input_properties) {
        names.add(this.normalize_property_name(prop.name));
      }
      for (const prop of r.output_properties) {
        names.add(this.normalize_property_name(prop.name));
      }
      return names;
    });

    // Calculate Jaccard similarity between all pairs
    let total_similarity = 0;
    let pair_count = 0;

    for (let i = 0; i < all_property_sets.length; i++) {
      for (let j = i + 1; j < all_property_sets.length; j++) {
        const set_a = all_property_sets[i];
        const set_b = all_property_sets[j];

        const intersection = new Set([...set_a].filter((x) => set_b.has(x)));
        const union = new Set([...set_a, ...set_b]);

        const similarity = union.size > 0 ? intersection.size / union.size : 0;
        total_similarity += similarity;
        pair_count++;
      }
    }

    return pair_count > 0 ? total_similarity / pair_count : 0;
  }

  /**
   * Normalize property name for comparison.
   */
  private normalize_property_name(name: string): string {
    return name.toLowerCase().replace(/_/g, '').replace(/-/g, '').replace(/\s/g, '');
  }

  /**
   * Create unified type from cross-provider equivalent.
   */
  private create_unified_type(equiv: CrossProviderEquivalent): UnifiedResourceType {
    // Use the first resource's category or infer from name
    const category = equiv.resources[0]?.category || 'uncategorized';

    // Create implementations
    const implementations: ProviderImplementation[] = equiv.resources.map((r) => ({
      source: r.source,
      provider_name: r.provider_name,
      resource_type: r.source_type,
      documentation_url: r.documentation_url,
    }));

    // For Pulumi resources, also infer Terraform implementations
    for (const resource of equiv.resources) {
      if (resource.source === 'pulumi') {
        const terraform_impl = this.infer_terraform_implementation(resource);
        if (terraform_impl) {
          // Check if we don't already have this implementation
          const exists = implementations.some(
            (impl) =>
              impl.source === 'terraform' && impl.resource_type === terraform_impl.resource_type
          );
          if (!exists) {
            implementations.push(terraform_impl);
          }
        }
      }
    }

    // Merge properties across all resources
    const merged_properties = this.merge_properties(equiv.resources);

    // Create property mappings
    const property_mappings = this.create_property_mappings(equiv.resources);

    // Generate ICE type name
    const ice_type = this.generate_ice_type_name(equiv.normalized_name, category);

    // Get best description
    const description =
      equiv.resources
        .map((r) => r.description)
        .filter((d) => d.length > 0)
        .sort((a, b) => b.length - a.length)[0] || `${equiv.normalized_name} resource`;

    return {
      ice_type,
      display_name: this.to_display_name(equiv.normalized_name),
      description,
      category,
      implementations,
      properties: merged_properties,
      property_mappings,
    };
  }

  /**
   * Create unified type for single-provider resource.
   */
  private create_single_provider_unified_type(
    resource: ExtractedResourceSchema
  ): UnifiedResourceType {
    const normalized_name = this.normalize_resource_name(resource.source_type);
    const category = resource.category || 'uncategorized';

    const implementations: ProviderImplementation[] = [
      {
        source: resource.source,
        provider_name: resource.provider_name,
        resource_type: resource.source_type,
        documentation_url: resource.documentation_url,
      },
    ];

    // If this is a Pulumi resource from a provider that wraps Terraform,
    // infer the corresponding Terraform resource type
    if (resource.source === 'pulumi') {
      const terraform_impl = this.infer_terraform_implementation(resource);
      if (terraform_impl) {
        implementations.push(terraform_impl);
      }
    }

    const properties: UnifiedPropertyDefinition[] = [
      ...resource.input_properties.map((p) => this.to_unified_property(p, resource)),
      ...resource.output_properties.map((p) => this.to_unified_property(p, resource)),
    ];

    return {
      ice_type: this.generate_ice_type_name(normalized_name, category),
      display_name: this.to_display_name(normalized_name),
      description: resource.description,
      category,
      implementations,
      properties,
      property_mappings: [],
    };
  }

  /**
   * Infer Terraform implementation from Pulumi resource.
   * Pulumi providers like aws, gcp, azure wrap Terraform providers.
   */
  private infer_terraform_implementation(
    resource: ExtractedResourceSchema
  ): ProviderImplementation | null {
    // Mapping of Pulumi provider names to Terraform provider names
    const PULUMI_TO_TERRAFORM_PROVIDER: Record<string, string> = {
      aws: 'hashicorp/aws',
      gcp: 'hashicorp/google',
      azure: 'hashicorp/azurerm',
      'azure-native': 'hashicorp/azurerm',
      digitalocean: 'digitalocean/digitalocean',
      cloudflare: 'cloudflare/cloudflare',
      github: 'integrations/github',
      gitlab: 'gitlabhq/gitlab',
      kubernetes: 'hashicorp/kubernetes',
      vault: 'hashicorp/vault',
      consul: 'hashicorp/consul',
      random: 'hashicorp/random',
      tls: 'hashicorp/tls',
      docker: 'kreuzwerker/docker',
      postgresql: 'cyrilgdn/postgresql',
      mysql: 'petoju/mysql',
      mongodbatlas: 'mongodb/mongodbatlas',
      datadog: 'DataDog/datadog',
      newrelic: 'newrelic/newrelic',
      pagerduty: 'PagerDuty/pagerduty',
      auth0: 'auth0/auth0',
      okta: 'okta/okta',
      fastly: 'fastly/fastly',
      akamai: 'akamai/akamai',
      alicloud: 'aliyun/alicloud',
      oci: 'oracle/oci',
      linode: 'linode/linode',
      ns1: 'ns1-terraform/ns1',
      dnsimple: 'dnsimple/dnsimple',
    };

    // Extract provider name from Pulumi provider (e.g., "pulumi/aws" -> "aws")
    const pulumi_provider = resource.provider_name.split('/').pop() || '';
    const terraform_provider = PULUMI_TO_TERRAFORM_PROVIDER[pulumi_provider];

    if (!terraform_provider) {
      return null;
    }

    // Convert Pulumi resource type to Terraform resource type
    // "aws:ec2/vpc:Vpc" -> "aws_vpc"
    // "aws:s3/bucket:Bucket" -> "aws_s3_bucket"
    const terraform_resource_type = this.pulumi_to_terraform_resource_type(
      resource.source_type,
      pulumi_provider
    );

    if (!terraform_resource_type) {
      return null;
    }

    // Build Terraform docs URL
    const [namespace, provider_name] = terraform_provider.split('/');
    const resource_slug = terraform_resource_type.replace(`${pulumi_provider}_`, '');
    const docs_url = `https://registry.terraform.io/providers/${terraform_provider}/latest/docs/resources/${resource_slug}`;

    return {
      source: 'terraform',
      provider_name: terraform_provider,
      resource_type: terraform_resource_type,
      documentation_url: docs_url,
    };
  }

  /**
   * Convert Pulumi resource type to Terraform resource type.
   * Examples:
   *   "aws:ec2/vpc:Vpc" -> "aws_vpc"
   *   "aws:s3/bucket:Bucket" -> "aws_s3_bucket"
   *   "aws:ec2/instance:Instance" -> "aws_instance"
   *   "gcp:compute/instance:Instance" -> "google_compute_instance"
   */
  private pulumi_to_terraform_resource_type(
    pulumi_type: string,
    pulumi_provider: string
  ): string | null {
    // Parse Pulumi format: "provider:module/resource:ResourceName"
    const parts = pulumi_type.split(':');
    if (parts.length !== 3) return null;

    const [provider_prefix, module_path, resource_name] = parts;

    // Extract module and resource from path like "ec2/vpc"
    const path_parts = module_path.split('/');
    const module = path_parts[0];
    const resource_suffix = path_parts.length > 1 ? path_parts[path_parts.length - 1] : '';

    // Build Terraform resource type
    // Provider prefix mapping (Pulumi -> Terraform)
    const terraform_prefix_map: Record<string, string> = {
      aws: 'aws',
      gcp: 'google',
      azure: 'azurerm',
      'azure-native': 'azurerm',
      digitalocean: 'digitalocean',
      cloudflare: 'cloudflare',
      github: 'github',
      gitlab: 'gitlab',
      kubernetes: 'kubernetes',
      vault: 'vault',
      consul: 'consul',
      random: 'random',
      tls: 'tls',
      docker: 'docker',
    };

    const tf_prefix = terraform_prefix_map[pulumi_provider] || pulumi_provider;

    // Convert resource name from PascalCase to snake_case
    const snake_resource = resource_name
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');

    // Build the Terraform resource type
    // Common patterns:
    // - If resource_suffix matches module, use: prefix_resource (e.g., aws_vpc)
    // - Otherwise include module: prefix_module_resource (e.g., aws_s3_bucket)

    // Check if the resource is the "main" resource of the module
    const normalized_module = module.toLowerCase().replace(/-/g, '_');
    const normalized_resource = snake_resource.replace(/-/g, '_');

    if (
      normalized_resource === normalized_module ||
      normalized_resource.endsWith(normalized_module) ||
      normalized_module.endsWith(normalized_resource)
    ) {
      // Simple case: aws:ec2/vpc:Vpc -> aws_vpc
      return `${tf_prefix}_${normalized_resource}`;
    } else {
      // Include module: aws:s3/bucketObject:BucketObject -> aws_s3_bucket_object
      return `${tf_prefix}_${normalized_module}_${normalized_resource}`;
    }
  }

  /**
   * Merge properties from multiple resources.
   */
  private merge_properties(resources: ExtractedResourceSchema[]): UnifiedPropertyDefinition[] {
    const property_map = new Map<string, UnifiedPropertyDefinition>();

    for (const resource of resources) {
      const all_props = [...resource.input_properties, ...resource.output_properties];

      for (const prop of all_props) {
        const normalized = this.normalize_property_name(prop.name);
        const existing = property_map.get(normalized);

        if (existing) {
          // Add provider info
          existing.available_in.push({
            source: resource.source,
            provider_name: resource.provider_name,
            property_name: prop.name,
            type: prop.type,
          });
        } else {
          property_map.set(normalized, {
            ...prop,
            available_in: [
              {
                source: resource.source,
                provider_name: resource.provider_name,
                property_name: prop.name,
                type: prop.type,
              },
            ],
          });
        }
      }
    }

    return Array.from(property_map.values());
  }

  /**
   * Create property mappings across providers.
   */
  private create_property_mappings(
    resources: ExtractedResourceSchema[]
  ): CrossProviderPropertyMap[] {
    const mappings: CrossProviderPropertyMap[] = [];
    const property_groups = new Map<
      string,
      { source: 'terraform' | 'pulumi'; provider_name: string; property_name: string }[]
    >();

    for (const resource of resources) {
      const all_props = [...resource.input_properties, ...resource.output_properties];

      for (const prop of all_props) {
        const normalized = this.normalize_property_name(prop.name);
        const group = property_groups.get(normalized) || [];
        group.push({
          source: resource.source,
          provider_name: resource.provider_name,
          property_name: prop.name,
        });
        property_groups.set(normalized, group);
      }
    }

    for (const [unified_name, group] of property_groups) {
      if (group.length > 1) {
        mappings.push({
          unified_name,
          mappings: group,
        });
      }
    }

    return mappings;
  }

  /**
   * Convert property to unified property definition.
   */
  private to_unified_property(
    prop: PropertyDefinition,
    resource: ExtractedResourceSchema
  ): UnifiedPropertyDefinition {
    return {
      ...prop,
      available_in: [
        {
          source: resource.source,
          provider_name: resource.provider_name,
          property_name: prop.name,
          type: prop.type,
        },
      ],
    };
  }

  /**
   * Generate ICE type name.
   */
  private generate_ice_type_name(normalized_name: string, category: string): string {
    const capitalized = normalized_name
      .split(/[_-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

    const category_prefix = category.charAt(0).toUpperCase() + category.slice(1);

    return `${category_prefix}.${capitalized}`;
  }

  /**
   * Convert to display name.
   */
  private to_display_name(normalized_name: string): string {
    return normalized_name
      .split(/[_-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}

// =============================================================================
// Supporting Types
// =============================================================================

interface CrossProviderEquivalent {
  normalized_name: string;
  resources: ExtractedResourceSchema[];
  provider_count: number;
  property_similarity: number;
}

interface SchemaStatistics {
  total_resources: number;
  terraform_resources: number;
  pulumi_resources: number;
  inferred_terraform_implementations: number;
  terraform_providers: number;
  pulumi_providers: number;
  categories: string[];
  category_counts: Record<string, number>;
  cross_provider_equivalents: number;
}

// =============================================================================
// Factory Function
// =============================================================================

export function create_schema_unifier(): SchemaUnifier {
  return new SchemaUnifier();
}
