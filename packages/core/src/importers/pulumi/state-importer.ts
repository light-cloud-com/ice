/**
 * Pulumi State Importer
 *
 * Imports Pulumi stack state files into ICE graph format.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import type {
  PulumiStackState,
  PulumiStackExport,
  PulumiResource,
  PulumiDeployment,
  PulumiImportResult,
  PulumiImportedResource,
  PulumiImportedOutput,
  PulumiImportError,
  PulumiImportWarning,
  PulumiImportMetadata,
} from './types.js';
import {
  get_ice_type,
  get_provider_from_type,
  parse_urn,
  is_provider_resource,
  is_stack_resource,
} from './type-mapper.js';
import { MutableGraph, create_mutable_graph } from '../../graph/mutable-graph.js';
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

/**
 * Import a single Pulumi resource.
 */
function import_resource(
  resource: PulumiResource,
  options: Required<Omit<PulumiImportOptions, 'target_graph'>>,
  warnings: PulumiImportWarning[],
): PulumiImportedResource {
  const pulumi_type = resource.type;
  const ice_type = get_ice_type(pulumi_type);
  const provider = get_provider_from_type(pulumi_type);

  // Parse the URN to get name
  const parsed_urn = parse_urn(resource.urn);
  let name = parsed_urn?.name ?? extract_name_from_urn(resource.urn);

  // Apply name prefix
  if (options.name_prefix) {
    name = `${options.name_prefix}${name}`;
  }

  // Process properties from outputs (the actual state) or inputs
  let properties: Record<string, unknown> = {};
  if (resource.outputs) {
    properties = process_properties(resource.outputs, options);
  } else if (resource.inputs) {
    properties = process_properties(resource.inputs, options);
    warnings.push({
      code: 'NO_OUTPUTS',
      message: 'Resource has no outputs, using inputs instead',
      resource: resource.urn,
    });
  }

  // Extract dependencies
  const dependencies: string[] = [];
  if (resource.dependencies) {
    dependencies.push(...resource.dependencies);
  }
  if (resource.parent) {
    dependencies.push(resource.parent);
  }

  // Extract secret outputs
  const secret_outputs: string[] = [];
  if (resource.additional_secret_outputs) {
    secret_outputs.push(...resource.additional_secret_outputs);
  }

  return {
    pulumi_urn: resource.urn,
    pulumi_type,
    ice_type,
    name,
    id: resource.id,
    properties,
    dependencies,
    provider,
    parent: resource.parent,
    protect: resource.protect ?? false,
    external: resource.external ?? false,
    secret_outputs,
  };
}

/**
 * Process properties, handling secrets.
 */
function process_properties(
  props: Record<string, unknown>,
  options: Required<Omit<PulumiImportOptions, 'target_graph'>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    if (is_secret_value(value)) {
      result[key] = options.include_secrets ? unwrap_secret(value) : '***SECRET***';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = process_properties(value as Record<string, unknown>, options);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check if a value is a Pulumi secret.
 */
function is_secret_value(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return obj['4dabf18193072939515e22aab3b80af9'] === '1b47061264138c4ac30d75fd1eb44270';
}

/**
 * Unwrap a Pulumi secret value.
 */
function unwrap_secret(value: unknown): unknown {
  if (!is_secret_value(value)) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  return obj['ciphertext'] ?? obj['plaintext'] ?? value;
}

/**
 * Get the deployment from state data.
 */
function get_deployment(state_data: PulumiStackState | PulumiStackExport): PulumiDeployment | null {
  // Check for export format first
  if ('deployment' in state_data && state_data.deployment) {
    return state_data.deployment;
  }

  // Check for stack state format
  if ('checkpoint' in state_data && state_data.checkpoint?.latest) {
    return state_data.checkpoint.latest;
  }

  return null;
}

/**
 * Get stack and project info from state data.
 */
function get_stack_info(state_data: PulumiStackState | PulumiStackExport): {
  stack: string;
  project: string;
} {
  if ('checkpoint' in state_data && state_data.checkpoint) {
    return {
      stack: state_data.checkpoint.stack,
      project: state_data.checkpoint.stack.split('/').pop() ?? 'unknown',
    };
  }

  // Try to get from stack resource
  if ('deployment' in state_data && state_data.deployment?.resources) {
    const stack_resource = state_data.deployment.resources.find((r) => is_stack_resource(r.type));
    if (stack_resource) {
      const parsed = parse_urn(stack_resource.urn);
      if (parsed) {
        return { stack: parsed.stack, project: parsed.project };
      }
    }
  }

  return { stack: 'unknown', project: 'unknown' };
}

/**
 * Extract name from URN when parsing fails.
 */
function extract_name_from_urn(urn: string): string {
  const parts = urn.split('::');
  return parts[parts.length - 1] ?? urn;
}

/**
 * Create empty metadata for error cases.
 */
function create_empty_metadata(): PulumiImportMetadata {
  return {
    pulumi_version: 'unknown',
    stack: 'unknown',
    project: 'unknown',
    deployment_time: new Date().toISOString(),
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
