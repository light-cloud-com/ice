/**
 * ICE Schema Module
 *
 * Provides schema access, validation, and type mapping.
 */

// Schema provider types and interfaces
export type {
  IceType,
  PropertyType,
  PropertySchema,
  PropertyValidation,
  ProviderImplementation,
  ResourceSchema,
  SchemaQuery,
  SchemaQueryResult,
  SchemaProvider,
  ProviderInfo,
  SchemaStats,
  TypeMapping,
  PropertyMapping,
  SchemaEventType,
  SchemaEvent,
  SchemaEventListener,
  ObservableSchemaProvider,
} from './schema-provider.js';

export { create_ice_type } from './schema-provider.js';

// Resource validator
export type {
  ValidationSeverity,
  ValidationIssue,
  ValidationCode,
  ValidationResult,
  ValidationOptions,
} from './resource-validator.js';

export { ResourceValidator, create_resource_validator } from './resource-validator.js';

// Type mapper
export type { MappedResource, MappedProperty, TransformedValue } from './type-mapper.js';

export { TypeMapper, create_type_mapper } from './type-mapper.js';

// Embedded schema provider
export {
  EmbeddedSchemaProvider,
  create_embedded_schema_provider,
  create_embedded_schema_provider_with_registry,
} from './embedded-schema-provider.js';

// Unified type resolver
export type {
  ProviderSource,
  TypeResolutionResult,
  PropertyMapping as TypePropertyMapping,
} from './unified-type-resolver.js';

export {
  UnifiedTypeResolver,
  get_type_resolver,
  initialize_type_resolver,
  create_type_resolver,
} from './unified-type-resolver.js';

// Customization loader
export type {
  CustomizationPaths,
  CustomizationSummary,
  CustomizationFile,
  CustomizationValidation,
  CustomizationError,
  ValidationWarning as CustomizationWarning,
} from './customization-loader.js';

export { CustomizationLoader, create_customization_loader, get_base_db_path } from './customization-loader.js';
