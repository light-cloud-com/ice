/**
 * AWS Direct Importer
 *
 * Imports resources directly from AWS APIs into ICE graph format.
 * Uses AWS Resource Explorer to discover ALL resources across all regions.
 */

import { get_ice_type, map_properties } from './type-mapper';
import { init_aws_sdk, get_account_id } from './sdk-init';
import { discover_with_resource_explorer, discover_with_config } from './discovery';
import { aws_result_to_graph as aws_result_to_graph_impl, infer_relationships } from './graph-conversion';
import { classifyAWSError, ImportErrorCode } from '../../errors/import-errors';
import type { MutableGraph } from '../../graph/mutable-graph';
import type {
  AWSImportOptions,
  AWSImportResult,
  AWSImportedResource,
  AWSImportError,
  AWSImportWarning,
  AWSImportMetadata,
  AWSResource,
} from './types';

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_OPTIONS: Required<Omit<AWSImportOptions, 'profile'>> = {
  regions: [],
  services: ['all'],
  filter_types: [],
  exclude_types: [],
  filter_tags: {},
  infer_dependencies: true,
};

// =============================================================================
// Import Functions
// =============================================================================

/**
 * Import resources from AWS using Resource Explorer.
 */
export async function import_aws(options: AWSImportOptions = {}): Promise<AWSImportResult> {
  const start_time = Date.now();
  const errors: AWSImportError[] = [];
  const warnings: AWSImportWarning[] = [];

  // Merge options with defaults
  const opts = {
    ...DEFAULT_OPTIONS,
    ...Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined)),
  } as Required<Omit<AWSImportOptions, 'profile'>> & { profile?: string };

  let account_id = '';
  const all_resources: AWSResource[] = [];
  const services_scanned: string[] = [];
  const regions_scanned: string[] = [];

  try {
    // Initialize AWS SDK
    const sdk = await init_aws_sdk(opts.profile);

    // Get account ID
    account_id = await get_account_id(sdk);

    // Try Resource Explorer first (discovers ALL resources)
    if (opts.services.includes('all')) {
      try {
        const resources = await discover_with_resource_explorer(sdk, opts);
        all_resources.push(...resources);
        services_scanned.push('resource-explorer');
      } catch (error: unknown) {
        const err = error as {
          name?: string;
          code?: string;
          message?: string;
          $metadata?: { httpStatusCode?: number };
        };

        // Use centralized error classifier
        const classified = classifyAWSError(err, 'resource-explorer');

        // Check if it's a Resource Explorer specific error
        if (
          classified.code === ImportErrorCode.RESOURCE_EXPLORER_NOT_ENABLED ||
          err.name === 'AccessDeniedException' ||
          err.message?.includes('Resource Explorer') ||
          err.message?.includes('not enabled')
        ) {
          errors.push({
            code: ImportErrorCode.RESOURCE_EXPLORER_NOT_ENABLED,
            message: 'AWS Resource Explorer is not enabled.',
            action: 'enable_service',
            command: 'aws resource-explorer-2 create-index --type AGGREGATOR',
            help_url: 'https://console.aws.amazon.com/resource-explorer',
          });

          // Fall back to Config if Resource Explorer fails
          warnings.push({
            code: 'FALLBACK_TO_CONFIG',
            message: 'Falling back to AWS Config for resource discovery',
          });

          try {
            const config_resources = await discover_with_config(sdk, opts);
            all_resources.push(...config_resources);
            services_scanned.push('config');
          } catch (config_error: unknown) {
            const config_err = config_error as {
              name?: string;
              code?: string;
              message?: string;
              $metadata?: { httpStatusCode?: number };
            };
            const config_classified = classifyAWSError(config_err, 'config');
            errors.push({
              code: config_classified.code,
              message: config_classified.message,
              ...(config_classified.action
                ? {
                    action: config_classified.action.type,
                    command: config_classified.action.command,
                    help_url: config_classified.action.url,
                  }
                : {}),
            });
          }
        } else if (
          classified.code === ImportErrorCode.AUTH_EXPIRED ||
          classified.code === ImportErrorCode.AUTH_INVALID_CREDENTIALS ||
          classified.code === ImportErrorCode.AUTH_REQUIRED
        ) {
          // Auth errors should be surfaced immediately
          errors.push({
            code: classified.code,
            message: classified.message,
            action: classified.action?.type,
            command: classified.action?.command,
            help_url: classified.action?.url,
          });
        } else {
          throw error;
        }
      }
    }
  } catch (error: unknown) {
    const err = error as {
      name?: string;
      code?: string;
      message?: string;
      $metadata?: { httpStatusCode?: number };
    };
    const classified = classifyAWSError(err);
    errors.push({
      code: classified.code,
      message: classified.message,
      ...(classified.action
        ? {
            action: classified.action.type,
            command: classified.action.command,
            help_url: classified.action.url,
          }
        : {}),
    });
  }

  // Convert AWS resources to imported resources
  const imported_resources: AWSImportedResource[] = [];

  for (const resource of all_resources) {
    const ice_type = get_ice_type(resource.resource_type);

    // Apply type filters
    if (opts.filter_types.length > 0 && !opts.filter_types.includes(ice_type)) {
      continue;
    }
    if (opts.exclude_types.includes(ice_type)) {
      continue;
    }

    // Apply tag filters
    if (Object.keys(opts.filter_tags).length > 0) {
      const matches = Object.entries(opts.filter_tags).every(([key, value]) => resource.tags?.[key] === value);
      if (!matches) continue;
    }

    imported_resources.push({
      aws_arn: resource.arn,
      aws_type: resource.resource_type,
      ice_type,
      name: resource.name,
      properties: map_properties(resource.resource_type, resource.properties),
      dependencies: [],
      provider: 'aws',
      account_id: resource.account_id,
      region: resource.region,
      tags: resource.tags || {},
    });

    if (!regions_scanned.includes(resource.region)) {
      regions_scanned.push(resource.region);
    }
  }

  // Infer dependencies
  if (opts.infer_dependencies) {
    infer_relationships(imported_resources);
  }

  const metadata: AWSImportMetadata = {
    account_id,
    regions: regions_scanned,
    services_scanned,
    resource_count: imported_resources.length,
    imported_at: new Date().toISOString(),
    duration_ms: Date.now() - start_time,
  };

  // Success if no fatal errors (NOT_ENABLED errors are non-fatal if we got resources via fallback)
  const fatalErrors = errors.filter(
    (e) => e.code !== ImportErrorCode.RESOURCE_EXPLORER_NOT_ENABLED && e.code !== 'RESOURCE_EXPLORER_NOT_ENABLED',
  );

  return {
    success: fatalErrors.length === 0,
    resources: imported_resources,
    errors,
    warnings,
    metadata,
  };
}

/**
 * Import AWS resources directly to a graph.
 */
export async function import_aws_to_graph(
  options: AWSImportOptions = {},
  graph_name: string = 'aws-import',
): Promise<{ graph: MutableGraph; result: AWSImportResult }> {
  const result = await import_aws(options);
  const graph = aws_result_to_graph_impl(result, graph_name);
  return { graph, result };
}

// =============================================================================
// Graph conversion (re-export)
// =============================================================================

export { aws_result_to_graph } from './graph-conversion';
