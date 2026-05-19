/**
 * Terraform Exporter — shared types (rf-tfexp-1).
 *
 * Extracted from `terraform-exporter.ts` (pre-extraction L20-160).
 * Contains the public option / resource / config / result shapes
 * used by every helper in the terraform/* decomposition. The shapes
 * are 1:1 verbatim ports of the original interfaces — no semantic
 * changes, only relocation.
 *
 * Re-exported from the orchestrator module (`terraform-exporter.ts`)
 * and from `export/index.ts` so external consumers keep their
 * existing imports.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Terraform export options.
 */
export interface TerraformExportOptions {
  /** Target provider (e.g., "google", "aws", "azurerm") */
  provider: string;

  /** Output format: hcl (human-readable) or json */
  format?: 'hcl' | 'json';

  /** Include comments in output */
  include_comments?: boolean;

  /** Include import blocks for existing resources */
  include_imports?: boolean;

  /** Provider configuration to include */
  provider_config?: Record<string, unknown>;

  /** Required providers configuration */
  required_providers?: RequiredProvider[];
}

/**
 * Required provider configuration.
 */
export interface RequiredProvider {
  name: string;
  source: string;
  version?: string;
}

/**
 * Terraform resource definition.
 */
export interface TerraformResource {
  /** Resource type (e.g., "google_compute_instance") */
  type: string;

  /** Resource name (identifier) */
  name: string;

  /** Resource properties */
  properties: Record<string, unknown>;

  /** Dependencies */
  depends_on?: string[];

  /** Provider alias (if using multiple providers) */
  provider?: string;

  /** Lifecycle configuration */
  lifecycle?: TerraformLifecycle;
}

/**
 * Terraform lifecycle block.
 */
export interface TerraformLifecycle {
  create_before_destroy?: boolean;
  prevent_destroy?: boolean;
  ignore_changes?: string[];
}

/**
 * Complete Terraform configuration.
 */
export interface TerraformConfig {
  /** Terraform block */
  terraform?: TerraformBlock;

  /** Provider configurations */
  providers: TerraformProviderConfig[];

  /** Resource definitions */
  resources: TerraformResource[];

  /** Local values */
  locals?: Record<string, unknown>;

  /** Variable definitions */
  variables?: TerraformVariable[];

  /** Output definitions */
  outputs?: TerraformOutput[];
}

/**
 * Terraform block configuration.
 */
export interface TerraformBlock {
  required_version?: string;
  required_providers?: Record<
    string,
    {
      source: string;
      version?: string;
    }
  >;
  backend?: Record<string, unknown>;
}

/**
 * Provider configuration.
 */
export interface TerraformProviderConfig {
  name: string;
  alias?: string;
  config: Record<string, unknown>;
}

/**
 * Variable definition.
 */
export interface TerraformVariable {
  name: string;
  type?: string;
  description?: string;
  default?: unknown;
  sensitive?: boolean;
}

/**
 * Output definition.
 */
export interface TerraformOutput {
  name: string;
  value: string;
  description?: string;
  sensitive?: boolean;
}

/**
 * Export result.
 */
export interface TerraformExportResult {
  success: boolean;
  config: TerraformConfig;
  hcl?: string;
  json?: string;
  warnings: string[];
  errors: string[];
  unmapped_types: string[];
}
