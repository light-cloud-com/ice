/**
 * ICE Core Package
 *
 * Core types, interfaces, and utilities for the ICE engine.
 */

// Re-export all types
export * from './types';

// Re-export schema module (has ValidationIssue, ValidationOptions, ValidationSeverity)
export * from './schema';

// Re-export state module
export * from './state';

// Re-export graph module (rename conflicting exports)
export {
  // Parser
  tokenize,
  Lexer,
  parse,
  Parser,
  parse_yaml,
  parse_json,
  parse_auto,
  parse_source,
  // AST types
  type Program,
  type Statement,
  type ResourceBlock,
  type DataBlock,
  type ModuleBlock,
  type VariableBlock,
  type OutputBlock,
  type LocalsBlock,
  type ProviderBlock,
  type Expression,
  type Block,
  type Attribute,
  type NestedBlock,
  type Token,
  type TokenType,
  type SourcePosition,
  type SourceSpan,
  type LexerOptions,
  type LexerResult,
  type ParserOptions,
  type ParserResult,
  // Graph
  MutableGraph,
  create_mutable_graph,
  type GraphStats,
  type SerializedGraph,
  // Algorithms
  topological_sort,
  reverse_topological_sort,
  has_cycle,
  find_cycles,
  find_all_paths,
  find_shortest_path,
  find_connected_components,
  find_strongly_connected_components,
  get_execution_layers,
  get_critical_path,
  calculate_metrics,
  type GraphMetrics,
  // Validator (renamed to avoid conflicts with schema validator)
  ValidationContext,
  GraphValidator,
  create_graph_validator,
  create_validator,
  CycleValidator,
  ReferenceValidator,
  NamingValidator,
  ConnectivityValidator,
  TypeValidator,
  PropertyValidator,
  SensitiveDataValidator,
  BestPracticesValidator,
  create_builtin_validators,
  create_configured_validator,
  type GraphValidationResult,
  type Validator,
  // Rename conflicting types
  type ValidationSeverity as GraphValidationSeverity,
  type ValidationIssue as GraphValidationIssue,
  type ValidationOptions as GraphValidationOptions,
  // Category classifier
  classify_resource,
  is_category_visible_at_level,
  is_resource_visible_at_level,
  is_container_type,
  get_types_by_category,
  LEVEL_VISIBLE_CATEGORIES,
  NETWORK_CONTAINER_TYPES,
  L1_VISIBLE_NETWORK_TYPES,
  // Relationship inference
  RelationshipInferrer,
  create_relationship_inferrer,
  infer_relationships,
  type InferredRelationship,
  type InferenceOptions,
} from './graph';

// Re-export providers module
export * from './providers';

// Re-export importers module
export * from './importers';

// Re-export plan module
export * from './plan';

// Re-export apply module
export * from './apply';

// Re-export diff module
export * from './diff';

// Re-export deploy module
export * from './deploy';

// Re-export export module (Terraform/Pulumi exporters)
// Use explicit exports to avoid conflicts with importer module
export {
  TerraformExporter,
  create_terraform_exporter,
  PulumiExporter,
  create_pulumi_exporter,
  type TerraformExportOptions,
  type RequiredProvider,
  type TerraformResource as TerraformExportResource,
  type TerraformLifecycle,
  type TerraformConfig,
  type TerraformBlock,
  type TerraformProviderConfig,
  type TerraformVariable,
  type TerraformOutput as TerraformExportOutput,
  type TerraformExportResult,
  type PulumiExportOptions,
  type PulumiResource as PulumiExportResource,
  type PulumiResourceOptions,
  type PulumiProgram,
  type PulumiExportResult,
} from './export';

// Re-export errors module
export * from './errors';

// Re-export mock provider
export {
  MockProvider,
  create_mock_provider,
  create_mock_provider_factory,
  type MockProviderOptions,
} from './providers/mock-provider.js';

// Re-export high-level resources (shared between desktop and importers)
// Use specific exports to avoid conflicts with schema module
export {
  HIGH_LEVEL_CATEGORIES,
  getAllHighLevelResources,
  getHighLevelResourcesForPalette,
  filterResourcesByProvider,
  getBehaviorLabel,
  getBehaviorColor,
  getGCPCloudAssetTypes,
  cloudAssetToHighLevelType,
  type HighLevelResource,
  type HighLevelProperty,
  type HighLevelCategory,
  type NodeBehavior,
  type ProviderImplementation as HighLevelProviderImplementation,
} from './resources/high-level-resources.js';

// Re-export Cloud Provider Registry
export {
  CLOUD_PROVIDERS,
  getCloudProvider,
  getAllCloudProviders,
  getCloudProviderColor,
  getCloudProviderShortName,
  type CloudProviderMeta,
} from './resources/cloud-providers.js';

// Re-export Blueprint Factory
export {
  createBlueprintFromResource,
  type BlueprintProvider,
  type BlueprintProviderVariant,
  type BlueprintOverrides,
  type GeneratedBlueprint,
} from './resources/blueprint-factory.js';

// Re-export Cloud Blocks (Level 1 abstractions)
export {
  BLOCK_TEMPLATES,
  BLOCK_CATEGORIES,
  getBlockTemplate,
  createBlockFromTemplate,
  getBlockTypeTag,
  getProviderIcon,
  formatUptime,
  type CloudBlock,
  type BlockType,
  type BlockStatus,
  type CloudProvider,
  type BlockSource,
  type BlockDeployment,
  type BlockConfig,
  type BlockTemplate,
  type EnvVar,
} from './resources/cloud-blocks.js';

// Re-export Canvas Validation Engine
export {
  validateCanvas,
  validateNode,
  validateProperties,
  validateConnections,
  validateStructure,
  validateDeployability,
  validateArchitecture,
  validateTemplate,
  getResourceForIceType,
  getPropertiesForIceType,
  getSupportedProviders,
  isKnownIceType,
  type CanvasIssue,
  type CanvasValidationResult,
  type ValidatableNode,
  type ValidatableEdge,
  type ValidationContext as CanvasValidationContext,
  type IssueSeverity,
  type IssueCategory,
  type IssueCode,
} from './validation/index.js';
