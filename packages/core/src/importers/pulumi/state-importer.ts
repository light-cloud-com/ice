/**
 * Pulumi State Importer
 *
 * Imports Pulumi stack state files into ICE graph format.
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { is_provider_resource, is_stack_resource } from './type-mapper.js';
import {
  get_deployment,
  get_stack_info,
  is_secret_value,
  unwrap_secret,
  create_empty_metadata,
} from './parsing.js';
import { import_resource } from './resource-conversion.js';
import { MutableGraph, create_mutable_graph } from '../../graph/mutable-graph.js';
import type {
  PulumiStackState,
  PulumiStackExport,
  PulumiImportResult,
  PulumiImportedResource,
  PulumiImportedOutput,
  PulumiImportError,
  PulumiImportWarning,
  PulumiImportMetadata,
} from './types.js';
import type { NodeInput, EdgeInput } from '../../types/graph.js';

// =============================================================================
// Import Options
// =============================================================================

/**
 * Options for importing Pulumi state.
 */
export interface PulumiImportOptions {
  /** Include provider resources */
  readonly include_providers?: boolean;

  /** Include stack resource */
  readonly include_stack?: boolean;

  /** Include secret values (will be masked if false) */
  readonly include_secrets?: boolean;

  /** Only import resources matching these types */
  readonly filter_types?: string[];

  /** Exclude resources matching these types */
  readonly exclude_types?: string[];

  /** Prefix to add to resource names */
  readonly name_prefix?: string;

  /** Whether to resolve stack references */
  readonly resolve_references?: boolean;

  /** Existing graph to merge into (optional) */
  readonly target_graph?: MutableGraph;
}

const DEFAULT_OPTIONS: Required<Omit<PulumiImportOptions, 'target_graph'>> = {
  include_providers: false,
  include_stack: false,
  include_secrets: false,
  filter_types: [],
  exclude_types: [],
  name_prefix: '',
  resolve_references: true,
};

// =============================================================================
// State Importer
// =============================================================================

/**
 * Import Pulumi state from a file path.
 */
