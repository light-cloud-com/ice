/**
 * Export Module
 *
 * Exports ICE graphs to various infrastructure-as-code formats.
 */

// Terraform exporter
export type {
  TerraformExportOptions,
  RequiredProvider,
  TerraformResource,
  TerraformLifecycle,
  TerraformConfig,
  TerraformBlock,
  TerraformProviderConfig,
  TerraformVariable,
  TerraformOutput,
  TerraformExportResult,
} from './terraform-exporter.js';

export { TerraformExporter, create_terraform_exporter } from './terraform-exporter.js';

// Pulumi exporter
export type {
  PulumiExportOptions,
  PulumiResource,
  PulumiResourceOptions,
  PulumiProgram,
  PulumiExportResult,
} from './pulumi-exporter.js';

export { PulumiExporter, create_pulumi_exporter } from './pulumi-exporter.js';
