/**
 * Terraform State Types
 *
 * Type definitions for Terraform state file format (v4).
 * See: https://developer.hashicorp.com/terraform/internals/json-format
 */

// =============================================================================
// Terraform State File Format (v4)
// =============================================================================

/**
 * Root structure of a Terraform state file.
 */
export interface TerraformState {
  readonly version: number;
  readonly terraform_version: string;
  readonly serial: number;
  readonly lineage: string;
  readonly outputs?: Record<string, TerraformOutput>;
  readonly resources?: TerraformResource[];
}

/**
 * Terraform output value.
 */
export interface TerraformOutput {
  readonly value: unknown;
  readonly type: TerraformOutputType;
  readonly sensitive?: boolean;
}

/**
 * Terraform output type can be a primitive or complex type.
 */
export type TerraformOutputType =
  | 'string'
  | 'number'
  | 'bool'
  | ['list', TerraformOutputType]
  | ['map', TerraformOutputType]
  | ['set', TerraformOutputType]
  | ['object', Record<string, TerraformOutputType>]
  | ['tuple', TerraformOutputType[]];

/**
 * Terraform resource in state.
 */
export interface TerraformResource {
  readonly mode: 'managed' | 'data';
  readonly type: string;
  readonly name: string;
  readonly provider: string;
  readonly instances: TerraformResourceInstance[];
  readonly module?: string;
}

/**
 * Instance of a Terraform resource (for count/for_each).
 */
export interface TerraformResourceInstance {
  readonly schema_version: number;
  readonly attributes: Record<string, unknown>;
  readonly sensitive_attributes?: string[];
  readonly private?: string;
  readonly dependencies?: string[];
  readonly create_before_destroy?: boolean;
  readonly index_key?: string | number;
}

// =============================================================================
// Terraform Plan JSON Format
// =============================================================================

/**
 * Terraform plan JSON output (from `terraform show -json`).
 */
export interface TerraformPlan {
  readonly format_version: string;
  readonly terraform_version: string;
  readonly planned_values?: TerraformPlannedValues;
  readonly resource_changes?: TerraformResourceChange[];
  readonly prior_state?: TerraformState;
  readonly configuration?: TerraformConfiguration;
}

/**
 * Planned values in a Terraform plan.
 */
interface TerraformPlannedValues {
  readonly root_module: TerraformPlannedModule;
  readonly outputs?: Record<string, TerraformPlannedOutput>;
}

/**
 * Planned module with resources.
 */
interface TerraformPlannedModule {
  readonly resources?: TerraformPlannedResource[];
  readonly child_modules?: TerraformPlannedChildModule[];
}

/**
 * Child module in planned values.
 */
interface TerraformPlannedChildModule {
  readonly address: string;
  readonly resources?: TerraformPlannedResource[];
  readonly child_modules?: TerraformPlannedChildModule[];
}

/**
 * Planned resource.
 */
interface TerraformPlannedResource {
  readonly address: string;
  readonly mode: 'managed' | 'data';
  readonly type: string;
  readonly name: string;
  readonly provider_name: string;
  readonly schema_version: number;
  readonly values: Record<string, unknown>;
  readonly sensitive_values?: Record<string, unknown>;
}

/**
 * Planned output.
 */
interface TerraformPlannedOutput {
  readonly sensitive: boolean;
  readonly value?: unknown;
  readonly type?: TerraformOutputType;
}

/**
 * Resource change in a plan.
 */
export interface TerraformResourceChange {
  readonly address: string;
  readonly module_address?: string;
  readonly mode: 'managed' | 'data';
  readonly type: string;
  readonly name: string;
  readonly provider_name: string;
  readonly change: TerraformChange;
  readonly action_reason?: string;
}

/**
 * Change details for a resource.
 */
export interface TerraformChange {
  readonly actions: TerraformAction[];
  readonly before?: Record<string, unknown>;
  readonly after?: Record<string, unknown>;
  readonly after_unknown?: Record<string, boolean>;
  readonly before_sensitive?: Record<string, unknown>;
  readonly after_sensitive?: Record<string, unknown>;
  readonly replace_paths?: string[][];
}

