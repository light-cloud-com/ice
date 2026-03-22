/**
 * Azure Importer Module
 */

export { import_azure, import_azure_to_graph, azure_result_to_graph } from './azure-importer.js';

export { get_ice_type, is_type_supported, get_supported_types, map_properties } from './type-mapper.js';

export type {
  AzureResource,
  AzureImportOptions,
  AzureImportResult,
  AzureImportedResource,
  AzureImportError,
  AzureImportWarning,
  AzureImportMetadata,
} from './types.js';