export async function import_pulumi_state(
  state_path: string,
  options: PulumiImportOptions = {},
): Promise<PulumiImportResult> {
  const errors: PulumiImportError[] = [];
  const warnings: PulumiImportWarning[] = [];

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
  let state_data: PulumiStackState | PulumiStackExport;
  try {
    const content = await readFile(state_path, 'utf-8');
    state_data = JSON.parse(content) as PulumiStackState | PulumiStackExport;
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

  return import_pulumi_state_object(state_data, options, errors, warnings);
}

/**
 * Import Pulumi state from a JSON string.
 */
export function import_pulumi_state_json(json_content: string, options: PulumiImportOptions = {}): PulumiImportResult {
  const errors: PulumiImportError[] = [];
  const warnings: PulumiImportWarning[] = [];

  let state_data: PulumiStackState | PulumiStackExport;
  try {
    state_data = JSON.parse(json_content) as PulumiStackState | PulumiStackExport;
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

  return import_pulumi_state_object(state_data, options, errors, warnings);
}

/**
 * Import from a parsed Pulumi state object.
 */
export function import_pulumi_state_object(
  state_data: PulumiStackState | PulumiStackExport,
  options: PulumiImportOptions = {},
  errors: PulumiImportError[] = [],
  warnings: PulumiImportWarning[] = [],
): PulumiImportResult {
  // Merge options with defaults, filtering out undefined values
  const opts = {
    ...DEFAULT_OPTIONS,
    ...(Object.fromEntries(Object.entries(options).filter(([_, v]) => v !== undefined)) as PulumiImportOptions),
  };

  const imported_resources: PulumiImportedResource[] = [];
  const imported_outputs: PulumiImportedOutput[] = [];

  // Determine the deployment from state format
  const deployment = get_deployment(state_data);
  if (!deployment) {
    return {
      success: false,
      resources: [],
      outputs: [],
      errors: [
        {
          code: 'INVALID_STATE',
          message: 'No deployment found in Pulumi state',
        },
      ],
      warnings: [],
      metadata: create_empty_metadata(),
    };
  }

  // Get stack and project info
  const stack_info = get_stack_info(state_data);

  // Validate state version
  if (state_data.version > 3) {
    warnings.push({
      code: 'UNSUPPORTED_VERSION',
      message: `State version ${state_data.version} may not be fully supported. Supported versions: 1, 2, 3`,
    });
  }

  // Process resources
  if (deployment.resources) {
    for (const resource of deployment.resources) {
      // Skip provider resources unless explicitly included
      if (is_provider_resource(resource.type) && !opts.include_providers) {
        continue;
      }

      // Skip stack resource unless explicitly included
      if (is_stack_resource(resource.type) && !opts.include_stack) {
        continue;
      }

      // Apply type filters
      if (opts.filter_types.length > 0 && !opts.filter_types.includes(resource.type)) {
        continue;
      }
      if (opts.exclude_types.includes(resource.type)) {
        continue;
      }

      // Import resource
      try {
        const imported = import_resource(resource, opts, warnings);
        imported_resources.push(imported);
      } catch (error) {
        errors.push({
          code: 'IMPORT_ERROR',
          message: `Failed to import resource ${resource.urn}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          resource: resource.urn,
        });
      }
    }
  }

  // Process outputs (from stack resource)
  const stack_resource = deployment.resources?.find((r) => is_stack_resource(r.type));
  if (stack_resource?.outputs) {
    for (const [name, value] of Object.entries(stack_resource.outputs)) {
      const is_secret = is_secret_value(value);
      imported_outputs.push({
        name,
        value: opts.include_secrets || !is_secret ? unwrap_secret(value) : '***SECRET***',
        secret: is_secret,
      });
    }
  }

  const metadata: PulumiImportMetadata = {
    pulumi_version: deployment.manifest?.version ?? 'unknown',
    stack: stack_info.stack,
    project: stack_info.project,
    deployment_time: deployment.manifest?.time ?? new Date().toISOString(),
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

// =============================================================================
// Graph Conversion
// =============================================================================

/**
 * Convert imported resources to an ICE graph.
 */
export function import_result_to_graph(result: PulumiImportResult, graph_name: string = 'pulumi-import'): MutableGraph {
  const graph = create_mutable_graph(graph_name, {
    description: `Imported from Pulumi stack ${result.metadata.stack}`,
    labels: {
      source: 'pulumi',
      pulumi_version: result.metadata.pulumi_version,
      stack: result.metadata.stack,
      project: result.metadata.project,
    },
  });

  // Track URN to node ID mapping
  const urn_to_node_id = new Map<string, string>();

  // Add nodes for each resource
  for (const resource of result.resources) {
    const node_input: NodeInput = {
      type: resource.ice_type,
      name: resource.name,
      properties: {
        ...resource.properties,
        _pulumi_urn: resource.pulumi_urn,
        _pulumi_type: resource.pulumi_type,
      },
      labels: {
        provider: resource.provider,
        pulumi_type: resource.pulumi_type,
      },
      annotations: {
        imported_from: 'pulumi',
        pulumi_urn: resource.pulumi_urn,
      },
    };

    if (resource.id) {
      node_input.properties!['id'] = resource.id;
    }

    if (resource.protect) {
      node_input.labels!['protected'] = 'true';
    }

    if (resource.external) {
      node_input.labels!['external'] = 'true';
    }

    const add_result = graph.add_node(node_input);
    if (add_result.success && add_result.node) {
      urn_to_node_id.set(resource.pulumi_urn, add_result.node.id);
    }
  }

  // Add edges for dependencies
  for (const resource of result.resources) {
    const source_id = urn_to_node_id.get(resource.pulumi_urn);
    if (!source_id) continue;

    for (const dep_urn of resource.dependencies) {
      const target_id = urn_to_node_id.get(dep_urn);
      if (!target_id) continue;

      // Skip self-dependencies
      if (source_id === target_id) continue;

      const edge_input: EdgeInput = {
        source: source_id,
        target: target_id,
        relationship: 'depends_on',
        labels: {
          source: 'pulumi',
        },
      };

      graph.add_edge(edge_input);
    }
  }

  return graph;
}

/**
 * Import Pulumi state directly to a graph.
 */
export async function import_pulumi_to_graph(
  state_path: string,
  options: PulumiImportOptions = {},
): Promise<{ graph: MutableGraph; result: PulumiImportResult }> {
  const result = await import_pulumi_state(state_path, options);
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
