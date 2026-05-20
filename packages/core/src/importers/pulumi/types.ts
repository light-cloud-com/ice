/**
 * Pulumi State Types
 *
 * Type definitions for Pulumi stack state format.
 * See: https://www.pulumi.com/docs/concepts/state/
 */

// =============================================================================
// Pulumi Stack State Format
// =============================================================================

/**
 * Root structure of a Pulumi stack state file.
 * Located at .pulumi/stacks/<project>/<stack>.json
 */
export interface PulumiStackState {
  readonly version: number;
  readonly checkpoint: PulumiCheckpoint;
}

/**
 * Pulumi checkpoint containing deployment information.
 */
export interface PulumiCheckpoint {
  readonly stack: string;
  readonly config?: Record<string, PulumiConfigValue>;
  readonly latest?: PulumiDeployment;
  readonly pending_operations?: PulumiPendingOperation[];
}

/**
 * Pulumi config value (can be plaintext or secret).
 */
export interface PulumiConfigValue {
  readonly value?: unknown;
  readonly secret?: boolean;
  readonly object?: boolean;
}

/**
 * Pulumi deployment containing resources.
 */
export interface PulumiDeployment {
  readonly manifest: PulumiManifest;
  readonly secrets_providers?: PulumiSecretsProvider;
  readonly resources?: PulumiResource[];
  readonly pending_operations?: PulumiPendingOperation[];
}

/**
 * Pulumi manifest with metadata.
 */
export interface PulumiManifest {
  readonly time: string;
  readonly magic: string;
  readonly version: string;
  readonly plugins?: PulumiPluginInfo[];
}

/**
 * Pulumi plugin information.
 */
export interface PulumiPluginInfo {
  readonly name: string;
  readonly path: string;
  readonly type: 'resource' | 'language' | 'analyzer';
  readonly version: string;
}

/**
 * Pulumi secrets provider configuration.
 */
export interface PulumiSecretsProvider {
  readonly type: string;
  readonly state?: Record<string, unknown>;
}

/**
 * Pulumi resource in state.
 */
export interface PulumiResource {
  readonly urn: string;
  readonly custom?: boolean;
  readonly delete?: boolean;
  readonly id?: string;
  readonly type: string;
  readonly inputs?: Record<string, unknown>;
  readonly outputs?: Record<string, unknown>;
  readonly parent?: string;
  readonly protect?: boolean;
  readonly external?: boolean;
  readonly dependencies?: string[];
  readonly init_errors?: string[];
  readonly provider?: string;
  readonly property_dependencies?: Record<string, string[]>;
  readonly pending_replacement?: boolean;
  readonly additional_secret_outputs?: string[];
  readonly aliases?: string[];
  readonly import_id?: string;
  readonly retain_on_delete?: boolean;
  readonly deleted_with?: string;
  readonly created?: string;
  readonly modified?: string;
  readonly source_position?: PulumiSourcePosition;
}

/**
 * Source position for debugging.
 */
export interface PulumiSourcePosition {
  readonly uri: string;
  readonly line: number;
  readonly column: number;
}

/**
 * Pending operation in state.
 */
export interface PulumiPendingOperation {
  readonly resource: PulumiResource;
  readonly type: 'creating' | 'updating' | 'deleting' | 'reading';
}

// =============================================================================
// Pulumi URN Components
// =============================================================================

/**
 * Parsed Pulumi URN.
 * Format: urn:pulumi:<stack>::<project>::<type>::<name>
 * Type format: <provider>:<module>/<resource>:<ResourceClass>
 */
export interface ParsedUrn {
  readonly stack: string;
  readonly project: string;
  readonly type: string;
  readonly name: string;
  readonly parent_type?: string;
  readonly provider?: string;
  readonly module?: string;
  readonly resource_type?: string;
  readonly resource_class?: string;
}

// =============================================================================
// Pulumi Export Format
// =============================================================================

/**
 * Pulumi stack export format (from `pulumi stack export`).
 */
export interface PulumiStackExport {
  readonly version: number;
  readonly deployment: PulumiDeployment;
}

// =============================================================================
// Import Result Types
// =============================================================================

/**
 * Result of importing Pulumi state.
 */
export interface PulumiImportResult {
  readonly success: boolean;
  readonly resources: PulumiImportedResource[];
  readonly outputs: PulumiImportedOutput[];
  readonly errors: PulumiImportError[];
  readonly warnings: PulumiImportWarning[];
  readonly metadata: PulumiImportMetadata;
}

/**
 * Imported resource from Pulumi state.
 */
export interface PulumiImportedResource {
  readonly pulumi_urn: string;
  readonly pulumi_type: string;
  readonly ice_type: string;
  readonly name: string;
  readonly id?: string;
  readonly properties: Record<string, unknown>;
  readonly dependencies: string[];
  readonly provider: string;
  readonly parent?: string;
  readonly protect: boolean;
  readonly external: boolean;
  readonly secret_outputs: string[];
}

/**
 * Imported output from Pulumi state.
 */
export interface PulumiImportedOutput {
  readonly name: string;
  readonly value: unknown;
  readonly secret: boolean;
}

/**
 * Import error.
 */
export interface PulumiImportError {
  readonly code: string;
  readonly message: string;
  readonly resource?: string;
  readonly details?: unknown;
}

/**
 * Import warning.
 */
export interface PulumiImportWarning {
  readonly code: string;
  readonly message: string;
  readonly resource?: string;
}

/**
 * Import metadata.
 */
export interface PulumiImportMetadata {
  readonly pulumi_version: string;
  readonly stack: string;
  readonly project: string;
  readonly deployment_time: string;
  readonly resource_count: number;
  readonly output_count: number;
  readonly imported_at: string;
}
