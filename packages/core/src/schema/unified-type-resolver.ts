/**
 * Unified Type Resolver
 *
 * Central type resolution service that maps native provider types
 * (GCP, AWS, Azure, Terraform, Pulumi) to unified ICE types.
 *
 * This replaces hardcoded type mappings in individual importers
 * with a single source of truth from the schema package.
 */

import { EmbeddedSchemaProvider } from './embedded-schema-provider.js';
import type { IceType, ProviderImplementation } from './schema-provider.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Provider source types.
 */
export type ProviderSource = 'gcp' | 'aws' | 'azure' | 'terraform' | 'pulumi';

/**
 * Type resolution result.
 */
export interface TypeResolutionResult {
  /** The resolved ICE type */
  ice_type: IceType;

  /** Whether this was a direct match or fallback */
  is_exact_match: boolean;

  /** Source of the resolution (schema, fallback, etc.) */
  resolution_source: 'schema' | 'fallback' | 'normalized';
}

/**
 * Property mapping for a resolved type.
 */
export interface PropertyMapping {
  /** ICE property name */
  ice_name: string;

  /** Native property name for the source */
  native_name: string;

  /** Type of the property */
  type: string;

  /** Whether the property is required */
  required: boolean;
}

// =============================================================================
// Unified Type Resolver
// =============================================================================

/**
 * Central service for resolving native types to ICE types.
 */
export class UnifiedTypeResolver {
  private schema_provider: EmbeddedSchemaProvider;

  /** Mapping from native types to ICE types */
  private native_to_ice: Map<string, string> = new Map();

  /** Mapping from ICE types to native implementations */
  private ice_to_native: Map<string, Map<string, string>> = new Map();

  /** Whether the resolver has been initialized */
  private initialized = false;

  constructor(schema_provider?: EmbeddedSchemaProvider) {
    this.schema_provider = schema_provider || new EmbeddedSchemaProvider();
  }

  /**
   * Initialize the resolver by loading all schemas.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.schema_provider.initialize();

    // Build reverse mappings from all implementations
    try {
      const query_result = await this.schema_provider.query({});

      // Check if the query was successful and we have data
      const result_data = query_result as unknown;
      if (
        result_data &&
        typeof result_data === 'object' &&
        'data' in result_data &&
        result_data.data &&
        typeof result_data.data === 'object' &&
        'schemas' in result_data.data &&
        Array.isArray((result_data.data as { schemas: unknown }).schemas)
      ) {
        const schemas = (
          result_data.data as {
            schemas: Array<{
              ice_type: string;
              implementations: Array<{ source: string; provider: string; native_type: string }>;
            }>;
          }
        ).schemas;
        for (const schema of schemas) {
          for (const impl of schema.implementations) {
            // Map native type to ICE type
            const normalized_native = this.normalizeNativeType(
              impl.native_type,
              impl.source as ProviderSource
            );
            this.native_to_ice.set(normalized_native, schema.ice_type);

            // Map ICE type to native implementations
            const source_key = `${impl.source}:${impl.provider}`;
            let ice_map = this.ice_to_native.get(schema.ice_type);
            if (!ice_map) {
              ice_map = new Map();
              this.ice_to_native.set(schema.ice_type, ice_map);
            }
            ice_map.set(source_key, impl.native_type);
          }
        }
      }
    } catch {
      // Schema provider may not have schemas - this is fine
    }

    this.initialized = true;
  }

  /**
   * Resolve a native type to an ICE type.
   *
   * @param native_type - The native resource type (e.g., "compute#instance", "AWS::EC2::Instance")
   * @param source - The provider source (gcp, aws, azure, terraform, pulumi)
   * @returns The resolved ICE type
   */
  resolveToICE(native_type: string, source: ProviderSource): TypeResolutionResult {
    // Try exact match first
    const normalized = this.normalizeNativeType(native_type, source);
    const exact_match = this.native_to_ice.get(normalized);

    if (exact_match) {
      return {
        ice_type: exact_match as IceType,
        is_exact_match: true,
        resolution_source: 'schema',
      };
    }

    // Try fallback mapping based on source
    const fallback = this.fallbackMapping(native_type, source);
    return {
      ice_type: fallback as IceType,
      is_exact_match: false,
      resolution_source: 'fallback',
    };
  }

