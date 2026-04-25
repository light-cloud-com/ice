/**
 * GCP Direct Importer
 *
 * Imports resources directly from GCP APIs into ICE graph format.
 */

import { infer_relationships } from './relationships.js';
import { ComputeService, StorageService, AssetInventoryService, BaseGCPService } from "./services";
import { get_ice_type, get_behavior, map_properties } from './type-mapper.js';
import { create_mutable_graph, type MutableGraph } from '../../graph/mutable-graph.js';
import type {
  GCPImportOptions,
  GCPImportResult,
  GCPImportedResource,
  GCPImportError,
  GCPImportWarning,
  GCPImportMetadata,
  GCPResource,
  GCPServiceType,
} from './types.js';
import type { NodeInput, EdgeInput } from '../../types/graph.js';

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_OPTIONS: Required<Omit<GCPImportOptions, 'project' | 'key_file'>> = {
  regions: [],
  zones: [],
  services: ['all'], // Use Cloud Asset Inventory by default - discovers ALL resources
  filter_types: [],
  exclude_types: [],
  filter_labels: {},
  name_prefix: '',
  infer_dependencies: true,
  max_concurrent: 5,
  timeout_ms: 30000,
};

// Default GCP regions to scan if none specified
const DEFAULT_REGIONS = ['us-central1', 'us-east1', 'us-west1', 'europe-west1'];

// =============================================================================
// Import Functions
// =============================================================================

/**
 * Import resources from GCP.
 */
export async function import_gcp(options: GCPImportOptions): Promise<GCPImportResult> {
  const start_time = Date.now();
  const errors: GCPImportError[] = [];
  const warnings: GCPImportWarning[] = [];

  // Merge options with defaults, handling undefined values
  const opts = {
    ...DEFAULT_OPTIONS,
    ...Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined)),
  } as Required<Omit<GCPImportOptions, 'key_file'>> & { key_file?: string; project: string };

  const regions = opts.regions.length > 0 ? opts.regions : DEFAULT_REGIONS;
  const zones = opts.zones.length > 0 ? opts.zones : derive_zones(regions);

  // Discover resources from each service
  const all_resources: GCPResource[] = [];
  const services_scanned: GCPServiceType[] = [];

  for (const service_type of opts.services) {
    const service = create_service(service_type, opts.project, regions, zones, options.key_file);
    if (!service) {
      warnings.push({
        code: 'UNKNOWN_SERVICE',
        message: `Unknown service type: ${service_type}`,
      });
      continue;
    }

    try {
      const result = await service.discover();
      all_resources.push(...result.resources);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      services_scanned.push(service_type);
    } catch (error) {
      errors.push({
        code: 'SERVICE_ERROR',
        message: `Service ${service_type} failed: ${error instanceof Error ? error.message : String(error)}`,
        service: service_type,
      });
    }
  }

  // Convert GCP resources to imported resources
  const imported_resources: GCPImportedResource[] = [];

  for (const resource of all_resources) {
    // Map to ICE type
    const ice_type = get_ice_type(resource.kind);

    // Apply type filters
    if (opts.filter_types.length > 0 && !opts.filter_types.includes(ice_type)) {
      continue;
    }
    if (opts.exclude_types.includes(ice_type)) {
      continue;
    }

    // Apply label filters
    if (Object.keys(opts.filter_labels).length > 0) {
      const matches = Object.entries(opts.filter_labels).every(([key, value]) => resource.labels?.[key] === value);
      if (!matches) continue;
    }

    // Build name - make it unique by including region/zone for resources that often share names
    let name = resource.name;

    // For subnets, VPCs, and other regional/zonal resources, include location to make unique
    if (resource.region || resource.zone) {
      const location = resource.zone || resource.region;
      // Check if this is a resource type that commonly has duplicate names
      const needsLocationSuffix = [
        'compute#subnetwork',
        'compute#network',
        'compute#firewall',
        'compute#route',
      ].includes(resource.kind);

      if (needsLocationSuffix && name === 'default') {
        name = `${name}-${location}`;
      }
    }

    if (opts.name_prefix) {
      name = `${opts.name_prefix}${name}`;
    }

    // Get behavior from high-level mapping
    const behavior = get_behavior(resource.kind);

    imported_resources.push({
      gcp_self_link: resource.self_link,
      gcp_kind: resource.kind,
      ice_type,
      name,
      id: resource.id,
      properties: map_properties(resource.kind, resource.properties),
      dependencies: [],
      provider: 'gcp',
      project: resource.project,
      zone: resource.zone,
      region: resource.region,
      labels: resource.labels ?? {},
      behavior,
    });
  }

  // Infer dependencies
  if (opts.infer_dependencies) {
    infer_relationships(imported_resources, warnings);
  }

  const metadata: GCPImportMetadata = {
    project: opts.project,
    regions,
    zones,
    services_scanned,
    resource_count: imported_resources.length,
    imported_at: new Date().toISOString(),
    duration_ms: Date.now() - start_time,
  };

  return {
    success: errors.filter((e) => !e.code.includes('ACCESS_DENIED')).length === 0,
    resources: imported_resources,
    errors,
    warnings,
    metadata,
  };
}

