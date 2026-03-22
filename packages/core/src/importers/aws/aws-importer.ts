/**
 * AWS Direct Importer
 *
 * Imports resources directly from AWS APIs into ICE graph format.
 * Uses AWS Resource Explorer to discover ALL resources across all regions.
 */

import type {
  AWSImportOptions,
  AWSImportResult,
  AWSImportedResource,
  AWSImportError,
  AWSImportWarning,
  AWSImportMetadata,
  AWSResource,
} from './types.js';
import { get_ice_type, map_properties } from './type-mapper.js';
import { create_mutable_graph, type MutableGraph } from '../../graph/mutable-graph.js';
import type { NodeInput, EdgeInput } from '../../types/graph.js';
import { classifyAWSError, ImportErrorCode } from '../../errors/import-errors.js';

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
  const graph = aws_result_to_graph(result, graph_name);
  return { graph, result };
}

/**
 * Convert AWS import result to ICE graph.
 */
export function aws_result_to_graph(result: AWSImportResult, graph_name: string = 'aws-import'): MutableGraph {
  const graph = create_mutable_graph(graph_name, {
    description: `Imported from AWS account ${result.metadata.account_id}`,
    labels: {
      source: 'aws',
      account_id: result.metadata.account_id,
    },
  });

  // Track ARN to node ID mapping
  const arn_to_node_id = new Map<string, string>();

  // Add nodes for each resource
  for (const resource of result.resources) {
    const labels: Record<string, string> = {
      provider: 'aws',
      aws_type: resource.aws_type,
      account_id: resource.account_id,
      region: resource.region,
      ...resource.tags,
    };

    const node_input: NodeInput = {
      type: resource.ice_type,
      name: resource.name,
      properties: {
        ...resource.properties,
        _aws_arn: resource.aws_arn,
        _aws_type: resource.aws_type,
      },
      labels,
      annotations: {
        imported_from: 'aws',
        aws_arn: resource.aws_arn,
        aws_account: resource.account_id,
      },
    };

    const add_result = graph.add_node(node_input);
    if (add_result.success && add_result.node) {
      arn_to_node_id.set(resource.aws_arn, add_result.node.id);
    }
  }

  // Add edges for dependencies
  for (const resource of result.resources) {
    const source_id = arn_to_node_id.get(resource.aws_arn);
    if (!source_id) continue;

    for (const dep_arn of resource.dependencies) {
      const target_id = arn_to_node_id.get(dep_arn);
      if (!target_id) continue;
      if (source_id === target_id) continue;

      const edge_input: EdgeInput = {
        source: source_id,
        target: target_id,
        relationship: 'depends_on',
        labels: {
          inferred: 'true',
          source: 'aws',
        },
      };

      graph.add_edge(edge_input);
    }
  }

  return graph;
}

// =============================================================================
// AWS SDK Initialization
// =============================================================================

interface AWSSdk {
  STS: any;
  ResourceExplorer: any;
  ConfigService: any;
  credentials?: any;
}