  /**
   * Resolve an ICE type to a native type for export.
   *
   * @param ice_type - The ICE type
   * @param target_source - Target provider (terraform, pulumi, gcp, aws, azure)
   * @param target_provider - Specific provider (e.g., "aws", "google", "azurerm")
   * @returns The native type or undefined if no mapping exists
   */
  resolveToNative(
    ice_type: IceType,
    target_source: 'terraform' | 'pulumi',
    target_provider: string
  ): string | undefined {
    const ice_map = this.ice_to_native.get(ice_type);
    if (!ice_map) return undefined;

    const source_key = `${target_source}:${target_provider}`;
    return ice_map.get(source_key);
  }

  /**
   * Get the implementation details for an ICE type.
   */
  getImplementation(
    ice_type: IceType,
    source: 'terraform' | 'pulumi',
    provider: string
  ): ProviderImplementation | undefined {
    return this.schema_provider.get_implementation(ice_type, source, provider);
  }

  /**
   * Check if a type mapping exists.
   */
  hasMapping(native_type: string, source: ProviderSource): boolean {
    const normalized = this.normalizeNativeType(native_type, source);
    return this.native_to_ice.has(normalized);
  }

  /**
   * Get all supported native types for a source.
   */
  getSupportedNativeTypes(source: ProviderSource): string[] {
    const types: string[] = [];
    for (const [normalized, _] of this.native_to_ice) {
      if (normalized.startsWith(`${source}:`)) {
        types.push(normalized.substring(source.length + 1));
      }
    }
    return types;
  }

