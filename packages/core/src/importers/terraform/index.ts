/**
 * Terraform Importer Module
 *
 * Import Terraform state files into ICE graph format.
 */

// Types
export type {
  TerraformState,
  TerraformResource,
  TerraformResourceInstance,
  TerraformOutput,
  TerraformOutputType,
  TerraformPlan,
  TerraformResourceChange,
  TerraformChange,
  TerraformAction,
  TerraformImportResult,
  ImportedResource,
  ImportedOutput,
  ImportError,
  ImportWarning,
  ImportMetadata,
} from './types.js';

// Type mapper
export {
  get_ice_type,
  get_ice_provider,
  get_provider_from_type,
  is_type_supported,
  get_supported_types,
  get_supported_ice_types,
  map_properties,
} from './type-mapper.js';

// State importer
export type { TerraformImportOptions } from './state-importer.js';
export {
  import_terraform_state,
  import_terraform_state_json,
  import_terraform_state_object,
  import_result_to_graph,
  import_terraform_to_graph,
} from './state-importer.js';
