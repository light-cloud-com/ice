/**
 * Schema Extractor - Main Entry Point
 *
 * Exports all schema extraction functionality for aggregating
 * resources from Terraform and Pulumi registries.
 */

// Types
export type {
  CrossProviderPropertyMap,
  ExtractedResourceSchema,
  ExtractionError,
  ExtractionMetadata,
  ExtractionResult,
  ExtractorConfig,
  PropertyDefinition,
  PropertyType,
  ProviderImplementation,
  ProviderManifestEntry,
  ProviderMetadata,
  ProviderPropertyInfo,
  SchemaManifest,
  SchemaSource,
  SourceManifest,
  UnifiedPropertyDefinition,
  UnifiedResourceType,
  ValidationDefinition,
} from './types';

export { DEFAULT_CONFIG } from './types';

// Extractors
export { TerraformExtractor, create_terraform_extractor } from './terraform-extractor';
export { TerraformCliExtractor, create_terraform_cli_extractor } from './terraform-cli-extractor';
export { PulumiExtractor, create_pulumi_extractor } from './pulumi-extractor';

// Unifier
export { SchemaUnifier, create_schema_unifier } from './schema-unifier';
export type { SchemaStore } from './schema-unifier';