  /**
   * Normalize native type to a consistent format for lookup.
   *
   * @param native_type - The native type string
   * @param source - The provider source
   * @returns Normalized type string in format "source:type"
   */
  private normalizeNativeType(native_type: string, source: ProviderSource): string {
    let normalized: string;

    switch (source) {
      case 'gcp':
        // GCP formats:
        // - compute#instance -> gcp:compute.instance
        // - compute.googleapis.com/Instance -> gcp:compute.instance
        if (native_type.includes('#')) {
          const [service, resource] = native_type.split('#');
          normalized = `${service}.${resource?.toLowerCase()}`;
        } else if (native_type.includes('.googleapis.com/')) {
          const match = native_type.match(/^([^.]+)\.googleapis\.com\/(.+)$/);
          if (match && match[1] && match[2]) {
            normalized = `${match[1]}.${match[2].toLowerCase()}`;
          } else {
            normalized = native_type.toLowerCase();
          }
        } else {
          normalized = native_type.toLowerCase();
        }
        break;

      case 'aws':
        // AWS formats:
        // - AWS::EC2::Instance -> aws:ec2.instance
        // - aws_instance -> aws:instance
        if (native_type.startsWith('AWS::')) {
          const parts = native_type.substring(5).split('::');
          normalized = parts.map((p) => p.toLowerCase()).join('.');
        } else if (native_type.startsWith('aws_')) {
          normalized = native_type.substring(4).replace(/_/g, '.');
        } else {
          normalized = native_type.toLowerCase();
        }
        break;

      case 'azure':
        // Azure formats:
        // - Microsoft.Compute/virtualMachines -> azure:compute.virtualmachines
        if (native_type.startsWith('Microsoft.')) {
          const parts = native_type.substring(10).split('/');
          normalized = parts.map((p) => p.toLowerCase()).join('.');
        } else {
          normalized = native_type.toLowerCase().replace(/\//g, '.');
        }
        break;

      case 'terraform':
        // Terraform formats:
        // - google_compute_instance -> terraform:google.compute_instance
        // - aws_instance -> terraform:aws.instance
        const tf_parts = native_type.split('_');
        if (tf_parts.length >= 2) {
          const provider = tf_parts[0];
          const resource = tf_parts.slice(1).join('_');
          normalized = `${provider}.${resource}`;
        } else {
          normalized = native_type;
        }
        break;

      case 'pulumi':
        // Pulumi formats:
        // - gcp:compute/instance:Instance -> pulumi:gcp.compute.instance
        // - aws:ec2/instance:Instance -> pulumi:aws.ec2.instance
        const pulumi_match = native_type.match(/^([^:]+):([^/]+)\/([^:]+):(.+)$/);
        if (pulumi_match) {
          const [, provider, module, , type] = pulumi_match;
          normalized = `${provider}.${module}.${type?.toLowerCase()}`;
        } else {
          normalized = native_type.toLowerCase().replace(/[:/]/g, '.');
        }
        break;

      default:
        normalized = native_type.toLowerCase();
    }

    return `${source}:${normalized}`;
  }

  /**
   * Fallback mapping when no exact match is found.
   * Creates a reasonable ICE type based on the native type structure.
   */
  private fallbackMapping(native_type: string, source: ProviderSource): string {
    switch (source) {
      case 'gcp':
        // compute#instance -> gcp.compute.instance
        if (native_type.includes('#')) {
          const [service, resource] = native_type.split('#');
          return `gcp.${service}.${resource?.toLowerCase()}`;
        }
        if (native_type.includes('.googleapis.com/')) {
          const match = native_type.match(/^([^.]+)\.googleapis\.com\/(.+)$/);
          if (match && match[1] && match[2]) {
            return `gcp.${match[1]}.${match[2].toLowerCase()}`;
          }
        }
        return `gcp.${native_type.toLowerCase().replace(/#/g, '.')}`;

      case 'aws':
        // AWS::EC2::Instance -> aws.ec2.instance
        if (native_type.startsWith('AWS::')) {
          const parts = native_type.substring(5).split('::');
          return `aws.${parts.map((p) => p.toLowerCase()).join('.')}`;
        }
        // aws_instance -> aws.instance
        if (native_type.startsWith('aws_')) {
          return `aws.${native_type.substring(4).replace(/_/g, '.')}`;
        }
        return `aws.${native_type.toLowerCase()}`;

      case 'azure':
        // Microsoft.Compute/virtualMachines -> azure.compute.virtualmachines
        if (native_type.startsWith('Microsoft.')) {
          const parts = native_type.substring(10).split('/');
          return `azure.${parts.map((p) => p.toLowerCase()).join('.')}`;
        }
        return `azure.${native_type.toLowerCase().replace(/\//g, '.')}`;

      case 'terraform':
        // google_compute_instance -> gcp.compute.instance
        const tf_parts = native_type.split('_');
        if (tf_parts.length >= 2) {
          const provider = this.mapTerraformProvider(tf_parts[0]!);
          const resource = tf_parts.slice(1).join('.');
          return `${provider}.${resource}`;
        }
        return native_type.replace(/_/g, '.');

      case 'pulumi':
        // gcp:compute/instance:Instance -> gcp.compute.instance
        const pulumi_match = native_type.match(/^([^:]+):([^/]+)\/([^:]+):(.+)$/);
        if (pulumi_match) {
          const [, provider, module, , type] = pulumi_match;
          const mapped_provider = this.mapPulumiProvider(provider!);
          return `${mapped_provider}.${module}.${type?.toLowerCase()}`;
        }
        return native_type.toLowerCase().replace(/[:/]/g, '.');

      default:
        return native_type;
    }
  }

  /**
   * Map Terraform provider prefix to ICE provider name.
   */
  private mapTerraformProvider(tf_provider: string): string {
    const provider_map: Record<string, string> = {
      google: 'gcp',
      aws: 'aws',
      azurerm: 'azure',
      azure: 'azure',
      kubernetes: 'kubernetes',
      k8s: 'kubernetes',
      helm: 'kubernetes',
    };
    return provider_map[tf_provider] ?? tf_provider;
  }

  /**
   * Map Pulumi provider prefix to ICE provider name.
   */
  private mapPulumiProvider(pulumi_provider: string): string {
    const provider_map: Record<string, string> = {
      gcp: 'gcp',
      'google-native': 'gcp',
      aws: 'aws',
      'aws-native': 'aws',
      azure: 'azure',
      'azure-native': 'azure',
      kubernetes: 'kubernetes',
    };
    return provider_map[pulumi_provider] ?? pulumi_provider;
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let resolver_instance: UnifiedTypeResolver | null = null;

/**
 * Get the singleton type resolver instance.
 */
export function get_type_resolver(): UnifiedTypeResolver {
  if (!resolver_instance) {
    resolver_instance = new UnifiedTypeResolver();
  }
  return resolver_instance;
}

/**
 * Initialize the type resolver (should be called at startup).
 */
export async function initialize_type_resolver(): Promise<UnifiedTypeResolver> {
  const resolver = get_type_resolver();
  await resolver.initialize();
  return resolver;
}

/**
 * Create a new type resolver with custom schema provider.
 */
export function create_type_resolver(
  schema_provider?: EmbeddedSchemaProvider
): UnifiedTypeResolver {
  return new UnifiedTypeResolver(schema_provider);
}
