/**
 * ICE Importers Module
 *
 * Import infrastructure state from various sources into ICE graph format.
 */

// Terraform importer
export {
  // State importer
  import_terraform_state,
  import_terraform_state_json,
  import_terraform_state_object,
  import_result_to_graph as terraform_result_to_graph,
  import_terraform_to_graph,
  type TerraformImportOptions,
  // Type mapper
  get_ice_type as terraform_get_ice_type,
  get_ice_provider as terraform_get_ice_provider,
  get_provider_from_type as terraform_get_provider_from_type,
  map_properties as terraform_map_properties,
  is_type_supported as terraform_is_type_supported,
  get_supported_types as terraform_get_supported_types,
  get_supported_ice_types as terraform_get_supported_ice_types,
  // Types
  type TerraformState,
  type TerraformResource,
  type TerraformResourceInstance,
  type TerraformOutput,
  type TerraformImportResult,
  type ImportedResource as TerraformImportedResource,
  type ImportedOutput as TerraformImportedOutput,
  type ImportError as TerraformImportError,
  type ImportWarning as TerraformImportWarning,
  type ImportMetadata as TerraformImportMetadata,
} from "./terraform";

// Pulumi importer
export {
  // State importer
  import_pulumi_state,
  import_pulumi_state_json,
  import_pulumi_state_object,
  import_result_to_graph as pulumi_result_to_graph,
  import_pulumi_to_graph,
  type PulumiImportOptions,
  // Type mapper
  parse_urn,
  parse_type,
  get_ice_type as pulumi_get_ice_type,
  get_ice_provider as pulumi_get_ice_provider,
  get_provider_from_type as pulumi_get_provider_from_type,
  is_type_supported as pulumi_is_type_supported,
  get_supported_types as pulumi_get_supported_types,
  get_supported_ice_types as pulumi_get_supported_ice_types,
  get_name_from_urn,
  is_provider_resource,
  is_stack_resource,
  // Types
  type PulumiStackState,
  type PulumiCheckpoint,
  type PulumiConfigValue,
  type PulumiDeployment,
  type PulumiManifest,
  type PulumiPluginInfo,
  type PulumiSecretsProvider,
  type PulumiResource,
  type PulumiSourcePosition,
  type PulumiPendingOperation,
  type ParsedUrn,
  type PulumiStackExport,
  type PulumiImportResult,
  type PulumiImportedResource,
  type PulumiImportedOutput,
  type PulumiImportError,
  type PulumiImportWarning,
  type PulumiImportMetadata,
} from "./pulumi";

// GCP importer
export {
  // Main importer functions
  import_gcp,
  import_gcp_to_graph,
  gcp_result_to_graph,
  // Type mapper
  get_ice_type as gcp_get_ice_type,
  get_behavior as gcp_get_behavior,
  get_type_info as gcp_get_type_info,
  is_kind_supported as gcp_is_kind_supported,
  get_supported_kinds as gcp_get_supported_kinds,
  map_properties as gcp_map_properties,
  // Relationships
  infer_relationships as gcp_infer_relationships,
  get_relationship_type as gcp_get_relationship_type,
  // Types
  type GCPResource,
  type GCPServiceType,
  type ResourceScope,
  type ServiceDiscoveryResult,
  type GCPImportResult,
  type GCPImportedResource,
  type GCPImportError,
  type GCPImportWarning,
  type GCPImportMetadata,
  type GCPImportOptions,
  type GCPAuthConfig,
} from "./gcp";

// AWS importer
export {
  // Main importer functions
  import_aws,
  import_aws_to_graph,
  aws_result_to_graph,
  // Type mapper
  get_ice_type as aws_get_ice_type,
  is_type_supported as aws_is_type_supported,
  get_supported_types as aws_get_supported_types,
  map_properties as aws_map_properties,
  // Types
  type AWSResource,
  type AWSServiceType,
  type AWSImportOptions,
  type AWSImportResult,
  type AWSImportedResource,
  type AWSImportError,
  type AWSImportWarning,
  type AWSImportMetadata,
} from "./aws";

// Azure importer
export {
  // Main importer functions
  import_azure,
  import_azure_to_graph,
  azure_result_to_graph,
  // Type mapper
  get_ice_type as azure_get_ice_type,
  is_type_supported as azure_is_type_supported,
  get_supported_types as azure_get_supported_types,
  map_properties as azure_map_properties,
  // Types
  type AzureResource,
  type AzureImportOptions,
  type AzureImportResult,
  type AzureImportedResource,
  type AzureImportError,
  type AzureImportWarning,
  type AzureImportMetadata,
} from "./azure";