/**
 * Terraform action types.
 */
export type TerraformAction = 'no-op' | 'create' | 'read' | 'update' | 'delete';

/**
 * Terraform configuration block.
 */
interface TerraformConfiguration {
  readonly provider_config?: Record<string, TerraformProviderConfig>;
  readonly root_module?: TerraformConfigModule;
}

/**
 * Provider configuration.
 */
export interface TerraformProviderConfig {
  readonly name: string;
  readonly full_name: string;
  readonly alias?: string;
  readonly version_constraint?: string;
  readonly expressions?: Record<string, TerraformExpression>;
}

/**
 * Configuration module.
 */
interface TerraformConfigModule {
  readonly outputs?: Record<string, TerraformConfigOutput>;
  readonly resources?: TerraformConfigResource[];
  readonly module_calls?: Record<string, TerraformModuleCall>;
  readonly variables?: Record<string, TerraformConfigVariable>;
}

/**
 * Configuration output.
 */
interface TerraformConfigOutput {
  readonly expression?: TerraformExpression;
  readonly description?: string;
  readonly sensitive?: boolean;
}

/**
 * Configuration resource.
 */
interface TerraformConfigResource {
  readonly address: string;
  readonly mode: 'managed' | 'data';
  readonly type: string;
  readonly name: string;
  readonly provider_config_key: string;
  readonly expressions?: Record<string, TerraformExpression>;
  readonly schema_version: number;
  readonly count_expression?: TerraformExpression;
  readonly for_each_expression?: TerraformExpression;
  readonly depends_on?: string[];
}

/**
 * Module call configuration.
 */
interface TerraformModuleCall {
  readonly source: string;
  readonly expressions?: Record<string, TerraformExpression>;
  readonly count_expression?: TerraformExpression;
  readonly for_each_expression?: TerraformExpression;
  readonly depends_on?: string[];
  readonly module?: TerraformConfigModule;
  readonly version_constraint?: string;
}

/**
 * Configuration variable.
 */
interface TerraformConfigVariable {
  readonly default?: unknown;
  readonly description?: string;
  readonly sensitive?: boolean;
  readonly type?: string;
}

/**
 * Terraform expression (can be constant or reference).
 */
interface TerraformExpression {
  readonly constant_value?: unknown;
  readonly references?: string[];
}

// =============================================================================
// Import Result Types
// =============================================================================

/**
 * Result of importing Terraform state.
 */
export interface TerraformImportResult {
  readonly success: boolean;
  readonly resources: ImportedResource[];
  readonly outputs: ImportedOutput[];
  readonly errors: ImportError[];
  readonly warnings: ImportWarning[];
  readonly metadata: ImportMetadata;
}

/**
 * Imported resource from Terraform state.
 */
export interface ImportedResource {
  readonly terraform_address: string;
  readonly terraform_type: string;
  readonly ice_type: string;
  readonly name: string;
  readonly properties: Record<string, unknown>;
  readonly dependencies: string[];
  readonly provider: string;
  readonly module?: string;
  readonly index_key?: string | number;
  readonly sensitive_attributes: string[];
}

/**
 * Imported output from Terraform state.
 */
export interface ImportedOutput {
  readonly name: string;
  readonly value: unknown;
  readonly type: TerraformOutputType;
  readonly sensitive: boolean;
}

/**
 * Import error.
 */
export interface ImportError {
  readonly code: string;
  readonly message: string;
  readonly resource?: string;
  readonly details?: unknown;
}

/**
 * Import warning.
 */
export interface ImportWarning {
  readonly code: string;
  readonly message: string;
  readonly resource?: string;
}

/**
 * Import metadata.
 */
export interface ImportMetadata {
  readonly terraform_version: string;
  readonly state_version: number;
  readonly serial: number;
  readonly lineage: string;
  readonly resource_count: number;
  readonly output_count: number;
  readonly imported_at: string;
}
