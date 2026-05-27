/**
 * Azure Direct Importer
 *
 * Imports resources directly from Azure APIs into ICE graph format.
 * Uses Azure Resource Graph to discover ALL resources.
 */

import { infer_relationships as infer_relationships_module } from './relationships';
import { get_ice_type, map_properties } from './type-mapper';
import { classifyAzureError } from '../../errors/import-errors';
import { create_mutable_graph, type MutableGraph } from '../../graph/mutable-graph';
import type {
  AzureImportOptions,
  AzureImportResult,
  AzureImportedResource,
  AzureImportError,
  AzureImportWarning,
  AzureImportMetadata,
  AzureResource,
} from './types';
import type { NodeInput, EdgeInput } from '../../types/graph';

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_OPTIONS: Required<Omit<AzureImportOptions, 'subscriptions' | 'resource_groups'>> = {
  filter_types: [],
  exclude_types: [],
  filter_tags: {},
  infer_dependencies: true,
};

// =============================================================================
// Import Functions
// =============================================================================

/**
 * Import resources from Azure using Resource Graph.
 */
export async function import_azure(options: AzureImportOptions = {}): Promise<AzureImportResult> {
  const start_time = Date.now();
  const errors: AzureImportError[] = [];
  const warnings: AzureImportWarning[] = [];

  // Merge options with defaults
  const opts = {
    ...DEFAULT_OPTIONS,
    ...Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined)),
  } as Required<Omit<AzureImportOptions, 'subscriptions' | 'resource_groups'>> & {
    subscriptions?: string[];
    resource_groups?: string[];
  };

  const all_resources: AzureResource[] = [];
  const subscriptions_scanned: string[] = [];
  const locations_scanned: string[] = [];

  try {
    // Initialize Azure SDK
    const sdk = await init_azure_sdk();

    // Discover resources using Resource Graph
    const resources = await discover_with_resource_graph(sdk, opts, errors, warnings);
    all_resources.push(...resources);

    // Track subscriptions and locations
    for (const resource of resources) {
      if (!subscriptions_scanned.includes(resource.subscription_id)) {
        subscriptions_scanned.push(resource.subscription_id);
      }
      if (!locations_scanned.includes(resource.location)) {
        locations_scanned.push(resource.location);
      }
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; statusCode?: number };
    const classified = classifyAzureError(err);
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

  // Convert Azure resources to imported resources
  const imported_resources: AzureImportedResource[] = [];

  for (const resource of all_resources) {
    const ice_type = get_ice_type(resource.type);

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
      azure_id: resource.id,
      azure_type: resource.type,
      ice_type,
      name: resource.name,
      properties: map_properties(resource.type, resource.properties),
      dependencies: [],
      provider: 'azure',
      subscription_id: resource.subscription_id,
      resource_group: resource.resource_group,
      location: resource.location,
      tags: resource.tags || {},
    });
  }

  // Infer dependencies via the dedicated relationships module so the
  // logic stays testable in isolation (see relationships.test.ts).
  if (opts.infer_dependencies) {
    infer_relationships_module(imported_resources, []);
  }

  const metadata: AzureImportMetadata = {
    subscriptions: subscriptions_scanned,
    locations: locations_scanned,
    resource_count: imported_resources.length,
    imported_at: new Date().toISOString(),
    duration_ms: Date.now() - start_time,
  };

  return {
    success: errors.length === 0,
    resources: imported_resources,
    errors,
    warnings,
    metadata,
  };
}

/**
 * Import Azure resources directly to a graph.
 */
export async function import_azure_to_graph(
  options: AzureImportOptions = {},
  graph_name: string = 'azure-import',
): Promise<{ graph: MutableGraph; result: AzureImportResult }> {
  const result = await import_azure(options);
  const graph = azure_result_to_graph(result, graph_name);
  return { graph, result };
}

/**
 * Convert Azure import result to ICE graph.
 */
