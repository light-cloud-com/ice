/**
 * Terraform State Importer
 *
 * Imports Terraform state files (.tfstate) into ICE graph format.
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { import_resource_instance, infer_dependencies } from './resource-conversion';
import { create_empty_metadata } from './sensitive';
import type {
  TerraformState,
  TerraformImportResult,
  ImportedResource,
  ImportedOutput,
  ImportError,
  ImportWarning,
  ImportMetadata,
} from './types';
import type { MutableGraph } from '../../graph/mutable-graph';

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

// =============================================================================
// Graph Conversion (re-exports)
// =============================================================================

export { import_result_to_graph, import_terraform_to_graph } from './graph-conversion';
