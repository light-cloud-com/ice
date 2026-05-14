/**
 * AWS Importer Module
 */

export { import_aws, import_aws_to_graph, aws_result_to_graph } from './aws-importer';

export { get_ice_type, is_type_supported, get_supported_types, map_properties } from './type-mapper';

export type {
  AWSResource,
  AWSServiceType,
  AWSImportOptions,
  AWSImportResult,
  AWSImportedResource,
  AWSImportError,
  AWSImportWarning,
  AWSImportMetadata,
} from './types';