async function init_aws_sdk(profile?: string): Promise<AWSSdk> {
  try {
    // Dynamic imports for AWS SDK v3
    const sts_module_name = '@aws-sdk/client-sts';
    const re_module_name = '@aws-sdk/client-resource-explorer-2';
    const config_module_name = '@aws-sdk/client-config-service';

    const [sts_mod, re_mod, config_mod] = await Promise.all([
      Function('m', 'return import(m)')(sts_module_name),
      Function('m', 'return import(m)')(re_module_name),
      Function('m', 'return import(m)')(config_module_name),
    ]);

    const config: Record<string, unknown> = {};

    if (profile) {
      // Load credentials from profile
      const creds_module_name = '@aws-sdk/credential-providers';
      const creds_mod = await Function('m', 'return import(m)')(creds_module_name);
      config.credentials = creds_mod.fromIni({ profile });
    }

    return {
      STS: new sts_mod.STSClient(config),
      ResourceExplorer: new re_mod.ResourceExplorer2Client(config),
      ConfigService: new config_mod.ConfigServiceClient(config),
    };
  } catch (error) {
    throw new Error(
      `Failed to initialize AWS SDK. Make sure AWS SDK v3 packages are installed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function get_account_id(sdk: AWSSdk): Promise<string> {
  try {
    const sts_module_name = '@aws-sdk/client-sts';
    const sts_mod = await Function('m', 'return import(m)')(sts_module_name);
    const command = new sts_mod.GetCallerIdentityCommand({});
    const response = await sdk.STS.send(command);
    return response.Account || '';
  } catch {
    return 'unknown';
  }
}

// =============================================================================
// Resource Discovery
// =============================================================================

async function discover_with_resource_explorer(
  sdk: AWSSdk,
  opts: Required<Omit<AWSImportOptions, 'profile'>>,
): Promise<AWSResource[]> {
  const resources: AWSResource[] = [];

  const re_module_name = '@aws-sdk/client-resource-explorer-2';
  const re_mod = await Function('m', 'return import(m)')(re_module_name);

  // Search for all resources
  let next_token: string | undefined;

  do {
    const command = new re_mod.SearchCommand({
      QueryString: '*', // Search all resources
      MaxResults: 100,
      NextToken: next_token,
    });

    const response = await sdk.ResourceExplorer.send(command);

    for (const resource of response.Resources || []) {
      resources.push({
        arn: resource.Arn || '',
        name: extract_name_from_arn(resource.Arn || ''),
        resource_type: resource.ResourceType || '',
        region: resource.Region || 'global',
        account_id: extract_account_from_arn(resource.Arn || ''),
        properties: resource.Properties || {},
        tags: parse_tags(resource.Properties),
      });
    }

    next_token = response.NextToken;
  } while (next_token);

  return resources;
}

async function discover_with_config(
  sdk: AWSSdk,
  opts: Required<Omit<AWSImportOptions, 'profile'>>,
): Promise<AWSResource[]> {
  const resources: AWSResource[] = [];

  const config_module_name = '@aws-sdk/client-config-service';
  const config_mod = await Function('m', 'return import(m)')(config_module_name);

  // Query all resources using AWS Config's advanced query
  let next_token: string | undefined;

  do {
    const command = new config_mod.SelectResourceConfigCommand({
      Expression: "SELECT resourceId, resourceType, arn, configuration, tags WHERE resourceType LIKE '%'",
      Limit: 100,
      NextToken: next_token,
    });

    const response = await sdk.ConfigService.send(command);

    for (const result of response.Results || []) {
      try {
        const resource_data = JSON.parse(result);
        resources.push({
          arn: resource_data.arn || '',
          name: resource_data.resourceId || extract_name_from_arn(resource_data.arn || ''),
          resource_type: resource_data.resourceType || '',
          region: extract_region_from_arn(resource_data.arn || ''),
          account_id: extract_account_from_arn(resource_data.arn || ''),
          properties: resource_data.configuration || {},
          tags: resource_data.tags || {},
        });
      } catch {
        // Skip unparseable results
      }
    }

    next_token = response.NextToken;
  } while (next_token);

  return resources;
}

// =============================================================================
// Helper Functions
// =============================================================================

function extract_name_from_arn(arn: string): string {
  // ARN format: arn:partition:service:region:account:resource
  const parts = arn.split(':');
  if (parts.length >= 6) {
    const resource = parts.slice(5).join(':');
    // Handle resource/name or resource:name formats
    const name_parts = resource.split(/[/:]/);
    return name_parts[name_parts.length - 1] || resource;
  }
  return arn;
}

function extract_account_from_arn(arn: string): string {
  const parts = arn.split(':');
  return parts[4] || '';
}

function extract_region_from_arn(arn: string): string {
  const parts = arn.split(':');
  return parts[3] || 'global';
}

function parse_tags(properties: unknown): Record<string, string> {
  if (!properties || typeof properties !== 'object') {
    return {};
  }

  const props = properties as Record<string, unknown>;
  const tags: Record<string, string> = {};

  // Try different tag formats
  if (Array.isArray(props.Tags)) {
    for (const tag of props.Tags) {
      if (tag && typeof tag === 'object' && 'Key' in tag && 'Value' in tag) {
        tags[String(tag.Key)] = String(tag.Value);
      }
    }
  } else if (props.tags && typeof props.tags === 'object') {
    Object.assign(tags, props.tags);
  }

  return tags;
}

function infer_relationships(resources: AWSImportedResource[]): void {
  const arn_set = new Set(resources.map((r) => r.aws_arn));

  for (const resource of resources) {
    const deps: string[] = [];

    // Scan properties for ARN references
    const find_arns = (obj: unknown): void => {
      if (typeof obj === 'string' && obj.startsWith('arn:aws:') && arn_set.has(obj)) {
        if (obj !== resource.aws_arn && !deps.includes(obj)) {
          deps.push(obj);
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(find_arns);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(find_arns);
      }
    };

    find_arns(resource.properties);
    (resource as { dependencies: string[] }).dependencies = deps;
  }
}
