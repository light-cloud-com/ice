/**
 * GCP Importer
 *
 * Import infrastructure directly from Google Cloud Platform.
 */

// Types
export type {
  GCPResource,
  GCPServiceType,
  ResourceScope,
  ServiceDiscoveryResult,
  GCPImportResult,
  GCPImportedResource,
  GCPImportError,
  GCPImportWarning,
  GCPImportMetadata,
  GCPImportOptions,
  GCPAuthConfig,
} from './types.js';

// Main importer functions
export { import_gcp, import_gcp_to_graph, gcp_result_to_graph } from './gcp-importer.js';

// Type mapper
export {
  get_ice_type,
  get_behavior,
  get_type_info,
  is_kind_supported,
  get_supported_kinds,
  map_properties,
} from './type-mapper.js';

// Relationships
export { infer_relationships, get_relationship_type } from './relationships.js';

// Services
export { BaseGCPService, ComputeService, StorageService } from './services/index.js';