/**
 * Import GCP resources directly to a graph.
 */
export async function import_gcp_to_graph(
  options: GCPImportOptions,
  graph_name: string = 'gcp-import',
): Promise<{ graph: MutableGraph; result: GCPImportResult }> {
  const result = await import_gcp(options);
  const graph = gcp_result_to_graph(result, graph_name);
  return { graph, result };
}

/**
 * Convert GCP import result to ICE graph.
 */
export function gcp_result_to_graph(result: GCPImportResult, graph_name: string = 'gcp-import'): MutableGraph {
  const graph = create_mutable_graph(graph_name, {
    description: `Imported from GCP project ${result.metadata.project}`,
    labels: {
      source: 'gcp',
      project: result.metadata.project,
    },
  });

  // Track self_link to node ID mapping
  const self_link_to_node_id = new Map<string, string>();

  // Add nodes for each resource
  for (const resource of result.resources) {
    const labels: Record<string, string> = {
      provider: 'gcp',
      gcp_kind: resource.gcp_kind,
      project: resource.project,
      ...resource.labels,
    };

    if (resource.zone) {
      labels['zone'] = resource.zone;
    }
    if (resource.region) {
      labels['region'] = resource.region;
    }

    const node_input: NodeInput = {
      type: resource.ice_type,
      name: resource.name,
      properties: {
        ...resource.properties,
        _gcp_self_link: resource.gcp_self_link,
        _gcp_kind: resource.gcp_kind,
        // Include region/zone in properties for easier access
        ...(resource.region && { region: resource.region }),
        ...(resource.zone && { zone: resource.zone }),
      },
      labels,
      annotations: {
        imported_from: 'gcp',
        gcp_self_link: resource.gcp_self_link,
        gcp_project: resource.project,
        behavior: resource.behavior,
      },
    };

    const add_result = graph.add_node(node_input);
    if (add_result.success && add_result.node) {
      self_link_to_node_id.set(resource.gcp_self_link, add_result.node.id);
    }
  }

  // Add edges for dependencies
  for (const resource of result.resources) {
    const source_id = self_link_to_node_id.get(resource.gcp_self_link);
    if (!source_id) continue;

    for (const dep_self_link of resource.dependencies) {
      const target_id = self_link_to_node_id.get(dep_self_link);
      if (!target_id) continue;

      // Don't create self-referencing edges
      if (source_id === target_id) continue;

      const edge_input: EdgeInput = {
        source: source_id,
        target: target_id,
        relationship: 'depends_on',
        labels: {
          inferred: 'true',
          source: 'gcp',
        },
      };

      graph.add_edge(edge_input);
    }
  }

  return graph;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Derive zones from regions.
 * GCP zones are typically region + a/b/c (e.g., us-central1-a).
 */
function derive_zones(regions: string[]): string[] {
  return regions.flatMap((region) => [`${region}-a`, `${region}-b`, `${region}-c`]);
}

/**
 * Create a service instance for the given service type.
 */
function create_service(
  service_type: GCPServiceType,
  project: string,
  regions: string[],
  zones: string[],
  key_file?: string,
): BaseGCPService | null {
  switch (service_type) {
    case 'all':
      // Cloud Asset Inventory - discovers ALL resources in one API call
      return new AssetInventoryService(project, regions, zones, key_file);
    case 'compute':
    case 'network':
      return new ComputeService(project, regions, zones, key_file);
    case 'storage':
      return new StorageService(project, regions, zones, key_file);
    default:
      return null;
  }
}
