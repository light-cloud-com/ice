/**
 * Pulumi Exporter — shared types (rf-pulumi-1).
 *
 * Extracted from `pulumi-exporter.ts` (pre-extraction L20-106).
 * Contains the public option / resource / program / result shapes
 * used by every helper in the pulumi/* decomposition. The shapes
 * are 1:1 verbatim ports of the original interfaces — no semantic
 * changes, only relocation.
 *
 * Re-exported from the orchestrator module (`pulumi-exporter.ts`)
 * and from `export/index.ts` so external consumers keep their
 * existing imports.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Pulumi export options.
 */
export interface PulumiExportOptions {
  /** Target provider (e.g., "gcp", "aws", "azure") */
  provider: string;

  /** Output format: yaml or typescript */
  format?: 'yaml' | 'typescript';

  /** Project name */
  project_name?: string;

  /** Stack name */
  stack_name?: string;

  /** Runtime (for TypeScript: nodejs, for Python: python) */
  runtime?: string;

  /** Include comments in output */
  include_comments?: boolean;

  /** Configuration values */
  config?: Record<string, unknown>;
}

/**
 * Pulumi resource definition.
 */
export interface PulumiResource {
  /** Resource type (e.g., "gcp:compute/instance:Instance") */
  type: string;

  /** Resource name (identifier) */
  name: string;

  /** Resource properties */
  properties: Record<string, unknown>;

  /** Resource options */
  options?: PulumiResourceOptions;
}

/**
 * Pulumi resource options.
 */
export interface PulumiResourceOptions {
  depends_on?: string[];
  protect?: boolean;
  provider?: string;
  parent?: string;
  delete_before_replace?: boolean;
  ignore_changes?: string[];
}

/**
 * Complete Pulumi program.
 */
export interface PulumiProgram {
  /** Project name */
  name: string;

  /** Runtime */
  runtime: string;

  /** Description */
  description?: string;

  /** Configuration values */
  config?: Record<string, unknown>;

  /** Resource definitions */
  resources: PulumiResource[];

  /** Output values */
  outputs?: Record<string, unknown>;
}

/**
 * Export result.
 */
export interface PulumiExportResult {
  success: boolean;
  program: PulumiProgram;
  yaml?: string;
  typescript?: string;
  warnings: string[];
  errors: string[];
  unmapped_types: string[];
}
