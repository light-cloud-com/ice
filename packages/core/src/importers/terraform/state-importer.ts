/**
 * Terraform State Importer
 *
 * Imports Terraform state files (.tfstate) into ICE graph format.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type {
  TerraformState,
  TerraformResource,
  TerraformResourceInstance,
  TerraformImportResult,
  ImportedResource,
  ImportedOutput,
  ImportError,
  ImportWarning,
  ImportMetadata,
} from './types.js';
import { get_ice_type, get_ice_provider, get_provider_from_type, map_properties } from './type-mapper.js';
import { MutableGraph, create_mutable_graph } from '../../graph/mutable-graph.js';
import type { NodeInput, EdgeInput } from '../../types/graph.js';

// =============================================================================
// Import Options
// =============================================================================

/**
 * Options for importing Terraform state.
 */
export interface TerraformImportOptions {
  /** Include data sources (mode: 'data') */
  readonly include_data_sources?: boolean;

  /** Include sensitive attributes (will be masked) */
  readonly include_sensitive?: boolean;

  /** Only import resources matching these types */
  readonly filter_types?: string[];

  /** Exclude resources matching these types */
  readonly exclude_types?: string[];

  /** Only import resources from these modules */
  readonly filter_modules?: string[];

  /** Prefix to add to resource names */
  readonly name_prefix?: string;

  /** Whether to infer dependencies from attribute references */
  readonly infer_dependencies?: boolean;

  /** Existing graph to merge into (optional) */
  readonly target_graph?: MutableGraph;
}

const DEFAULT_OPTIONS: Required<Omit<TerraformImportOptions, 'target_graph'>> = {
  include_data_sources: false,
  include_sensitive: false,
  filter_types: [],
  exclude_types: [],
  filter_modules: [],
  name_prefix: '',
  infer_dependencies: true,
};

// =============================================================================
// State Importer
// =============================================================================

/**
 * Import Terraform state from a file path.
 */
