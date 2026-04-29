/**
 * Schema Extractor Type Definitions
 *
 * Core types for the schema extraction pipeline that aggregates
 * ALL resources from Terraform and Pulumi registries into ICE format.
 */

// =============================================================================
// Base Types - No Hardcoded Values
// =============================================================================

/**
 * Property types supported by ICE schema system.
 */
export type PropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'map'
  | 'set'
  | 'any';

/**
 * Schema sources we extract from.
 */
export type SchemaSource = 'terraform' | 'pulumi';

// =============================================================================
// Property Definitions
// =============================================================================

export interface PropertyDefinition {
  readonly name: string;
  readonly type: PropertyType;
  readonly description: string;
  readonly required: boolean;
  readonly computed: boolean;
  readonly sensitive: boolean;
  readonly deprecated: boolean;
  readonly default_value?: unknown;
  readonly validation?: ValidationDefinition;
  readonly nested_properties?: PropertyDefinition[];
  readonly element_type?: PropertyType;
  readonly element_properties?: PropertyDefinition[];
}

export interface ValidationDefinition {
  readonly pattern?: string;
  readonly enum_values?: (string | number)[];
  readonly min_length?: number;
  readonly max_length?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly min_items?: number;
  readonly max_items?: number;
}

// =============================================================================
// Resource Schema - Raw Extracted Data
// =============================================================================

export interface ExtractedResourceSchema {
  /** Original resource type from source (e.g., "aws_vpc", "aws:ec2/vpc:Vpc") */
  readonly source_type: string;

  /** Source of extraction */
  readonly source: SchemaSource;

  /** Provider name as defined in registry (e.g., "hashicorp/aws", "aws") */
  readonly provider_name: string;

  /** Provider namespace/organization */
  readonly provider_namespace: string;

  /** Resource category from registry metadata (if available) */
  readonly category?: string;

  /** Subcategory from registry metadata (if available) */
  readonly subcategory?: string;

  /** Module path (for Pulumi, e.g., "ec2", "s3") */
  readonly module_path?: string;

  /** Resource description */
  readonly description: string;

  /** All input properties */
  readonly input_properties: PropertyDefinition[];

  /** All output/computed properties */
  readonly output_properties: PropertyDefinition[];

  /** Required input property names */
  readonly required_inputs: string[];

  /** Whether resource is deprecated */
  readonly deprecated: boolean;

  /** Deprecation message if deprecated */
  readonly deprecation_message?: string;

  /** Documentation URL */
  readonly documentation_url?: string;

  /** Provider version this was extracted from */
  readonly provider_version: string;

  /** Raw metadata from source */
  readonly raw_metadata?: Record<string, unknown>;
}

// =============================================================================
// Provider Metadata - Dynamic Discovery
// =============================================================================

export interface ProviderMetadata {
  /** Provider identifier (e.g., "hashicorp/aws") */
  readonly id: string;

  /** Provider name (e.g., "aws") */
  readonly name: string;

  /** Provider namespace (e.g., "hashicorp") */
  readonly namespace: string;

  /** Latest version */
  readonly version: string;

  /** Provider description */
  readonly description: string;

  /** Source (terraform or pulumi) */
  readonly source: SchemaSource;

  /** Total resource count */
  readonly resource_count: number;

  /** Total data source count (terraform) */
  readonly data_source_count?: number;

  /** Categories discovered in this provider */
  readonly categories: string[];

  /** Documentation base URL */
  readonly docs_url: string;
}

// =============================================================================
// Extraction Results
// =============================================================================

export interface ExtractionResult {
  readonly success: boolean;
  readonly source: SchemaSource;
  readonly provider: ProviderMetadata;
  readonly resources: ExtractedResourceSchema[];
  readonly data_sources?: ExtractedResourceSchema[];
  readonly errors: ExtractionError[];
  readonly metadata: ExtractionMetadata;
}

export interface ExtractionError {
  readonly resource_type?: string;
  readonly error: string;
  readonly recoverable: boolean;
  readonly stack?: string;
}

export interface ExtractionMetadata {
  readonly extracted_at: string;
  readonly source_version: string;
  readonly total_resources: number;
  readonly successful_extractions: number;
  readonly failed_extractions: number;
  readonly duration_ms: number;
  readonly categories_found: string[];
}

// =============================================================================
// Unified Schema - Cross-Provider Aggregation
// =============================================================================

export interface UnifiedResourceType {
  /** ICE canonical type (auto-generated from common patterns) */
  readonly ice_type: string;

  /** Display name */
  readonly display_name: string;

  /** Aggregated description */
  readonly description: string;

  /** Inferred category */
  readonly category: string;

  /** All provider implementations */
  readonly implementations: ProviderImplementation[];

  /** Unified property schema (merged from all providers) */
  readonly properties: UnifiedPropertyDefinition[];

  /** Property mapping across providers */
  readonly property_mappings: CrossProviderPropertyMap[];
}

export interface ProviderImplementation {
  readonly source: SchemaSource;
  readonly provider_name: string;
  readonly resource_type: string;
  readonly documentation_url?: string;
}

export interface UnifiedPropertyDefinition extends PropertyDefinition {
  /** Which providers have this property */
  readonly available_in: ProviderPropertyInfo[];
}

export interface ProviderPropertyInfo {
  readonly source: SchemaSource;
  readonly provider_name: string;
  readonly property_name: string;
  readonly type: PropertyType;
}

export interface CrossProviderPropertyMap {
  /** Unified property name */
  readonly unified_name: string;

  /** Mappings per provider */
  readonly mappings: {
    readonly source: SchemaSource;
    readonly provider_name: string;
    readonly property_name: string;
  }[];
}

// =============================================================================
// Configuration
// =============================================================================

export interface ExtractorConfig {
  /** Output directory for generated schemas */
  readonly output_dir: string;

  /** Cache directory for downloaded schemas */
  readonly cache_dir: string;

  /** Include deprecated resources */
  readonly include_deprecated: boolean;

  /** Terraform registry base URL */
  readonly terraform_registry_url: string;

  /** Pulumi registry base URL */
  readonly pulumi_registry_url: string;

  /** Request timeout in ms */
  readonly timeout_ms: number;

  /** Retry attempts for failed requests */
  readonly retry_attempts: number;

  /** Cache TTL in hours */
  readonly cache_ttl_hours: number;
}

export const DEFAULT_CONFIG: ExtractorConfig = {
  output_dir: './packages/schemas/src/generated',
  cache_dir: './.schema-cache',
  include_deprecated: false,
  terraform_registry_url: 'https://registry.terraform.io/v1',
  pulumi_registry_url: 'https://www.pulumi.com/registry/packages',
  timeout_ms: 30000,
  retry_attempts: 3,
  cache_ttl_hours: 24,
};

// =============================================================================
// Schema Manifest - Output Tracking
// =============================================================================

export interface SchemaManifest {
  readonly version: string;
  readonly generated_at: string;
  readonly sources: SourceManifest[];
  readonly unified_types: number;
  readonly total_resources: number;
}

export interface SourceManifest {
  readonly source: SchemaSource;
  readonly providers: ProviderManifestEntry[];
}

export interface ProviderManifestEntry {
  readonly name: string;
  readonly namespace: string;
  readonly version: string;
  readonly resource_count: number;
  readonly categories: Record<string, number>;
}