export function azure_result_to_graph(result: AzureImportResult, graph_name: string = 'azure-import'): MutableGraph {
  const graph = create_mutable_graph(graph_name, {
    description: `Imported from Azure subscriptions: ${result.metadata.subscriptions.join(', ')}`,
    labels: {
      source: 'azure',
    },
  });

  // Track ID to node ID mapping
  const id_to_node_id = new Map<string, string>();

  // Add nodes for each resource
  for (const resource of result.resources) {
    const labels: Record<string, string> = {
      provider: 'azure',
      azure_type: resource.azure_type,
      subscription_id: resource.subscription_id,
      resource_group: resource.resource_group,
      location: resource.location,
      ...resource.tags,
    };

    const node_input: NodeInput = {
      type: resource.ice_type,
      name: resource.name,
      properties: {
        ...resource.properties,
        _azure_id: resource.azure_id,
        _azure_type: resource.azure_type,
      },
      labels,
      annotations: {
        imported_from: 'azure',
        azure_id: resource.azure_id,
        azure_subscription: resource.subscription_id,
      },
    };

    const add_result = graph.add_node(node_input);
    if (add_result.success && add_result.node) {
      id_to_node_id.set(resource.azure_id, add_result.node.id);
    }
  }

  // Add edges for dependencies
  for (const resource of result.resources) {
    const source_id = id_to_node_id.get(resource.azure_id);
    if (!source_id) continue;

    for (const dep_id of resource.dependencies) {
      const target_id = id_to_node_id.get(dep_id);
      if (!target_id) continue;
      if (source_id === target_id) continue;

      const edge_input: EdgeInput = {
        source: source_id,
        target: target_id,
        relationship: 'depends_on',
        labels: {
          inferred: 'true',
          source: 'azure',
        },
      };

      graph.add_edge(edge_input);
    }
  }

  return graph;
}

// =============================================================================
// Azure SDK Initialization
// =============================================================================

interface AzureSdk {
  ResourceGraphClient: any;
  credential: any;
}

async function init_azure_sdk(): Promise<AzureSdk> {
  try {
    // Dynamic imports for Azure SDK
    const identity_module = '@azure/identity';
    const graph_module = '@azure/arm-resourcegraph';

    const [identity_mod, graph_mod] = await Promise.all([
      Function('m', 'return import(m)')(identity_module),
      Function('m', 'return import(m)')(graph_module),
    ]);

    // Use DefaultAzureCredential (works with az login, managed identity, etc.)
    const credential = new identity_mod.DefaultAzureCredential();
    const client = new graph_mod.ResourceGraphClient(credential);

    return {
      ResourceGraphClient: client,
      credential,
    };
  } catch (error) {
    throw new Error(
      `Failed to initialize Azure SDK. Make sure Azure SDK packages are installed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

// =============================================================================
// Resource Discovery
// =============================================================================

async function discover_with_resource_graph(
  sdk: AzureSdk,
  opts: Required<Omit<AzureImportOptions, 'subscriptions' | 'resource_groups'>> & {
    subscriptions?: string[];
    resource_groups?: string[];
  },
  errors: AzureImportError[],
  _warnings: AzureImportWarning[],
): Promise<AzureResource[]> {
  const resources: AzureResource[] = [];

  try {
    // Build Kusto query
    let query = 'Resources | project id, name, type, location, resourceGroup, subscriptionId, properties, tags';

    if (opts.resource_groups && opts.resource_groups.length > 0) {
      const rg_filter = opts.resource_groups.map((rg) => `"${rg}"`).join(', ');
      query += ` | where resourceGroup in~ (${rg_filter})`;
    }

    // Query options
    const query_options: Record<string, unknown> = {
      query,
      options: {
        resultFormat: 'objectArray',
      },
    };

    if (opts.subscriptions && opts.subscriptions.length > 0) {
      query_options.subscriptions = opts.subscriptions;
    }

    // Execute query with pagination
    let skip_token: string | undefined;

    do {
      if (skip_token) {
        (query_options.options as Record<string, unknown>)['$skipToken'] = skip_token;
      }

      const response = await sdk.ResourceGraphClient.resources(query_options);

      for (const item of response.data || []) {
        resources.push({
          id: item.id || '',
          name: item.name || '',
          type: item.type || '',
          location: item.location || 'global',
          resource_group: item.resourceGroup || '',
          subscription_id: item.subscriptionId || '',
          properties: item.properties || {},
          tags: item.tags || {},
        });
      }

      skip_token = response.skipToken;
    } while (skip_token);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string; statusCode?: number };
    const classified = classifyAzureError(err, 'resource-graph');

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

  return resources;
}

// =============================================================================
// Helper Functions
// =============================================================================

function infer_relationships(resources: AzureImportedResource[]): void {
  const id_set = new Set(resources.map((r) => r.azure_id.toLowerCase()));

  for (const resource of resources) {
    const deps: string[] = [];

    // Scan properties for Azure resource ID references
    const find_ids = (obj: unknown): void => {
      if (typeof obj === 'string') {
        // Check if it looks like an Azure resource ID
        if (obj.startsWith('/subscriptions/') && id_set.has(obj.toLowerCase())) {
          if (obj.toLowerCase() !== resource.azure_id.toLowerCase() && !deps.includes(obj)) {
            deps.push(obj);
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(find_ids);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(find_ids);
      }
    };

    find_ids(resource.properties);
    (resource as { dependencies: string[] }).dependencies = deps;
  }
}