export async function import_terraform_state(
  state_path: string,
  options: TerraformImportOptions = {},
): Promise<TerraformImportResult> {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];

  // Check file exists
  if (!existsSync(state_path)) {
    return {
      success: false,
      resources: [],
      outputs: [],
      errors: [
        {
          code: 'FILE_NOT_FOUND',
          message: `State file not found: ${state_path}`,
        },
      ],
      warnings: [],
      metadata: create_empty_metadata(),
    };
  }

  // Read and parse state file
  let state: TerraformState;
  try {
    const content = await readFile(state_path, 'utf-8');
    state = JSON.parse(content) as TerraformState;
  } catch (error) {
    return {
      success: false,
      resources: [],
      outputs: [],
      errors: [
        {
          code: 'PARSE_ERROR',
          message: `Failed to parse state file: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      warnings: [],
      metadata: create_empty_metadata(),
    };
  }

  // Validate state version
  if (state.version !== 4 && state.version !== 3) {
    warnings.push({
      code: 'UNSUPPORTED_VERSION',
      message: `State version ${state.version} may not be fully supported. Supported versions: 3, 4`,
    });
  }

  return import_terraform_state_object(state, options, errors, warnings);
}

/**
 * Import Terraform state from a JSON string.
 */
export function import_terraform_state_json(
  json_content: string,
  options: TerraformImportOptions = {},
): TerraformImportResult {
  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];

  let state: TerraformState;
  try {
    state = JSON.parse(json_content) as TerraformState;
  } catch (error) {
    return {
      success: false,
      resources: [],
      outputs: [],
      errors: [
        {
          code: 'PARSE_ERROR',
          message: `Failed to parse state JSON: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      warnings: [],
      metadata: create_empty_metadata(),
    };
  }

  return import_terraform_state_object(state, options, errors, warnings);
}

/**
 * Import from a parsed Terraform state object.
 */
export function import_terraform_state_object(
  state: TerraformState,
  options: TerraformImportOptions = {},
  errors: ImportError[] = [],
  warnings: ImportWarning[] = [],
): TerraformImportResult {
  // Merge options with defaults, filtering out undefined values
  const opts = {
    ...DEFAULT_OPTIONS,
    ...(Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined)) as TerraformImportOptions),
  };
  const imported_resources: ImportedResource[] = [];
  const imported_outputs: ImportedOutput[] = [];

  // Validate state version
  if (state.version !== 4 && state.version !== 3) {
    warnings.push({
      code: 'UNSUPPORTED_VERSION',
      message: `State version ${state.version} may not be fully supported. Supported versions: 3, 4`,
    });
  }

  // Process resources
  if (state.resources) {
    for (const resource of state.resources) {
      // Skip data sources unless explicitly included
      if (resource.mode === 'data' && !opts.include_data_sources) {
        continue;
      }

      // Apply type filters
      if (opts.filter_types.length > 0 && !opts.filter_types.includes(resource.type)) {
        continue;
      }
      if (opts.exclude_types.includes(resource.type)) {
        continue;
      }

      // Apply module filters
      if (opts.filter_modules.length > 0) {
        const module = resource.module ?? '';
        if (!opts.filter_modules.some((m) => module.startsWith(m))) {
          continue;
        }
      }

      // Import each instance
      for (const instance of resource.instances) {
        try {
          const imported = import_resource_instance(resource, instance, opts, warnings);
          imported_resources.push(imported);
        } catch (error) {
          errors.push({
            code: 'IMPORT_ERROR',
            message: `Failed to import resource ${resource.type}.${resource.name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            resource: `${resource.type}.${resource.name}`,
          });
        }
      }
    }
  }

  // Process outputs
  if (state.outputs) {
    for (const [name, output] of Object.entries(state.outputs)) {
      imported_outputs.push({
        name,
        value: opts.include_sensitive || !output.sensitive ? output.value : '***SENSITIVE***',
        type: output.type,
        sensitive: output.sensitive ?? false,
      });
    }
  }

  // Infer dependencies if enabled
  if (opts.infer_dependencies) {
    infer_dependencies(imported_resources, warnings);
  }

  const metadata: ImportMetadata = {
    terraform_version: state.terraform_version,
    state_version: state.version,
    serial: state.serial,
    lineage: state.lineage,
    resource_count: imported_resources.length,
    output_count: imported_outputs.length,
    imported_at: new Date().toISOString(),
  };

  return {
    success: errors.length === 0,
    resources: imported_resources,
    outputs: imported_outputs,
    errors,
    warnings,
    metadata,
  };
}

/**
 * Import a single resource instance.
 */
function import_resource_instance(
  resource: TerraformResource,
  instance: TerraformResourceInstance,
  options: Required<Omit<TerraformImportOptions, 'target_graph'>>,
  warnings: ImportWarning[],
): ImportedResource {
  const terraform_type = resource.type;
  const ice_type = get_ice_type(terraform_type);
  const provider = get_ice_provider(resource.provider);

  // Build the Terraform address
  let address = `${resource.type}.${resource.name}`;
  if (resource.module) {
    address = `${resource.module}.${address}`;
  }
  if (instance.index_key !== undefined) {
    address = `${address}[${JSON.stringify(instance.index_key)}]`;
  }

  // Build the ICE name
  let name = resource.name;
  if (options.name_prefix) {
    name = `${options.name_prefix}${name}`;
  }
  if (instance.index_key !== undefined) {
    name = `${name}_${instance.index_key}`;
  }

  // Process attributes
  let properties = map_properties(terraform_type, instance.attributes);

  // Handle sensitive attributes
  const sensitive_attributes = instance.sensitive_attributes ?? [];
  if (!options.include_sensitive && sensitive_attributes.length > 0) {
    properties = mask_sensitive_attributes(properties, sensitive_attributes);
    if (sensitive_attributes.length > 0) {
      warnings.push({
        code: 'SENSITIVE_MASKED',
        message: `Masked ${sensitive_attributes.length} sensitive attributes`,
        resource: address,
      });
    }
  }

  // Extract explicit dependencies
  const dependencies = (instance.dependencies ?? []).map((dep) => {
    // Convert Terraform address to ICE reference format
    return dep;
  });

  return {
    terraform_address: address,
    terraform_type,
    ice_type,
    name,
    properties,
    dependencies,
    provider,
    module: resource.module,
    index_key: instance.index_key,
    sensitive_attributes,
  };
}

/**
 * Mask sensitive attributes in properties.
 */
function mask_sensitive_attributes(
  properties: Record<string, unknown>,
  sensitive_paths: string[],
): Record<string, unknown> {
  const result = { ...properties };

  for (const path of sensitive_paths) {
    // Parse the path (handles array notation like "password" or "connection[0].password")
    const parts = path.split(/\.|\[|\]/).filter(Boolean);
    mask_path(result, parts);
  }

  return result;
}

/**
 * Mask a specific path in an object.
 */
function mask_path(obj: Record<string, unknown>, path: string[]): void {
  if (path.length === 0) return;

  const [first, ...rest] = path;
  if (!first || !(first in obj)) return;

  if (rest.length === 0) {
    obj[first] = '***SENSITIVE***';
  } else {
    const next = obj[first];
    if (typeof next === 'object' && next !== null) {
      mask_path(next as Record<string, unknown>, rest);
    }
  }
}

/**
 * Infer dependencies from attribute references.
 */
function infer_dependencies(resources: ImportedResource[], warnings: ImportWarning[]): void {
  // Build a lookup map of resource addresses and their IDs
  const resource_lookup = new Map<string, string>();
  const id_lookup = new Map<string, string>();

  for (const resource of resources) {
    resource_lookup.set(resource.terraform_address, resource.name);

    // Also index by various ID fields
    const id = resource.properties['id'] as string | undefined;
    if (id) {
      id_lookup.set(id, resource.terraform_address);
    }

    // AWS-specific IDs
    const arn = resource.properties['arn'] as string | undefined;
    if (arn) {
      id_lookup.set(arn, resource.terraform_address);
    }
  }

  // Scan properties for references
  for (const resource of resources) {
    const inferred_deps = new Set(resource.dependencies);

    scan_for_references(resource.properties, id_lookup, inferred_deps);

    // Update dependencies
    resource.dependencies.length = 0;
    resource.dependencies.push(...inferred_deps);
  }
}

/**
 * Scan an object for ID references.
 */
function scan_for_references(obj: unknown, id_lookup: Map<string, string>, deps: Set<string>): void {
  if (obj === null || obj === undefined) return;

  if (typeof obj === 'string') {
    // Check if this string matches any known ID
    const ref = id_lookup.get(obj);
    if (ref) {
      deps.add(ref);
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      scan_for_references(item, id_lookup, deps);
    }
  } else if (typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      scan_for_references(value, id_lookup, deps);
    }
  }
}

/**
 * Create empty metadata for error cases.
 */
function create_empty_metadata(): ImportMetadata {
  return {
    terraform_version: 'unknown',
    state_version: 0,
    serial: 0,
    lineage: '',
    resource_count: 0,
    output_count: 0,
    imported_at: new Date().toISOString(),
  };
}

// =============================================================================
// Graph Conversion
// =============================================================================

/**
 * Convert imported resources to an ICE graph.
 */
export function import_result_to_graph(
  result: TerraformImportResult,
  graph_name: string = 'terraform-import',
): MutableGraph {
  const graph = create_mutable_graph(graph_name, {
    description: `Imported from Terraform state (v${result.metadata.state_version})`,
    labels: {
      source: 'terraform',
      terraform_version: result.metadata.terraform_version,
      lineage: result.metadata.lineage,
    },
  });

  // Track terraform address to node ID mapping
  const address_to_node_id = new Map<string, string>();

  // Add nodes for each resource
  for (const resource of result.resources) {
    const node_input: NodeInput = {
      type: resource.ice_type,
      name: resource.name,
      properties: {
        ...resource.properties,
        _terraform_address: resource.terraform_address,
        _terraform_type: resource.terraform_type,
      },
      labels: {
        provider: resource.provider,
        terraform_type: resource.terraform_type,
      },
      annotations: {
        imported_from: 'terraform',
        terraform_address: resource.terraform_address,
      },
    };

    if (resource.module) {
      node_input.labels!['module'] = resource.module;
    }

    const add_result = graph.add_node(node_input);
    if (add_result.success && add_result.node) {
      address_to_node_id.set(resource.terraform_address, add_result.node.id);
    }
  }

  // Add edges for dependencies
  for (const resource of result.resources) {
    const source_id = address_to_node_id.get(resource.terraform_address);
    if (!source_id) continue;

    for (const dep_address of resource.dependencies) {
      const target_id = address_to_node_id.get(dep_address);
      if (!target_id) continue;

      const edge_input: EdgeInput = {
        source: source_id,
        target: target_id,
        relationship: 'depends_on',
        labels: {
          inferred: 'true',
        },
      };

      graph.add_edge(edge_input);
    }
  }

  return graph;
}

/**
 * Import Terraform state directly to a graph.
 */
export async function import_terraform_to_graph(
  state_path: string,
  options: TerraformImportOptions = {},
): Promise<{ graph: MutableGraph; result: TerraformImportResult }> {
  const result = await import_terraform_state(state_path, options);
  const graph = options.target_graph ?? import_result_to_graph(result);

  if (options.target_graph) {
    // Merge into existing graph
    const merge_result = import_result_to_graph(result, 'temp');
    for (const node of merge_result.nodes.values()) {
      options.target_graph.add_node({
        type: node.type,
        name: node.name,
        properties: node.properties,
        labels: node.metadata.labels,
        annotations: node.metadata.annotations,
      });
    }
  }

  return { graph, result };
}
